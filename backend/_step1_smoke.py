"""Smoke-тест Шага 1: рабочие чаты отделов (временный файл, запуск вручную)."""
import os, sys
os.environ["DATABASE_URL"] = "sqlite:///./_team_step1_test.db"
import models
from database import init_db, engine
init_db()
from sqlmodel import Session, select
import main

with Session(engine) as s:
    cat = models.RoleCategory(name="Тест Отдел")
    s.add(cat); s.commit(); s.refresh(cat)
    chat = main.ensure_team_chat_for_category(cat.id, s)
    s.refresh(cat)
    print("1) category:", cat.id, "team_chat_id:", cat.team_chat_id)
    print("   chat:", chat.id, chat.name, "| is_group:", chat.is_group, "| folder:", chat.system_folder, "| cat:", chat.category_id)
    assert cat.team_chat_id == chat.id and chat.system_folder == "work" and chat.is_group

    role = models.Role(name="Тест Роль lvl5", level=5, category_id=cat.id)
    s.add(role); s.commit(); s.refresh(role)
    u = models.User(username="test_member", display_name="Test", password_hash="x", role_id=role.id)
    s.add(role); s.add(u); s.commit(); s.refresh(u)
    m = main.add_user_to_team_chat(u, cat, s)
    print("   debug level:", main.get_user_level(u, s))
    print("2) member: auto:", m.auto_assigned, "| hierarchy:", m.team_hierarchy, "| manual:", m.team_hierarchy_manual)
    assert m.auto_assigned and m.team_hierarchy == "deputy"

    cat2 = models.RoleCategory(name="Отдел 2")
    s.add(cat2); s.commit(); s.refresh(cat2)
    chat2 = main.ensure_team_chat_for_category(cat2.id, s)
    role2 = models.Role(name="Роль отдела2 lvl3", level=3, category_id=cat2.id)
    s.add(role2); s.commit()
    u.role_id = role2.id; s.add(u); s.commit()
    main.sync_user_team_membership(u, s)
    old_m = s.exec(select(models.ChatMember).where(models.ChatMember.chat_id == chat.id, models.ChatMember.user_id == u.id)).first()
    new_m = s.exec(select(models.ChatMember).where(models.ChatMember.chat_id == chat2.id, models.ChatMember.user_id == u.id)).first()
    print("3) old membership (None expected):", old_m, "| new:", new_m.chat_id if new_m else None, new_m.team_hierarchy if new_m else None)
    assert old_m is None and new_m is not None and new_m.team_hierarchy == "junior"

    new_m.team_hierarchy = "deputy"; new_m.team_hierarchy_manual = True; s.add(new_m); s.commit()
    main.add_user_to_team_chat(u, cat2, s)
    s.refresh(new_m)
    print("4) manual hierarchy preserved:", new_m.team_hierarchy, new_m.team_hierarchy_manual)
    assert new_m.team_hierarchy == "deputy" and new_m.team_hierarchy_manual

    main.kick_user_from_team_chat(u.id, cat2.id, s)
    still = s.exec(select(models.ChatMember).where(models.ChatMember.chat_id == chat2.id, models.ChatMember.user_id == u.id)).first()
    print("5) after kick (None expected):", still)
    assert still is None

print("ALL STEP-1 CHECKS PASSED")
