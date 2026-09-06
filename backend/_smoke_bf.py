import os
os.environ["REDIS_URL"] = "FAKE"
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import main
from fastapi.testclient import TestClient
from database import engine, init_db
init_db()

with TestClient(main.app) as c:
    # регистрируем юзера (идемпотентно)
    r = c.post("/api/register", json={"username": "ownbot", "password": "secret123", "display_name": "Own"})
    print("register:", r.status_code)
    r = c.post("/api/login", json={"username": "ownbot", "password": "secret123"})
    print("login:", r.status_code)
    token = r.json().get("token")
    h = {"Authorization": f"Bearer {token}"}
    from sqlmodel import Session, select
    from models import User, Bot
    from bots import ensure_botfather
    with Session(engine) as s:
        bf = ensure_botfather(s)
        print("botfather:", bf.username, "user_id:", bf.user_id)
        bf_uid = bf.user_id
    r = c.post(f"/api/chats?other_user_id={bf_uid}", headers=h)
    print("open dm:", r.status_code)
    dm_id = r.json().get("chat_id") if r.status_code == 200 else None
    r = c.post(f"/api/chats/{dm_id}/messages", data={"text": "/newbot СтикерМастер"}, headers=h)
    print("send /newbot:", r.status_code)
    r = c.get(f"/api/chats/{dm_id}/messages", headers=h)
    d = r.json() if r.status_code == 200 else {}
    msgs = d.get("messages") or d.get("items") or (d if isinstance(d, list) else [])
    for m in msgs[-2:]:
        print("msg:", (m.get("text") or "")[:100])
    r = c.get("/api/admin/bots?mine=1", headers=h)
    bots = r.json() if r.status_code == 200 else []
    print("my bots:", [(b["name"], b["username"], bool(b.get("user_id"))) for b in bots])
print("DONE")