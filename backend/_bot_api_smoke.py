"""Smoke: Bot API — токены, getMe, sendMessage, getUpdates, webhook-валидация."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_bot_api_test.db"
if os.path.exists("_bot_api_test.db"):
    os.remove("_bot_api_test.db")
import models
from database import init_db, engine
init_db()
from sqlmodel import Session, select
from fastapi.testclient import TestClient
import main
from bot_api import generate_api_token

client = TestClient(main.app)

with Session(engine) as s:
    # --- фикстуры: пользователь, бот, чат ---
    u = models.User(username="api_user", display_name="Иван", password_hash="x")
    s.add(u); s.commit(); s.refresh(u)
    bot = models.Bot(name="TestBot", username="testbot_bot", type="custom",
                     active=True, token="legacy", owner_id=u.id)
    s.add(bot); s.commit(); s.refresh(bot)
    botu = models.User(username="testbot_bot_acc", display_name="TestBot",
                       password_hash="x", is_bot=True)
    s.add(botu); s.commit(); s.refresh(botu)
    bot.user_id = botu.id
    s.add(bot); s.commit()
    ch = models.Chat(is_group=True, name="BotGroup", owner_id=u.id)
    s.add(ch); s.commit(); s.refresh(ch)
    s.add(models.ChatMember(chat_id=ch.id, user_id=u.id, role="owner"))
    s.add(models.ChatMember(chat_id=ch.id, user_id=botu.id, role="member"))
    s.commit()

    # --- 1) генерация токена ---
    token = generate_api_token(bot)
    s.add(bot); s.commit()
    assert token.startswith("%d:" % bot.id) and len(token) > 40
    print("1) token ok:", token[:12] + "...")

    # --- 2) getMe ---
    r = client.post("/bot%s/getMe" % token)
    assert r.status_code == 200 and r.json()["ok"], r.text
    me = r.json()["result"]
    assert me["is_bot"] is True and me["username"] == "testbot_bot"
    print("2) getMe ok:", me["username"])

    # --- 3) неверный токен ---
    r = client.post("/bot12345:WRONG/getMe")
    assert r.status_code == 401 and r.json()["ok"] is False
    print("3) bad token -> 401 ok")

    # --- 4) sendMessage ---
    r = client.post("/bot%s/sendMessage" % token,
                    json={"chat_id": ch.id, "text": "Привет из Bot API!"})
    assert r.status_code == 200 and r.json()["ok"], r.text
    sent = r.json()["result"]
    assert sent["text"] == "Привет из Bot API!" and sent["chat"]["id"] == ch.id
    print("4) sendMessage ok, message_id:", sent["message_id"])

    # --- 5) сообщение юзера в чат → событие в очереди ---
    msg = models.Message(chat_id=ch.id, sender_id=u.id, text="/start")
    s.add(msg); s.commit(); s.refresh(msg)
    from bot_api import notify_bots_in_chat
    notify_bots_in_chat(s, ch.id, msg, u)
    upd = s.exec(select(models.BotUpdate).where(models.BotUpdate.bot_id == bot.id)).all()
    import json as _json
    payloads = [_json.loads(x.payload) for x in upd]
    assert len(payloads) == 1 and payloads[0]["command"] == "/start", payloads
    print("5) emit update ok, update_id:", upd[0].update_id)

    # --- 6) getUpdates (offset-семантика) ---
    r = client.post("/bot%s/getUpdates" % token, json={"timeout": 0})
    res = r.json()["result"]
    assert r.json()["ok"] and len(res) == 1 and res[0]["message"]["text"] == "/start"
    last = res[0]["update_id"]
    print("6) getUpdates ok:", res)

    # offset = last+1 → пусто (все обработаны)
    r = client.post("/bot%s/getUpdates" % token, json={"timeout": 0, "offset": last + 1})
    assert r.json()["result"] == []
    print("7) offset semantics ok")

    # --- 8) setWebhook: только HTTPS + запрет внутренних хостов (SSRF) ---
    r = client.post("/bot%s/setWebhook" % token, json={"url": "http://evil.com/hook"})
    assert r.status_code == 400
    r = client.post("/bot%s/setWebhook" % token, json={"url": "https://localhost/hook"})
    assert r.status_code == 400
    r = client.post("/bot%s/setWebhook" % token, json={"url": "https://127.0.0.1/hook"})
    assert r.status_code == 400
    r = client.post("/bot%s/setWebhook" % token, json={"url": "https://10.0.0.5/hook"})
    assert r.status_code == 400
    r = client.post("/bot%s/setWebhook" % token,
                    json={"url": "https://example.com/hook", "secret_token": "s3cret"})
    assert r.json()["ok"] and r.json()["result"] is True
    r = client.post("/bot%s/getWebhookInfo" % token)
    assert r.json()["result"]["url"] == "https://example.com/hook"
    print("8) webhook set/info ok")
    client.post("/bot%s/deleteWebhook" % token)

    # --- 9) команды через API ---
    r = client.post("/bot%s/setMyCommands" % token, json={
        "commands": [{"command": "start", "description": "Старт"}]})
    assert r.json()["ok"]
    r = client.post("/bot%s/getMyCommands" % token)
    assert r.json()["result"][0]["command"] == "start"
    print("9) setMyCommands/getMyCommands ok")

    # --- 10) чаты: getChat / getChatMember / pin (только свои сообщения) ---
    r = client.post("/bot%s/getChat" % token, json={"chat_id": ch.id})
    assert r.json()["ok"] and r.json()["result"]["members_count"] == 2
    r = client.post("/bot%s/getChatMember" % token,
                    json={"chat_id": ch.id, "user_id": u.id})
    assert r.json()["result"]["user"]["id"] == u.id
    # чужое сообщение бот закрепить не может
    r = client.post("/bot%s/pinChatMessage" % token,
                    json={"chat_id": ch.id, "message_id": msg.id})
    assert r.status_code == 403, r.status_code
    # своё — может
    r = client.post("/bot%s/pinChatMessage" % token,
                    json={"chat_id": ch.id, "message_id": 1})
    assert r.json()["ok"]
    print("10) getChat/getChatMember/pin (по правам) ok")

    # --- 11) социальные методы: пост, лайк, комментарий ---
    r = client.post("/bot%s/createPost" % token, json={"text": "Пост от бота"})
    post_id = r.json()["result"]["post_id"]
    assert post_id
    r = client.post("/bot%s/likePost" % token, json={"post_id": post_id})
    assert r.json()["result"]["liked"] is True
    r = client.post("/bot%s/likePost" % token, json={"post_id": post_id})  # toggle
    assert r.json()["result"]["liked"] is False
    r = client.post("/bot%s/commentPost" % token,
                    json={"post_id": post_id, "text": "Коммент от бота"})
    assert r.json()["result"]["comment_id"]
    r = client.post("/bot%s/getWall" % token)
    assert r.json()["result"][0]["post_id"] == post_id
    print("11) createPost/likePost/commentPost/getWall ok")

    # --- 12) rate limit (30 rps) ---
    codes = [client.post("/bot%s/getMe" % token).status_code for _ in range(40)]
    assert 429 in codes, codes[:5]
    print("12) rate limiting ok (получен 429)")

    # --- 13) owner endpoint: без валидного JWT → 401 ---
    r = client.post("/api/admin/bots/%d/api-token/reset" % bot.id,
                    headers={"Authorization": "Bearer faketoken"})
    assert r.status_code == 401, r.status_code
    print("13) owner endpoint auth ok (401 без JWT)")

    # --- 14) sendPoll / sendPhoto ---
    from bot_api import _rate_windows
    _rate_windows.clear()  # после теста rate limit
    r = client.post("/bot%s/sendPoll" % token,
                    json={"chat_id": ch.id, "question": "Как дела?",
                          "options": ["Отлично", "Норм"]})
    assert r.json()["ok"], r.text
    assert "📊" in r.json()["result"]["text"]
    r = client.post("/bot%s/sendPhoto" % token,
                    json={"chat_id": ch.id, "photo": "uploads/test.png", "caption": "Фото"})
    assert r.json()["ok"] and r.json()["result"]["photo"]
    print("14) sendPoll/sendPhoto ok")

    # --- 15) приватность: секретный чат не попадает в очередь бота ---
    sec = models.Chat(is_secret=True)
    s.add(sec); s.commit(); s.refresh(sec)
    s.add(models.ChatMember(chat_id=sec.id, user_id=u.id))
    s.add(models.ChatMember(chat_id=sec.id, user_id=botu.id))
    s.commit()
    before = s.exec(select(models.BotUpdate).where(
        models.BotUpdate.bot_id == bot.id)).all()
    smsg = models.Message(chat_id=sec.id, sender_id=u.id, text="секрет")
    s.add(smsg); s.commit()
    notify_bots_in_chat(s, sec.id, smsg, u)
    after = s.exec(select(models.BotUpdate).where(
        models.BotUpdate.bot_id == bot.id)).all()
    assert len(after) == len(before), "secret chat leaked to bot!"
    print("15) secret chat privacy ok")

    # --- 16) privacy mode: в группах бот видит только команды ---
    gmsg = models.Message(chat_id=ch.id, sender_id=u.id, text="обычное сообщение")
    s.add(gmsg); s.commit()
    notify_bots_in_chat(s, ch.id, gmsg, u)
    after2 = s.exec(select(models.BotUpdate).where(
        models.BotUpdate.bot_id == bot.id)).all()
    assert len(after2) == len(before), "privacy mode broken!"
    cmsg = models.Message(chat_id=ch.id, sender_id=u.id, text="/help")
    s.add(cmsg); s.commit()
    notify_bots_in_chat(s, ch.id, cmsg, u)
    after3 = s.exec(select(models.BotUpdate).where(
        models.BotUpdate.bot_id == bot.id)).all()
    assert len(after3) == len(before) + 1, "command not delivered!"
    print("16) group privacy mode ok (только команды)")

print("\n✅ BOT API SMOKE: все проверки пройдены")

