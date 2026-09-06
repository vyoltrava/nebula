# BOT COMPANY - единая платформа ботов (рабочие+пользовательские).
import json, re, secrets
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from database import get_session
from models import User, Bot, BotTrigger, BotLog, WorkChat, BOT_TYPES
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
    session.add(BotLog(bot_id=bot_id, actor_id=actor_id, action=action,
                       details=json.dumps(details or {})))


def valid_username(u):
    return bool(u and re.match(r"^[a-z0-9_]{3,32}$", u))


@router.get("/admin/bots")
def list_bots(mine: int = 0, user: User = Depends(get_current_user),
              session: Session = Depends(get_session)):
    q = select(Bot)
    if mine:
        q = q.where(Bot.owner_id == user.id)
    return [bot_out(b, session) for b in session.exec(
        q.order_by(Bot.id.desc()).limit(200)).all()]


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
    log_bot(session, bot.id, "bot_created", user.id,
            {"type": data.type, "chat_id": data.chat_id})
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
