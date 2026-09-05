"""Smoke: ticket queue (Random + Level Priority + kinds + async create)."""
import os, asyncio, json
os.environ["DATABASE_URL"] = "sqlite:///./_team_step7_test.db"
import models
from database import init_db, engine
init_db()
from sqlmodel import Session, select
import main

with Session(engine) as s:
    staff = models.User(username="admin7", display_name="Admin", password_hash="x", is_admin=True)
    s.add(staff); s.commit(); s.refresh(staff)
    cat = models.RoleCategory(name="Tickets Dept")
    s.add(cat); s.commit(); s.refresh(cat)
    main.ensure_team_chat_for_category(cat.id, s)

    users = {}
    for uname, lvl, perms in [("jun1", 3, ["can_handle_tasks"]), ("jun2", 3, ["can_handle_tasks"]),
                              ("sen1", 4, ["can_handle_tasks"]), ("head1", 6, [])]:
        r = models.Role(name=f"R {uname}", level=lvl, category_id=cat.id)
        s.add(r); s.commit(); s.refresh(r)
        u = models.User(username=uname, display_name=uname, password_hash="x", role_id=r.id)
        s.add(u); s.commit(); s.refresh(u)
        cm = main.add_user_to_team_chat(u, cat, s)
        cm.team_permissions = json.dumps(perms)
        s.add(cm); s.commit()
        users[uname] = u

    t1 = asyncio.run(main.create_team_ticket(cat.id, main.TeamTicketIn(title="Fix bug"), staff, s))
    print("1) ticket1:", t1["ticket"]["status"], "->", t1["ticket"]["assigned_to_username"], "| prio:", t1["ticket"]["assigned_hierarchy"])
    assert t1["auto_assigned"] and t1["ticket"]["assigned_hierarchy"] == "junior"

    t2 = asyncio.run(main.create_team_ticket(cat.id, main.TeamTicketIn(title="Second"), staff, s))
    print("2) ticket2:", t2["ticket"]["assigned_to_username"])
    assert t2["ticket"]["assigned_hierarchy"] == "junior"
    assert t2["ticket"]["assigned_to_username"] != t1["ticket"]["assigned_to_username"]

    t3 = asyncio.run(main.create_team_ticket(cat.id, main.TeamTicketIn(title="Third"), staff, s))
    print("3) ticket3:", t3["ticket"]["assigned_to_username"], "| prio:", t3["ticket"]["assigned_hierarchy"])
    assert t3["ticket"]["assigned_to_username"] == "sen1" and t3["ticket"]["assigned_hierarchy"] == "senior"

    r = main.close_team_ticket(cat.id, t3["ticket"]["id"], users["sen1"], s)
    print("4) closed:", r["ticket"]["status"])
    assert r["ticket"]["status"] == "done"

    lst = main.list_team_tickets(cat.id, "assigned", users["head1"], s)
    print("5) open assigned:", len(lst))
    assert len(lst) == 2

    r = main.assign_team_ticket(cat.id, t3["ticket"]["id"], users["head1"].id, staff, s)
    print("6) manual assign:", r["ticket"]["assigned_to_username"], "| status:", r["ticket"]["status"])
    assert r["ticket"]["assigned_to_username"] == "head1" and r["ticket"]["status"] == "assigned"

    msgs = s.exec(select(models.Message).where(models.Message.chat_id == cat.team_chat_id)).all()
    print("7) chat messages:", len(msgs))
    assert any("@sen1" in (m.text or "") for m in msgs)

print("ALL STEP-7 CHECKS PASSED")
