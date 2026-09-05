"""Smoke-тест Шага 3: вкладка «Команды» — структура/иерархия/права."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_team_step3_test.db"
import models
from database import init_db, engine
init_db()
from sqlmodel import Session, select
import main

with Session(engine) as s:
    # staff с полными правами
    staff = models.User(username="admin_s", display_name="Admin", password_hash="x", is_admin=True)
    s.add(staff); s.commit(); s.refresh(staff)

    cat = models.RoleCategory(name="Отдел S3")
    s.add(cat); s.commit(); s.refresh(cat)
    main.ensure_team_chat_for_category(cat.id, s)
    r4 = models.Role(name="Средний S3", level=4, category_id=cat.id)
    s.add(r4); s.commit(); s.refresh(r4)
    u = models.User(username="mid_s3", display_name="Mid", password_hash="x", role_id=r4.id)
    s.add(u); s.commit(); s.refresh(u)
    main.sync_user_team_membership(u, s)

    # 1) структура: участник с авто-иерархией senior
    st = main.teams_structure(staff, s)
    team = [t for t in st["teams"] if t["category_id"] == cat.id][0]
    m = team["members"][0]
    print("1) structure:", m["username"], "| hierarchy:", m["team_hierarchy"], "| manual:", m["team_hierarchy_manual"], "| perms:", m["team_permissions"])
    assert m["team_hierarchy"] == "senior" and not m["team_hierarchy_manual"]

    # 2) ручное повышение lvl4 → deputy
    r = main.set_team_hierarchy(cat.id, main.TeamHierarchyIn(user_id=u.id, team_hierarchy="deputy"), staff, s)
    print("2) manual override:", r["team_hierarchy"], "| manual:", r["team_hierarchy_manual"])
    assert r["team_hierarchy"] == "deputy" and r["team_hierarchy_manual"]
    # смена роли не перетирает ручную иерархию
    main.add_user_to_team_chat(u, cat, s)
    st = main.teams_structure(staff, s)
    assert st["teams"][0]["members"][0]["team_hierarchy"] == "deputy"

    # 3) сброс на авто
    r = main.set_team_hierarchy(cat.id, main.TeamHierarchyIn(user_id=u.id, team_hierarchy=None), staff, s)
    print("3) reset:", r["team_hierarchy"], "| manual:", r["team_hierarchy_manual"])
    assert r["team_hierarchy"] == "senior" and not r["team_hierarchy_manual"]

    # 4) права: выдать can_handle_tasks, невалидное право → 400
    r = main.set_team_permissions(cat.id, main.TeamPermissionsIn(user_id=u.id, permissions=["can_handle_tasks", "can_close_tasks"]), staff, s)
    print("4) permissions:", r["team_permissions"])
    assert set(r["team_permissions"]) == {"can_handle_tasks", "can_close_tasks"}
    try:
        main.set_team_permissions(cat.id, main.TeamPermissionsIn(user_id=u.id, permissions=["hack_admin"]), staff, s)
        raise SystemExit("FAIL: невалидное право принято")
    except main.HTTPException as e:
        assert e.status_code == 400
        print("   невалидное право отклонено с", e.status_code)

    # 5) юзер не в чате отдела → 404
    u2 = models.User(username="outsider", display_name="Out", password_hash="x")
    s.add(u2); s.commit(); s.refresh(u2)
    try:
        main.set_team_hierarchy(cat.id, main.TeamHierarchyIn(user_id=u2.id, team_hierarchy="head"), staff, s)
        raise SystemExit("FAIL: чужой юзер принят")
    except main.HTTPException as e:
        assert e.status_code == 404
        print("5) чужой юзер отклонён с", e.status_code)

print("ALL STEP-3 CHECKS PASSED")
