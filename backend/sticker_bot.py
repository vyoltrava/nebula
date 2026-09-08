# ============================================================
# 🎨 STICKER BOT — единый системный стикер-бот (свой чат).
#    Создаёт П ОЛЬЗОВАТЕЛЬСКИЕ стикерпаки от имени юзера.
#    User API: MY CRUSER см. эндпоинты /api/sticker-packs (user).
# ============================================================
import json
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel
from sqlmodel import Session, select, func

from database import get_session
from models import (
    User, Bot, BotLog, BotCommand, Chat, ChatMember, Message,
    StickerPack, Sticker, SystemSetting,
)
from main import get_current_user, has_permission, log_action, get_client_ip
from websocket_manager import manager

router = APIRouter(tags=["sticker-bot"])

STICKERBOT_USERNAME = "stickerbot"
# 🖼 Аватар StickerBot: статика из public (меняется заменой файла)
STICKERBOT_AVATAR = "public:/stickerbot.png"


def utcnow():
    return datetime.now(timezone.utc)


def _log(session, actor_id, action, details=None, bot_id=None, ip=None):
    # 🛡 bot_log.bot_id имеет FK на bot.id — проверяем существование
    from models import Bot as _Bot
    if bot_id and session.get(_Bot, bot_id):
        session.add(BotLog(bot_id=bot_id, actor_id=actor_id, action=action,
                           details=json.dumps(details or {})))
    if ip:
        log_action(session, actor_id, action, ip_address=ip)


def ensure_stickerbot(session: Session) -> Bot:
    """Единый системный стикер-бот (аккаунт is_bot, свой чат-панель)."""
    b = session.exec(select(Bot).where(
        Bot.username == STICKERBOT_USERNAME)).first()
    if b:
        # проставляем аватар, если его ещё нет (старые БД)
        if b.user_id:
            bu = session.get(User, b.user_id)
            if bu and not bu.avatar_url:
                bu.avatar_url = STICKERBOT_AVATAR
                session.add(bu); session.commit()
        return b
    bu = User(username=STICKERBOT_USERNAME, display_name="StickerBot",
              password_hash=secrets.token_hex(16), is_bot=True,
              avatar_url=STICKERBOT_AVATAR)
    session.add(bu); session.commit(); session.refresh(bu)
    b = Bot(name="StickerBot", username=STICKERBOT_USERNAME,
            description="Единый стикер-бот. Создаёт пользовательские стикерпаки.",
            type="sticker", active=True, token=secrets.token_hex(20),
            owner_id=None, user_id=bu.id, system=True)
    session.add(b); session.commit(); session.refresh(b)
    for cmd, reply in [
        ("/start", "Привет! Я StickerBot 🎨\n\nСоздать свой пак — /newpack\n"
                   "Мои паки — /mypacks"), 
        ("/newpack", "Напиши /newpack Название — создам твой стикерпак."),
        ("/mypacks", "Напиши /mypacks — покажу твои паки."),
    ]:
        session.add(BotCommand(bot_id=b.id, command=cmd, reply=reply,
                               action="reply_text", payload="{}"))
    session.commit()
    return b


# Официальный чат стикер-бота (для юзеров, создают паки прямо там)
def ensure_stickerbot_chat(session: Session, actor: Optional[User] = None) -> Chat:
    b = ensure_stickerbot(session)
    # ищем существующий общий чат-панель (2+ участника, все с is_bot)
    for m in session.exec(select(ChatMember).where(
            ChatMember.user_id == b.user_id)).all():
        c = session.get(Chat, m.chat_id)
        if c and c.is_group:
            mems = session.exec(select(ChatMember).where(
                ChatMember.chat_id == c.id)).all()
            if len(mems) == 1:
                return c
    c = Chat(is_group=True, name="🎨 StickerBot · твои стикеры", owner_id=b.user_id)
    session.add(c); session.commit(); session.refresh(c)
    session.add(ChatMember(chat_id=c.id, user_id=b.user_id, role="owner"))
    session.commit()
    return c
# ------------------------------------------------------------------
# 📦 User API — пользовательские стикерпаки (через стикер-бот)
# ------------------------------------------------------------------

# ------------------------------------------------------------------
# 💬 Открытие лички со StickerBot (UI-кнопка, как BotFather)
# ------------------------------------------------------------------

@router.post("/sticker-bot/open")
def open_stickerbot_chat(user: User = Depends(get_current_user),
                         session: Session = Depends(get_session)):
    """Открыть (или создать) личку со StickerBot."""
    from models import Message as _Msg
    sb = ensure_stickerbot(session)
    session.commit()
    if not sb.user_id:
        raise HTTPException(500, "StickerBot без аккаунта")
    # ищем существующую личку user <-> stickerbot
    for m in session.exec(select(ChatMember).where(
            ChatMember.user_id == user.id)).all():
        c = session.get(Chat, m.chat_id)
        if c and not c.is_group and not c.is_secret:
            others = session.exec(select(ChatMember).where(
                ChatMember.chat_id == c.id)).all()
            if {x.user_id for x in others} == {user.id, sb.user_id}:
                return {"ok": True, "chat_id": c.id, "bot_user_id": sb.user_id}
    # нет — создаём
    c = Chat()
    session.add(c); session.commit(); session.refresh(c)
    session.add(ChatMember(chat_id=c.id, user_id=user.id, role="owner"))
    session.add(ChatMember(chat_id=c.id, user_id=sb.user_id, role="member"))
    session.commit()
    # приветствие от StickerBot
    session.add(_Msg(chat_id=c.id, sender_id=sb.user_id,
                     text="Привет! Я StickerBot 🎨\n\nСоздать свой стикерпак — /newpack Название\n"
                          "Мои паки — /mypacks\n\nЗагрузить картинки можно на странице «Мои стикеры»."))
    session.commit()
    return {"ok": True, "chat_id": c.id, "bot_user_id": sb.user_id}


def _pack_out(p: StickerPack, session: Session) -> dict:
    stickers = session.exec(select(Sticker).where(
        Sticker.pack_id == p.id).order_by(Sticker.order)).all()
    owner = session.get(User, p.owner_id) if p.owner_id else None
    return {
        "id": p.id, "name": p.name, "is_user": p.is_user,
        "is_builtin": p.is_builtin, "banned": p.banned,
        "is_public": bool(getattr(p, "is_public", True)),
        "owner_id": p.owner_id, "owner_username": owner.username if owner else None,
        "stickers": [{"id": s.id, "type": s.type, "content": s.content,
                      "order": s.order} for s in stickers],
    }


@router.get("/sticker-packs/mine")
def my_sticker_packs(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    packs = session.exec(select(StickerPack).where(
        StickerPack.is_user == True, StickerPack.owner_id == user.id)) \
        .order_by(StickerPack.id.desc()).all()
    return [_pack_out(p, session) for p in packs]


class NewPackIn(BaseModel):
    name: str
    emojis: list[str] = []
    is_public: bool = True


@router.post("/sticker-packs")
def create_user_pack(data: NewPackIn,
                     user: User = Depends(get_current_user),
                     session: Session = Depends(get_session)):
    name = (data.name or "").strip()[:60]
    if not name:
        raise HTTPException(400, "Имя обязательно")
    if session.exec(select(StickerPack).where(
            StickerPack.name == name, StickerPack.owner_id == user.id)).first():
        raise HTTPException(400, "Пак с таким именем уже есть")
    pack = StickerPack(name=name, is_active=True, is_user=True,
                       owner_id=user.id, min_level=1,
                       is_public=bool(data.is_public))
    session.add(pack); session.commit(); session.refresh(pack)
    for e in data.emojis[:50]:
        if e:
            session.add(Sticker(pack_id=pack.id, type="emoji", content=e))
    session.commit()
    _log(session, user.id, "user_pack_created", {"pack_id": pack.id, "name": name})
    session.commit()
    return _pack_out(pack, session)


@router.post("/sticker-packs/{pack_id}/upload")
async def upload_sticker(pack_id: int, file: UploadFile = File(...),
                         emoji: str = Form(""),
                         user: User = Depends(get_current_user),
                         session: Session = Depends(get_session)):
    pack = session.get(StickerPack, pack_id)
    if not pack or not pack.is_user:
        raise HTTPException(404, "Пак не найден")
    if pack.banned:
        raise HTTPException(403, "Пак забанен")
    if pack.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "Это не ваш стикерпак")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Нужна картинка")
    contents = await file.read()
    try:
        import cloudinary.uploader
        result = cloudinary.uploader.upload(contents, folder="user_stickers",
                                            resource_type="image")
        url = result["secure_url"]
    except Exception as e:
        print("sticker upload err:", e)
        raise HTTPException(500, "Не удалось загрузить картинку")
    max_order = session.exec(select(func.max(Sticker.order)).where(
        Sticker.pack_id == pack_id)).one() or 0
    s = Sticker(pack_id=pack_id, type="image", content=url, order=max_order + 1)
    session.add(s)
    session.commit(); session.refresh(s)
    _log(session, user.id, "user_sticker_added",
         {"pack_id": pack_id, "sticker_id": s.id})
    session.commit()
    return {"ok": True, "sticker": {"id": s.id, "type": "image", "content": url}}


@router.delete("/sticker-packs/{pack_id}")
def delete_user_pack(pack_id: int,
                     user: User = Depends(get_current_user),
                     session: Session = Depends(get_session)):
    pack = session.get(StickerPack, pack_id)
    if not pack or not pack.is_user:
        raise HTTPException(404, "Пак не найден")
    if pack.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "Не ваш пак")
    for s in session.exec(select(Sticker).where(Sticker.pack_id == pack_id)).all():
        session.delete(s)
    session.delete(pack)
    session.commit()
    _log(session, user.id, "user_pack_deleted", {"pack_id": pack_id})
    session.commit()
    return {"ok": True}


class VisibilityIn(BaseModel):
    is_public: bool


@router.post("/sticker-packs/{pack_id}/visibility")
def set_pack_visibility(pack_id: int, data: VisibilityIn,
                        user: User = Depends(get_current_user),
                        session: Session = Depends(get_session)):
    """Владелец делает пак публичным или приватным (админам видно всегда)."""
    pack = session.get(StickerPack, pack_id)
    if not pack or not pack.is_user:
        raise HTTPException(404, "Пак не найден")
    if pack.owner_id != user.id and not user.is_admin:
        raise HTTPException(403, "Не ваш пак")
    pack.is_public = bool(data.is_public)
    session.add(pack)
    session.commit()
    _log(session, user.id, "pack_visibility_changed",
         {"pack_id": pack_id, "is_public": pack.is_public})
    session.commit()
    return {"ok": True, "is_public": pack.is_public}


@router.get("/sticker-packs/public")
def public_sticker_packs(user: User = Depends(get_current_user),
                         session: Session = Depends(get_session)):
    """🪐 Каталог: все ПУБЛИЧНЫЕ пользовательские паки.
    Админам (manage_stickers) видны и приватные, и забаненные."""
    is_admin = user.is_admin or has_permission(user, "manage_stickers", session)
    q = select(StickerPack).where(StickerPack.is_user == True)  # noqa: E712
    if not is_admin:
        q = q.where(StickerPack.is_public == True,  # noqa: E712
                    StickerPack.banned == False,  # noqa: E712
                    StickerPack.is_active == True)  # noqa: E712
    packs = session.exec(q.order_by(StickerPack.id.desc()).limit(200)).all()
    return [_pack_out(p, session) for p in packs]


@router.get("/admin/user-packs")
def admin_list_user_packs(user: User = Depends(get_current_user),
                          session: Session = Depends(get_session)):
    """🛡 Админ: все пользовательские паки (вкл. приватные и забаненные)."""
    _require_sticker_admin(user, session)
    packs = session.exec(select(StickerPack).where(
        StickerPack.is_user == True).order_by(StickerPack.id.desc())
        .limit(500)).all()  # noqa: E712
    out = []
    for p in packs:
        cnt = session.exec(select(func.count(Sticker.id)).where(
            Sticker.pack_id == p.id)).one() or 0
        out.append({"id": p.id, "name": p.name, "banned": p.banned,
                    "is_public": bool(getattr(p, "is_public", True)),
                    "is_active": p.is_active,
                    "owner_id": p.owner_id,
                    "owner_username": (session.get(User, p.owner_id).username
                                       if p.owner_id else None),
                    "stickers_count": cnt,
                    "created_at": p.created_at.isoformat() if p.created_at else None})
    return out
# ------------------------------------------------------------------
# 🛡 Админ: удаление стикера/пака, бан юзера с его паками
# ------------------------------------------------------------------

def _require_sticker_admin(user: User, session: Session):
    if not (user.is_admin or has_permission(user, "manage_stickers", session)):
        raise HTTPException(403, "Нет права: manage_stickers")


@router.delete("/admin/user-stickers/{sticker_id}")
def admin_delete_user_sticker(sticker_id: int,
                              user: User = Depends(get_current_user),
                              session: Session = Depends(get_session)):
    _require_sticker_admin(user, session)
    s = session.get(Sticker, sticker_id)
    if not s:
        raise HTTPException(404, "Стикер не найден")
    session.delete(s)
    session.commit()
    _log(session, user.id, "admin_delete_sticker", {"sticker_id": sticker_id})
    session.commit()
    return {"ok": True}


@router.delete("/admin/user-packs/{pack_id}")
def admin_delete_user_pack(pack_id: int,
                           user: User = Depends(get_current_user),
                           session: Session = Depends(get_session)):
    _require_sticker_admin(user, session)
    pack = session.get(StickerPack, pack_id)
    if not pack:
        raise HTTPException(404, "Пак не найден")
    for s in session.exec(select(Sticker).where(Sticker.pack_id == pack_id)).all():
        session.delete(s)
    to_del = session.get(User, pack.owner_id) if pack.owner_id else None
    session.delete(pack)
    session.commit()
    _log(session, user.id, "admin_delete_pack", {"pack_id": pack_id})
    session.commit()
    return {"ok": True}


class BanPackIn(BaseModel):
    ban: bool = True
    ban_user: bool = True


@router.post("/admin/user-packs/{pack_id}/ban")
def admin_ban_user_pack(pack_id: int, data: BanPackIn,
                        request: Request,
                        user: User = Depends(get_current_user),
                        session: Session = Depends(get_session)):
    """Бан юзера вместе со всеми его стикерпаками."""
    ip = get_client_ip(request)
    _require_sticker_admin(user, session)
    pack = session.get(StickerPack, pack_id)
    if not pack:
        raise HTTPException(404, "Пак не найден")
    pack.banned = bool(data.ban)
    pack.is_active = not data.ban
    session.add(pack)
    if data.ban_user and pack.owner_id:
        target = session.get(User, pack.owner_id)
        for p in session.exec(select(StickerPack).where(
                StickerPack.owner_id == pack.owner_id)).all():
            p.banned = bool(data.ban)
            p.is_active = not data.ban
            session.add(p)
        if target:
            target.is_banned = True
            session.add(target)
        _log(session, user.id, "admin_ban_pack_user",
             {"pack_id": pack_id, "user_id": pack.owner_id, "ban": data.ban}, ip=ip)
    _log(session, user.id, "admin_ban_pack", {"pack_id": pack_id, "ban": data.ban}, ip=ip)
    session.commit()
    return {"ok": True, "banned": data.ban}
# ------------------------------------------------------------------
# 💬 Обработка команд стикер-бота в чате (/newpack, /mypacks)
# ------------------------------------------------------------------

def handle_stickerbot_command(session: Session, chat_id: int, sender_id: int,
                              text: str) -> bool:
    """Если в чате есть StickerBot и текст с / — отвечает созданием пака."""
    if not text.startswith("/"):
        return False
    sb = session.exec(select(Bot).where(
        Bot.username == STICKERBOT_USERNAME)).first()
    if not sb or not sb.user_id:
        return False
    in_chat = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat_id,
        ChatMember.user_id == sb.user_id)).first()
    if not in_chat:
        return False
    low = (text or "").lower()
    from models import Message as _Msg

    def send(t):
        session.add(_Msg(chat_id=chat_id, sender_id=sb.user_id, text=t))
        session.commit()

    if low.startswith("/newpack"):
        name = text.split(" ", 1)[1][:60] if " " in text else ""
        if not name:
            send("Напиши /newpack Название пака — создам его у тебя.")
            return True
        dup = session.exec(select(StickerPack).where(
            StickerPack.name == name,
            StickerPack.owner_id == sender_id)).first()
        if dup:
            send("Пак «%s» уже есть. Пиши другое имя." % name)
            return True
        pack = StickerPack(name=name, is_active=True, is_user=True,
                           owner_id=sender_id, min_level=1)
        session.add(pack); session.commit(); session.refresh(pack)
        _log(session, sender_id, "user_pack_created_via_bot",
             {"pack_id": pack.id, "name": name})
        session.commit()
        send("Создал твой стикерпак «%s»! Загрузить картинки можно "
             "через кнопку 🪐 в окне стикеров." % name)
        return True
    if low.strip() == "/mypacks":
        packs = session.exec(select(StickerPack).where(
            StickerPack.owner_id == sender_id,
            StickerPack.is_user == True)).all()  # noqa: E712
        if packs:
            lines = []
            for p in packs:
                cnt = session.exec(select(func.count(Sticker.id)).where(
                    Sticker.pack_id == p.id)).one() or 0
                lines.append("%s (%s шт.)%s" % (p.name, cnt,
                                                " (забанен)" if p.banned else ""))
            send("Твои паки:\n" + "\n".join(lines))
        else:
            send("Паков нет. /newpack Название")
        return True
    if low.strip() in ("/start", "/help"):
        send("Я StickerBot 🎨\n\n/newpack Название — создать свой стикерпак\n"
             "/mypacks — мои паки\n\nКартинки загружай на странице «Мои стикеры».")
        return True
    return False