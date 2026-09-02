# -*- coding: utf-8 -*-
import os, shutil, time
shutil.copy("nebula.db", "_smoke_ch.db")
os.environ["DATABASE_URL"] = "sqlite:///_smoke_ch.db"
from fastapi.testclient import TestClient
import main as M
M.startup()
c = TestClient(M.app)
sfx = str(int(time.time()))[-6:]
u1, u2 = f"ce{sfx}", f"cf{sfx}"
c.post("/api/register", json={"username": u1, "display_name": u1, "password": "Passw0rd!23"})
c.post("/api/register", json={"username": u2, "display_name": u2, "password": "Passw0rd!23"})
def login(u):
    r = c.post("/api/login", json={"username": u, "password": "Passw0rd!23"}).json()
    return r.get("access_token") or r.get("token")
tok1, tok2 = login(u1), login(u2)
H1 = {"Authorization": f"Bearer {tok1}"}
H2 = {"Authorization": f"Bearer {tok2}"}
u2id = c.get(f"/api/users?q={u2}", headers=H1).json()["users"][0]["id"]
cn = c.post("/api/chats/channel", headers=H1, json={"name": "TestChan", "user_ids": [u2id]}).json()["chat_id"]

# 1) Админ пишет сообщение в канал — ок
r1 = c.post(f"/api/chats/{cn}/messages", headers=H1, data={"text": "hello channel"})
print("R1 admin message:", r1.status_code == 200)
# 2) Рядовой участник не может (who_can_post=admins)
r2 = c.post(f"/api/chats/{cn}/messages", headers=H2, data={"text": "nope"})
print("R2 member 403:", r2.status_code == 403)
# 3) get_messages: sender_name = канал, author_signature = автор (show_author default True)
msgs = c.get(f"/api/chats/{cn}/messages", headers=H1).json()["messages"]
print("R3 channel identity:", msgs[0]["sender_name"] == "TestChan" and msgs[0]["sender_avatar"] is None)
print("R4 author signature:", msgs[0]["author_signature"] == u1)
# 4) show_author=False → подписи нет
c.patch(f"/api/chats/{cn}/settings", headers=H1, json={"show_author": False})
msgs2 = c.get(f"/api/chats/{cn}/messages", headers=H1).json()["messages"]
print("R5 no signature:", msgs2[0]["author_signature"] is None and msgs2[0]["sender_name"] == "TestChan")
# 5) реакции и закреп работают (Message-сущности)
mid = msgs[0]["id"]
rp = c.post(f"/api/chats/{cn}/messages/{mid}/reactions", headers=H1, data={"emoji": "🔥"})
print("R6 reaction:", rp.status_code == 200)
pn = c.post(f"/api/chats/{cn}/messages/{mid}/pin", headers=H1)
print("R7 pin:", pn.status_code == 200)
# 6) миграция старых постов: создадим пост напрямую в БД и перезапустим startup
import sqlite3
con = sqlite3.connect("_smoke_ch.db")
con.execute("INSERT INTO chatpost (chat_id, author_id, text, created_at) VALUES (?, ?, 'legacy post', datetime('now'))", (cn, me_id if (me_id := c.get("/api/me", headers=H1).json().get("id")) else 1))
con.commit(); con.close()
M.startup()
msgs3 = c.get(f"/api/chats/{cn}/messages", headers=H1).json()["messages"]
print("R8 legacy post migrated:", any(m["text"] == "legacy post" for m in msgs3))
os.remove("_smoke_ch.db")
print("ALL DONE")
