"""Проверка: заявка отдела (create_team_ticket) приходит бот-сообщением в рабочий чат."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_team_ticket_test.db"
if os.path.exists("_team_ticket_test.db"):
    os.remove("_team_ticket_test.db")

import main
from database import init_db, engine
from models import User, RoleCategory, TeamTicket, Message, ChatMember
from sqlmodel import Session, select, func
init_db()

from fastapi.testclient import TestClient


def _make_user(uid):
    def _cu():
        with Session(engine) as s:
            return s.get(User, uid)
    return _cu


DATA = {}

with Session(engine) as s:
    cat = RoleCategory(name="Отдел")
    s.add(cat); s.commit(); s.refresh(cat)
    team_chat = main.ensure_team_chat_for_category(cat.id, s)
    DATA["cat"] = cat.id
    DATA["team_chat"] = team_chat.id

    worker = User(username="worker3", display_name="Worker", password_hash="x")
    s.add(worker); s.commit(); s.refresh(worker)
    wm = main.add_user_to_team_chat(worker, cat, s)
    wm.team_hierarchy = "junior"
    import json
    wm.team_permissions = json.dumps(["can_create_tasks", "can_handle_tasks"])
    s.add(wm); s.commit()
    DATA["worker"] = worker.id
    DATA["wm"] = wm.id

main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["worker"])
c = TestClient(main.app)

# иждиенец: создаём заявку от КЛИЕНТА (юзер с правом на создание = сам worker?) — нет,
# правильнее проверить как пользователь с can_create_tasks создаёт заявку для отдела
r = c.post(f"/api/teams/{DATA['cat']}/tickets", json={"title": "TEST-заявка N", "kind": "other"})
print("create ticket status:", r.status_code)
print("resp:", r.json())
assert r.status_code == 200, r.text

with Session(engine) as s:
    t = s.exec(select(TeamTicket).where(TeamTicket.title == "TEST-заявка N")).first()
    assert t, "тикет не создан"
    print("ticket id:", t.id, "status:", t.status, "assigned_to:", t.assigned_to)
    assert t.assigned_to == DATA["worker"]

    msgs = s.exec(select(Message).where(Message.chat_id == DATA["team_chat"])).all()
    print("bot message count:", len(msgs))
    for m in msgs:
        print("  msg:", m.text)
    assert any("TEST-заявка" in (m.text or "") for m in msgs), "бот-сообщение не пришло в чат отдела"

# читаем через API как участник
r = c.get(f"/api/chats/{DATA['team_chat']}/messages")
print("GET messages:", r.status_code)
data = r.json()
texts = [m.get("text") or "" for m in data.get("messages", [])]
print("сообщения с TEST-заявка через API:", [t for t in texts if "TEST-заявка" in t])
assert any("TEST-заявка" in t for t in texts)

print("\nALL TEAM TICKET CHECKS PASSED")