"""Smoke: archive sync API (server-side archive)."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_archive_test.db"
import models
from database import init_db, engine
init_db()
from sqlmodel import Session, select
import main

with Session(engine) as s:
    u = models.User(username="arch_user", display_name="A", password_hash="x")
    other = models.User(username="arch_other", display_name="B", password_hash="x")
    s.add(u); s.add(other); s.commit(); s.refresh(u); s.refresh(other)

    ch = models.Chat(is_group=True, name="G")
    s.add(ch); s.commit(); s.refresh(ch)
    s.add(models.ChatMember(chat_id=ch.id, user_id=u.id, role="owner"))
    s.add(models.ChatMember(chat_id=ch.id, user_id=other.id))
    dm = models.Chat()
    s.add(dm); s.commit(); s.refresh(dm)
    s.add(models.ChatMember(chat_id=dm.id, user_id=u.id))
    s.add(models.ChatMember(chat_id=dm.id, user_id=other.id))
    channel = models.Channel(owner_id=other.id, title="Chan", custom_slug="archch")
    s.add(channel); s.commit(); s.refresh(channel)
    s.add(models.ChannelSubscriber(channel_id=channel.id, user_id=u.id))
    s.commit()

    # 1) пустой архив
    a = main.get_archive(u, s)
    print("1) empty:", a)
    assert a == {"chats": [], "channels": []}

    # 2) архивируем группу и канал
    r = main.sync_archive(main.ArchiveSyncIn(archive_chats=[ch.id], archive_channels=[channel.id]), u, s)
    print("2) archived:", r["chats"], r["channels"])
    assert r["chats"] == [ch.id] and r["channels"] == [channel.id]

    # 3) флаг archived в сериализации
    data = main.serialize_chat_for_user(ch, u.id, s)
    print("3) group archived flag:", data["archived"])
    assert data["archived"] is True
    dm_data = main.serialize_chat_for_user(dm, u.id, s)
    assert dm_data["archived"] is False

    # 4) другой юзер не видит чужой архив
    a2 = main.get_archive(other, s)
    print("4) other user:", a2)
    assert a2 == {"chats": [], "channels": []}

    # 5) синк не трогает чужие memberships (u архивирует чат, где не участник — игнор)
    r2 = main.sync_archive(main.ArchiveSyncIn(archive_chats=[999999]), u, s)
    print("5) non-member ignored:", r2["chats"])
    assert r2["chats"] == [ch.id]

    # 6) разархивация
    r3 = main.sync_archive(main.ArchiveSyncIn(unarchive_chats=[ch.id], unarchive_channels=[channel.id]), u, s)
    print("6) unarchived:", r3)
    assert r3 == {"ok": True, "chats": [], "channels": []}
    data = main.serialize_chat_for_user(ch, u.id, s)
    assert data["archived"] is False

print("ALL ARCHIVE CHECKS PASSED")
