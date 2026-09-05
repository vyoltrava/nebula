"""Проверка строгой привязки типов заявок к правам панелей:
   bug -> tech_access, complaint -> manage_reports."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_kind_perm_test.db"
if os.path.exists("_kind_perm_test.db"):
    os.remove("_kind_perm_test.db")

import main
from database import init_db, engine
from models import User, Role, RoleCategory, TeamTicket, Message
from sqlmodel import Session, select
init_db()


def _make_user(uid):
    def _cu():
        with Session(engine) as s:
            return s.get(User, uid)
    return _cu


with Session(engine) as s:
    cat = RoleCategory(name="ТехПоддержка")
    s.add(cat); s.commit(); s.refresh(cat)
    tc = main.ensure_team_chat_for_category(cat.id, s)
    DATA = {"cat": cat.id, "chat": tc.id}

    # техник: tech_access + локальные права
    tech = User(username="tech1", display_name="Tech", password_hash="x", is_admin=True)
    s.add(tech); s.commit(); s.refresh(tech)
    m = main.add_user_to_team_chat(tech, cat, s)
    m.team_hierarchy = "junior"
    import json
    m.team_permissions = json.dumps(["can_handle_tasks", "can_handle_bugs"])
    s.add(m)

    # модератор: manage_reports
    rep = User(username="rep1", display_name="Rep", password_hash="x", is_admin=True)
    s.add(rep); s.commit(); s.refresh(rep)
    m2 = main.add_user_to_team_chat(rep, cat, s)
    m2.team_hierarchy = "junior"
    m2.team_permissions = json.dumps(["can_handle_tasks", "can_handle_complaints"])
    s.add(m2)

    # обычный участник: только can_handle_tasks (без прав панелей)
    plain = User(username="plain1", display_name="Plain", password_hash="x")
    s.add(plain); s.commit(); s.refresh(plain)
    m3 = main.add_user_to_team_chat(plain, cat, s)
    m3.team_hierarchy = "senior"
    m3.team_permissions = json.dumps(["can_handle_tasks"])
    s.add(m3)
    s.commit()
    DATA["tech"] = tech.id
    DATA["rep"] = rep.id
    DATA["plain"] = plain.id

main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["plain"])
c = TestClient(main.app) if False else None
import asyncio
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

# --- 1) Баг: создаём через create_bug_report (от plain) ---
from fastapi.testclient import TestClient
c = TestClient(main.app)
r = c.post("/api/bugs", data={"title": "Не работает кнопка", "description": "Кнопка не нажимается в мобильной версии интерфейса", "priority": "high"})
print("bug create:", r.status_code, r.json())
assert r.status_code == 200
with Session(engine) as s:
    t = s.exec(select(TeamTicket).where(TeamTicket.kind == "bug")).first()
    assert t, "bug-тикет не создан"
    print("bug ticket assigned_to:", t.assigned_to, "| ожидаем tech:", DATA["tech"])
    assert t.assigned_to == DATA["tech"], "баг должен достаться технику с tech_access"
    msg = s.exec(select(Message).where(Message.chat_id == DATA["chat"])).all()
    print("bot msgs:", [m.text for m in msg])
    assert any("Баг" in (m.text or "") for m in msg)

# --- 2) Жалоба: create_report → complaint должен достаться rep (manage_reports) ---
r = c.post("/api/reports", data={"target_type": "chat", "target_id": DATA["chat"], "reason": "spam", "comment": "тест"})
print("report create:", r.status_code, r.json())
with Session(engine) as s:
    t = s.exec(select(TeamTicket).where(TeamTicket.kind == "complaint")).first()
    assert t, "complaint-тикет не создан"
    print("complaint assigned_to:", t.assigned_to, "| ожидаем rep:", DATA["rep"])
    assert t.assigned_to == DATA["rep"], "жалоба должна достаться модератору с manage_reports"

# --- 3) Строгость: plain (без tech_access/manage_reports) НЕ должен быть в кандидатах bug/complaint ---
with Session(engine) as s:
    members = s.exec(select(main.ChatMember).where(main.ChatMember.chat_id == DATA["chat"])).all()
    plain_cm = [m for m in members if m.user_id == DATA["plain"]][0]
    assert not main._member_handles_kind(plain_cm, "bug", session=s), "plain не должен брать bug"
    assert not main._member_handles_kind(plain_cm, "complaint", session=s), "plain не должен брать complaint"
    assert main._member_handles_kind(plain_cm, "other", session=s), "plain берёт other"
    assert main._member_handles_kind(plain_cm, "join", session=s), "plain берёт join"

print("\nALL KIND-PERM CHECKS PASSED")