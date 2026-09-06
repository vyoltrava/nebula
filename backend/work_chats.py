# ============================================================
# 🏢 РАБОЧИЕ ЧАТЫ — изолированная CRM-подсистема: свои таблицы,
#    роуты /api/work/*, WS work_*. Chat/Message не трогаем. Без E2EE.
# ============================================================
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import (
    User, Role, RoleCategory, Report, SupportTicket, BugReport,
    WorkChat, WorkChatMember, WorkChatMessage, WorkTicket, WorkSectionConfig,
    WorkTicketRating, WorkPromotionLog,
    WORK_ROLES, WORK_SECTIONS,
)
from websocket_manager import manager
from main import get_current_user

router = APIRouter(tags=["work-chats"])


def utcnow():
    return datetime.now(timezone.utc)


ROLE_RANK = {"head": 4, "deputy": 3, "worker": 2, "novice": 1}
PROMO_CLOSED_REQUIRED = 50
PROMO_AVG_REQUIRED = 4.0
PROMO_NEXT = {"novice": "worker", "worker": "deputy"}


def get_member(session: Session, chat_id: int, user_id: int):
    return session.exec(select(WorkChatMember).where(
        WorkChatMember.chat_id == chat_id,
        WorkChatMember.user_id == user_id)).first()


def require_member(session: Session, chat_id: int, user: User) -> WorkChatMember:
    m = get_member(session, chat_id, user.id)
    if not m:
        raise HTTPException(403, "Вы не участник этого рабочего чата")
    return m


def member_out(m: WorkChatMember, session: Session) -> dict:
    u = session.get(User, m.user_id)
    return {
        "user_id": m.user_id,
        "username": u.username if u else None,
        "display_name": u.display_name if u else None,
        "role": m.role,
        "on_shift": m.on_shift,
        "shift_taken": m.shift_taken,
        "handles": json.loads(m.handles or "[]"),
        "joined_at": m.joined_at.isoformat() if m.joined_at else None,
    }


def chat_out(c: WorkChat, session: Session) -> dict:
    members = session.exec(
        select(WorkChatMember).where(WorkChatMember.chat_id == c.id)).all()
    sections = session.exec(
        select(WorkSectionConfig).where(WorkSectionConfig.chat_id == c.id)).all()
    return {
        "id": c.id, "name": c.name, "category_id": c.category_id,
        "is_active": c.is_active, "member_count": len(members),
        "members": [member_out(m, session) for m in members],
        "sections": [{"section": s.section, "enabled": s.enabled,
                      "default_priority": s.default_priority} for s in sections],
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def msg_out(m: WorkChatMessage, session: Session) -> dict:
    u = session.get(User, m.sender_id) if m.sender_id else None
    return {
        "id": m.id, "chat_id": m.chat_id, "sender_id": m.sender_id,
        "sender_username": u.username if u else "bot",
        "sender_display_name": (u.display_name if u else None) or "Бот",
        "text": m.text, "reply_to_id": m.reply_to_id, "kind": m.kind,
        "ticket_id": m.ticket_id,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


async def broadcast_work(chat_id: int, event: str, data: dict, session: Session):
    """WS всем участникам рабочего чата (события work_*)."""
    ids = session.exec(select(WorkChatMember.user_id).where(
        WorkChatMember.chat_id == chat_id)).all()
    await manager.broadcast_to_users(list(set(ids)), event, data)


def log_bot(session: Session, bot_id, action: str,
            actor_id: Optional[int] = None, details: dict | None = None):
    from models import BotLog
    session.add(BotLog(bot_id=bot_id or 0, actor_id=actor_id,
                       action=action, details=json.dumps(details or {})))


def require_admin(user: User, session: Session):
    from main import has_permission
    if not (user.is_admin or has_permission(user, "manage_roles", session)):
        raise HTTPException(403, "Нет права: manage_roles")


def visible_chats(session: Session, user: User) -> list:
    memberships = session.exec(select(WorkChatMember).where(
        WorkChatMember.user_id == user.id)).all()
    mine = {m.chat_id for m in memberships}
    if user.is_admin:
        return session.exec(select(WorkChat)).all()
    return [c for c in session.exec(select(WorkChat)).all() if c.id in mine]


def get_chat_or_404(session: Session, chat_id: int) -> WorkChat:
    chat = session.get(WorkChat, chat_id)
    if not chat:
        raise HTTPException(404, "Рабочий чат не найден")
    return chat
# ------------------------------------------------------------------
# 🏗 Создание чатов + бот отдела
# ------------------------------------------------------------------

def _ensure_worker_bot(session: Session, chat: WorkChat):
    from models import Bot
    bot = session.exec(select(Bot).where(
        Bot.chat_id == chat.id, Bot.type == "worker")).first()
    if bot:
        return bot
    bot = Bot(name="Bot " + chat.name, type="worker", active=True,
              token=secrets.token_hex(20), chat_id=chat.id)
    session.add(bot)
    session.commit()
    session.refresh(bot)
    log_bot(session, bot.id, "worker_bot_created", None, {"chat_id": chat.id})
    return bot


def ensure_work_chat(session: Session, category: RoleCategory,
                     actor: Optional[User] = None) -> WorkChat:
    """Авто-создание рабочего чата под категорию роли + бота отдела."""
    existing = session.exec(
        select(WorkChat).where(WorkChat.category_id == category.id)).first()
    if existing:
        return existing
    chat = WorkChat(category_id=category.id, name=category.name[:80],
                    created_by=actor.id if actor else None)
    session.add(chat)
    session.commit()
    session.refresh(chat)
    _ensure_worker_bot(session, chat)
    log_bot(session, None, "work_chat_created", actor.id if actor else None,
            {"chat_id": chat.id, "category": category.name})
    session.commit()
    return chat


def ensure_work_chats_for_categories(session: Session, actor: Optional[User] = None):
    """На старте: чат под каждую категорию, где есть is_staff роли."""
    cats = session.exec(select(RoleCategory)).all()
    staff_cat_ids = {row for row in session.exec(
        select(Role.category_id).where(Role.is_staff == True)).all() if row}
    created = []
    for cat in cats:
        if cat.id in staff_cat_ids:
            chat = session.exec(
                select(WorkChat).where(WorkChat.category_id == cat.id)).first()
            if not chat:
                created.append(ensure_work_chat(session, cat, actor).id)
    return created


# ------------------------------------------------------------------
# 🤖 Бот-распределитель: round-robin + фильтр сложности
# ------------------------------------------------------------------

def _pick_assignee(session: Session, chat_id: int, section: str,
                   priority: str) -> Optional[WorkChatMember]:
    """Round-robin: head/deputy пропускаются; novice — только low."""
    members = session.exec(select(WorkChatMember).where(
        WorkChatMember.chat_id == chat_id)).all()
    candidates = []
    for m in members:
        if m.role not in ("worker", "novice") or not m.on_shift:
            continue
        handles = json.loads(m.handles or "[]")
        if handles and section not in handles:
            continue
        if m.role == "novice" and priority != "low":
            continue
        candidates.append(m)
    if not candidates:
        return None
    candidates.sort(key=lambda m: (m.shift_taken, m.id or 0))
    return candidates[0]


def ticket_out(t: WorkTicket, session: Session) -> dict:
    a = session.get(User, t.assignee_id) if t.assignee_id else None
    rating = session.exec(select(WorkTicketRating).where(
        WorkTicketRating.ticket_id == t.id)).first()
    return {
        "id": t.id, "chat_id": t.chat_id, "section": t.section,
        "title": t.title, "description": t.description,
        "priority": t.priority, "source_url": t.source_url,
        "source_type": t.source_type, "status": t.status,
        "assignee_id": t.assignee_id,
        "assignee_username": a.username if a else None,
        "author_id": t.author_id,
        "taken_at": t.taken_at.isoformat() if t.taken_at else None,
        "closed_at": t.closed_at.isoformat() if t.closed_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "rating": rating.score if rating else None,
    }


async def post_system_message(session: Session, chat_id: int, text: str,
                              kind: str = "system",
                              ticket_id: Optional[int] = None) -> WorkChatMessage:
    msg = WorkChatMessage(chat_id=chat_id, sender_id=None, text=text,
                          kind=kind, ticket_id=ticket_id)
    session.add(msg)
    session.commit()
    session.refresh(msg)
    await broadcast_work(chat_id, "work_new_message",
                         {"chat_id": chat_id, "message": msg_out(msg, session)},
                         session)
    return msg
async def dispatch_ticket(session: Session, chat_id: int, section: str,
                          title: str, description: Optional[str],
                          priority: str, source_type: str = "manual",
                          source_id: Optional[int] = None,
                          source_url: Optional[str] = None,
                          author_id: Optional[int] = None) -> WorkTicket:
    """Бот отдела: карточка заявки + round-robin. Нет воркеров → head."""
    ticket = WorkTicket(
        chat_id=chat_id, section=section, title=title[:160],
        description=description, priority=priority,
        source_type=source_type, source_id=source_id,
        source_url=source_url, author_id=author_id, status="open",
    )
    assignee = _pick_assignee(session, chat_id, section, priority)
    head = session.exec(select(WorkChatMember).where(
        WorkChatMember.chat_id == chat_id,
        WorkChatMember.role == "head")).first()
    if assignee:
        ticket.status = "assigned"
        ticket.assignee_id = assignee.user_id
        assignee.shift_taken += 1
        session.add(assignee)
    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    assignee_u = session.get(User, ticket.assignee_id) if ticket.assignee_id else None
    head_u = session.get(User, head.user_id) if head else None
    msg = ("Новая заявка #%s · раздел: %s · приоритет: %s\n%s\n%s\n" % (
        ticket.id, section, priority, title, description or ""))
    if source_url:
        msg += "Ссылка: %s\n" % source_url
    if assignee_u:
        msg += "Назначено: @%s" % assignee_u.username
    else:
        msg += "Нет свободных исполнителей — уведомлён старший"
        if head_u:
            msg += " (@%s)" % head_u.username
    await post_system_message(session, chat_id, msg,
                              kind="ticket_card", ticket_id=ticket.id)
    await broadcast_work(chat_id, "work_ticket_new",
                         {"chat_id": chat_id,
                          "ticket": ticket_out(ticket, session)}, session)
    if not assignee and head:
        await manager.send_to_user(
            head.user_id, "work_ticket_unassigned",
            {"chat_id": chat_id, "ticket": ticket_out(ticket, session)})
    return ticket


async def process_source(session: Session, section: str, source_type: str,
                         source_id: int, title: str, description: Optional[str],
                         priority: str, author_id: Optional[int],
                         source_url: Optional[str] = None) -> bool:
    """Событие внешнего источника → привязанные чаты → раздача."""
    configs = session.exec(select(WorkSectionConfig).where(
        WorkSectionConfig.section == section,
        WorkSectionConfig.enabled == True)).all()  # noqa: E712
    dispatched = False
    for cfg in configs:
        chat = session.get(WorkChat, cfg.chat_id)
        if not chat or not chat.is_active:
            continue
        if priority not in ("low", "medium", "high"):
            priority = cfg.default_priority
        dup = session.exec(select(WorkTicket).where(
            WorkTicket.source_type == source_type,
            WorkTicket.source_id == source_id,
            WorkTicket.chat_id == chat.id)).first()
        if dup:
            continue
        await dispatch_ticket(session, chat.id, section, title, description,
                              priority, source_type, source_id, source_url,
                              author_id)
        dispatched = True
    return dispatched
# ------------------------------------------------------------------
# 🌐 REST: /api/work/* — чаты и доступ
# ------------------------------------------------------------------

@router.get("/work/chats")
def list_work_chats(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return [chat_out(c, session) for c in visible_chats(session, user)]


@router.post("/work/chats")
async def create_work_chat(
    data: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Ручное создание (если авто-создание не сработало)."""
    require_admin(user, session)
    cat = session.get(RoleCategory, int(data.get("category_id") or 0))
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    chat = ensure_work_chat(session, cat, user)
    await post_system_message(session, chat.id, "Рабочий чат отдела создан")
    return chat_out(chat, session)


@router.patch("/work/chats/{chat_id}")
def update_work_chat(
    chat_id: int,
    data: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    chat = get_chat_or_404(session, chat_id)
    m = require_member(session, chat_id, user)
    if m.role != "head" and not user.is_admin:
        raise HTTPException(403, "Только старший отдела или админ")
    if "is_active" in data:
        chat.is_active = bool(data["is_active"])
    if "name" in data and data["name"]:
        chat.name = str(data["name"])[:80]
    session.add(chat)
    session.commit()
    return chat_out(chat, session)


@router.get("/work/staff-search")
def staff_search(
    q: str = "",
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Поиск пользователей с staff-плашкой (только их можно добавлять)."""
    roles = session.exec(select(Role).where(Role.is_staff == True)).all()  # noqa: E712
    role_ids = {r.id for r in roles}
    ql = q.strip().lower()
    out = []
    for u in session.exec(select(User).where(User.is_bot == False)).all():  # noqa: E712
        if u.role_id not in role_ids:
            continue
        if ql and ql not in (u.username or "").lower() \
                and ql not in (u.display_name or "").lower():
            continue
        out.append({"id": u.id, "username": u.username,
                    "display_name": u.display_name})
        if len(out) >= 20:
            break
    return out


class MemberIn(BaseModel):
    user_id: int
    role: str = "novice"


@router.post("/work/chats/{chat_id}/members")
async def add_member(
    chat_id: int,
    data: MemberIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_chat_or_404(session, chat_id)
    m = require_member(session, chat_id, user)
    if m.role not in ("head", "deputy") and not user.is_admin:
        raise HTTPException(403, "Недостаточно прав")
    if data.role not in WORK_ROLES:
        raise HTTPException(400, "Роль: head|deputy|worker|novice")
    if data.role == "head" and not user.is_admin:
        raise HTTPException(403, "Старшего назначает только глобальный админ")
    if data.role == "deputy" and m.role != "head" and not user.is_admin:
        raise HTTPException(403, "Зам. старшего назначает только старший")
    target = session.get(User, data.user_id)
    if not target or target.is_bot:
        raise HTTPException(404, "Пользователь не найден")
    role = session.get(Role, target.role_id) if target.role_id else None
    if not (role and role.is_staff) and not user.is_admin:
        raise HTTPException(403, "Добавлять можно только сотрудников (staff)")
    if get_member(session, chat_id, data.user_id):
        raise HTTPException(400, "Уже участник")
    member = WorkChatMember(chat_id=chat_id, user_id=data.user_id,
                            role=data.role, added_by=user.id)
    session.add(member)
    session.commit()
    session.refresh(member)
    await post_system_message(
        session, chat_id,
        "Участник @%s присоединился к отделу (роль: %s)" % (target.username, data.role))
    await broadcast_work(chat_id, "work_member_joined",
                         {"chat_id": chat_id,
                          "member": member_out(member, session)}, session)
    return member_out(member, session)


@router.delete("/work/chats/{chat_id}/members/{user_id}")
async def remove_member(
    chat_id: int,
    user_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_chat_or_404(session, chat_id)
    m = require_member(session, chat_id, user)
    if m.role not in ("head", "deputy") and not user.is_admin and user.id != user_id:
        raise HTTPException(403, "Недостаточно прав")
    member = get_member(session, chat_id, user_id)
    if not member:
        raise HTTPException(404, "Не участник")
    if member.role == "head" and not user.is_admin:
        raise HTTPException(403, "Старшего может снять только глобальный админ")
    session.delete(member)
    session.commit()
    await post_system_message(session, chat_id, "Участник покинул отдел")
    await broadcast_work(chat_id, "work_member_left",
                         {"chat_id": chat_id, "user_id": user_id}, session)
    return {"ok": True}
class RoleIn(BaseModel):
    role: str


@router.patch("/work/chats/{chat_id}/members/{user_id}/role")
async def set_member_role(
    chat_id: int,
    user_id: int,
    data: RoleIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_chat_or_404(session, chat_id)
    m = require_member(session, chat_id, user)
    if data.role not in WORK_ROLES:
        raise HTTPException(400, "Роль: head|deputy|worker|novice")
    if data.role == "head" and not user.is_admin:
        raise HTTPException(403, "Старшего назначает только глобальный админ")
    if data.role == "deputy" and not (user.is_admin or m.role == "head"):
        raise HTTPException(403, "Зам. назначает только старший или админ")
    if data.role in ("worker", "novice") \
            and not (user.is_admin or m.role in ("head", "deputy")):
        raise HTTPException(403, "Недостаточно прав")
    member = get_member(session, chat_id, user_id)
    if not member:
        raise HTTPException(404, "Не участник")
    if member.role == "head" and not user.is_admin:
        raise HTTPException(403, "Роль старшего меняет только глобальный админ")
    member.role = data.role
    session.add(member)
    session.commit()
    await broadcast_work(chat_id, "work_member_role",
                         {"chat_id": chat_id, "user_id": user_id,
                          "role": data.role}, session)
    return member_out(member, session)


class ShiftIn(BaseModel):
    on_shift: bool


@router.patch("/work/chats/{chat_id}/shift")
async def toggle_shift(
    chat_id: int,
    data: ShiftIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """/enter — на смене, /exit — ушёл со смены (сброс round-robin)."""
    member = require_member(session, chat_id, user)
    member.on_shift = data.on_shift
    member.shift_entered_at = utcnow() if data.on_shift else None
    if not data.on_shift:
        member.shift_taken = 0
    session.add(member)
    session.commit()
    await broadcast_work(chat_id, "work_shift",
                         {"chat_id": chat_id, "user_id": user.id,
                          "on_shift": data.on_shift}, session)
    return {"ok": True, "on_shift": member.on_shift}


# ------------------------------------------------------------------
# 🎯 Разделы + сообщения
# ------------------------------------------------------------------

class SectionsIn(BaseModel):
    sections: list[dict]  # [{section, enabled, default_priority}]


@router.put("/work/chats/{chat_id}/sections")
async def set_sections(
    chat_id: int,
    data: SectionsIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Привязка разделов (жалобы/поддержка/баги/чаты) + сложность по умолчанию."""
    chat = get_chat_or_404(session, chat_id)
    m = require_member(session, chat_id, user)
    if m.role not in ("head", "deputy") and not user.is_admin:
        raise HTTPException(403, "Недостаточно прав")
    for item in data.sections[:8]:
        section = str(item.get("section", ""))
        if section not in WORK_SECTIONS:
            raise HTTPException(400, "Неизвестный раздел: %s" % section)
        cfg = session.exec(select(WorkSectionConfig).where(
            WorkSectionConfig.chat_id == chat_id,
            WorkSectionConfig.section == section)).first()
        if not cfg:
            cfg = WorkSectionConfig(chat_id=chat_id, section=section)
        cfg.enabled = bool(item.get("enabled", True))
        pr = str(item.get("default_priority", "medium"))
        cfg.default_priority = pr if pr in ("low", "medium", "high") else "medium"
        session.add(cfg)
    session.commit()
    return chat_out(chat, session)["sections"]


@router.get("/work/chats/{chat_id}/messages")
def list_messages(
    chat_id: int,
    before: int = 0,
    limit: int = 50,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_chat_or_404(session, chat_id)
    require_member(session, chat_id, user)
    q = select(WorkChatMessage).where(WorkChatMessage.chat_id == chat_id)
    if before:
        q = q.where(WorkChatMessage.id < before)
    msgs = session.exec(q.order_by(WorkChatMessage.id.desc()).limit(
        min(limit, 100))).all()
    return [msg_out(m, session) for m in reversed(msgs)]


class MessageIn(BaseModel):
    text: str
    reply_to_id: Optional[int] = None


@router.post("/work/chats/{chat_id}/messages")
async def send_message(
    chat_id: int,
    data: MessageIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_chat_or_404(session, chat_id)
    require_member(session, chat_id, user)
    text = (data.text or "").strip()
    if not text:
        raise HTTPException(400, "Пустое сообщение")
    if len(text) > 4000:
        raise HTTPException(400, "Максимум 4000 символов")
    msg = WorkChatMessage(chat_id=chat_id, sender_id=user.id, text=text,
                          reply_to_id=data.reply_to_id, kind="text")
    session.add(msg)
    session.commit()
    session.refresh(msg)
    await broadcast_work(chat_id, "work_new_message",
                         {"chat_id": chat_id, "message": msg_out(msg, session)},
                         session)
    return msg_out(msg, session)
# ------------------------------------------------------------------
# 🎫 Тикеты: очередь / взять / закрыть / оценить
# ------------------------------------------------------------------

@router.get("/work/tickets")
def list_tickets(
    chat_id: int = 0,
    status: str = "",
    mine: int = 0,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    q = select(WorkTicket)
    if chat_id:
        require_member(session, chat_id, user)
        q = q.where(WorkTicket.chat_id == chat_id)
    else:
        chat_ids = [m.chat_id for m in session.exec(
            select(WorkChatMember).where(
                WorkChatMember.user_id == user.id)).all()]
        if not chat_ids:
            return []
        q = q.where(WorkTicket.chat_id.in_(chat_ids))
    if status:
        q = q.where(WorkTicket.status == status)
    if mine:
        q = q.where(WorkTicket.assignee_id == user.id)
    tickets = session.exec(q.order_by(
        WorkTicket.id.desc()).limit(200)).all()
    return [ticket_out(t, session) for t in tickets]


@router.post("/work/tickets/{ticket_id}/take")
async def take_ticket(
    ticket_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """«Взять в работу» — идемпотентная блокировка за сотрудником."""
    t = session.get(WorkTicket, ticket_id)
    if not t:
        raise HTTPException(404, "Заявка не найдена")
    m = require_member(session, t.chat_id, user)
    if t.status == "done":
        raise HTTPException(400, "Заявка уже закрыта")
    if t.status == "assigned" and t.assignee_id not in (None, user.id):
        raise HTTPException(409, "Заявка уже взята другим сотрудником")
    was = t.assignee_id
    t.assignee_id = user.id
    t.status = "assigned"
    if not was:
        t.taken_at = utcnow()
        m.shift_taken += 1
        session.add(m)
    session.add(t)
    session.commit()
    await broadcast_work(t.chat_id, "work_ticket_taken",
                         {"chat_id": t.chat_id,
                          "ticket": ticket_out(t, session)}, session)
    return ticket_out(t, session)


@router.post("/work/tickets/{ticket_id}/close")
async def close_ticket(
    ticket_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    t = session.get(WorkTicket, ticket_id)
    if not t:
        raise HTTPException(404, "Заявка не найдена")
    m = require_member(session, t.chat_id, user)
    if t.assignee_id != user.id and m.role not in ("head", "deputy") \
            and not user.is_admin:
        raise HTTPException(403, "Закрывает исполнитель или старший")
    if t.status == "done":
        return ticket_out(t, session)
    t.status = "done"
    t.closed_at = utcnow()
    t.closed_by = user.id
    if not t.assignee_id:
        t.assignee_id = user.id
        t.taken_at = t.taken_at or t.closed_at
    session.add(t)
    session.commit()
    await post_system_message(
        session, t.chat_id,
        "Заявка #%s закрыта @%s. Автору отправлена форма оценки."
        % (t.id, user.username))
    await broadcast_work(t.chat_id, "work_ticket_closed",
                         {"chat_id": t.chat_id,
                          "ticket": ticket_out(t, session)}, session)
    if t.author_id:
        await manager.send_to_user(
            t.author_id, "work_ticket_rate_request",
            {"ticket_id": t.id, "assignee_id": t.assignee_id,
             "title": t.title})
    return ticket_out(t, session)


class RatingIn(BaseModel):
    score: int
    comment: Optional[str] = None


@router.post("/work/tickets/{ticket_id}/rate")
async def rate_ticket(
    ticket_id: int,
    data: RatingIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Оценка 1..5 от автора заявки исполнителю."""
    t = session.get(WorkTicket, ticket_id)
    if not t:
        raise HTTPException(404, "Заявка не найдена")
    if t.status != "done":
        raise HTTPException(400, "Заявка ещё не закрыта")
    if t.author_id and user.id != t.author_id and not user.is_admin:
        raise HTTPException(403, "Оценку ставит автор заявки")
    if not (1 <= data.score <= 5):
        raise HTTPException(400, "Оценка от 1 до 5")
    existing = session.exec(select(WorkTicketRating).where(
        WorkTicketRating.ticket_id == t.id)).first()
    if existing:
        existing.score = data.score
        existing.comment = data.comment
        session.add(existing)
        session.commit()
        return {"ok": True, "updated": True}
    rating = WorkTicketRating(ticket_id=t.id, author_id=user.id,
                              assignee_id=t.assignee_id or user.id,
                              score=data.score, comment=data.comment)
    session.add(rating)
    session.commit()
    await broadcast_work(t.chat_id, "work_ticket_rating",
                         {"chat_id": t.chat_id, "ticket_id": t.id,
                          "score": data.score}, session)
    return {"ok": True}


@router.post("/work/tickets/manual")
async def create_manual_ticket(
    data: dict,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Внутреннее обращение («Чаты»): сотрудник создаёт заявку вручную."""
    chat_id = int(data.get("chat_id") or 0)
    require_member(session, chat_id, user)
    ticket = await dispatch_ticket(
        session, chat_id, section=str(data.get("section", "chat")),
        title=str(data.get("title", "Обращение")),
        description=data.get("description"),
        priority=str(data.get("priority", "medium")),
        source_type="manual", author_id=user.id,
    )
    return ticket_out(ticket, session)
# ------------------------------------------------------------------
# 📊 Статистика + 📈 повышения
# ------------------------------------------------------------------

def _member_stats(session: Session, chat_id: int, user_id: int,
                  since: Optional[datetime] = None) -> dict:
    tickets = session.exec(select(WorkTicket).where(
        WorkTicket.chat_id == chat_id,
        WorkTicket.assignee_id == user_id)).all()
    if since:
        tickets = [t for t in tickets if t.created_at >= since]
    closed = [t for t in tickets if t.status == "done"]
    ratings = []
    for t in closed:
        r = session.exec(select(WorkTicketRating).where(
            WorkTicketRating.ticket_id == t.id)).first()
        if r:
            ratings.append(r.score)
    resp = [(t.taken_at - t.created_at).total_seconds()
            for t in tickets if t.taken_at and t.taken_at >= t.created_at]
    avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0.0
    return {
        "user_id": user_id,
        "taken": len(tickets),
        "closed": len(closed),
        "avg_response_sec": round(sum(resp) / len(resp), 1) if resp else 0.0,
        "avg_rating": avg_rating,
        "rating_score": round(len(closed) * avg_rating, 1),
    }


@router.get("/work/stat/summary")
def stat_summary(
    period: str = "month",
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    periods = {"day": timedelta(days=1), "week": timedelta(days=7)}
    since = utcnow() - periods.get(period, timedelta(days=30))
    out = []
    for chat in visible_chats(session, user):
        tickets = session.exec(select(WorkTicket).where(
            WorkTicket.chat_id == chat.id)).all()
        tickets = [t for t in tickets if t.created_at >= since]
        closed = [t for t in tickets if t.status == "done"]
        members = session.exec(select(WorkChatMember).where(
            WorkChatMember.chat_id == chat.id)).all()
        workers = [m for m in members if m.role in ("worker", "novice")]
        ratings = []
        resp = []
        for t in closed:
            r = session.exec(select(WorkTicketRating).where(
                WorkTicketRating.ticket_id == t.id)).first()
            if r:
                ratings.append(r.score)
            if t.taken_at and t.taken_at >= t.created_at:
                resp.append((t.taken_at - t.created_at).total_seconds())
        out.append({
            "chat_id": chat.id, "name": chat.name,
            "total": len(tickets), "closed": len(closed),
            "avg_response_sec": round(sum(resp) / len(resp), 1) if resp else 0.0,
            "avg_rating": round(sum(ratings) / len(ratings), 2) if ratings else 0.0,
            "workload": len([m for m in workers if m.on_shift]),
        })
    return out


@router.get("/work/stat/members")
def stat_members(
    chat_id: int,
    period: str = "month",
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_chat_or_404(session, chat_id)
    require_member(session, chat_id, user)
    periods = {"day": timedelta(days=1), "week": timedelta(days=7)}
    since = utcnow() - periods.get(period, timedelta(days=30))
    out = []
    for m in session.exec(select(WorkChatMember).where(
            WorkChatMember.chat_id == chat_id)).all():
        st = _member_stats(session, chat_id, m.user_id, since)
        st["role"] = m.role
        u = session.get(User, m.user_id)
        st["username"] = u.username if u else None
        out.append(st)
    out.sort(key=lambda x: -x["rating_score"])
    return out
def _promotion_progress(session: Session, chat_id: int, user_id: int,
                        role: str) -> dict:
    st = _member_stats(session, chat_id, user_id)
    nxt = PROMO_NEXT.get(role)
    if not nxt:
        return {"eligible": False, "next_role": None,
                "closed": st["closed"], "avg_rating": st["avg_rating"],
                "closed_left": 0,
                "message": "Максимальный уровень для авто-повышения"}
    closed_left = max(0, PROMO_CLOSED_REQUIRED - st["closed"])
    avg_ok = st["avg_rating"] >= PROMO_AVG_REQUIRED
    return {"eligible": closed_left == 0 and avg_ok, "next_role": nxt,
            "closed": st["closed"], "closed_left": closed_left,
            "avg_rating": st["avg_rating"],
            "message": "Осталось %s закрытых заявок до повышения" % closed_left}


@router.get("/work/promotions/progress")
def promotions_progress(
    chat_id: int = 0,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    chats = ([get_chat_or_404(session, chat_id)] if chat_id
             else visible_chats(session, user))
    out = []
    for chat in chats:
        m = get_member(session, chat.id, user.id)
        if m:
            out.append({"chat_id": chat.id, "chat_name": chat.name,
                        "role": m.role,
                        **_promotion_progress(session, chat.id, user.id, m.role)})
    return out


@router.get("/work/chats/{chat_id}/promotions")
def chat_promotions(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_chat_or_404(session, chat_id)
    m = require_member(session, chat_id, user)
    pending = session.exec(select(WorkPromotionLog).where(
        WorkPromotionLog.chat_id == chat_id,
        WorkPromotionLog.status == "pending")).all()
    progress = []
    for mm in session.exec(select(WorkChatMember).where(
            WorkChatMember.chat_id == chat_id)).all():
        if mm.role in PROMO_NEXT:
            u = session.get(User, mm.user_id)
            progress.append({
                "user_id": mm.user_id,
                "username": u.username if u else None,
                "role": mm.role,
                **_promotion_progress(session, chat_id, mm.user_id, mm.role),
            })
    return {
        "pending": [
            {"id": p.id, "user_id": p.user_id, "from_role": p.from_role,
             "to_role": p.to_role,
             "planned_at": p.planned_at.isoformat() if p.planned_at else None}
            for p in pending
        ],
        "progress": progress,
        "can_cancel": m.role == "head" or user.is_admin,
    }


@router.post("/work/promotions/{promo_id}/cancel")
async def cancel_promotion(
    promo_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    p = session.get(WorkPromotionLog, promo_id)
    if not p:
        raise HTTPException(404, "Повышение не найдено")
    m = require_member(session, p.chat_id, user)
    if m.role != "head" and not user.is_admin:
        raise HTTPException(403, "Отменить может только старший отдела")
    if p.status != "pending":
        raise HTTPException(400, "Повышение уже не в статусе pending")
    p.status = "cancelled"
    p.decided_by = user.id
    session.add(p)
    session.commit()
    await post_system_message(
        session, p.chat_id,
        "Повышение сотрудника %s отменено старшим" % p.user_id)
    return {"ok": True}
# ------------------------------------------------------------------
# ⏰ Планировщик: сканирование источников + исполнение повышений
# ------------------------------------------------------------------

async def _scan_sources(session: Session):
    """Забирает новые заявки из привязанных разделов (дедуп по source_id)."""
    for r in session.exec(select(Report).where(
            Report.status == "pending").limit(20)).all():
        await process_source(session, "complaint", "report", r.id,
                             "Жалоба #%s: %s" % (r.id, r.reason),
                             r.comment, "medium", r.reporter_id)
    for t in session.exec(select(SupportTicket).where(
            SupportTicket.status == "open").limit(20)).all():
        await process_source(session, "support", "support", t.id,
                             "Тикет поддержки #%s" % t.id,
                             None, "medium", t.user_id)
        t.status = "assigned"
    for b in session.exec(select(BugReport).where(
            BugReport.status == "new").limit(20)).all():
        await process_source(session, "bug", "bug", b.id,
                             "Баг #%s: %s" % (b.id, b.title),
                             b.description, b.priority or "medium",
                             b.reporter_id)
        b.status = "in_progress"
    session.commit()


async def _run_promotions(session: Session):
    """pending → executed по истечении planned_at; создание новых pending."""
    for p in session.exec(select(WorkPromotionLog).where(
            WorkPromotionLog.status == "pending")).all():
        if p.planned_at and p.planned_at <= utcnow():
            member = get_member(session, p.chat_id, p.user_id)
            if member and member.role == p.from_role:
                member.role = p.to_role
                session.add(member)
            p.status = "executed"
            p.executed_at = utcnow()
            session.add(p)
            await post_system_message(
                session, p.chat_id,
                "Сотрудник %s повышен: %s -> %s" % (p.user_id, p.from_role, p.to_role))
    session.commit()
    for chat in session.exec(select(WorkChat)).all():
        if not chat.is_active:
            continue
        members = session.exec(select(WorkChatMember).where(
            WorkChatMember.chat_id == chat.id)).all()
        for m in members:
            nxt = PROMO_NEXT.get(m.role)
            if not nxt:
                continue
            prog = _promotion_progress(session, chat.id, m.user_id, m.role)
            if not prog["eligible"]:
                continue
            if nxt == "deputy" and any(x.role == "deputy" for x in members):
                continue
            existing = session.exec(select(WorkPromotionLog).where(
                WorkPromotionLog.chat_id == chat.id,
                WorkPromotionLog.user_id == m.user_id,
                WorkPromotionLog.status == "pending")).first()
            if existing:
                continue
            promo = WorkPromotionLog(
                chat_id=chat.id, user_id=m.user_id, from_role=m.role,
                to_role=nxt, status="pending",
                planned_at=utcnow() + timedelta(days=3))
            session.add(promo)
            target = session.get(User, m.user_id)
            name = target.username if target else str(m.user_id)
            await post_system_message(
                session, chat.id,
                "Участник @%s будет повышен через 3 дня: %s -> %s. "
                "Старший может отменить, пока не наступил срок."
                % (name, m.role, nxt))
            head = next((x for x in members if x.role == "head"), None)
            if head:
                await manager.send_to_user(
                    head.user_id, "work_promotion_pending",
                    {"chat_id": chat.id, "user_id": m.user_id,
                     "to_role": nxt})
    session.commit()


async def work_scheduler_loop():
    import asyncio
    counter = 0
    while True:
        try:
            from database import engine
            with Session(engine) as session:
                await _scan_sources(session)
                counter += 1
                if counter % 120 == 0:  # ~раз в час при тике 30с
                    await _run_promotions(session)
        except Exception as e:
            print("work_scheduler error:", e)
        await asyncio.sleep(30)


def start_work_bot_scheduler():
    """Вызывается из main.py startup."""
    import asyncio
    return asyncio.create_task(work_scheduler_loop())
