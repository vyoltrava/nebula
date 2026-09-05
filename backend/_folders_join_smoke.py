"""Смоук: создание папки сразу с чатами + диспетчеризация заявки в канал."""
import os, tempfile
os.environ["DATABASE_URL"] = "sqlite:///./_folders_join_test.db"
if os.path.exists("_folders_join_test.db"):
    os.remove("_folders_join_test.db")

import main, channels
from database import init_db, engine
from models import SQLModel, User, Chat, ChatMember, ChatFolderAssign, RoleCategory, TeamTicket, Message, Channel
from sqlmodel import Session, select

init_db()
s = Session(engine)

u = User(username="tester", display_name="Tester", password_hash="x")
s.add(u); s.commit(); s.refresh(u)
other = User(username="admin1", display_name="Admin1", password_hash="x")
s.add(other); s.commit(); s.refresh(other)

ch = Chat(name="ЛС", is_group=False)
s.add(ch); s.commit(); s.refresh(ch)
s.add(ChatMember(chat_id=ch.id, user_id=u.id, role="member"))
s.commit()

# --- 1) Папка создаётся сразу с чатами ---
fd = main.FolderCreateIn(name="Игры", icon="🎮🔥", chat_ids=[ch.id])
res = main.create_chat_folder(fd, u, s)
print("1) create folder:", res)
assert res["ok"] and res["chat_ids"] == [ch.id]
assign = s.exec(select(ChatFolderAssign).where(ChatFolderAssign.folder_id == res["id"])).all()
assert len(assign) == 1
assert len(res["icon"]) <= 16

# --- 2) Заявка в приватный канал → тикет + бот-сообщение в рабочем чате отдела ---
# other = глава отдела (head): заявки ему НЕ приходят, если есть обычные исполнители
cat = main.RoleCategory(name="Поддержка")
s.add(cat); s.commit(); s.refresh(cat)
team_chat = main.ensure_team_chat_for_category(cat.id, s)
assert team_chat is not None
member = main.add_user_to_team_chat(other, cat, s)
assert member is not None
import json
member.team_permissions = json.dumps(["can_handle_tasks"])
member.team_hierarchy = "head"
s.add(member); s.commit()

# обычный исполнитель (junior) с правом can_handle_tasks — заявки идут ему
worker = User(username="worker1", display_name="Worker", password_hash="x")
s.add(worker); s.commit(); s.refresh(worker)
w_member = main.add_user_to_team_chat(worker, cat, s)
assert w_member is not None
w_member.team_permissions = json.dumps(["can_handle_tasks"])
w_member.team_hierarchy = "junior"
s.add(w_member); s.commit()

# участник с доступом к тикетам, но БЕЗ can_handle_tasks → заявок не получает
no_perm = User(username="noperm1", display_name="NoPerm", password_hash="x")
s.add(no_perm); s.commit(); s.refresh(no_perm)
np_member = main.add_user_to_team_chat(no_perm, cat, s)
np_member.team_permissions = json.dumps([])
np_member.team_hierarchy = "senior"
s.add(np_member); s.commit()

channel = Channel(title="Закрытый клуб", is_public=False, owner_id=other.id, custom_slug="closed-club")
s.add(channel); s.commit(); s.refresh(channel)
s.add(channels.ChannelSubscriber(channel_id=channel.id, user_id=other.id, role="owner"))
s.commit()

import asyncio
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)
r = loop.run_until_complete(channels._create_pending_request(s, channel, u))
print("2) pending request:", r)
ticket = s.exec(select(TeamTicket).where(TeamTicket.kind == "join")).first()
print("   ticket:", ticket.title, "| assigned_to:", ticket.assigned_to, "| chat_id:", ticket.chat_id)
# глава (other) и без права (no_perm) получить не должны — только worker
assert ticket is not None and ticket.assigned_to == worker.id
bot_msg = s.exec(select(Message).where(Message.chat_id == team_chat.id)).all()
print("   bot message:", bot_msg[-1].text if bot_msg else None)
assert bot_msg and "@" + worker.username in bot_msg[-1].text

# --- 3) resolve_request закрывает тикет ---
req = s.exec(select(channels.ChannelInviteRequest)).first()
r = loop.run_until_complete(channels.resolve_request(channel.id, req.id, "approve", other, s))
s.refresh(ticket)
print("3) resolved:", r, "| ticket status:", ticket.status)
assert ticket.status == "done"

print("ALL FOLDERS+JOIN CHECKS PASSED")
