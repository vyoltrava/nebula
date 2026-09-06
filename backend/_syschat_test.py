"""Проверка отдельной системы системных чатов заявок."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_syschat_test.db"
if os.path.exists("_syschat_test.db"):
    os.remove("_syschat_test.db")

import main
from database import init_db, engine
from models import User, SystemChat, SystemChatMember, SystemChatMessage
from sqlmodel import Session, select
init_db()

from fastapi.testclient import TestClient


def _make_user(uid):
    def _cu():
        with Session(engine) as s:
            return s.get(User, uid)
    return _cu


with Session(engine) as s:
    admin = User(username="adminx", display_name="Admin", password_hash="x", is_admin=True)
    s.add(admin); s.commit(); s.refresh(admin)
    mod = User(username="modx", display_name="Moderator", password_hash="x")
    s.add(mod); s.commit(); s.refresh(mod)
    user = User(username="userx", display_name="User", password_hash="x")
    s.add(user); s.commit(); s.refresh(user)
    DATA = {"admin": admin.id, "mod": mod.id, "user": user.id}

main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["admin"])
c = TestClient(main.app)
AUTH = {"Authorization": f"Bearer {main.create_token(DATA['admin'])}"}

# 1) Создаём системный чат "Поддержка чат" для панели support
r = c.post("/api/admin/system-chats", json={"name": "Поддержка-чат", "panel": "support", "member_ids": [DATA["mod"]]}, headers=AUTH)
print("1) create chat:", r.status_code, r.json())
assert r.status_code == 200
chat_id = r.json()["id"]
assert r.json()["members"]  # admin + mod

# 2) Заявка в поддержку → приходит СООБЩЕНИЕМ в системный чат
with Session(engine) as s:
    app1 = User(username="appx", display_name="AppX", password_hash="x")
    s.add(app1); s.commit(); s.refresh(app1)
    UID_APP = app1.id
main.app.dependency_overrides[main.get_current_user] = _make_user(UID_APP)
r = c.post("/api/support/start", data={"text": "Помогите пожалуйста"})
print("2) support start:", r.status_code)
assert r.status_code == 200
with Session(engine) as s:
    msgs = s.exec(select(SystemChatMessage).where(SystemChatMessage.chat_id == chat_id)).all()
    print("   сообщений в системном чате:", len(msgs), "| текст:", msgs[-1].text if msgs else None)
    assert msgs, "заявка не пришла в системный чат"

# 3) Участник видит ленту
main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["mod"])
r = c.get(f"/api/admin/system-chats/{chat_id}/messages")
print("3) лента участника:", r.status_code, "| сообщений:", len(r.json()))
assert r.status_code == 200 and len(r.json()) >= 1

# 4) Список чатов по панели
main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["admin"])
r = c.get("/api/admin/system-chats?panel=support").json()
print("4) чаты support:", [(x["name"], x["panel"]) for x in r])
assert any(x["panel"] == "support" for x in r)

# 5) Не-участник не видит ленту
main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["user"])
r = c.get(f"/api/admin/system-chats/{chat_id}/messages")
print("5) чужой доступ:", r.status_code)
assert r.status_code == 403

# 6) Удаление (как создатель)
main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["admin"])
r = c.delete(f"/api/admin/system-chats/{chat_id}", headers=AUTH)
print("6) delete:", r.status_code, r.json())
assert r.status_code == 200

print("\nALL SYSTEM-CHAT CHECKS PASSED")