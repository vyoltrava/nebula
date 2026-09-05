"""Smoke-тест Шага 2: папки чатов + кросс-командные чаты (временный файл)."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_team_step2_test.db"
import models
from database import init_db, engine
init_db()
from sqlmodel import Session, select
import main

with Session(engine) as s:
    # --- подготовка: два отдела, глава (lvl6), зам (lvl5), новичок (lvl3)
    cat = models.RoleCategory(name="Отдел A")
    s.add(cat); s.commit(); s.refresh(cat)
    main.ensure_team_chat_for_category(cat.id, s)

    r_head = models.Role(name="Глава A", level=6, category_id=cat.id)
    s.add(r_head); s.commit(); s.refresh(r_head)
    head = models.User(username="head_a", display_name="Head", password_hash="x", role_id=r_head.id)
    s.add(head); s.commit(); s.refresh(head)
    main.sync_user_team_membership(head, s)

    r_dep = models.Role(name="Зам A", level=5, category_id=cat.id)
    s.add(r_dep); s.commit(); s.refresh(r_dep)
    dep = models.User(username="dep_a", display_name="Dep", password_hash="x", role_id=r_dep.id)
    s.add(dep); s.commit(); s.refresh(dep)
    main.sync_user_team_membership(dep, s)

    # --- 1) кросс-командный чат: только главы
    cross = models.Chat(name="Чат Глав", is_group=True, system_folder="work", cross_team_type="heads_only")
    s.add(cross); s.commit(); s.refresh(cross)
    cand = main._cross_team_candidate_ids(s, "heads_only")
    main._create_cross_team_chat_sync(s, cross, cand, actor_id=head.id)
    s.commit()
    members = s.exec(select(models.ChatMember).where(models.ChatMember.chat_id == cross.id)).all()
    print("1) Чат Глав members:", sorted(m.user_id for m in members), "(head:", head.id, ")")
    assert head.id in [m.user_id for m in members] and dep.id not in [m.user_id for m in members]

    # --- 2) новенький стал главой другого отдела → сам попал в Чат Глав
    cat2 = models.RoleCategory(name="Отдел B")
    s.add(cat2); s.commit(); s.refresh(cat2)
    main.ensure_team_chat_for_category(cat2.id, s)
    r_head2 = models.Role(name="Глава B", level=6, category_id=cat2.id)
    s.add(r_head2); s.commit(); s.refresh(r_head2)
    u2 = models.User(username="head_b", display_name="HB", password_hash="x", role_id=r_head2.id)
    s.add(u2); s.commit(); s.refresh(u2)
    main.sync_user_team_membership(u2, s)
    m2 = s.exec(select(models.ChatMember).where(models.ChatMember.chat_id == cross.id, models.ChatMember.user_id == u2.id)).first()
    print("2) новый глава авто-добавлен в Чат Глав:", bool(m2))
    assert m2 is not None

    # --- 3) главу понизили до новичка → авто-кик из Чат Глав (но не из своего отдела)
    r_jun = models.Role(name="Новичок B", level=3, category_id=cat2.id)
    s.add(r_jun); s.commit(); s.refresh(r_jun)
    u2.role_id = r_jun.id; s.add(u2); s.commit()
    main.sync_user_team_membership(u2, s)
    m2 = s.exec(select(models.ChatMember).where(models.ChatMember.chat_id == cross.id, models.ChatMember.user_id == u2.id)).first()
    team_m2 = s.exec(select(models.ChatMember).where(models.ChatMember.user_id == u2.id)).all()
    print("3) после понижения: в Чат Глав:", bool(m2), "| остался в чатах:", len(team_m2))
    assert m2 is None and len(team_m2) == 1

    # --- 4) чат замов
    cross2 = models.Chat(name="Чат Замов", is_group=True, system_folder="work", cross_team_type="deputies_only")
    s.add(cross2); s.commit(); s.refresh(cross2)
    cand2 = main._cross_team_candidate_ids(s, "deputies_only")
    main._create_cross_team_chat_sync(s, cross2, cand2, actor_id=dep.id)
    s.commit()
    dm = s.exec(select(models.ChatMember).where(models.ChatMember.chat_id == cross2.id)).all()
    print("4) Чат Замов members:", sorted(m.user_id for m in dm), "(dep:", dep.id, ")")
    assert dep.id in [m.user_id for m in dm] and head.id not in [m.user_id for m in dm]

    # --- 5) папки: создание, привязка ЛС, структура GET /api/chats/folders
    fd = main.FolderCreateIn(name="Игры", icon="🎮")
    folder = main.create_chat_folder(fd, dep, s)
    assert folder["ok"]
    dm_chat = models.Chat(is_group=False)
    s.add(dm_chat); s.commit(); s.refresh(dm_chat)
    s.add(models.ChatMember(chat_id=dm_chat.id, user_id=dep.id))
    s.add(models.ChatMember(chat_id=dm_chat.id, user_id=head.id))
    s.commit()
    r = main.add_chat_to_folder(folder["id"], main.FolderChatIn(chat_id=dm_chat.id), dep, s)
    assert r["ok"]
    # системный чат в папку класть нельзя
    try:
        main.add_chat_to_folder(folder["id"], main.FolderChatIn(chat_id=cat.team_chat_id), dep, s)
        raise SystemExit("FAIL: системный чат добавился в папку")
    except main.HTTPException as e:
        print("5) системный чат в папку: отклонён с", e.status_code)
        assert e.status_code == 400
    struct = main.list_chat_folders(dep, s)
    print("   work chats:", struct["work_folder"]["chat_ids"] if struct["work_folder"] else None)
    print("   folders:", [(f["name"], f["chat_ids"]) for f in struct["folders"]])
    print("   rest chats:", [c["id"] for c in struct["chats"]])
    assert struct["work_folder"] and dm_chat.id not in [c["id"] for c in struct["chats"]]
    assert struct["folders"][0]["chat_ids"] == [dm_chat.id]
    # удаление привязки → чат вернулся в «остальные»
    main.remove_chat_from_folder(folder["id"], dm_chat.id, dep, s)
    struct = main.list_chat_folders(dep, s)
    assert struct["folders"][0]["chat_ids"] == [] and dm_chat.id in [c["id"] for c in struct["chats"]]
    print("   после снятия привязки чат вернулся в общий список: OK")

print("ALL STEP-2 CHECKS PASSED")
