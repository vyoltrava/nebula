import os
os.environ["REDIS_URL"] = "FAKE"
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import main
from fastapi.testclient import TestClient
from database import engine, init_db
init_db()
from sqlmodel import Session, select
from models import User, RoleCategory, Role, WorkChat, WorkChatMember
import bcrypt
import work_chats as wc

with Session(engine) as s:
    # юзер УЖЕ стоит на роли (никаких смен не будет)
    u = s.exec(select(User).where(User.username == "oldrole_user")).first()
    if not u:
        u = User(username="oldrole_user", display_name="Old",
                 password_hash=bcrypt.hashpw(b"secret123", bcrypt.gensalt()).decode())
        s.add(u); s.commit(); s.refresh(u)
    cat = s.exec(select(RoleCategory).where(RoleCategory.name == "КотА")).first()
    if not cat:
        cat = RoleCategory(name="КотА", order=91); s.add(cat); s.commit(); s.refresh(cat)
    role = s.exec(select(Role).where(Role.name == "РольА")).first()
    if not role:
        role = Role(name="РольА", color="#111", level=5, category_id=cat.id)
        s.add(role); s.commit(); s.refresh(role)
    # УЖЕ ставим роль (до любого синка) — эмулирует «давно стоит на роли»
    u.role_id = role.id
    s.add(u); s.commit()
    uid, cid = u.id, cat.id
    # чистим членство, чтобы доказать, что бэкфилл сам добавит
    for m in s.exec(select(WorkChatMember).where(WorkChatMember.user_id == uid)).all():
        s.delete(m)
    s.commit()
    admin = s.exec(select(User).where(User.username == "autotest_admin")).first()
    if not admin:
        admin = User(username="autotest_admin", display_name="AT",
                     password_hash=bcrypt.hashpw(b"secret123", bcrypt.gensalt()).decode(),
                     is_admin=True)
        s.add(admin); s.commit(); s.refresh(admin)
    admin_id = admin.id

# запускаем сервер → startup должен САМ добавить юзера в чат
with TestClient(main.app) as c:
    with Session(engine) as s:
        chat = s.exec(select(WorkChat).where(WorkChat.category_id == cid)).first()
        print("chat exists:", bool(chat))
        if not chat:
            # проверим, что именно произошло на старте
            print("all workchats:", [(w.id, w.category_id) for w in s.exec(select(WorkChat)).all()])
        else:
            m = s.exec(select(WorkChatMember).where(
                WorkChatMember.chat_id == chat.id, WorkChatMember.user_id == uid)).first()
            print("AUTO-BACKFILL: old-role user in chat:", bool(m), "| role:", m.role if m else None)
    # и ручной эндпоинт
    r = c.post("/api/login", json={"username": "autotest_admin", "password": "secret123"})
    h = {"Authorization": f"Bearer {r.json().get('token')}"}
    r = c.post("/api/work/chats/sync-members", headers=h)
    print("manual sync:", r.status_code, r.json() if r.status_code == 200 else r.text)
print("DONE")