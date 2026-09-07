# ============================================================
# BOT API — публичный Telegram-подобный API ботов соцсети.
#
#   POST/GET  /bot{TOKEN}/{method}
#
# Токен:  "{bot_id}:{secrets.token_urlsafe(32)}"  (bcrypt-хэш в БД,
# сам токен не хранится). Кеш верифицированных токенов в памяти.
# Rate limit: 30 req/sec на бота (скользящее окно).
# Обновления: очередь bot_update → getUpdates (long polling)
#             или webhook (HTTPS POST, 3 попытки, экспон. задержка).
# ============================================================
import asyncio
import json
import os
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Optional

import bcrypt
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import (User, Bot, BotCommand, BotUpdate, BotWebhookLog, Chat,
                    ChatMember, Message, Post, Like, Follow)
from main import get_current_user
from websocket_manager import manager

router = APIRouter(tags=["bot-api"])

RATE_LIMIT_PER_SEC = 30
WEBHOOK_RETRY_DELAYS = (5, 25, 125)  # сек, экспоненциальная задержка, 3 попытки
MAX_MEDIA_SIZE = 20 * 1024 * 1024

# ------------------------------------------------------------------
# Токены: генерация и верификация
# ------------------------------------------------------------------

# кеш: token -> bot_id (bcrypt дорогой; после первого успеха токен кешируем)
_token_cache: dict[str, int] = {}
_token_cache_max = 10000


def generate_api_token(bot: Bot) -> str:
    """Новый токен бота. Возвращается владельцу ОДИН раз; в БД — только bcrypt-хэш."""
    token = "%d:%s" % (bot.id, secrets.token_urlsafe(32))
    bot.api_token_hash = bcrypt.hashpw(token.encode(), bcrypt.gensalt()).decode()
    # сбрасываем кеш всех старых токенов этого бота
    for t in [t for t, bid in _token_cache.items() if bid == bot.id]:
        _token_cache.pop(t, None)
    return token


def reset_api_token_cache(bot_id: int):
    for t in [t for t, bid in _token_cache.items() if bid == bot_id]:
        _token_cache.pop(t, None)


def verify_api_token(token: str, session: Session) -> Optional[Bot]:
    """Верифицируем токен → Bot (активный, с хэшем). Кеш ускоряет повторные вызовы."""
    if not token or ":" not in token:
        return None
    bot_id = _token_cache.get(token)
    if bot_id:
        bot = session.get(Bot, bot_id)
        if bot and bot.api_token_hash and bot.active:
            return bot
        _token_cache.pop(token, None)
        return None
    try:
        bid = int(token.split(":", 1)[0])
    except ValueError:
        return None
    bot = session.get(Bot, bid)
    if not bot or not bot.api_token_hash or not bot.active:
        # защита от перебора: даже при неверном id делаем фиктивную проверку
        bcrypt.checkpw(token.encode(), bcrypt.hashpw(b"decoy", bcrypt.gensalt(rounds=4)))
        return None
    if bcrypt.checkpw(token.encode(), bot.api_token_hash.encode()):
        if len(_token_cache) >= _token_cache_max:
            _token_cache.clear()
        _token_cache[token] = bot.id
        return bot
    return None


# ------------------------------------------------------------------
# Rate limiting: 30 req/sec на бота (in-memory скользящее окно)
# ------------------------------------------------------------------
_rate_windows: dict[int, deque] = defaultdict(
    lambda: deque(maxlen=RATE_LIMIT_PER_SEC * 2))


def _check_rate_limit(bot_id: int) -> bool:
    now = time.monotonic()
    win = _rate_windows[bot_id]
    while win and now - win[0] > 1.0:
        win.popleft()
    if len(win) >= RATE_LIMIT_PER_SEC:
        return False
    win.append(now)
    return True

# ------------------------------------------------------------------
# Очередь обновлений + webhook-доставка
# ------------------------------------------------------------------

def _next_update_id(session: Session, bot_id: int) -> int:
    last = session.exec(select(BotUpdate).where(BotUpdate.bot_id == bot_id)
                        .order_by(BotUpdate.update_id.desc())).first()
    return (last.update_id + 1) if last else 1


def emit_bot_update(session: Session, bot: Bot, payload: dict) -> Optional[BotUpdate]:
    """Положить событие в очередь бота. Если задан webhook — запланировать доставку."""
    upd = BotUpdate(bot_id=bot.id, update_id=_next_update_id(session, bot.id),
                    payload=json.dumps(payload, ensure_ascii=False))
    session.add(upd)
    session.commit()
    session.refresh(upd)
    if bot.webhook_url:
        _schedule_webhook_delivery(bot.id, upd.id)
    return upd


def _schedule_webhook_delivery(bot_id: int, update_row_id: int):
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_deliver_webhook(bot_id, update_row_id, 0))
    except RuntimeError:
        pass  # нет event loop (синхронный контекст) — событие останется в очереди


async def _deliver_webhook(bot_id: int, update_row_id: int, attempt: int):
    """POST события на webhook бота. Успех (HTTP 2xx) → is_processed=True,
    иначе до 3 попыток с экспоненциальной задержкой."""
    from database import engine
    with Session(engine) as session:
        upd = session.get(BotUpdate, update_row_id)
        bot = session.get(Bot, bot_id)
        if not upd or not bot or not bot.webhook_url:
            return
        url = bot.webhook_url
        headers = {"Content-Type": "application/json"}
        if bot.webhook_secret:
            headers["X-Nebula-Bot-Secret-Token"] = bot.webhook_secret
        ok, status, err = False, None, None
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(url, content=upd.payload, headers=headers)
                status = resp.status_code
                ok = 200 <= status < 300
                if not ok:
                    err = "HTTP %s" % status
        except Exception as e:
            err = str(e)[:300]
        session.add(BotWebhookLog(bot_id=bot_id, update_id=upd.update_id, url=url,
                                  ok=ok, status_code=status, error=err))
        if ok:
            upd.is_processed = True
            session.add(upd)
        else:
            upd.delivery_attempts = attempt + 1
            session.add(upd)
        session.commit()
        if not ok and attempt < len(WEBHOOK_RETRY_DELAYS):
            await asyncio.sleep(WEBHOOK_RETRY_DELAYS[attempt])
            await _deliver_webhook(bot_id, update_row_id, attempt + 1)


# ------------------------------------------------------------------
# Сериализация объектов (Telegram-совместимые)
# ------------------------------------------------------------------

def _user_out(u: Optional[User]) -> Optional[dict]:
    if not u:
        return None
    return {"id": u.id, "is_bot": bool(u.is_bot),
            "first_name": u.display_name or u.username, "username": u.username}


def _chat_out(session: Session, chat: Chat) -> dict:
    t = "private"
    if chat.is_group:
        t = "supergroup" if getattr(chat, "is_channel", False) else "group"
    return {"id": chat.id, "type": t,
            "title": chat.name if chat.is_group else None}


def _message_out(session: Session, m: Message) -> dict:
    sender = session.get(User, m.sender_id)
    chat = session.get(Chat, m.chat_id)
    out = {"message_id": m.id, "from": _user_out(sender),
           "chat": _chat_out(session, chat) if chat else {"id": m.chat_id, "type": "private"},
           "date": int(m.created_at.timestamp()) if m.created_at else int(time.time()),
           "text": m.text or (m.ciphertext if m.ciphertext and not m.media_url else None)}
    if m.media_url:
        kind = {"image": "photo", "video": "video", "gif": "animation",
                "audio": "audio"}.get(m.media_type, "document")
        out[kind] = [{"file_id": m.media_url, "file_unique_id": m.media_url}]
    if m.reply_to_id:
        out["reply_to_message"] = {"message_id": m.reply_to_id}
    return out


def _bot_user_out(session: Session, bot: Bot) -> dict:
    return {"id": bot.user_id, "is_bot": True, "first_name": bot.name,
            "username": bot.username, "can_join_groups": True,
            "can_read_all_group_messages": False, "supports_inline_queries": False}


def _require_bot_in_chat(session: Session, bot: Bot, chat_id: int) -> Chat:
    chat = session.get(Chat, chat_id)
    if not chat:
        raise _api_error(400, "Bad Request: chat not found")
    if chat.is_secret:
        raise _api_error(403, "Forbidden: bot cannot access secret chats")
    if not session.exec(select(ChatMember).where(
            ChatMember.chat_id == chat_id, ChatMember.user_id == bot.user_id)).first():
        raise _api_error(403, "Forbidden: bot not a member of this chat")
    return chat


def _api_error(status: int, description: str):
    return HTTPException(status, description)


async def _params(request: Request) -> dict:
    """Параметры метода: JSON body, form или query string."""
    if request.method == "GET":
        return dict(request.query_params)
    ct = request.headers.get("content-type", "")
    try:
        if "application/json" in ct:
            body = await request.json()
            return body if isinstance(body, dict) else {}
        if "form" in ct or "multipart" in ct:
            form = await request.form()
            return {k: form[k] for k in form}
    except Exception:
        pass
    return dict(request.query_params)


def _int(p: dict, key: str, default=None) -> Optional[int]:
    v = p.get(key, default)
    try:
        return int(v)
    except (TypeError, ValueError):
        return default

# ------------------------------------------------------------------
# Единая точка входа: /bot{token}/{method}
# ------------------------------------------------------------------

@router.api_route("/bot{token}/{method}", methods=["POST", "GET"])
async def bot_api_entry(token: str, method: str, request: Request,
                        session: Session = Depends(get_session)):
    bot = verify_api_token(token, session)
    if not bot:
        return JSONResponse({"ok": False, "error_code": 401,
                             "description": "Unauthorized: invalid or inactive token"}, 401)
    if not _check_rate_limit(bot.id):
        return JSONResponse({"ok": False, "error_code": 429,
                             "description": "Too Many Requests: retry after 1"}, 429,
                            headers={"Retry-After": "1"})
    method = method.lower()
    handler = _HANDLERS.get(method)
    if not handler:
        return JSONResponse({"ok": False, "error_code": 404,
                             "description": "Not Found: method not found"}, 404)
    params = await _params(request)
    try:
        result = await handler(session, bot, params, request)
    except HTTPException as e:
        return JSONResponse({"ok": False, "error_code": e.status_code,
                             "description": str(e.detail)}, e.status_code)
    return {"ok": True, "result": result}


# ------------------------------------------------------------------
# Отправка сообщений от имени бота
# ------------------------------------------------------------------

async def _send_media(session: Session, bot: Bot, p: dict, media_type: str) -> dict:
    chat_id = _int(p, "chat_id")
    media_url = p.get("photo") or p.get("video") or p.get("audio") \
        or p.get("document") or p.get("sticker") or p.get("animation") or p.get("file_url")
    if not chat_id or not media_url:
        raise _api_error(400, "Bad Request: chat_id and media are required")
    _require_bot_in_chat(session, bot, chat_id)
    caption = (p.get("caption") or "")[:2000]
    m = Message(chat_id=chat_id, sender_id=bot.user_id, text=caption or None,
                media_url=str(media_url), media_type=media_type,
                reply_to_id=_int(p, "reply_to_id"))
    session.add(m)
    session.commit()
    session.refresh(m)
    await manager.broadcast_to_chat(chat_id, "new_message", {
        "id": m.id, "chat_id": chat_id, "sender_id": bot.user_id,
        "sender_name": bot.name, "text": caption,
        "media_url": m.media_url, "media_type": media_type,
        "created_at": m.created_at.isoformat(), "reply_to_id": m.reply_to_id,
    }, session)
    return _message_out(session, m)


async def h_send_message(session: Session, bot: Bot, p: dict, request: Request) -> dict:
    chat_id = _int(p, "chat_id")
    text = (p.get("text") or "").strip()
    if not chat_id or not text:
        raise _api_error(400, "Bad Request: chat_id and text are required")
    _require_bot_in_chat(session, bot, chat_id)
    m = Message(chat_id=chat_id, sender_id=bot.user_id, text=text[:8000],
                reply_to_id=_int(p, "reply_to_id"))
    session.add(m)
    session.commit()
    session.refresh(m)
    sender = session.get(User, bot.user_id)
    await manager.broadcast_to_chat(chat_id, "new_message", {
        "id": m.id, "chat_id": chat_id, "sender_id": bot.user_id,
        "sender_name": sender.display_name if sender else bot.name,
        "sender_avatar": sender.avatar_url if sender else None,
        "text": text, "created_at": m.created_at.isoformat(),
        "reply_to_id": m.reply_to_id,
    }, session)
    return _message_out(session, m)


async def h_send_photo(s, b, p, r): return await _send_media(s, b, p, "image")
async def h_send_video(s, b, p, r): return await _send_media(s, b, p, "video")
async def h_send_audio(s, b, p, r): return await _send_media(s, b, p, "audio")
async def h_send_document(s, b, p, r): return await _send_media(s, b, p, "file")
async def h_send_sticker(s, b, p, r): return await _send_media(s, b, p, "sticker")


POLL_EMOJI = "\U0001F4CA"


async def h_send_poll(session: Session, bot: Bot, p: dict, request: Request) -> dict:
    chat_id = _int(p, "chat_id")
    question = (p.get("question") or "").strip()
    options = p.get("options") or []
    if isinstance(options, str):
        options = [o.strip() for o in options.split("|") if o.strip()]
    if not chat_id or not question or not (2 <= len(options) <= 10):
        raise _api_error(400, "Bad Request: chat_id, question and 2-10 options required")
    _require_bot_in_chat(session, bot, chat_id)
    text = POLL_EMOJI + " " + question + "\n" + "\n".join(
        "%d. %s" % (i + 1, o) for i, o in enumerate(options))
    m = Message(chat_id=chat_id, sender_id=bot.user_id, text=text[:8000])
    session.add(m)
    session.commit()
    session.refresh(m)
    await manager.broadcast_to_chat(chat_id, "new_message", {
        "id": m.id, "chat_id": chat_id, "sender_id": bot.user_id,
        "sender_name": bot.name, "text": text,
        "created_at": m.created_at.isoformat(),
    }, session)
    return _message_out(session, m)


async def h_send_chat_action(session: Session, bot: Bot, p: dict, request: Request):
    chat_id = _int(p, "chat_id")
    action = p.get("action", "typing")
    if not chat_id:
        raise _api_error(400, "Bad Request: chat_id required")
    await manager.broadcast_to_chat(
        chat_id, action, {"chat_id": chat_id, "user_id": bot.user_id}, session)
    return True

h_send_typing = h_send_chat_action

# ------------------------------------------------------------------
# Обновления: getUpdates (long polling) + webhook management
# ------------------------------------------------------------------

async def h_get_updates(session: Session, bot: Bot, p: dict, request: Request):
    offset = _int(p, "offset", 0) or 0
    limit = min(max(_int(p, "limit", 100) or 100, 1), 100)
    timeout = min(max(_int(p, "timeout", 0) or 0, 0), 60)
    if bot.webhook_url:
        raise _api_error(409, "Conflict: webhook is set, use deleteWebhook for getUpdates")

    def fetch():
        q = select(BotUpdate).where(BotUpdate.bot_id == bot.id)
        if offset > 0:
            q = q.where(BotUpdate.update_id >= offset)  # offset = last_update_id + 1
        else:
            q = q.where(BotUpdate.is_processed == False)  # noqa: E712
        rows = session.exec(q.order_by(BotUpdate.update_id).limit(limit)).all()
        out = []
        for u in rows:
            try:
                payload = json.loads(u.payload)
            except Exception:
                payload = {}
            out.append({"update_id": u.update_id, **payload})
        if rows:
            for u in rows:
                u.is_processed = True
                session.add(u)
            session.commit()
        return out

    # long polling: опрашиваем очередь до timeout секунд
    deadline = time.monotonic() + timeout
    while True:
        updates = fetch()
        if updates or time.monotonic() >= deadline:
            return updates
        await asyncio.sleep(0.5)


def _validate_webhook_url(url: str):
    """🛡 Только публичный HTTPS — блокируем SSRF на localhost/внутренние сети."""
    from urllib.parse import urlparse
    import ipaddress
    if not url.startswith("https://"):
        raise _api_error(400, "Bad Request: webhook URL must be HTTPS")
    if len(url) > 512:
        raise _api_error(400, "Bad Request: webhook URL too long")
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        raise _api_error(400, "Bad Request: invalid webhook URL")
    if not host:
        raise _api_error(400, "Bad Request: invalid webhook URL")
    if host in ("localhost", "0.0.0.0") or host.endswith(".local") \
            or host.endswith(".internal") or host.endswith(".localhost"):
        raise _api_error(400, "Bad Request: internal hosts are not allowed")
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise _api_error(400, "Bad Request: internal IPs are not allowed")
    except ValueError:
        pass  # обычный домен — ок


async def h_set_webhook(session: Session, bot: Bot, p: dict, request: Request):
    url = (p.get("url") or "").strip()
    if not url:
        raise _api_error(400, "Bad Request: url is required")
    _validate_webhook_url(url)
    secret = p.get("secret_token") or None
    if secret and len(secret) > 128:
        raise _api_error(400, "Bad Request: secret_token too long")
    bot.webhook_url = url[:512]
    bot.webhook_secret = secret
    session.add(bot)
    session.commit()
    return True


async def h_delete_webhook(session: Session, bot: Bot, p: dict, request: Request):
    bot.webhook_url = None
    bot.webhook_secret = None
    session.add(bot)
    session.commit()
    return True


async def h_get_webhook_info(session: Session, bot: Bot, p: dict, request: Request):
    pending = session.exec(select(BotUpdate).where(
        BotUpdate.bot_id == bot.id, BotUpdate.is_processed == False)).all()  # noqa: E712
    return {"url": bot.webhook_url or "", "has_custom_certificate": False,
            "pending_update_count": len(pending), "last_error_message": None}

# ------------------------------------------------------------------
# Чаты и участники
# ------------------------------------------------------------------

async def h_get_chat(session: Session, bot: Bot, p: dict, request: Request):
    chat_id = _int(p, "chat_id")
    if not chat_id:
        raise _api_error(400, "Bad Request: chat_id required")
    chat = _require_bot_in_chat(session, bot, chat_id)
    members = session.exec(select(ChatMember).where(ChatMember.chat_id == chat_id)).all()
    return {**_chat_out(session, chat), "members_count": len(members)}


async def h_get_chat_member(session: Session, bot: Bot, p: dict, request: Request):
    chat_id = _int(p, "chat_id")
    user_id = _int(p, "user_id")
    if not chat_id or not user_id:
        raise _api_error(400, "Bad Request: chat_id and user_id required")
    _require_bot_in_chat(session, bot, chat_id)
    m = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)).first()
    if not m:
        raise _api_error(404, "Not Found: member not found")
    return {"user": _user_out(session.get(User, user_id)),
            "status": m.role, "role": m.role}


async def h_leave_chat(session: Session, bot: Bot, p: dict, request: Request):
    chat_id = _int(p, "chat_id")
    if not chat_id:
        raise _api_error(400, "Bad Request: chat_id required")
    _require_bot_in_chat(session, bot, chat_id)
    m = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat_id, ChatMember.user_id == bot.user_id)).first()
    if m:
        session.delete(m)
        session.commit()
    return True


async def h_kick_chat_member(session: Session, bot: Bot, p: dict, request: Request):
    chat_id = _int(p, "chat_id")
    user_id = _int(p, "user_id")
    if not chat_id or not user_id:
        raise _api_error(400, "Bad Request: chat_id and user_id required")
    chat = _require_bot_in_chat(session, bot, chat_id)
    if chat.owner_id != bot.user_id:
        raise _api_error(403, "Forbidden: only chat owner can kick members")
    m = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)).first()
    if m:
        session.delete(m)
        session.commit()
    return True


async def h_pin_chat_message(session: Session, bot: Bot, p: dict, request: Request):
    chat_id = _int(p, "chat_id")
    message_id = _int(p, "message_id")
    if not chat_id or not message_id:
        raise _api_error(400, "Bad Request: chat_id and message_id required")
    _require_bot_in_chat(session, bot, chat_id)
    chat = session.get(Chat, chat_id)
    # 🛡 Закреплять может только владелец чата (или сам автор сообщения)
    m = session.get(Message, message_id)
    if not m or m.chat_id != chat_id:
        raise _api_error(404, "Not Found: message not found")
    if chat.owner_id != bot.user_id and m.sender_id != bot.user_id:
        raise _api_error(403, "Forbidden: only chat owner can pin messages")
    m.pinned = True
    m.pinned_at = datetime.now(timezone.utc)
    m.pinned_by = bot.user_id
    session.add(m)
    session.commit()
    return True


async def h_unpin_chat_message(session: Session, bot: Bot, p: dict, request: Request):
    chat_id = _int(p, "chat_id")
    message_id = _int(p, "message_id")
    if not chat_id or not message_id:
        raise _api_error(400, "Bad Request: chat_id and message_id required")
    _require_bot_in_chat(session, bot, chat_id)
    m = session.get(Message, message_id)
    if not m or m.chat_id != chat_id:
        raise _api_error(404, "Not Found: message not found")
    m.pinned = False
    session.add(m)
    session.commit()
    return True

# ------------------------------------------------------------------
# Специфичные методы соцсети: посты, лайки, друзья, файлы
# ------------------------------------------------------------------

async def h_create_post(session: Session, bot: Bot, p: dict, request: Request):
    text = (p.get("text") or "").strip()
    media_url = p.get("media_url")
    if not text and not media_url:
        raise _api_error(400, "Bad Request: text or media_url required")
    post = Post(author_id=bot.user_id, text=(text or "")[:8000],
                media_url=media_url, media_type=p.get("media_type"))
    session.add(post)
    session.commit()
    session.refresh(post)
    return {"post_id": post.id, "author_id": post.author_id, "text": post.text,
            "date": int(post.created_at.timestamp()) if post.created_at else None}


async def h_like_post(session: Session, bot: Bot, p: dict, request: Request):
    post_id = _int(p, "post_id")
    if not post_id:
        raise _api_error(400, "Bad Request: post_id required")
    if not session.get(Post, post_id):
        raise _api_error(404, "Not Found: post not found")
    existing = session.exec(select(Like).where(
        Like.user_id == bot.user_id, Like.post_id == post_id)).first()
    if existing:
        session.delete(existing)
        session.commit()
        return {"post_id": post_id, "liked": False}
    session.add(Like(user_id=bot.user_id, post_id=post_id))
    session.commit()
    return {"post_id": post_id, "liked": True}


async def h_comment_post(session: Session, bot: Bot, p: dict, request: Request):
    post_id = _int(p, "post_id")
    text = (p.get("text") or "").strip()
    if not post_id or not text:
        raise _api_error(400, "Bad Request: post_id and text required")
    if not session.get(Post, post_id):
        raise _api_error(404, "Not Found: post not found")
    c = Post(author_id=bot.user_id, text=text[:8000], reply_to_id=post_id)
    session.add(c)
    session.commit()
    session.refresh(c)
    return {"comment_id": c.id, "post_id": post_id, "text": c.text}


async def h_get_wall(session: Session, bot: Bot, p: dict, request: Request):
    user_id = _int(p, "user_id", bot.user_id)
    limit = min(max(_int(p, "limit", 20) or 20, 1), 100)
    posts = session.exec(select(Post).where(
        Post.author_id == user_id, Post.reply_to_id == None)  # noqa: E711
        .order_by(Post.id.desc()).limit(limit)).all()
    return [{"post_id": x.id, "text": x.text, "media_url": x.media_url,
             "date": int(x.created_at.timestamp()) if x.created_at else None}
            for x in posts]


async def h_add_friend(session: Session, bot: Bot, p: dict, request: Request):
    user_id = _int(p, "user_id")
    if not user_id:
        raise _api_error(400, "Bad Request: user_id required")
    u = session.get(User, user_id)
    if not u or u.is_bot:
        raise _api_error(404, "Not Found: user not found")
    existing = session.exec(select(Follow).where(
        Follow.follower_id == bot.user_id, Follow.followee_id == user_id)).first()
    if existing:
        return {"user_id": user_id, "requested": True, "already": True}
    session.add(Follow(follower_id=bot.user_id, followee_id=user_id))
    session.commit()
    return {"user_id": user_id, "requested": True}


async def h_accept_friend(session: Session, bot: Bot, p: dict, request: Request):
    """Бот принимает заявку: добавляем взаимную подписку bot->user."""
    user_id = _int(p, "user_id")
    if not user_id:
        raise _api_error(400, "Bad Request: user_id required")
    incoming = session.exec(select(Follow).where(
        Follow.follower_id == user_id, Follow.followee_id == bot.user_id)).first()
    if not incoming:
        raise _api_error(404, "Not Found: no incoming request from this user")
    existing = session.exec(select(Follow).where(
        Follow.follower_id == bot.user_id, Follow.followee_id == user_id)).first()
    if not existing:
        session.add(Follow(follower_id=bot.user_id, followee_id=user_id))
        session.commit()
    return {"user_id": user_id, "friends": True}


async def h_upload_file(session: Session, bot: Bot, p: dict, request: Request):
    """multipart/form-data: file=<file> → {file_url} для sendPhoto и т.д."""
    try:
        form = await request.form()
    except Exception:
        raise _api_error(400, "Bad Request: multipart/form-data expected")
    f = form.get("file")
    if not isinstance(f, UploadFile):
        raise _api_error(400, "Bad Request: file field is required")
    content = await f.read()
    if len(content) > MAX_MEDIA_SIZE:
        raise _api_error(413, "Request Entity Too Large: max 20MB")
    ext = os.path.splitext(f.filename or "")[1][:10].lower() or ".bin"
    # 🛡 Whitelist: никаких .html/.svg/.exe — защита от stored XSS через /uploads
    ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".webm", ".mp4",
                    ".mp3", ".ogg", ".wav", ".pdf", ".zip", ".txt"}
    if ext not in ALLOWED_EXTS:
        raise _api_error(415, "Unsupported Media Type: extension %s not allowed" % ext)
    fname = "bot_%s_%s%s" % (bot.id, secrets.token_hex(8), ext)
    os.makedirs("uploads", exist_ok=True)
    with open(os.path.join("uploads", fname), "wb") as out:
        out.write(content)
    return {"file_url": fname, "file_name": f.filename, "size": len(content)}

# ------------------------------------------------------------------
# Инфо о боте + команды + служебные
# ------------------------------------------------------------------

async def h_get_me(session: Session, bot: Bot, p: dict, request: Request):
    return _bot_user_out(session, bot)


async def h_get_my_commands(session: Session, bot: Bot, p: dict, request: Request):
    cmds = session.exec(select(BotCommand).where(
        BotCommand.bot_id == bot.id, BotCommand.enabled == True)).all()  # noqa: E712
    return [{"command": c.command.lstrip("/"),
             "description": (c.reply[:255] or c.command)} for c in cmds]


async def h_set_my_commands(session: Session, bot: Bot, p: dict, request: Request):
    commands = p.get("commands") or []
    for c in session.exec(select(BotCommand).where(BotCommand.bot_id == bot.id)).all():
        session.delete(c)
    for it in commands[:40]:
        if not isinstance(it, dict) or not it.get("command"):
            continue
        cmd = str(it["command"]).strip().lower().lstrip("/")
        if not cmd:
            continue
        session.add(BotCommand(bot_id=bot.id, command="/" + cmd[:39],
                               reply=(it.get("description") or "")[:1000],
                               action="reply_text", payload="{}", enabled=True))
    session.commit()
    return True


async def h_delete_message(session: Session, bot: Bot, p: dict, request: Request):
    chat_id = _int(p, "chat_id")
    message_id = _int(p, "message_id")
    if not chat_id or not message_id:
        raise _api_error(400, "Bad Request: chat_id and message_id required")
    m = session.get(Message, message_id)
    if not m or m.chat_id != chat_id or m.sender_id != bot.user_id:
        raise _api_error(404, "Not Found: message not found")
    session.delete(m)
    session.commit()
    return True


async def h_close(session: Session, bot: Bot, p: dict, request: Request):
    return True


async def h_log_out(session: Session, bot: Bot, p: dict, request: Request):
    reset_api_token_cache(bot.id)
    return True


_HANDLERS = {
    "getme": h_get_me,
    "sendmessage": h_send_message,
    "sendphoto": h_send_photo,
    "sendvideo": h_send_video,
    "sendaudio": h_send_audio,
    "senddocument": h_send_document,
    "sendsticker": h_send_sticker,
    "sendanimation": h_send_sticker,
    "sendpoll": h_send_poll,
    "sendtyping": h_send_typing,
    "sendchataction": h_send_chat_action,
    "getupdates": h_get_updates,
    "setwebhook": h_set_webhook,
    "deletewebhook": h_delete_webhook,
    "getwebhookinfo": h_get_webhook_info,
    "getchat": h_get_chat,
    "getchatmember": h_get_chat_member,
    "leavechat": h_leave_chat,
    "kickchatmember": h_kick_chat_member,
    "pinchatmessage": h_pin_chat_message,
    "unpinchatmessage": h_unpin_chat_message,
    "deletemessage": h_delete_message,
    "createpost": h_create_post,
    "likepost": h_like_post,
    "commentpost": h_comment_post,
    "getwall": h_get_wall,
    "addfriend": h_add_friend,
    "acceptfriend": h_accept_friend,
    "uploadfile": h_upload_file,
    "getmycommands": h_get_my_commands,
    "setmycommands": h_set_my_commands,
    "close": h_close,
    "logout": h_log_out,
}

# ------------------------------------------------------------------
# Owner API: управление ботом из фронтенда (Bearer-токен владельца)
# ------------------------------------------------------------------

def _owner_bot(bot_id: int, user, session: Session) -> Bot:
    from main import has_permission
    b = session.get(Bot, bot_id)
    if not b:
        raise HTTPException(404, "Бот не найден")
    if not (user.is_admin or b.owner_id == user.id
            or has_permission(user, "manage_roles", session)):
        raise HTTPException(403, "Нет доступа к этому боту")
    return b


@router.post("/api/admin/bots/{bot_id}/api-token/reset")
def owner_reset_token(bot_id: int, user: User = Depends(get_current_user),
                      session: Session = Depends(get_session)):
    """Сброс API-токена: новый возвращается ОДИН раз, старый перестаёт работать."""
    b = _owner_bot(bot_id, user, session)
    token = generate_api_token(b)
    session.add(b)
    session.commit()
    try:
        from bots import log_bot
        log_bot(session, b.id, "api_token_reset", user.id)
        session.commit()
    except Exception:
        pass
    return {"ok": True, "token": token,
            "warning": "Сохраните токен в безопасном месте. Он даёт полный доступ "
                       "к управлению ботом. Если вы потеряете токен, его можно "
                       "будет сбросить, но старый перестанет работать."}


@router.get("/api/admin/bots/{bot_id}/api")
def owner_api_info(bot_id: int, user: User = Depends(get_current_user),
                   session: Session = Depends(get_session)):
    b = _owner_bot(bot_id, user, session)
    chats = session.exec(select(ChatMember).where(ChatMember.user_id == b.user_id)).all()
    updates = session.exec(select(BotUpdate).where(BotUpdate.bot_id == b.id)).all()
    webhooks = session.exec(select(BotWebhookLog).where(BotWebhookLog.bot_id == b.id)
                            .order_by(BotWebhookLog.id.desc()).limit(50)).all()
    return {
        "has_token": bool(b.api_token_hash),
        "webhook_url": b.webhook_url,
        "webhook_secret_set": bool(b.webhook_secret),
        "stats": {"chats": len(chats), "updates_total": len(updates),
                  "updates_pending": len([u for u in updates if not u.is_processed])},
        "webhook_log": [{"update_id": w.update_id, "ok": w.ok,
                         "status_code": w.status_code, "error": w.error,
                         "created_at": w.created_at.isoformat() if w.created_at else None}
                        for w in webhooks],
    }


class WebhookIn(BaseModel):
    url: str = ""
    secret_token: Optional[str] = None


@router.post("/api/admin/bots/{bot_id}/webhook")
def owner_set_webhook(bot_id: int, data: WebhookIn,
                      user: User = Depends(get_current_user),
                      session: Session = Depends(get_session)):
    b = _owner_bot(bot_id, user, session)
    if data.url:
        if not data.url.startswith("https://"):
            raise HTTPException(400, "Webhook URL должен быть HTTPS")
        if len(data.url) > 512:
            raise HTTPException(400, "Webhook URL слишком длинный")
    b.webhook_url = data.url or None
    b.webhook_secret = data.secret_token or None
    session.add(b)
    session.commit()
    return {"ok": True, "webhook_url": b.webhook_url}


@router.get("/api/admin/bots/{bot_id}/updates")
def owner_recent_updates(bot_id: int, user: User = Depends(get_current_user),
                         session: Session = Depends(get_session)):
    """Последние обновления — для встроенного тестирования бота."""
    b = _owner_bot(bot_id, user, session)
    rows = session.exec(select(BotUpdate).where(BotUpdate.bot_id == b.id)
                        .order_by(BotUpdate.id.desc()).limit(50)).all()
    return [{"update_id": u.update_id, "is_processed": u.is_processed,
             "payload": json.loads(u.payload or "{}"),
             "created_at": u.created_at.isoformat() if u.created_at else None}
            for u in rows]


# ------------------------------------------------------------------
# Хук: новые сообщения боту → очередь обновлений (getUpdates/webhook).
# Вызывается из main.py после сохранения сообщения в чате с ботом.
# ------------------------------------------------------------------

def notify_bots_in_chat(session: Session, chat_id: int, msg: Message, sender: User):
    """Найти ботов-участников чата и положить событие message в их очереди.
    🛡 Секретные чаты боты НЕ получают никогда."""
    try:
        chat = session.get(Chat, chat_id)
        if not chat or chat.is_secret:
            return
        is_group = bool(chat.is_group)
        text = (msg.text or msg.ciphertext or "").strip()
        is_command = text.startswith("/")
        members = session.exec(select(ChatMember).where(
            ChatMember.chat_id == chat_id)).all()
        member_ids = {m.user_id for m in members}
        for uid in member_ids:
            if uid == sender.id:
                continue
            bu = session.get(User, uid)
            if not bu or not bu.is_bot:
                continue
            b = session.exec(select(Bot).where(Bot.user_id == uid,
                                               Bot.system == False)).first()  # noqa: E712
            if not b or not b.active:
                continue
            # 🛡 Privacy mode (как в Telegram): в группах бот видит только
            # команды, кроме случаев когда read_all_group_messages=True
            if is_group and not is_command:
                read_all = bool(_j_conf(b.config).get("read_all_group_messages"))
                if not read_all:
                    continue
            payload = {"message": _message_out(session, msg)}
            if is_command:
                payload["command"] = text.split()[0].split("@")[0].lower()
            emit_bot_update(session, b, payload)
    except Exception as e:
        print("bot_api notify:", e)


def _j_conf(s: Optional[str]) -> dict:
    try:
        d = json.loads(s or "{}")
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}







