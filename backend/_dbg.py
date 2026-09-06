import os
os.environ["REDIS_URL"] = "FAKE"
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import main
from fastapi.testclient import TestClient
from database import engine, init_db
init_db()
from sqlmodel import Session, select
from models import User, WorkChat, WorkChatMember
import work_chats as wc

with Session(engine) as s:
    u = s.exec(select(User).where(User.username == "oldrole_user")).first()
    print("user:", u.username, "role_id:", u.role_id)
    role = s.get(type(u).__mro__ and __import__("models").Role, u.role_id)
    print("role:", role.name if role else None, "category:", role.category_id if role else None)
    # удаляем существующие membership
    for m in s.exec(select(WorkChatMember).where(WorkChatMember.user_id == u.id)).all():
        s.delete(m)
    s.commit()
    # прямой вызов
    wc.sync_user_work_membership(s, u)
    ms = s.exec(select(WorkChatMember).where(WorkChatMember.user_id == u.id)).all()
    print("after direct sync:", [(m.chat_id, m.role) for m in ms])
    # а теперь sync_all
    n = wc.sync_all_memberships(s)
    print("sync_all:", n)
    ms = s.exec(select(WorkChatMember).where(WorkChatMember.user_id == u.id)).all()
    print("after sync_all:", [(m.chat_id, m.role) for m in ms])
print("DONE")