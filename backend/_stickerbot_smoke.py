"""Smoke: StickerBot — открытие лички, команды /newpack, /mypacks, /start."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_stb_test.db"
if os.path.exists("_stb_test.db"):
    os.remove("_stb_test.db")
import models
from database import init_db, engine
init_db()
from sqlmodel import Session, select
from fastapi.testclient import TestClient
import main
from main import create_token, hash_password

client = TestClient(main.app)

with Session(engine) as s:
    u = models.User(username="stb_user", display_name="U",
                    password_hash=hash_password("secret123"))
    s.add(u); s.commit(); s.refresh(u)
    tok = {"Authorization": "Bearer " + create_token(u.id)}

# открыть личку со StickerBot
r = client.post("/api/sticker-bot/open", headers=tok)
print("open:", r.status_code, r.json())
assert r.status_code == 200 and r.json()["chat_id"], r.text
chat_id = r.json()["chat_id"]

# идемпотентно
r2 = client.post("/api/sticker-bot/open", headers=tok)
assert r2.json()["chat_id"] == chat_id
print("idempotent ok")

def texts():
    with Session(engine) as s:
        msgs = s.exec(select(models.Message).where(
            models.Message.chat_id == chat_id).order_by(models.Message.id)).all()
        return [m.text or "" for m in msgs]

# /start -> ответ
r = client.post("/api/chats/%d/messages" % chat_id, headers=tok, data={"text": "/start"})
assert r.status_code == 200
assert any("StickerBot" in t for t in texts()), texts()
print("start reply ok")

# /newpack -> создание пака
r = client.post("/api/chats/%d/messages" % chat_id, headers=tok,
                data={"text": "/newpack Мемы"})
assert r.status_code == 200
assert any("Создал твой стикерпак" in t for t in texts()), texts()
with Session(engine) as s:
    pack = s.exec(select(models.StickerPack).where(
        models.StickerPack.name == "Мемы",
        models.StickerPack.owner_id == u.id)).first()
    assert pack, "пак не создан"
    assert pack.is_active and pack.is_user
    PACK_ID = pack.id
print("newpack ok, pack_id:", PACK_ID)

# /mypacks -> список
r = client.post("/api/chats/%d/messages" % chat_id, headers=tok, data={"text": "/mypacks"})
assert any("Мемы" in t for t in texts()), texts()
print("mypacks ok")

# /privacy -> переключить приватность пака
r = client.post("/api/chats/%d/messages" % chat_id, headers=tok, data={"text": "/privacy Мемы"})
assert any("приватный" in t for t in texts()), texts()
with Session(engine) as s:
    p = s.get(models.StickerPack, PACK_ID)
    assert p.is_public is False, p.is_public
print("privacy ok (стал приватным)")

# /rename -> переименовать
r = client.post("/api/chats/%d/messages" % chat_id, headers=tok, data={"text": "/rename Мемы МемыV2"})
assert any("переименован" in t for t in texts()), texts()
with Session(engine) as s:
    p = s.get(models.StickerPack, PACK_ID)
    assert p.name == "МемыV2", p.name
print("rename ok")
print("mypacks ok")

print("STICKERBOT SMOKE OK")