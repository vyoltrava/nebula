"""Проверка привязки отделов к разделам админки (panel_tabs):
   цвет вкладки + маршрутизация заявок в привязанный отдел."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_panel_tabs_test.db"
if os.path.exists("_panel_tabs_test.db"):
    os.remove("_panel_tabs_test.db")

import main
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


with Session(engine) as s:
    import json
    # --- Отдел «Поддержка» (зелёный): отвечает за support (appeal) и bugs ---
    sup = RoleCategory(name="Поддержка", color="#22c55e")
    s.add(sup); s.commit(); s.refresh(sup)
    tc1 = main.ensure_team_chat_for_category(sup.id, s)
    u1 = User(username="sup1", display_name="Sup", password_hash="x", is_admin=True)
    s.add(u1); s.commit(); s.refresh(u1)
    m1 = main.add_user_to_team_chat(u1, sup, s)
    m1.team_hierarchy = "junior"
    m1.team_permissions = json.dumps(["can_handle_tasks", "can_handle_appeals", "can_handle_bugs"])
    s.add(m1)

    # --- Отдел «Модерация» (красный): отвечает за reports (complaint) ---
    mod = RoleCategory(name="Модерация", color="#ef4444")
    s.add(mod); s.commit(); s.refresh(mod)
    tc2 = main.ensure_team_chat_for_category(mod.id, s)
    u2 = User(username="mod1", display_name="Mod", password_hash="x", is_admin=True)
    s.add(u2); s.commit(); s.refresh(u2)
    m2 = main.add_user_to_team_chat(u2, mod, s)
    m2.team_hierarchy = "junior"
    m2.team_permissions = json.dumps(["can_handle_tasks", "can_handle_complaints"])
    s.add(m2)
    s.commit()

    DATA = {
        "sup": sup.id, "mod": mod.id,
        "tc_sup": tc1.id, "tc_mod": tc2.id,
        "u_sup": u1.id, "u_mod": u2.id,
        "staff": u1.id,
    }

main.app.dependency_overrides[main.get_current_user] = _make_user(DATA["staff"])
c = TestClient(main.app)
STAFF_TOKEN = main.create_token(DATA["staff"])
AUTH = {"Authorization": f"Bearer {STAFF_TOKEN}"}

# 1) Привязываем отделы к разделам (require_staff читает заголовок — нужен токен)
r = c.patch(f"/api/admin/teams/{DATA['sup']}/panel-tabs", json={"tabs": ["support", "bugs"]}, headers=AUTH)
print("1) bind support dept:", r.json())
assert r.status_code == 200
r = c.patch(f"/api/admin/teams/{DATA['mod']}/panel-tabs", json={"tabs": ["reports"]}, headers=AUTH)
assert r.status_code == 200

# 2) panel-colors: вкладки окрашены цветами отделов
r = c.get("/api/admin/panel-colors", headers=AUTH).json()
print("2) panel colors:", r["tabs"])
assert r["tabs"]["support"]["color"] == "#22c55e"
assert r["tabs"]["bugs"]["color"] == "#22c55e"
assert r["tabs"]["reports"]["color"] == "#ef4444"
assert r["tabs"]["support"]["category_name"] == "Поддержка"

# 3) Баг уходит в отдел «Поддержка» (привязан к bugs), несмотря на «Модерацию»
staff_u = _make_user(DATA["staff"])()
r = c.post("/api/bugs", data={"title": "Кнопка не жмётся", "description": "В мобильной версии кнопка не реагирует на нажатия", "priority": "high"})
assert r.status_code == 200, r.text
with Session(engine) as s:
    t = s.exec(select(TeamTicket).where(TeamTicket.kind == "bug")).first()
    print("3) bug ticket -> category:", t.category_id, "| ожидали:", DATA["sup"])
    assert t.category_id == DATA["sup"], "баг должен уйти в отдел «Поддержка»"
    assert t.assigned_to == DATA["u_sup"]
    msg = s.exec(select(Message).where(Message.chat_id == DATA["tc_sup"])).all()
    assert any("Баг" in (m.text or "") for m in msg)

# 4) Обращение в поддержку → тоже в «Поддержку»
r = c.post("/api/support/start", data={"text": "Помогите с аккаунтом"})
assert r.status_code == 200, r.text
with Session(engine) as s:
    t = s.exec(select(TeamTicket).where(TeamTicket.kind == "appeal")).first()
    print("4) appeal ticket -> category:", t.category_id, "| ожидали:", DATA["sup"])
    assert t.category_id == DATA["sup"]

# 5) Жалоба → в «Модерацию»
with Session(engine) as s:
    u_plain = User(username="plain2", display_name="P2", password_hash="x")
    s.add(u_plain); s.commit(); s.refresh(u_plain)
    UID_P = u_plain.id
main.app.dependency_overrides[main.get_current_user] = _make_user(UID_P)
r = c.post("/api/reports", data={"target_type": "chat", "target_id": DATA["tc_sup"], "reason": "spam", "comment": "тест"})
assert r.status_code == 200, r.text
with Session(engine) as s:
    t = s.exec(select(TeamTicket).where(TeamTicket.kind == "complaint")).first()
    print("5) complaint ticket -> category:", t.category_id, "| ожидали:", DATA["mod"])
    assert t.category_id == DATA["mod"], "жалоба должна уйти в отдел «Модерация»"

# 6) Невалидная вкладка → 400
r = c.patch(f"/api/admin/teams/{DATA['sup']}/panel-tabs", json={"tabs": ["hacker"]}, headers=AUTH)
print("6) invalid tab ->", r.status_code)
assert r.status_code == 400

print("\nALL PANEL-TABS CHECKS PASSED")