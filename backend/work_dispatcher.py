"""Единый сервис распределения заявок по рабочим чатам.

Заменяет dispatch_to_system_chats / dispatch_ticket_to_team.

Единственная точка входа заявки из 4 разделов админки
(reports / support / bugs / chats) в рабочий чат:
    WorkChatDispatcher.dispatch(session, section, origin_type, origin_id, ...)

Вся логика распределения (выбор активного чата раздела, round-robin
исполнителя, синхронизация состава backing-чата, бот-сообщение) живёт здесь,
чтобы не дублировать её в точках создания заявок.
"""
from typing import Optional

from sqlmodel import Session, select
from sqlalchemy import func

from models import (
    WorkChat, WorkChatMember, WorkAssignment, Chat, ChatMember, Message, User,
)
from websocket_manager import manager

WORK_SECTIONS = ("reports", "support", "bugs", "chats")
# 📬 Раздел -> (эмодзи, label) для бот-сообщения
SECTION_META = {
    "reports": ("🚩", "Жалоба"),
    "support": ("🎧", "Обращение в поддержку"),
    "bugs":    ("🐞", "Баг"),
    "chats":   ("💬", "Обращение (чаты)"),
}
# 🤖 Кандидаты в исполнители (руководитель/зам — только если нет других,
# см. pick_assignee fallback)
WORKER_ROLES = ("senior", "novice")


def _count_assignments(session: Session, work_chat_id: int, user_id: int) -> int:
    count = session.exec(
        select(func.count(WorkAssignment.id)).where(
            WorkAssignment.work_chat_id == work_chat_id,
            WorkAssignment.assignee_id == user_id,
            WorkAssignment.status != "done",
        )
    ).one()
    return int(count)
async def _push_message(session: Session, msg: Message) -> None:
    """WS-рассылка одного бот-сообщения в чат (is_system=True)."""
    await manager.broadcast_to_chat(
        msg.chat_id,
        "new_message",
        {
            "id": msg.id,
            "chat_id": msg.chat_id,
            "sender_id": msg.sender_id,
            "sender_name": "WorkChat Bot",
            "sender_avatar": None,
            "sender_prefix": None,
            "text": msg.text,
            "ciphertext": None,
            "media_url": None,
            "media_type": None,
            "is_encrypted_media": False,
            "created_at": msg.created_at.isoformat(),
            "pinned": False,
            "pinned_by": None,
            "reply_to_id": None,
            "reply_preview": None,
            "reactions": [],
            "is_system": True,
        },
        session,
    )


class WorkChatDispatcher:
    @staticmethod
    def active_chat_for(session: Session, section: str) -> Optional[WorkChat]:
        """Единственный активный рабочий чат раздела (0..1 на раздел)."""
        if section not in WORK_SECTIONS:
            return None
        return session.exec(
            select(WorkChat).where(
                WorkChat.assigned_section == section,
                WorkChat.is_active == True,  # noqa: E712
            ).order_by(WorkChat.id)
        ).first()

    @staticmethod
    def busy_member_ids(session: Session, work_chat_id: int) -> set[int]:
        """У кого уже есть открытые (assigned/taken) назначения в этом чате."""
        rows = session.exec(
            select(WorkAssignment.assignee_id).where(
                WorkAssignment.work_chat_id == work_chat_id,
                WorkAssignment.assignee_id.is_not(None),
                WorkAssignment.status.in_(["assigned", "taken"]),
            )
        ).all()
        return {r for r in rows if r is not None}

    @staticmethod
    def pick_assignee(session: Session, work_chat: WorkChat) -> Optional[WorkChatMember]:
        """Round-robin: свободный senior/novice с наименьшим числом активных назначений."""
        members = session.exec(
            select(WorkChatMember).where(
                WorkChatMember.work_chat_id == work_chat.id,
                WorkChatMember.role.in_(WORKER_ROLES),
            )
        ).all()
        if not members:
            return None

        busy = WorkChatDispatcher.busy_member_ids(session, work_chat.id)
        pool = [m for m in members if m.user_id not in busy] or list(members)

        return min(
            pool,
            key=lambda m: (
                _count_assignments(session, work_chat.id, m.user_id),
                m.id,
            ),
        )

    @staticmethod
    def sync_chat_membership(session: Session, work_chat: WorkChat) -> None:
        """Синхронизирует состав backing-чата с WorkChatMember (схлопывает дубли)."""
        if not work_chat.chat_id:
            return
        wanted = {m.user_id for m in session.exec(
            select(WorkChatMember).where(WorkChatMember.work_chat_id == work_chat.id)
        ).all()}
        existing = {m.user_id for m in session.exec(
            select(ChatMember).where(ChatMember.chat_id == work_chat.chat_id)
        ).all()}
        for uid in wanted - existing:
            session.add(ChatMember(chat_id=work_chat.chat_id, user_id=uid, role="member"))
        session.commit()

    @staticmethod
    def dispatch(
        session: Session,
        section: str,
        origin_type: str,
        origin_id: int,
        title: str,
        body: str,
        link: str,
        sender: Optional[User] = None,
    ) -> Optional[WorkAssignment]:
        """Единственная точка входа заявки в рабочий чат раздела.

        origin_type: report | bug | support | chat
        sender: если не передан — берём первого участника чата (бот — не аккаунт,
        поэтому сообщение пишется от существующего участника без создания бота).
        """
        chat = WorkChatDispatcher.active_chat_for(session, section)
        if not chat or not chat.chat_id:
            return None

        assignee = WorkChatDispatcher.pick_assignee(session, chat)

        if sender is None:
            first = session.exec(
                select(ChatMember).where(ChatMember.chat_id == chat.chat_id)
            ).first()
            sender = session.get(User, first.user_id) if first else None
        if sender is None:
            return None

        emoji, label = SECTION_META.get(section, ("🔔", "Заявка"))
        assignee_name = ""
        if assignee:
            u = session.get(User, assignee.user_id)
            assignee_name = f" → @{u.username}" if u else ""
        text = (
            f"{emoji} **{label}**: {title}\n{body}\n\n"
            f"{link}\n🚀 *Кнопка «Взять в работу» доступна в карточке раздела.*"
            f"{assignee_name}"
        )

        msg = Message(chat_id=chat.chat_id, sender_id=sender.id, text=text)
        session.add(msg)
        session.flush()

        assignment = WorkAssignment(
            work_chat_id=chat.id,
            section=section,
            origin_type=origin_type,
            origin_id=origin_id,
            assignee_id=assignee.user_id if assignee else None,
            status="assigned",
            message_id=msg.id,
        )
        session.add(assignment)
        session.commit()
        session.refresh(assignment)

        # 🔔 WS-рассылка в backing-чат РАБОТА
        try:
            import asyncio
            loop = asyncio.get_running_loop()
            loop.create_task(_push_message(session, msg))
        except RuntimeError:
            pass
        return assignment