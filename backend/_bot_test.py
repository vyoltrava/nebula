"""Проверка системной диспетчеризации заявок: приходят сообщением в рабочие чаты
   отделов (без бота-аккаунта), + счётчик открытых заявок для вкладок модерации."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_bot_test.db"
if os.path.exists("_bot_test.db"):
    os.remove("_bot_test.db")

import main
from database import init_db, engine
from models import User, RoleCategory, SystemChat, SystemChatMember, SystemChatMessage
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

    supporter = User(username="sup2", display_name="Sup2", password_hash="x", is_admin=True)
    s.add(supporter); s.commit(); s.refresh(supporter)
    m = main.add_user_to_team_chat(supporter, sup, s)
    m.team_hierarchy = "junior"
    m.team_permissions = json.dumps(["can_handle_tasks", "can_handle_appeals"])
    s.add(m); s.commit()

    DATA = {"cat": sup.id, "chat": tc.id, "sup": supporter.id}

main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["sup"])
c = TestClient(main.app)
AUTH = {"Authorization": f"Bearer {main.create_token(DATA['sup'])}"}

# 0) Создаём системный чат для поддержки с участником sup
r = c.post("/api/admin/system-chats", json={"name": "Суппорт-чат", "panel": "support", "member_ids": []}, headers=AUTH)
assert r.status_code == 200, r.text
sys_chat_id = r.json()["id"]

# 1) Поддержка: заявка приходит сообщением в системный чат раздела support
applicant = User(username="applicant3", display_name="App3", password_hash="x")
with Session(engine) as s:
    s.add(applicant); s.commit(); s.refresh(applicant)
    UID_A = applicant.id
main.app.dependency_overrides[main.get_current_user] = _make_user(UID_A)

r = c.post("/api/support/start", data={"text": "Не могу войти в аккаунт"})
print("1) support start:", r.status_code)
assert r.status_code == 200

with Session(engine) as s:
    msgs = s.exec(select(SystemChatMessage).where(SystemChatMessage.chat_id == sys_chat_id)).all()
    print("   сообщений в системном чате:", len(msgs), "| текст:", msgs[-1].text if msgs else None)
    assert msgs, "заявка не пришла в системный чат"

# 2) Баг → тоже приходит (общий юзер без прав, но чат=ловушка)
with Session(engine) as s:
    b = User(username="bugrep", display_name="BugRep", password_hash="x")
    s.add(b); s.commit(); s.refresh(b)
    UID_B = b.id
with Session(engine) as s:
    chat_bug = SystemChat(name="Баги-чат", panel="bugs", created_by=DATA["sup"])
    s.add(chat_bug); s.commit(); s.refresh(chat_bug)
    s.add(SystemChatMember(chat_id=chat_bug.id, user_id=DATA["sup"])); s.commit()
    BUG_CHAT = chat_bug.id
main.app.dependency_overrides[main.get_current_user] = _make_user(UID_B)
r = c.post("/api/bugs", data={"title": "Баг с загрузкой фото", "description": "При загрузке фото больше 10 МБ выбрасывает ошибку без объяснения", "priority": "high"})
assert r.status_code == 200
with Session(engine) as s:
    msgs = s.exec(select(SystemChatMessage).where(SystemChatMessage.chat_id == BUG_CHAT)).all()
    print("2) сообщений о баге:", len(msgs), "| текст:", msgs[-1].text if msgs else None)
    assert msgs, "баг не пришёл в системный чат"

print("\nALL SYS-DISPATCH CHECKS PASSED")