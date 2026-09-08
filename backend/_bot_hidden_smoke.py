"""Smoke: скрытая каста ботов — регистрация bot_ запрещена, honeypot-бан,
поиск не показывает ботов, профиль бота отдаёт is_bot."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_bot_hidden_test.db"
if os.path.exists("_bot_hidden_test.db"):
    os.remove("_bot_hidden_test.db")
import models
from database import init_db, engine
init_db()
from sqlmodel import Session, select
from fastapi.testclient import TestClient
import main
from main import create_token, hash_password

client = TestClient(main.app)

with Session(engine) as s:
    u = models.User(username="reg_user", display_name="R",
                    password_hash=hash_password("secret123"))
    other = models.User(username="reg_other", display_name="O",
                        password_hash=hash_password("secret123"))
    s.add(u); s.add(other); s.commit(); s.refresh(u); s.refresh(other)
    # бот-аккаунт (боты с bot_ / _bot)
    botu = models.User(username="helper_bot", display_name="HelperBot",
                       password_hash=hash_password("x"), is_bot=True)
    s.add(botu); s.commit(); s.refresh(botu)
    b = models.Bot(name="HelperBot", username="helper_bot", type="custom",
                   active=True, token="y", owner_id=u.id, user_id=botu.id, system=False)
    s.add(b); s.commit()
    # IP-логи: учётка other засветилась на нашем IP
    s.add(models.IPLog(user_id=other.id, ip_address="9.9.9.9", action="login"))
    BOT_USER_ID = botu.id  # фиксируем ДО выхода из сессии
    OTHER_ID = other.id

# 1) регистрация с bot_ / _bot запрещена
def reg(username):
    return client.post("/api/register", json={
        "username": username, "display_name": "Test", "password": "secret123",
        "confirm_password": "secret123"})

r = reg("bot_taken")
print("register bot_:", r.status_code, r.text[:80])
assert r.status_code == 400, r.status_code
r = reg("helper_bot")
print("register _bot:", r.status_code, r.text[:80])
assert r.status_code == 400, r.status_code
print("1) register запрещает bot_-префикс ok")

# 2) поиск не показывает ботов
r = client.get("/api/users?q=helper")
print("search users:", r.json()["users"])
assert all(not x.get("is_bot") for x in r.json()["users"]), "бот утёк в поиск"
print("2) search hides bots ok")

# 3) профиль бота отдаёт is_bot (через id)
r = client.get(f"/api/users/{BOT_USER_ID}")
print("profile bot:", r.status_code, r.json().get("is_bot"), r.json().get("username"))
assert r.json().get("is_bot") is True
print("3) bot profile is_bot ok")

# 4) HONEYPOT: успешный логин other (засветит IP), затем попытка входа в бота
#    → IP блокируется, other банится. Но сначала other должен залогиниться с нашего IP.
r = client.post("/api/login", json={"username": "reg_other", "password": "secret123"})
assert r.status_code == 200, r.text
print("4a) other login ok")

# изменим IP other'а в iplog на реальный тестовый (testclient)
with Session(engine) as s:
    s.add(models.IPLog(user_id=OTHER_ID, ip_address="testclient", action="login"))
    s.commit()

# теперь пробуем зайти в бота → honeypot
r = client.post("/api/login", json={"username": "helper_bot", "password": "whatever"})
print("4b) bot login attempt:", r.status_code)
assert r.status_code == 401, r.status_code

with Session(engine) as s:
    blocked = s.exec(select(models.IPBlock).select_from(models.IPBlock)).all()
    print("   ip blocks:", [(x.ip_address, (x.reason or "")[:30]) for x in blocked])
    assert any(x.ip_address == "testclient" for x in blocked), "IP не заблокирован"
    other2 = s.get(models.User, OTHER_ID)
    print("   other banned:", other2.is_banned)
    assert other2.is_banned is True, "аккаунт, светившийся с IP, не забанен"
print("4) honeypot: бан IP + всех аккаунтов с IP ok")

print("\nBOT HIDDEN SMOKE OK")