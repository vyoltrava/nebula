"""Smoke: BotFather — открытие лички через UI-кнопку + ответы на команды."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_bf_test.db"
if os.path.exists("_bf_test.db"):
    os.remove("_bf_test.db")
import models
from database import init_db, engine
init_db()
from sqlmodel import Session, select
from fastapi.testclient import TestClient
import main
from main import create_token, hash_password

client = TestClient(main.app)

with Session(engine) as s:
    u = models.User(username="bf_user", display_name="U",
                    password_hash=hash_password("secret123"))
    s.add(u); s.commit(); s.refresh(u)
    tok = {"Authorization": "Bearer " + create_token(u.id)}

r = client.post("/api/admin/bots/botfather/open", headers=tok)
print("open:", r.status_code, r.json())
assert r.status_code == 200 and r.json()["chat_id"], r.text
chat_id = r.json()["chat_id"]

# 🖼 у BotFather есть аватар из public-папки фронтенда
with Session(engine) as s:
    bf_user = s.exec(select(models.User).where(
        models.User.username == "botfather")).first()
    assert bf_user, "BotFather не создан"
    assert bf_user.avatar_url == "public:/botfather.png", bf_user.avatar_url
    print("botfather avatar ok:", bf_user.avatar_url)

# повторный вызов — тот же чат (идемпотентно)
r2 = client.post("/api/admin/bots/botfather/open", headers=tok)
assert r2.json()["chat_id"] == chat_id, r2.json()
print("idempotent ok")

# юзер шлёт /start -> BotFather отвечает
r = client.post("/api/chats/%d/messages" % chat_id, headers=tok, data={"text": "/start"})
print("msg status:", r.status_code)

with Session(engine) as s:
    msgs = s.exec(select(models.Message).where(
        models.Message.chat_id == chat_id).order_by(models.Message.id)).all()
    texts = [(m.sender_id, (m.text or "")[:45]) for m in msgs]
    print("messages:", texts)
    assert any("BotFather" in (m.text or "") for m in msgs), "нет ответа BotFather"

# /newbot создаёт бота и присылает токен
r = client.post("/api/chats/%d/messages" % chat_id, headers=tok,
                data={"text": "/newbot Vazzer, Ник: vazzer_bot"})
print("newbot status:", r.status_code)
with Session(engine) as s:
    msgs = s.exec(select(models.Message).where(
        models.Message.chat_id == chat_id).order_by(models.Message.id)).all()
    token_msg = [m for m in msgs if "API-ключ" in (m.text or "")]
    assert token_msg, "нет ответа с API-ключом: " + str([(m.text or "")[:60] for m in msgs])
    print("last:", token_msg[-1].text[:80])

# /setcommands меняет команду боту через чат
r = client.post("/api/chats/%d/messages" % chat_id, headers=tok,
                data={"text": "/setcommands vazzer_bot /hello Приветствие!"})
print("setcommands status:", r.status_code)
with Session(engine) as s:
    bot = s.exec(select(models.Bot).where(models.Bot.username == "vazzer_bot")).first()
    cmds = s.exec(select(models.BotCommand).where(models.BotCommand.bot_id == bot.id)).all()
    print("commands:", [(c.command, c.reply) for c in cmds])
    assert any(c.command == "/hello" and c.reply == "Приветствие!" for c in cmds), cmds

# 🤖 подсказки команд: /chats/{id}/bot-commands возвращает команды ботов в чате
r = client.get("/api/chats/%d/bot-commands" % chat_id, headers=tok)
data = r.json()
print("bot-commands:", r.status_code, data)
assert r.status_code == 200 and "bots" in data
all_commands = [c["command"] for b in data["bots"] for c in b["commands"]]
assert "/newbot" in all_commands, all_commands  # команды BotFather в личке
# не-участник чата → 403
r = client.get("/api/chats/999999/bot-commands", headers=tok)
assert r.status_code == 403, r.status_code
print("command-hints endpoint ok")

# 👨💻 создание бота через кнопки (API-ключ, показывается один раз)
r = client.post("/api/botfather/create-bot", headers=tok,
                json={"name": "МойБот", "username": "mybot_bot"})
d = r.json()
print("create-bot:", r.status_code, d["ok"], "token?", "token" in d)
assert r.status_code == 200 and d["ok"] and d["token"]
assert d["token"].startswith("%d:" % d["bot"]["id"])
print("   token:", d["token"][:10] + "...")
# дубль ника → 400
r2 = client.post("/api/botfather/create-bot", headers=tok,
                 json={"name": "X", "username": "mybot_bot"})
assert r2.status_code == 400, r2.status_code
print("   duplicate username -> 400 ok")
# 🏷 ник БЕЗ приписки bot → 400
r2 = client.post("/api/botfather/create-bot", headers=tok,
                 json={"name": "X", "username": "badname"})
assert r2.status_code == 400, r2.status_code
print("   username without 'bot' suffix -> 400 ok")
# авто-ник тоже с припиской
r2 = client.post("/api/botfather/create-bot", headers=tok, json={"name": "АвтоБот"})
assert r2.status_code == 200 and r2.json()["bot"]["username"].endswith("bot"), r2.json()
print("   auto-nick ends with bot:", r2.json()["bot"]["username"])
# админский create без username → авто-ник с припиской
r2 = client.post("/api/admin/bots", headers=tok, json={"name": "АвтоТест", "type": "custom"})
assert r2.status_code == 200 and r2.json()["username"] and r2.json()["username"].endswith("bot"), r2.json()
print("   admin create auto-nick ends with bot:", r2.json()["username"])

# 📱 мои боты (без ключей)
r = client.get("/api/botfather/my-bots", headers=tok)
myb = r.json()
print("my-bots:", r.status_code, [(b["username"], b["has_api_key"]) for b in myb])
assert r.status_code == 200 and any(b["username"] == "mybot_bot" for b in myb)
bot_item = next(b for b in myb if b["username"] == "mybot_bot")
assert bot_item["has_api_key"] is True
# ключ НЕ должен раскрываться в списке
assert "token" not in bot_item
print("   keys not leaked ok")

# 🔑 сброс ключа → новый, старый инвалидируется
old_token = d["token"]
r = client.post("/api/botfather/reset-token", headers=tok,
                json={"bot_id": bot_item["id"]})
dr = r.json()
assert r.status_code == 200 and dr["ok"] and dr["token"] != old_token
print("reset-token ok (новый отличен от старого)")

# 💬 единая личка: повторный open возвращает тот же чат (уже проверено выше idempotent)
r = client.post("/api/admin/bots/botfather/open", headers=tok)
assert r.json()["chat_id"] == chat_id
print("single DM (no duplicates) ok")

# ⚙️ настройка бота: имя, описание, ссылка
r = client.post("/api/botfather/edit-bot", headers=tok,
                json={"bot_id": bot_item["id"], "name": "МойБот v2",
                      "description": "Эхо-бот для теста"})
assert r.status_code == 200 and r.json()["ok"], r.text
r = client.get("/api/botfather/my-bots", headers=tok)
b2 = next(b for b in r.json() if b["id"] == bot_item["id"])
assert b2["name"] == "МойБот v2" and b2["description"] == "Эхо-бот для теста"
print("edit-bot ok:", b2["name"], "|", b2["description"])

# 🔑 чужой бот → 403
with Session(engine) as s:
    other = models.User(username="bf_other", display_name="O",
                        password_hash=hash_password("secret123"))
    s.add(other); s.commit(); s.refresh(other)
    other_bot = models.Bot(name="Чужой", username="chuzhoy_bot", type="custom",
                           active=True, token="x", owner_id=other.id, system=False)
    s.add(other_bot); s.commit(); s.refresh(other_bot)
    ob_id = other_bot.id
r = client.post("/api/botfather/edit-bot", headers=tok,
                json={"bot_id": ob_id, "name": "Взлом"})
assert r.status_code == 403, r.status_code
r = client.post("/api/botfather/reset-token", headers=tok, json={"bot_id": ob_id})
assert r.status_code == 403, r.status_code
print(" чужой бот -> 403 ok")

# 🏛 официальные боты (system=True) — StickerBot и т.д.
r = client.post("/api/sticker-bot/open", headers=tok)
print("stickerbot open:", r.status_code, r.json())
assert r.status_code == 200 and r.json()["chat_id"]
sticker_chat = r.json()["chat_id"]
r = client.get("/api/botfather/official-bots", headers=tok)
officials = r.json()
print("official-bots:", r.status_code, [(b["username"], b["avatar_url"]) for b in officials])
assert r.status_code == 200
assert any(b["username"] == "stickerbot" for b in officials), officials
sb_item = next(b for b in officials if b["username"] == "stickerbot")
assert sb_item["avatar_url"] == "public:/stickerbot.png"
assert sb_item["avatar_url"] is not None
print("official-bots ok (StickerBot в касте + аватар)")

# открыть официального через smart-эндпоинт — тот же чат (единственный)
r = client.post("/api/botfather/official/stickerbot/open", headers=tok)
assert r.json()["chat_id"] == sticker_chat
print("official open idempotent ok")

print("BOTFATHER SMOKE OK")
