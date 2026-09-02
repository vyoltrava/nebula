# -*- coding: utf-8 -*-
import os, shutil, time
shutil.copy("nebula.db", "_smoke_sort.db")
os.environ["DATABASE_URL"] = "sqlite:///_smoke_sort.db"
from fastapi.testclient import TestClient
import main as M
M.startup()
c = TestClient(M.app)
sfx = str(int(time.time()))[-6:]
u1, u2 = f"sa{sfx}", f"sb{sfx}"
c.post("/api/register", json={"username": u1, "display_name": u1, "password": "Passw0rd!23"})
c.post("/api/register", json={"username": u2, "display_name": u2, "password": "Passw0rd!23"})
tok1 = c.post("/api/login", json={"username": u1, "password": "Passw0rd!23"}).json().get("access_token")
H1 = {"Authorization": f"Bearer {tok1}"}
me2 = c.get(f"/api/users?q={u2}", headers=H1).json()["users"][0]
dm = c.request("POST", "/api/chats", params={"other_user_id": me2["id"]}, headers=H1).json()["chat_id"]
c.post(f"/api/chats/{dm}/messages", headers=H1, data={"text": "old"})
cn = c.post("/api/chats/channel", headers=H1, json={"name": "Chan"}).json()["chat_id"]
time.sleep(0.05)
c.post(f"/api/chats/{cn}/posts", headers=H1, json={"text": "fresh"})
cn2 = c.post("/api/chats/channel", headers=H1, json={"name": "Empty"}).json()["chat_id"]
chats = c.get("/api/chats", headers=H1).json()
ids = [x["id"] for x in chats]
print("RESULT order:", ids, "| dm:", dm, "channel:", cn, "empty:", cn2)
print("RESULT channel_above_dm:", ids.index(cn) < ids.index(dm))
print("RESULT channel_above_empty:", ids.index(cn) < ids.index(cn2))
print("RESULT empty_no_last_message:", next(x for x in chats if x["id"] == cn2)["last_message"] is None)
os.remove("_smoke_sort.db")
