"""WorkChat API — управление рабочими чатами заявок (/stat → Отделы).

Вынесено в отдельный роутер (как channels.py), чтобы не раздувать main.py.
Зависимости из main.py импортируются внутри функций (без циклических импортов).
Создание/удаление рабочих чатов — только глобальный admin (require_admin).
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlmodel import Session, select

from models import WorkChat, WorkChatMember, WorkAssignment, Chat, User, Role
from work_dispatcher import WorkChatDispatcher, WORK_SECTIONS
from database import get_session

router = APIRouter(prefix="/api", tags=["work-chats"])

WORK_ROLES = ("leader", "deputy", "senior", "novice")


class WorkChatIn(BaseModel):
    name: str
    assigned_section: str = "reports"  # reports|support|bugs|chats
    member_roles: dict[int, str] = {}  # user_id -> leader|deputy|senior|novice


def _current_staff(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> "User":
    from main import get_current_user, get_user_permissions
    user = get_current_user(authorization=authorization, session=session)
    if not get_user_permissions(user, session):
        raise HTTPException(403, "Staff only")
    return user


def _current_admin(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> "User":
    from main import get_current_user
    user = get_current_user(authorization=authorization, session=session)
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    return user


def get_session_user(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> "User":
    from main import get_current_user
    return get_current_user(authorization=authorization, session=session)


def _work_chat_out(wc: WorkChat, session: Session) -> dict:
    rows = session.exec(
        select(WorkChatMember, User)
        .join(User, User.id == WorkChatMember.user_id)
        .where(WorkChatMember.work_chat_id == wc.id)
        .order_by(WorkChatMember.id)
    ).all()
    return {
        "id": wc.id,
        "name": wc.name,
        "assigned_section": wc.assigned_section,
        "chat_id": wc.chat_id,
        "is_active": wc.is_active,
        "created_at": wc.created_at.isoformat() if wc.created_at else None,
        "members": [{
            "user_id": u.id, "username": u.username, "display_name": u.display_name,
            "avatar_url": u.avatar_url, "role": m.role, "auto_assigned": m.auto_assigned,
        } for m, u in rows],
    }


@router.get("/admin/work-chats")
def list_work_chats(
    section: Optional[str] = None,
    staff: "User" = Depends(_current_staff),
    session: Session = Depends(get_session),
):
    stmt = select(WorkChat).order_by(WorkChat.id)
    if section:
        if section not in WORK_SECTIONS:
            raise HTTPException(400, f"Раздел должен быть одним из {WORK_SECTIONS}")
        stmt = stmt.where(WorkChat.assigned_section == section)
    chats = session.exec(stmt).all()
    return [_work_chat_out(c, session) for c in chats]
@router.post("/admin/work-chats")
def create_work_chat(
    data: WorkChatIn,
    admin: "User" = Depends(_current_admin),
    session: Session = Depends(get_session),
):
    name = data.name.strip()
    if not name or len(name) > 80:
        raise HTTPException(400, "Название обязательно (до 80 символов)")
    if data.assigned_section not in WORK_SECTIONS:
        raise HTTPException(400, f"Раздел должен быть одним из {WORK_SECTIONS}")
    existing = session.exec(
        select(WorkChat).where(
            WorkChat.assigned_section == data.assigned_section,
            WorkChat.is_active == True,  # noqa: E712
        )
    ).first()
    if existing:
        raise HTTPException(400, f"Для раздела «{data.assigned_section}» рабочий чат уже существует")

    # 🗂 backing-чат в системной папке РАБОТА (отдельная система от пользовательских чатов)
    chat = Chat(name=f"Рабочий чат: {name}", is_group=True, is_secret=False,
                system_folder="work", owner_id=admin.id)
    session.add(chat)
    session.flush()

    wc = WorkChat(name=name, assigned_section=data.assigned_section,
                  chat_id=chat.id, created_by=admin.id, is_active=True)
    session.add(wc)
    session.flush()

    for uid, role in (data.member_roles or {}).items():
        if role not in WORK_ROLES:
            role = "novice"
        if session.get(User, uid):
            session.add(WorkChatMember(work_chat_id=wc.id, user_id=uid, role=role))

    # 🤖 Авто-добавление всех носителей staff-плашки (Role.is_staff)
    for role in session.exec(select(Role).where(Role.is_staff == True)).all():  # noqa: E712
        for u in session.exec(select(User).where(User.role_id == role.id)).all():
            if not session.exec(select(WorkChatMember).where(
                WorkChatMember.work_chat_id == wc.id, WorkChatMember.user_id == u.id
            )).first():
                session.add(WorkChatMember(work_chat_id=wc.id, user_id=u.id, role="novice", auto_assigned=True))

    session.commit()
    WorkChatDispatcher.sync_chat_membership(session, wc)
    return _work_chat_out(session.get(WorkChat, wc.id), session)
@router.post("/admin/work-chats/{work_chat_id}/members")
def add_work_chat_member(
    work_chat_id: int,
    data: dict,
    admin: "User" = Depends(_current_admin),
    session: Session = Depends(get_session),
):
    wc = session.get(WorkChat, work_chat_id)
    if not wc:
        raise HTTPException(404, "Рабочий чат не найден")
    uid = int(data.get("user_id"))
    role = data.get("role", "novice")
    if not session.get(User, uid):
        raise HTTPException(404, "Пользователь не найден")
    if role not in WORK_ROLES:
        raise HTTPException(400, "Некорректная роль")
    if session.exec(select(WorkChatMember).where(
        WorkChatMember.work_chat_id == wc.id, WorkChatMember.user_id == uid)).first():
        raise HTTPException(400, "Участник уже в чате")
    session.add(WorkChatMember(work_chat_id=wc.id, user_id=uid, role=role))
    session.commit()
    WorkChatDispatcher.sync_chat_membership(session, wc)
    return {"ok": True}


@router.patch("/admin/work-chats/{work_chat_id}/members/{user_id}")
def set_work_chat_member_role(
    work_chat_id: int,
    user_id: int,
    data: dict,
    admin: "User" = Depends(_current_admin),
    session: Session = Depends(get_session),
):
    m = session.exec(select(WorkChatMember).where(
        WorkChatMember.work_chat_id == work_chat_id, WorkChatMember.user_id == user_id)).first()
    if not m:
        raise HTTPException(404, "Участник не найден")
    role = data.get("role")
    if role not in WORK_ROLES:
        raise HTTPException(400, "Некорректная роль")
    m.role = role
    m.auto_assigned = False
    session.add(m)
    session.commit()
    return {"ok": True}


@router.delete("/admin/work-chats/{work_chat_id}/members/{user_id}")
def remove_work_chat_member(
    work_chat_id: int,
    user_id: int,
    admin: "User" = Depends(_current_admin),
    session: Session = Depends(get_session),
):
    m = session.exec(select(WorkChatMember).where(
        WorkChatMember.work_chat_id == work_chat_id, WorkChatMember.user_id == user_id)).first()
    if not m:
        raise HTTPException(404, "Участник не найден")
    session.delete(m)
    session.commit()
    wc = session.get(WorkChat, work_chat_id)
    if wc:
        WorkChatDispatcher.sync_chat_membership(session, wc)
    return {"ok": True}
@router.delete("/admin/work-chats/{work_chat_id}")
def delete_work_chat(
    work_chat_id: int,
    admin: "User" = Depends(_current_admin),
    session: Session = Depends(get_session),
):
    wc = session.get(WorkChat, work_chat_id)
    if not wc:
        raise HTTPException(404, "Рабочий чат не найден")
    for m in session.exec(select(WorkChatMember).where(WorkChatMember.work_chat_id == wc.id)).all():
        session.delete(m)
    for a in session.exec(select(WorkAssignment).where(WorkAssignment.work_chat_id == wc.id)).all():
        session.delete(a)
    if wc.chat_id:
        chat = session.get(Chat, wc.chat_id)
        if chat:
            chat.system_folder = None  # убираем из РАБОТА; историю не вычищаем
    session.delete(wc)
    session.commit()
    return {"ok": True}


@router.patch("/admin/work-chats/{work_chat_id}/active")
def set_work_chat_active(
    work_chat_id: int,
    data: dict,
    admin: "User" = Depends(_current_admin),
    session: Session = Depends(get_session),
):
    wc = session.get(WorkChat, work_chat_id)
    if not wc:
        raise HTTPException(404, "Рабочий чат не найден")
    wc.is_active = bool(data.get("is_active", True))
    if wc.is_active:
        dup = session.exec(select(WorkChat).where(
            WorkChat.assigned_section == wc.assigned_section,
            WorkChat.is_active == True,  # noqa: E712
            WorkChat.id != wc.id,
        )).first()
        if dup:
            raise HTTPException(400, f"Уже есть активный рабочий чат раздела «{wc.assigned_section}»")
    session.add(wc)
    session.commit()
    return {"ok": True, "is_active": wc.is_active}


@router.post("/work-assignments/{assignment_id}/take")
def take_work_assignment(
    assignment_id: int,
    user: "User" = Depends(get_session_user),
    session: Session = Depends(get_session),
):
    """Кнопка «Взять в работу»: исполнитель забирает заявку себе."""
    a = session.get(WorkAssignment, assignment_id)
    if not a:
        raise HTTPException(404, "Назначение не найдено")
    if a.assignee_id and a.assignee_id != user.id and a.status == "taken":
        raise HTTPException(409, "Заявка уже взята другим")
    a.assignee_id = user.id
    a.status = "taken"
    session.add(a)
    session.commit()
    return {"ok": True, "assignment_id": a.id, "status": a.status}