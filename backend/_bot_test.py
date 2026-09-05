"""Проверка системного бота (nebula_bot): заявки приходят бот-сообщением
   в рабочие чаты отделов, включая support."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_bot_test.db"
if os.path.exists("_bot_test.db"):
    os.remove("_bot_test.db")

import main
from database import init_db, engine
from models import User, RoleCategory, TeamTicket, Message, ChatMember
from sqlmodel import Session, select
init_db()

from fastapi.testclient import TestClient


def _make_user(uid):
    def _cu():
        with Session(engine) as s:
            return s.get(User, uid)
    return _cu


with Session(engine) as s:
    import json
    # --- Отдел саппорта: юзер с manage_support (глобальное право панели) ---
    sup = RoleCategory(name="Саппорт", color="#22c55e")
    s.add(sup); s.commit(); s.refresh(sup)
    tc = main.ensure_team_chat_for_category(sup.id, s)
    main.ensure_bot_in_team_chats(s)

    supporter = User(username="sup2", display_name="Sup2", password_hash="x", is_admin=True)
    s.add(supporter); s.commit(); s.refresh(supporter)
    m = main.add_user_to_team_chat(supporter, sup, s)
    m.team_hierarchy = "junior"
    m.team_permissions = json.dumps(["can_handle_tasks", "can_handle_appeals"])
    s.add(m); s.commit()

    DATA = {"cat": sup.id, "chat": tc.id, "sup": supporter.id}

    # бот существует и в чате
    bot = s.exec(select(User).where(User.username == "nebula_bot")).first()
    assert bot is not None, "бот не создан"
    assert bot.is_bot is True
    DATA["bot"] = bot.id
    bm = s.exec(select(ChatMember).where(ChatMember.chat_id == tc.id, ChatMember.user_id == bot.id)).first()
    assert bm is not None, "бот не в рабочем чате отдела"

main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["sup"])
c = TestClient(main.app)

# 1) Поддержка: заявка приходит бот-сообщением в рабочий чат
applicant = User(username="applicant3", display_name="App3", password_hash="x")
with Session(engine) as s:
    s.add(applicant); s.commit(); s.refresh(applicant)
    UID_A = applicant.id
main.app.dependency_overrides[main.get_current_user] = _make_user(UID_A)

r = c.post("/api/support/start", data={"text": "Не могу войти в аккаунт"})
print("1) support start:", r.status_code, r.json().get("ok"))
assert r.status_code == 200

with Session(engine) as s:
    t = s.exec(select(TeamTicket).where(TeamTicket.kind == "appeal")).first()
    assert t, "appeal-тикет не создан"
    assert t.category_id == DATA["cat"]
    msgs = s.exec(select(Message).where(Message.chat_id == DATA["chat"])).all()
    bot_msgs = [m for m in msgs if m.sender_id == DATA["bot"]]
    print("   бот-сообщений:", len(bot_msgs), "| текст:", bot_msgs[-1].text if bot_msgs else None)
    assert bot_msgs, "бот-сообщение не пришло в чат отдела"
    assert "Поддержка" in bot_msgs[-1].text or "Обращение" in bot_msgs[-1].text

# 2) Другой тип (bug) — юзер НЕ имеет tech_access → тикет создаётся без assignee,
#    НО бот-сообщение всё равно приходит
with Session(engine) as s:
    b = User(username="bugrep", display_name="BugRep", password_hash="x")
    s.add(b); s.commit(); s.refresh(b)
    UID_B = b.id
main.app.dependency_overrides[main.get_current_user] = _make_user(UID_B)
r = c.post("/api/bugs", data={"title": "Баг с загрузкой фото", "description": "При загрузке фото больше 10 МБ выбрасывает ошибку без объяснения", "priority": "high"})
print("2) bug create:", r.status_code)
assert r.status_code == 200
with Session(engine) as s:
    t = s.exec(select(TeamTicket).where(TeamTicket.kind == "bug")).first()
    assert t is not None
    print("   bug ticket status:", t.status, "| assigned:", t.assigned_to)
    msgs = s.exec(select(Message).where(Message.chat_id == DATA["chat"])).all()
    bot_msgs = [m for m in msgs if m.sender_id == DATA["bot"] and "Баг" in (m.text or "")]
    print("   бот-сообщение о баге:", bot_msgs[-1].text if bot_msgs else "НЕТ")
    assert bot_msgs, "бот-сообщение о баге не пришло"

# 3) Ручная заявка из TeamsTab → бот-сообщение
main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["sup"])
r = c.post(f"/api/teams/{DATA['cat']}/tickets", json={"title": "Ручная заявка", "kind": "other"})
print("3) manual ticket:", r.status_code, "| auto_assigned:", r.json().get("auto_assigned"))
with Session(engine) as s:
    msgs = s.exec(select(Message).where(Message.chat_id == DATA["chat"])).all()
    bot_msgs = [m for m in msgs if m.sender_id == DATA["bot"] and "Ручная заявка" in (m.text or "")]
    print("   бот-сообщение:", bot_msgs[-1].text if bot_msgs else "НЕТ")
    assert bot_msgs, "бот-сообщение о ручной заявке не пришло"

print("\nALL BOT CHECKS PASSED")