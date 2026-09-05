"""Интеграционный тест: приход заявки на вступление в приватный канал
   в рабочий чат отдела (через реальный HTTP-поток /api/channels/...)."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_join_flow_test.db"
if os.path.exists("_join_flow_test.db"):
    os.remove("_join_flow_test.db")

import main
import channels
from database import init_db, engine
from models import User, RoleCategory, TeamTicket, Message
from sqlmodel import Session, select
init_db()

from fastapi.testclient import TestClient


def _make_user(uid):
    def _cu():
        with Session(engine) as s:
            return s.get(User, uid)
    return _cu


# данные, которые доступны во всех шагах теста
DATA = {}


with Session(engine) as s:
    # --- Отдел + рабочий чат + исполнитель (junior) и глава (head) ---
    cat = RoleCategory(name="Поддержка")
    s.add(cat); s.commit(); s.refresh(cat)
    team_chat = main.ensure_team_chat_for_category(cat.id, s)
    assert team_chat is not None
    DATA["team_chat_id"] = team_chat.id

    owner = User(username="owner1", display_name="Owner", password_hash="x")
    s.add(owner); s.commit(); s.refresh(owner)
    main.add_user_to_team_chat(owner, cat, s)

    head = User(username="head1", display_name="Head", password_hash="x")
    s.add(head); s.commit(); s.refresh(head)
    head_m = main.add_user_to_team_chat(head, cat, s)
    head_m.team_hierarchy = "head"

    worker = User(username="worker2", display_name="Worker", password_hash="x")
    s.add(worker); s.commit(); s.refresh(worker)
    worker_m = main.add_user_to_team_chat(worker, cat, s)
    worker_m.team_hierarchy = "junior"

    import json as _json
    for mm in (head_m, worker_m):
        mm.team_permissions = _json.dumps(["can_handle_tasks"])
        s.add(mm)
    s.commit()

    # --- Владелец создаёт приватный канал ---
    ch = channels.Channel(title="Закрытый клуб", is_public=False, owner_id=owner.id, custom_slug="closed2")
    s.add(ch); s.commit(); s.refresh(ch)
    s.add(channels.ChannelSubscriber(channel_id=ch.id, user_id=owner.id, role="owner"))
    s.commit()
    DATA["chid"] = ch.id
    DATA["owner"] = owner.id
    DATA["head"] = head.id
    DATA["worker"] = worker.id

main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["owner"])
c = TestClient(main.app)

# 1) заявка от нового юзера (не из отдела)
applicant = User(username="applicant1", display_name="Applicant", password_hash="x")
with Session(engine) as s:
    s.add(applicant); s.commit(); s.refresh(applicant)
    DATA["app"] = applicant.id
main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["app"])

print("1) subscribe ->", c.post(f"/api/channels/{DATA['chid']}/subscribe").json())
assert c.post(f"/api/channels/{DATA['chid']}/subscribe").status_code == 409  # дубликат

with Session(engine) as s:
    ticket = s.exec(select(TeamTicket).where(TeamTicket.kind == "join")).first()
    assert ticket is not None, "тикет не создан"
    assert ticket.assigned_to == DATA["worker"], f"назначен не работник: {ticket.assigned_to}"
    assert ticket.chat_id == DATA["team_chat_id"]
    msgs = s.exec(select(Message).where(Message.chat_id == DATA["team_chat_id"])).all()
    print("   бот-сообщений в рабочем чате:", len(msgs))
    text = msgs[-1].text
    print("   текст:", text)
    assert "@worker2" in text and "Закрытый клуб" in text

# 2) бот-сообщение реально приходит в чат через API
main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["worker"])
r = c.get(f"/api/chats/{DATA['team_chat_id']}/messages")
print("2) messages HTTP status:", r.status_code)
data = r.json()
msgs_api = data.get("messages", []) if isinstance(data, dict) else data
texts = [m.get("text") or "" for m in msgs_api]
print("   текст бота через API:", [t for t in texts if "worker2" in t or "Заявка" in t])
assert any("worker2" in t for t in texts), "бот-сообщение не дошло до чата через API"

# 3) approve на второй сессии тоже должен закрывать тикет
main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["owner"])
reqs = c.get(f"/api/channels/{DATA['chid']}/requests").json()
print("3) requests count:", len(reqs))
rid = reqs[0]["id"]
print("   approve ->", c.patch(f"/api/channels/{DATA['chid']}/requests/{rid}?action=approve").json())
with Session(engine) as s:
    t = s.exec(select(TeamTicket).where(TeamTicket.kind == "join")).first()
    assert t.status == "done"

# 4) ещё одна заявка -> снова бот-сообщение в том же рабочем чате
with Session(engine) as s:
    a2 = User(username="applicant2", display_name="App2", password_hash="x")
    s.add(a2); s.commit(); s.refresh(a2)
    DATA["a2"] = a2.id
main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["a2"])
print("4) second subscribe ->", c.post(f"/api/channels/{DATA['chid']}/subscribe").json()["status"])
with Session(engine) as s:
    assigned = s.exec(select(TeamTicket).where(TeamTicket.kind == "join", TeamTicket.status == "assigned")).all()
    print("   open/assigned join-тикетов:", len(assigned))
    assert len(assigned) >= 1
    assert assigned[0].assigned_to in (DATA["worker"],)

print("\nALL JOIN FLOW CHECKS PASSED")