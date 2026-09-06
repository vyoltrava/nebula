"""Фоновый воркер-распределитель заявок (дополняет синхронные вызовы).

Периодически сканирует новые Report / BugReport / SupportTicket, для которых
ещё нет WorkAssignment, и прогоняет их через WorkChatDispatcher.
Запускается отдельным процессом:  python work_worker.py
"""
import asyncio

from sqlmodel import Session, select

from database import engine
from models import Report, BugReport, SupportTicket, WorkAssignment
from work_dispatcher import WorkChatDispatcher

INTERVAL_SECONDS = 10
CHAT_TARGETS = ("chat", "chat_message", "dm_user")


def _pending(session: Session):
    """Генерирует (section, origin_type, id, title, body, link) недоставленных заявок."""
    for r in session.exec(select(Report).where(Report.status == "pending")).all():
        if not session.exec(select(WorkAssignment).where(
            WorkAssignment.origin_type == "report", WorkAssignment.origin_id == r.id
        )).first():
            section = "chats" if r.target_type in CHAT_TARGETS else "reports"
            yield (section, "report", r.id, f"Жалоба #{r.id}", f"Причина: {r.reason}", "/adminnew?tab=reports")

    for b in session.exec(select(BugReport).where(BugReport.status == "new")).all():
        if not session.exec(select(WorkAssignment).where(
            WorkAssignment.origin_type == "bug", WorkAssignment.origin_id == b.id
        )).first():
            yield ("bugs", "bug", b.id, b.title, b.description[:400], "/adminnew?tab=bugs")

    for t in session.exec(select(SupportTicket).where(SupportTicket.status == "open")).all():
        if not session.exec(select(WorkAssignment).where(
            WorkAssignment.origin_type == "support", WorkAssignment.origin_id == t.id
        )).first():
            yield ("support", "support", t.id, f"Обращение #{t.id}", "", "/adminnew?tab=support")


def run_once() -> int:
    delivered = 0
    with Session(engine) as s:
        for section, otype, oid, title, body, link in _pending(s):
            try:
                if WorkChatDispatcher.dispatch(s, section, otype, oid, title, body, link):
                    delivered += 1
            except Exception as e:
                print(f"⚠️ worker dispatch {section} {otype} {oid}: {e}")
    return delivered


async def loop() -> None:
    while True:
        try:
            n = run_once()
            if n:
                print(f"✅ work_worker: distributed {n} ticket(s)")
        except Exception as e:
            print(f"⚠️ work_worker: {e}")
        await asyncio.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    asyncio.run(loop())