"""Smoke: smeny (/enter /exit /shift), round-robin, ticket kinds."""
import os, asyncio
os.environ["DATABASE_URL"] = "sqlite:///./_team_shift_test.db"
import models
from database import init_db, engine
init_db()
from sqlmodel import Session, select
import main, json

with Session(engine) as s:
    staff = models.User(username="admin_sh", display_name="Admin", password_hash="x", is_admin=True)
    s.add(staff); s.commit(); s.refresh(staff)
    cat = models.RoleCategory(name="Smena Dept")
    s.add(cat); s.commit(); s.refresh(cat)
    main.ensure_team_chat_for_category(cat.id, s)
    chat = s.get(models.Chat, cat.team_chat_id)

    users = {}
    for uname, lvl in [("w1", 3), ("w2", 3), ("w3", 4)]:
        r = models.Role(name=f"R{uname}", level=lvl, category_id=cat.id)
        s.add(r); s.commit(); s.refresh(r)
        u = models.User(username=uname, display_name=uname, password_hash="x", role_id=r.id)
        s.add(u); s.commit(); s.refresh(u)
        cm = main.add_user_to_team_chat(u, cat, s)
        cm.team_permissions = json.dumps(["can_handle_tasks", "can_create_tasks"])
        s.add(cm); s.commit()
        users[uname] = (u, cm)

    u1, cm1 = users["w1"]; u2, cm2 = users["w2"]; u3, cm3 = users["w3"]
    r1 = asyncio.run(main.handle_team_chat_command(chat, cm1, u1, "/enter", s))
    r2 = asyncio.run(main.handle_team_chat_command(chat, cm2, u2, "/enter", s))
    print("1) /enter ok:", "@w1" in r1["text"] and "w1" in r1["text"])
    assert "@w1" in r1["text"]

    picks = []
    for i in range(4):
        t = asyncio.run(main.create_team_ticket(cat.id, main.TeamTicketIn(title=f"T{i}"), staff, s))
        picks.append(t["ticket"]["assigned_to_username"])
    print("2) round-robin:", picks)
    assert set(picks) == {"w1", "w2"} and "w3" not in picks
    assert picks[0] != picks[1]

    cm1.ticket_kinds = json.dumps(["complaint"])
    cm2.ticket_kinds = json.dumps(["appeal"])
    s.add(cm1); s.add(cm2); s.commit()
    for t in s.exec(select(models.TeamTicket).where(models.TeamTicket.category_id == cat.id)).all():
        t.status = "done"; s.add(t)
    s.commit()
    t = asyncio.run(main.create_team_ticket(cat.id, main.TeamTicketIn(title="Complaint", kind="complaint"), staff, s))
    print("3) complaint ->", t["ticket"]["assigned_to_username"])
    assert t["ticket"]["assigned_to_username"] == "w1"
    t2 = asyncio.run(main.create_team_ticket(cat.id, main.TeamTicketIn(title="Appeal", kind="appeal"), staff, s))
    assert t2["ticket"]["assigned_to_username"] == "w2"

    for t in s.exec(select(models.TeamTicket).where(models.TeamTicket.category_id == cat.id)).all():
        t.status = "done"; s.add(t)
    s.commit()
    t3 = asyncio.run(main.create_team_ticket(cat.id, main.TeamTicketIn(title="Other", kind="other"), staff, s))
    print("4) other ->", t3["ticket"]["status"], "| auto:", t3["auto_assigned"], "| to:", t3["ticket"]["assigned_to_username"])
    # w1/w2 на смене, но не отвечают за тип other -> fallback на w3 (все типы)
    assert t3["auto_assigned"] is True and t3["ticket"]["assigned_to_username"] == "w3"

    r = asyncio.run(main.handle_team_chat_command(chat, cm1, u1, "/exit", s))
    print("5) /exit ok:", "w1" in r["text"])
    queue = s.exec(select(models.TeamTicket).where(models.TeamTicket.category_id == cat.id, models.TeamTicket.status.in_(["open", "assigned"]))).all()
    print("   v queue:", len(queue))
    assert len(queue) >= 1

    r = asyncio.run(main.handle_team_chat_command(chat, cm2, u2, "/shift", s))
    print("6) /shift:", "@w2" in r["text"] and "@w1" not in r["text"])
    assert "@w2" in r["text"] and "@w1" not in r["text"]

    msgs = s.exec(select(models.Message).where(models.Message.chat_id == chat.id)).all()
    print("7) system messages:", len(msgs))
    assert len(msgs) >= 5

    # 8) эндпоинт кнопки смены (toggle) — то же, что /enter /exit
    st = main.get_shift_status(chat.id, u3, s)
    print("8) status before:", st)
    # u3 (id 4) не на смене; w2 (id 3) — на смене
    assert st["on_shift"] is False and st["shift_users"] == [3]
    res = asyncio.run(main.toggle_shift(chat.id, "toggle", u3, s))
    print("   after toggle:", res["on_shift"], "| msg:", res["message"]["text"][:40])
    assert res["on_shift"] is True
    res = asyncio.run(main.toggle_shift(chat.id, "toggle", u3, s))
    assert res["on_shift"] is False
    print("   toggle exit OK")

print("ALL SHIFT CHECKS PASSED")
