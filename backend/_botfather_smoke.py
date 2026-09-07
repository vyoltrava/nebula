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
    token_msg = [m for m in msgs if "Токен" in (m.text or "")]
    assert token_msg, "нет ответа с токеном: " + str([(m.text or "")[:60] for m in msgs])
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

print("BOTFATHER SMOKE OK")
