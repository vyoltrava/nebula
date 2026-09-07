"""Smoke: тестовый эхо-бот — проверка getMe / getUpdates / sendMessage через Token."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_bf_test.db"  # здесь бот id=2 = Vazzer
import bcrypt
import models
from database import engine
from sqlmodel import Session, select
from fastapi.testclient import TestClient
import main

TOKEN = "2:HHaNfVBDL8H-C8HGBKJzu9sdf7Ha9ZbhrXO_2r6gDVc"
client = TestClient(main.app)

# 1) привяжем переданный пользователем токен к боту id=2 (Vazzer)
with Session(engine) as s:
    bot = s.get(models.Bot, 2)
    assert bot, "бот id=2 не найден"
    bot.api_token_hash = bcrypt.hashpw(TOKEN.encode(), bcrypt.gensalt()).decode()
    s.add(bot); s.commit()
    print("1) токен привязан к боту:", bot.name, bot.username, "user_id=", bot.user_id)

# 2) getMe с этим токеном — реально, через HTTP-эмуляцию
r = client.post(f"/bot{TOKEN}/getMe")
print("2) getMe:", r.status_code, r.json())
assert r.status_code == 200 and r.json()["ok"]
me = r.json()["result"]
assert me["username"] == "vazzer_bot"
print("   ->", me["first_name"], "@" + me["username"], "id", me["id"])

# 3) создадим чат, куда добавим юзера-владельца и бота
with Session(engine) as s:
    owner = s.get(models.User, 1)
    ch = models.Chat(is_group=False)
    s.add(ch); s.commit(); s.refresh(ch)
    s.add(models.ChatMember(chat_id=ch.id, user_id=owner.id, role="owner"))
    s.add(models.ChatMember(chat_id=ch.id, user_id=bot.user_id, role="member"))
    s.commit()
    chat_id = ch.id
    print("3) личка готова, chat_id=", chat_id, "owner_id=", owner.id)

# 4) владелец пишет боту
from main import create_token as _ct
tok_user = {"Authorization": "Bearer " + _ct(owner.id)}
r = client.post(f"/api/chats/{chat_id}/messages", headers=tok_user, data={"text": "Привет, бот!"})
print("4) сообщение отправлено:", r.status_code)
assert r.status_code == 200

# 5) бот делает getUpdates (long polling) — видит сообщение
r = client.post(f"/bot{TOKEN}/getUpdates", json={"timeout": 0})
updates = r.json()["result"]
print("5) getUpdates:", r.json())
assert len(updates) == 1
assert updates[0]["message"]["text"] == "Привет, бот!"
upd = updates[0]

# 6) бот отвечает эхом через sendMessage (как handle_update в test_bot.py)
from test_bot import handle_update
from fastapi.testclient import TestClient as _TC
_tc = client

def _test_api(method, **params):
    r = _tc.post(f"/bot{TOKEN}/{method}", json=params)
    data = r.json()
    print(f"     api {method} ->", r.status_code)
    assert r.status_code == 200 and data["ok"], (method, data)
    return data["result"]

handle_update(upd, api_fn=_test_api)
with Session(engine) as s:
    msgs = s.exec(select(models.Message).where(
        models.Message.chat_id == chat_id).order_by(models.Message.id)).all()
    last = msgs[-1]
    print("6) ответ бота:", last.text, "| sender_id бота =", last.sender_id)
    assert last.text == "Вы сказали: «Привет, бот!»", last.text
    assert last.sender_id == bot.user_id

print("\n✅ TEST BOT SMOKE: OK — бот получил getMe, увидел сообщение и ответил эхом")