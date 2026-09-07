# BOT COMPANY - единая платформа ботов (рабочие+пользовательские).
import json, re, secrets
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlmodel import Session, select
from database import get_session
from models import User, Bot, BotTrigger, BotLog, WorkChat, BOT_TYPES, Chat, ChatMember, BotCommand, StickerPack, Sticker, SystemSetting
from main import get_current_user, has_permission
from websocket_manager import manager

router = APIRouter(tags=["bots"])
TRIGGER_EVENTS = ("ticket_created", "ticket_assigned", "ticket_closed",
                  "rating_added", "member_joined", "member_left", "message", "custom")


def utcnow():
    return datetime.now(timezone.utc)


def _j(s):
    try:
        d = json.loads(s or "{}")
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def bot_out(b: Bot, session: Session) -> dict:
    u = session.get(User, b.owner_id) if b.owner_id else None
    trigs = session.exec(select(BotTrigger).where(BotTrigger.bot_id == b.id)).all()
    return {
        "id": b.id, "name": b.name, "username": b.username,
        "description": b.description, "type": b.type, "active": b.active,
        "owner_id": b.owner_id, "owner_username": u.username if u else None,
        "user_id": b.user_id, "bot_username": (session.get(User, b.user_id).username if b.user_id and session.get(User, b.user_id) else None),
        "chat_id": b.chat_id, "config": _j(b.config),
        "triggers": [{"id": t.id, "event": t.event, "action": _j(t.action),
                      "enabled": t.enabled} for t in trigs],
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


def require_bot_admin(b: Bot, user: User, session: Session):
    if user.is_admin or has_permission(user, "manage_roles", session):
        return
    if b.owner_id == user.id:
        return
    raise HTTPException(403, "Нет доступа к этому боту")


def log_bot(session, bot_id, action, actor_id=None, details=None):
    # 🛡 bot_log.bot_id имеет FK на bot.id — проверяем существование
    from models import Bot as _Bot
    if not bot_id or not session.get(_Bot, bot_id):
        return
    session.add(BotLog(bot_id=bot_id, actor_id=actor_id, action=action,
                       details=json.dumps(details or {})))


def valid_username(u):
    return bool(u and re.match(r"^[a-z0-9_]{3,32}$", u))


@router.post("/admin/bots/botfather/open")
def open_botfather_chat(user: User = Depends(get_current_user),
                        session: Session = Depends(get_session)):
    """Открыть (или создать) ЕДИНСТВЕННУЮ личку с BotFather."""
    chat = _botfather_dm(session, user)
    bf = ensure_botfather(session)
    session.commit()
    return {"ok": True, "chat_id": chat.id, "botfather_user_id": bf.user_id}


def _botfather_dm(session: Session, user: User):
    """ЕДИНСТВЕННАЯ личка user<->BotFather: находит или создаёт (без дублей)."""
    from models import Message as _Msg
    bf = ensure_botfather(session)
    session.commit()
    if not bf.user_id:
        raise HTTPException(500, "BotFather без аккаунта")
    # ищем существующую личку user <-> botfather
    for m in session.exec(select(ChatMember).where(
            ChatMember.user_id == user.id)).all():
        c = session.get(Chat, m.chat_id)
        if c and not c.is_group and not c.is_secret:
            others = session.exec(select(ChatMember).where(
                ChatMember.chat_id == c.id)).all()
            if {x.user_id for x in others} == {user.id, bf.user_id}:
                return c
    # нет — создаём
    c = Chat()
    session.add(c); session.commit(); session.refresh(c)
    session.add(ChatMember(chat_id=c.id, user_id=user.id, role="owner"))
    session.add(ChatMember(chat_id=c.id, user_id=bf.user_id, role="member"))
    session.commit()
    # приветствие от BotFather
    session.add(_Msg(chat_id=c.id, sender_id=bf.user_id,
                     text="Привет! Я BotFather 🤖\n\nНажми кнопку «Создать бота» "
                          "над полем ввода — или напиши /newbot."))
    session.commit()
    return c


def _create_user_bot(session: Session, owner_id: int, name: str, nick: str):
    """Создать пользовательского бота: аккаунт is_bot + Bot + API-ключ
    (bcrypt, показывается ОДИН раз — для Python-файла бота)."""
    from bot_api import generate_api_token
    bot = Bot(name=name[:60], type="custom", username=nick, active=True,
              token=secrets.token_hex(20), owner_id=owner_id, system=False)
    session.add(bot); session.commit(); session.refresh(bot)
    botu = User(username=nick, display_name=name[:60],
                password_hash=secrets.token_hex(16), is_bot=True)
    session.add(botu); session.commit(); session.refresh(botu)
    bot.user_id = botu.id
    session.add(bot); session.commit()
    api_token = generate_api_token(bot)
    session.add(bot); session.commit()
    log_bot(session, bot.id, "bot_created", owner_id, {"user_id": botu.id})
    session.commit()
    return bot, api_token


def _bf_say(session: Session, owner_id: int, text: str):
    """BotFather пишет сообщение в свою единственную личку с юзером."""
    from models import Message as _Msg
    bf = ensure_botfather(session)
    chat = _botfather_dm(session, session.get(User, owner_id))
    session.add(_Msg(chat_id=chat.id, sender_id=bf.user_id, text=text))
    session.commit()


@router.get("/admin/bots")
def list_bots(mine: int = 0, user: User = Depends(get_current_user),
              session: Session = Depends(get_session)):
    q = select(Bot)
    if mine:
        q = q.where(Bot.owner_id == user.id)
    return [bot_out(b, session) for b in session.exec(
        q.order_by(Bot.id.desc()).limit(200)).all()]


@router.get("/chats/{chat_id}/bot-commands")
def chat_bot_commands(chat_id: int, user: User = Depends(get_current_user),
                      session: Session = Depends(get_session)):
    """Команды всех ботов в чате — для подсказок при вводе '/' (как в Telegram)."""
    member = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    result = []
    for m in session.exec(select(ChatMember).where(
            ChatMember.chat_id == chat_id)).all():
        bu = session.get(User, m.user_id)
        if not bu or not bu.is_bot:
            continue
        b = session.exec(select(Bot).where(Bot.user_id == bu.id)).first()
        if not b:
            continue
        cmds = session.exec(select(BotCommand).where(
            BotCommand.bot_id == b.id, BotCommand.enabled == True)  # noqa: E712
            .order_by(BotCommand.id)).all()
        if not cmds:
            continue
        result.append({
            "bot_id": b.id, "bot_username": b.username, "bot_name": b.name,
            "bot_user_id": bu.id,
            "commands": [{"command": c.command,
                          "description": (c.reply or c.command)[:200]}
                         for c in cmds],
        })
    return {"bots": result}


# ------------------------------------------------------------------
# 👨💻 BotFather: создание ботов кнопками (API-ключ для Python-файла)
# ------------------------------------------------------------------

class BfCreateBotIn(BaseModel):
    name: str
    username: Optional[str] = None


@router.post("/botfather/create-bot")
def bf_create_bot(data: BfCreateBotIn, user: User = Depends(get_current_user),
                  session: Session = Depends(get_session)):
    """🤖 Создание пользовательского бота через BotFather (кнопки в чате).
    API-ключ возвращается ОДИН раз — он нужен в Python-файле бота."""
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(400, "Имя обязательно")
    nick = (data.username or "").strip().lstrip("@").lower()
    if not nick:
        nick = "bot_" + secrets.token_hex(3)
    if not valid_username(nick):
        raise HTTPException(400, "Ник: 3-32 символа, латиница, цифры, _")
    if session.exec(select(Bot).where(Bot.username == nick)).first():
        raise HTTPException(400, "Ник '@%s' занят" % nick)
    bot, api_token = _create_user_bot(session, user.id, name, nick)
    _bf_say(session, user.id,
            "Бот создан! 🤖\n\nИмя: %s\nНик: @%s\n\nAPI-ключ для Python-файла "
            "показан в окне создания. Сохраните его — он больше не покажется."
            % (name, nick))
    return {"ok": True,
            "bot": {"id": bot.id, "name": bot.name, "username": bot.username,
                    "user_id": bot.user_id},
            "token": api_token,
            "warning": "Сохраните ключ — он показывается только один раз. "
                       "Потеряли? Сбросьте через «Мои боты»."}


@router.get("/botfather/my-bots")
def bf_my_bots(user: User = Depends(get_current_user),
               session: Session = Depends(get_session)):
    """📱 Мои пользовательские боты (без ключей — они не хранятся открыто)."""
    mine = session.exec(select(Bot).where(
        Bot.owner_id == user.id, Bot.system == False)  # noqa: E712
        .order_by(Bot.id.desc()).limit(100)).all()
    result = []
    for b in mine:
        bu = session.get(User, b.user_id) if b.user_id else None
        result.append({"id": b.id, "name": b.name, "username": b.username,
                       "user_id": b.user_id, "active": b.active,
                       "description": b.description,
                       "avatar_url": bu.avatar_url if bu else None,
                       "link": (bu.bio if bu else None),
                       "has_api_key": bool(b.api_token_hash),
                       "created_at": b.created_at.isoformat() if b.created_at else None})
    return result


class BfResetIn(BaseModel):
    bot_id: int


@router.post("/botfather/reset-token")
def bf_reset_token(data: BfResetIn, user: User = Depends(get_current_user),
                   session: Session = Depends(get_session)):
    """🔑 Сброс API-ключа своего бота. Новый показывается один раз."""
    from bot_api import generate_api_token, reset_api_token_cache
    b = session.get(Bot, data.bot_id)
    if not b or b.system:
        raise HTTPException(404, "Бот не найден")
    if b.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "Это не ваш бот")
    token = generate_api_token(b)
    reset_api_token_cache(b.id)
    session.add(b)
    session.commit()
    _bf_say(session, user.id,
            "API-ключ бота @%s сброшен. Новый показан в окне — старый "
            "перестал работать." % (b.username or b.name))
    return {"ok": True, "token": token,
            "warning": "Сохраните ключ — он показывается только один раз."}


# ------------------------------------------------------------------
# ⚙️ Настройка бота: имя, описание, ссылка, аватарка
# ------------------------------------------------------------------

class BfEditBotIn(BaseModel):
    bot_id: int
    name: Optional[str] = None
    description: Optional[str] = None
    link: Optional[str] = None


def _own_bot_or_404(session: Session, bot_id: int, user: User) -> Bot:
    b = session.get(Bot, bot_id)
    if not b or b.system:
        raise HTTPException(404, "Бот не найден")
    if b.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "Это не ваш бот")
    return b


@router.post("/botfather/edit-bot")
def bf_edit_bot(data: BfEditBotIn, user: User = Depends(get_current_user),
                session: Session = Depends(get_session)):
    """⚙️ Настройка бота: имя, описание, ссылка (в bio аккаунта бота)."""
    b = _own_bot_or_404(session, data.bot_id, user)
    if data.name is not None:
        name = data.name.strip()
        if name:
            b.name = name[:60]
    if data.description is not None:
        b.description = data.description.strip()[:300]
    if data.link is not None:
        bu = session.get(User, b.user_id)
        if bu:
            bu.bio = data.link.strip()[:300]
            session.add(bu)
    session.add(b)
    session.commit()
    log_bot(session, b.id, "bot_edited", user.id,
            {"name": b.name, "description": b.description})
    session.commit()
    return {"ok": True, "bot": {"id": b.id, "name": b.name,
                                "username": b.username,
                                "description": b.description}}


@router.post("/botfather/{bot_id}/avatar")
async def bf_bot_avatar(bot_id: int, file: UploadFile = File(...),
                        user: User = Depends(get_current_user),
                        session: Session = Depends(get_session)):
    """🖼 Аватарка бота (картинка → Cloudinary → User.avatar_url аккаунта бота)."""
    b = _own_bot_or_404(session, bot_id, user)
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Нужна картинка")
    contents = await file.read()
    url = None
    try:
        import cloudinary.uploader
        result = cloudinary.uploader.upload(contents, folder="bot_avatars",
                                            resource_type="image")
        url = result["secure_url"]
    except Exception as e:
        # fallback: локальные uploads
        print("bot avatar cloudinary err:", e)
        import os as _os
        ext = _os.path.splitext(file.filename or "")[1][:10].lower() or ".png"
        fname = "bot_%s_%s%s" % (bot_id, secrets.token_hex(8), ext)
        _os.makedirs("uploads", exist_ok=True)
        with open(_os.path.join("uploads", fname), "wb") as out:
            out.write(contents)
        url = "uploads/" + fname
    bu = session.get(User, b.user_id)
    if not bu:
        raise HTTPException(500, "У бота нет аккаунта")
    bu.avatar_url = url
    session.add(bu)
    session.commit()
    log_bot(session, b.id, "bot_avatar_set", user.id, {"url": url})
    session.commit()
    return {"ok": True, "avatar_url": url}


class BotCreateIn(BaseModel):
    name: str
    type: str = "custom"
    username: Optional[str] = None
    description: Optional[str] = None
    chat_id: Optional[int] = None
    config: dict = {}


@router.post("/admin/bots")
def create_bot(data: BotCreateIn, user: User = Depends(get_current_user),
               session: Session = Depends(get_session)):
    if data.type not in BOT_TYPES:
        raise HTTPException(400, "Неизвестный тип: %s" % data.type)
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(400, "Имя обязательно")
    username = None
    if data.username:
        username = data.username.strip().lstrip("@").lower()
        if not valid_username(username):
            raise HTTPException(400, "Никнейм: 3-32 символа, латиница, цифры, _")
        if session.exec(select(Bot).where(Bot.username == username)).first():
            raise HTTPException(400, "Никнейм уже занят")
    owner_id = user.id
    if data.chat_id:
        if not (user.is_admin or has_permission(user, "manage_roles", session)):
            raise HTTPException(403, "Рабочих ботов создаёт админ")
        if not session.get(WorkChat, data.chat_id):
            raise HTTPException(404, "Рабочий чат не найден")
    bot = Bot(name=name, type=data.type, username=username,
              description=(data.description or "")[:300], active=True,
              token=secrets.token_hex(20), owner_id=owner_id,
              chat_id=data.chat_id, config=json.dumps(data.config or {}))
    session.add(bot)
    session.commit()
    session.refresh(bot)

    # 🤖 Аккаунт-бот (User.is_bot=True) — чтобы бота можно было добавлять
    # в обычные групповые чаты как участника (как в Telegram).
    bot_username = username or ("bot_%s" % secrets.token_hex(4))
    base = bot_username
    suffix = 0
    while session.exec(select(User).where(User.username == bot_username)).first():
        suffix += 1
        bot_username = "%s_%d" % (base, suffix)
    bot_user = User(
        username=bot_username,
        display_name=name[:60],
        password_hash=secrets.token_hex(16),
        is_bot=True,
    )
    session.add(bot_user)
    session.commit()
    session.refresh(bot_user)
    bot.user_id = bot_user.id
    session.add(bot)
    session.commit()

    log_bot(session, bot.id, "bot_created", user.id,
            {"type": data.type, "chat_id": data.chat_id, "user_id": bot_user.id})
    session.commit()
    return bot_out(bot, session)
class BotUpdateIn(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None
    config: Optional[dict] = None


@router.patch("/admin/bots/{bot_id}")
def update_bot(bot_id: int, data: BotUpdateIn,
               user: User = Depends(get_current_user),
               session: Session = Depends(get_session)):
    b = session.get(Bot, bot_id)
    if not b:
        raise HTTPException(404, "Бот не найден")
    require_bot_admin(b, user, session)
    if data.name is not None:
        b.name = data.name.strip()[:60] or b.name
    if data.username is not None:
        username = data.username.strip().lstrip("@").lower()
        if not valid_username(username):
            raise HTTPException(400, "Никнейм: 3-32 символа, латиница, цифры, _")
        if session.exec(select(Bot).where(Bot.username == username,
                                          Bot.id != bot_id)).first():
            raise HTTPException(400, "Никнейм уже занят")
        b.username = username
    if data.description is not None:
        b.description = data.description[:300]
    if data.active is not None:
        b.active = bool(data.active)
    if data.config is not None:
        b.config = json.dumps(data.config)
    session.add(b)
    session.commit()
    log_bot(session, b.id, "bot_updated", user.id, {"active": b.active})
    session.commit()
    return bot_out(b, session)


@router.delete("/admin/bots/{bot_id}")
def delete_bot(bot_id: int, user: User = Depends(get_current_user),
               session: Session = Depends(get_session)):
    b = session.get(Bot, bot_id)
    if not b:
        raise HTTPException(404, "Бот не найден")
    require_bot_admin(b, user, session)
    for t in session.exec(select(BotTrigger).where(BotTrigger.bot_id == b.id)).all():
        session.delete(t)
    session.delete(b)
    session.commit()
    return {"ok": True}


@router.post("/admin/bots/{bot_id}/toggle")
async def toggle_bot(bot_id: int, user: User = Depends(get_current_user),
                     session: Session = Depends(get_session)):
    b = session.get(Bot, bot_id)
    if not b:
        raise HTTPException(404, "Бот не найден")
    require_bot_admin(b, user, session)
    b.active = not b.active
    session.add(b)
    session.commit()
    log_bot(session, b.id, "bot_toggled", user.id, {"active": b.active})
    session.commit()
    await manager.send_to_user(user.id, "bot_toggled",
                               {"bot_id": b.id, "active": b.active})
    return {"ok": True, "bot_id": b.id, "active": b.active}


@router.get("/admin/bots/{bot_id}/logs")
def bot_logs(bot_id: int, limit: int = 50,
             user: User = Depends(get_current_user),
             session: Session = Depends(get_session)):
    b = session.get(Bot, bot_id)
    if not b:
        raise HTTPException(404, "Бот не найден")
    require_bot_admin(b, user, session)
    out = []
    for lg in session.exec(select(BotLog).where(BotLog.bot_id == b.id).order_by(
            BotLog.id.desc()).limit(min(limit, 100))).all():
        actor = session.get(User, lg.actor_id) if lg.actor_id else None
        out.append({"id": lg.id, "action": lg.action,
                    "actor_username": actor.username if actor else None,
                    "details": _j(lg.details),
                    "created_at": lg.created_at.isoformat() if lg.created_at else None})
    return out


class TriggerIn(BaseModel):
    event: str
    action: dict = {}
    enabled: bool = True


@router.put("/admin/bots/{bot_id}/triggers")
def set_triggers(bot_id: int, data: list[TriggerIn],
                 user: User = Depends(get_current_user),
                 session: Session = Depends(get_session)):
    b = session.get(Bot, bot_id)
    if not b:
        raise HTTPException(404, "Бот не найден")
    require_bot_admin(b, user, session)
    for t in session.exec(select(BotTrigger).where(
            BotTrigger.bot_id == b.id)).all():
        session.delete(t)
    for it in data[:20]:
        if it.event not in TRIGGER_EVENTS:
            raise HTTPException(400, "Неизвестный event: %s" % it.event)
        session.add(BotTrigger(bot_id=b.id, event=it.event,
                               action=json.dumps(it.action or {}),
                               enabled=it.enabled))
    session.commit()
    log_bot(session, b.id, "triggers_updated", user.id, {"count": len(data)})
    session.commit()
    return bot_out(b, session)


def get_worker_bot_for_chat(session: Session, chat_id: int) -> Optional[Bot]:
    return session.exec(select(Bot).where(Bot.chat_id == chat_id,
                                          Bot.type == "worker")).first()


# ------------------------------------------------------------------
# 👨💻 BotFather — системный бот платформы (как в Telegram)
# ------------------------------------------------------------------

BOTFATHER_USERNAME = "botfather"


# 🖼 Аватар BotFather: статика из public-папки фронтенда ("public:"-префикс).
# Заменить — просто положить другой файл: nebula/l_frontend/public/botfather.png
BOTFATHER_AVATAR = "public:/botfather.png"


def ensure_botfather(session: Session) -> Bot:
    """Создаёт системного бота BotFather (аккаунт is_bot, личка)."""
    b = session.exec(select(Bot).where(
        Bot.username == BOTFATHER_USERNAME)).first()
    if b:
        # 🖼 проставляем аватар, если его ещё нет (старые БД)
        if b.user_id:
            bu = session.get(User, b.user_id)
            if bu and not bu.avatar_url:
                bu.avatar_url = BOTFATHER_AVATAR
                session.add(bu)
                session.commit()
        return b
    bu = User(username=BOTFATHER_USERNAME, display_name="BotFather",
              password_hash=secrets.token_hex(16), is_bot=True,
              avatar_url=BOTFATHER_AVATAR)
    session.add(bu)
    session.commit()
    session.refresh(bu)
    b = Bot(name="BotFather", username=BOTFATHER_USERNAME,
            description="Отец всех ботов. Создаёт ботов, выдаёт токены.",
            type="custom", active=True, token=secrets.token_hex(20),
            owner_id=None, user_id=bu.id, system=True)
    session.add(b)
    session.commit()
    session.refresh(b)
    for cmd, reply in [
        ("/start", "Привет! Я BotFather 🤖\n\nСоздать бота — /newbot\n"
                   "Мои боты — /mybots\nТокен — /token\nКоманды — /setcommands"),
        ("/newbot", "Отправь имя и ник нового бота как:\n\n"
                    "Имя: MyBot\nНик: my_bot_bot\n\nИли просто напиши название."),
        ("/mybots", "Напиши /mybots — покажу твоих ботов.\nПолное управление на /bots."),
        ("/token", "Напиши /token — пришлю токены твоих ботов."),
        ("/setcommands", "Команды настраиваются на /bots → бот → «Команды»."),
    ]:
        session.add(BotCommand(bot_id=b.id, command=cmd, reply=reply,
                               action="reply_text", payload="{}"))
    session.commit()
    log_bot(session, b.id, "botfather_created", None, {"user_id": bu.id})
    session.commit()
    return b


# ------------------------------------------------------------------
# 💬 Боты в обычных чатах (как в Telegram: добавить бота в группу)
# ------------------------------------------------------------------

def _bot_chat_ids(session: Session, b: Bot) -> list[int]:
    if not b.user_id:
        return []
    rows = session.exec(select(ChatMember.chat_id).where(
        ChatMember.user_id == b.user_id)).all()
    return list(rows)


def _can_manage_chat(session: Session, chat: Chat, user: User) -> bool:
    if user.is_admin:
        return True
    m = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat.id, ChatMember.user_id == user.id)).first()
    return bool(m and m.role in ("owner", "admin"))


class ChatIdIn(BaseModel):
    chat_id: int


@router.post("/admin/bots/{bot_id}/add-to-chat")
def add_bot_to_chat(bot_id: int, data: ChatIdIn,
                    user: User = Depends(get_current_user),
                    session: Session = Depends(get_session)):
    """Добавить бота участником в групповой чат (право: владелец бота +
    owner/admin чата, либо глобальный админ)."""
    b = session.get(Bot, bot_id)
    if not b:
        raise HTTPException(404, "Бот не найден")
    if not (user.is_admin or b.owner_id == user.id
            or has_permission(user, "manage_roles", session)):
        raise HTTPException(403, "Нет доступа к этому боту")
    if not b.user_id:
        raise HTTPException(400, "У бота нет аккаунта")
    chat = session.get(Chat, data.chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")
    if not chat.is_group:
        raise HTTPException(400, "Бота можно добавить только в группу")
    if not _can_manage_chat(session, chat, user):
        raise HTTPException(403, "Нет прав на этот чат (нужен owner/admin)")
    existing = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat.id, ChatMember.user_id == b.user_id)).first()
    if existing:
        return {"ok": True, "already": True}
    session.add(ChatMember(chat_id=chat.id, user_id=b.user_id, role="member"))
    session.commit()
    log_bot(session, b.id, "bot_added_to_chat", user.id,
            {"chat_id": chat.id, "chat_name": chat.name})
    session.commit()
    return {"ok": True, "chat_id": chat.id, "bot_user_id": b.user_id}


@router.post("/admin/bots/{bot_id}/remove-from-chat")
def remove_bot_from_chat(bot_id: int, data: ChatIdIn,
                         user: User = Depends(get_current_user),
                         session: Session = Depends(get_session)):
    b = session.get(Bot, bot_id)
    if not b:
        raise HTTPException(404, "Бот не найден")
    if not (user.is_admin or b.owner_id == user.id
            or has_permission(user, "manage_roles", session)):
        raise HTTPException(403, "Нет доступа к этому боту")
    if not b.user_id:
        raise HTTPException(400, "У бота нет аккаунта")
    m = session.exec(select(ChatMember).where(
        ChatMember.chat_id == data.chat_id, ChatMember.user_id == b.user_id)).first()
    if not m:
        return {"ok": True, "already": True}
    session.delete(m)
    session.commit()
    log_bot(session, b.id, "bot_removed_from_chat", user.id,
            {"chat_id": data.chat_id})
    session.commit()
    return {"ok": True}


@router.get("/admin/bots/{bot_id}/chats")
def bot_chats(bot_id: int, user: User = Depends(get_current_user),
              session: Session = Depends(get_session)):
    """В каких чатах состоит бот."""
    b = session.get(Bot, bot_id)
    if not b:
        raise HTTPException(404, "Бот не найден")
    require_bot_admin(b, user, session)
    out = []
    for cid in _bot_chat_ids(session, b):
        c = session.get(Chat, cid)
        if c:
            out.append({"id": c.id, "name": c.name, "is_group": c.is_group})
    return out# ------------------------------------------------------------------
# ⌨️ Программируемые команды ботов (+ движок обработки СМС боту)
# ------------------------------------------------------------------

class BotCommandIn(BaseModel):
    command: str
    reply: str = ""
    action: str = "reply_text"
    payload: dict = {}


@router.get("/admin/bots/{bot_id}/commands")
def bot_commands_list(bot_id: int, user: User = Depends(get_current_user),
                      session: Session = Depends(get_session)):
    b = session.get(Bot, bot_id)
    if not b:
        raise HTTPException(404, "Бот не найден")
    require_bot_admin(b, user, session)
    cmds = session.exec(select(BotCommand).where(
        BotCommand.bot_id == b.id).order_by(BotCommand.id)).all()
    return [{"id": c.id, "command": c.command, "reply": c.reply,
             "action": c.action, "payload": _j(c.payload),
             "enabled": c.enabled} for c in cmds]


@router.put("/admin/bots/{bot_id}/commands")
def bot_commands_set(bot_id: int, data: list[BotCommandIn],
                     user: User = Depends(get_current_user),
                     session: Session = Depends(get_session)):
    b = session.get(Bot, bot_id)
    if not b:
        raise HTTPException(404, "Бот не найден")
    require_bot_admin(b, user, session)
    for c in session.exec(select(BotCommand).where(
            BotCommand.bot_id == b.id)).all():
        session.delete(c)
    act_allowed = ("reply_text", "reply_sticker", "create_sticker")
    for it in data[:40]:
        cmd = (it.command or "").strip().lower()
        if not cmd.startswith("/"):
            cmd = "/" + cmd.lstrip("/")
        if it.action not in act_allowed:
            raise HTTPException(400, "action: %s" % ", ".join(act_allowed))
        session.add(BotCommand(bot_id=b.id, command=cmd[:40],
                               reply=(it.reply or "")[:1000],
                               action=it.action,
                               payload=json.dumps(it.payload or {}),
                               enabled=True))
    session.commit()
    log_bot(session, b.id, "commands_updated", user.id, {"count": len(data)})
    session.commit()
    return {"ok": True, "count": len(data)}


def bot_hello_message(b: Optional[Bot], name: str,
                      text: str, payload: dict) -> str:
    """Текстовый ответ боту при указании на него (например: /start@Bot)."""
    return ""


# ------------------------------------------------------------------
# 🤖 DдиНЖжок: обработка сообщения в адрес бота (бот в личке/группе)
#    ВЫЗЫВАЕТСЯ из main.py при отправке сообщения в чат, где есть бот.
# ------------------------------------------------------------------

def handle_bot_message(session: Session, chat_id: int, sender_id: int,
                       text: str):
    """Если в чате есть бот и текст начинается с / — бот отвечает своей командой.
    Пишем ответ как сообщение от аккаунта-бота (User.is_bot)."""
    if not text or not text.startswith("/"):
        return False
    bots_in_chat = []
    for m in session.exec(select(ChatMember).where(
            ChatMember.chat_id == chat_id)).all():
        if m.user_id == sender_id:
            continue
        bu = session.get(User, m.user_id)
        if bu and bu.is_bot:
            b = session.exec(select(Bot).where(Bot.user_id == bu.id)).first()
            if b and not b.system:
                bots_in_chat.append(b)
    if not bots_in_chat:
        return False
    cmd_word = text.split()[0].split("@")[0].lower()  # /start | /start@bot
    replied = False
    from models import Message
    for b in bots_in_chat:
        cmd = session.exec(select(BotCommand).where(
            BotCommand.bot_id == b.id, BotCommand.command == cmd_word,
            BotCommand.enabled == True)).first()  # noqa: E712
        if not cmd:
            continue
        bu = session.get(User, b.user_id)
        out_text = cmd.reply
        if cmd.action == "reply_sticker":
            p = _j(cmd.payload)
            pack_name = p.get("sticker_pack")
            if pack_name:
                pack = session.exec(select(StickerPack).where(
                    StickerPack.name == pack_name)).first()
                if pack:
                    st = session.exec(select(Sticker).where(
                        Sticker.pack_id == pack.id)).first()
                    if st and st.type == "image":
                        out_text = (out_text + "\n🖼 " + st.content).strip()
        elif cmd.action == "create_sticker":
            out_text = (out_text or "Отправь картинку — добавлю её в стикерпак моего владельца.")
        if out_text and bu:
            session.add(Message(chat_id=chat_id, sender_id=bu.id,
                                text=out_text))
            replied = True
    if replied:
        session.commit()
    return replied


def handle_botfather_dm(session: Session, sender_id: int, text: str) -> bool:
    """Обработка лички с BotFather: /newbot создаёт бота, /token выдаёт токен."""
    bf = session.exec(select(Bot).where(
        Bot.username == BOTFATHER_USERNAME)).first()
    if not bf or not bf.user_id:
        return False
    from models import Chat as _Chat, Message as _Msg
    dm = None
    for m in session.exec(select(ChatMember).where(
            ChatMember.user_id == sender_id)).all():
        others = session.exec(select(ChatMember).where(
            ChatMember.chat_id == m.chat_id)).all()
        uids = {x.user_id for x in others}
        if uids == {sender_id, bf.user_id}:
            c = session.get(_Chat, m.chat_id)
            if c and not getattr(c, "is_group", False):
                dm = c
                break
    if not dm:
        return False

    def send(t):
        session.add(_Msg(chat_id=dm.id, sender_id=bf.user_id, text=t))
        session.commit()

    t = (text or "").strip()
    low = t.lower()
    if low.startswith("/newbot"):
        name = None
        nick = None
        for ln in t.splitlines():
            if ":" in ln:
                k, v = ln.split(":", 1)
                kl = k.lower()
                if "имя" in kl or "name" in kl:
                    name = v.strip()
                elif "ник" in kl or "nick" in kl or "username" in kl:
                    nick = v.strip().lstrip("@")
        if not name:
            rest = t.split(" ", 1)[1] if " " in t else ""
            name = rest.split(",")[0].strip() or None
        if not name:
            send("Напиши так:\n/newbot MyBot\nИли:\nИмя: MyBot")
            return True
        nick = nick or ("bot_" + secrets.token_hex(3))
        if session.exec(select(Bot).where(Bot.username == nick)).first():
            send("Ник '@%s' занят. Выбери другой." % nick)
            return True
        bot, api_token = _create_user_bot(session, sender_id, name, nick)
        send("Бот создан! 🤖\n\nИмя: %s\nНик: @%s\n\n"
             "API-ключ (для Python-файла бота):\n%s\n\n"
             "⚠️ Ключ показывается один раз — сохрани его. "
             "Потерял? Сбрось через «Мои боты» в меню над вводом."
             % (name, nick, api_token))
        return True
    if low == "/mybots":
        mine = session.exec(select(Bot).where(
            Bot.owner_id == sender_id, Bot.system == False)).all()
        if mine:
            send("Мои боты:\n" + "\n".join(
                ["@%s — %s%s" % (b.username or b.name, b.name,
                                 "" if b.active else " (выкл)") for b in mine]))
        else:
            send("У тебя нет ботов. Нажми «Создать бота» над вводом или /newbot")
        return True
    if low.startswith("/token"):
        send("API-ключ бота показывается один раз — при создании или сбросе.\n"
             "Забыл ключ? Сбрось его через «Мои боты» (кнопка над вводом) "
             "или напиши /revoke @ник.")
        return True
    if low.startswith("/revoke"):
        parts = t.split()
        if len(parts) < 2:
            send("Формат: /revoke @имя_бота — сбросить API-ключ.")
            return True
        nick = parts[1].lstrip("@")
        b = session.exec(select(Bot).where(
            Bot.owner_id == sender_id, Bot.username == nick)).first()
        if not b:
            send("Бота '@%s' у тебя нет." % nick)
            return True
        from bot_api import generate_api_token, reset_api_token_cache
        token = generate_api_token(b)
        reset_api_token_cache(b.id)
        session.add(b); session.commit()
        send("API-ключ @%s сброшен. Новый:\n%s\n\nСтарый перестал работать."
             % (nick, token))
        return True
    if low.startswith("/setcommands"):
        # формат: /setcommands <имя_бота> команда описание
        # или:     /setcommands <имя_бота> очистить
        from models import BotCommand as _BC
        parts = t.split()
        if len(parts) < 3:
            send("Формат: /setcommands <имя_бота> команда описание\n"
                 "Пример: /setcommands myhelper_bot /start Приветствие\n"
                 "Очистить команды: /setcommands myhelper_bot очистить")
            return True
        nick = parts[1].lstrip("@")
        b = session.exec(select(Bot).where(Bot.owner_id == sender_id,
                                           Bot.username == nick)).first()
        if not b:
            send("Бота '@%s' у тебя нет." % nick)
            return True
        if parts[2].lower() == "очистить" or parts[2].lower() == "clear":
            for c in session.exec(select(_BC).where(_BC.bot_id == b.id)).all():
                session.delete(c)
            session.commit()
            send("Команды бота @%s очищены." % nick)
            return True
        cmd = parts[2]
        if not cmd.startswith("/"):
            cmd = "/" + cmd
        desc = " ".join(parts[3:])[:200] or cmd
        exist = session.exec(select(_BC).where(_BC.bot_id == b.id,
                                               _BC.command == cmd)).first()
        if exist:
            exist.reply = desc
            session.add(exist)
        else:
            session.add(_BC(bot_id=b.id, command=cmd[:40], reply=desc,
                            action="reply_text", payload="{}", enabled=True))
        session.commit()
        send("Команда %s → «%s» назначена боту @%s. "
             "Увидеть меню можно на странице /bots." % (cmd, desc, nick))
        return True
    if low in ("/help", "/start"):
        send("BotFather:\n/newbot — создать\n/mybots — список\n"
             "/token — токены\n/setcommands — команды")
        return True
    return False