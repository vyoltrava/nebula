"""Smoke: пользовательские стикерпаки — приватность, каталог, модерация."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_stickers_test.db"
if os.path.exists("_stickers_test.db"):
    os.remove("_stickers_test.db")
import models
from database import init_db, engine
init_db()
from sqlmodel import Session, select
from fastapi.testclient import TestClient
import main
from main import create_token, hash_password

client = TestClient(main.app)

with Session(engine) as s:
    u = models.User(username="pack_user", display_name="U",
                    password_hash=hash_password("secret123"))
    admin = models.User(username="pack_admin", display_name="A",
                        password_hash=hash_password("secret123"), is_admin=True)
    other = models.User(username="pack_other", display_name="O",
                        password_hash=hash_password("secret123"))
    s.add(u); s.add(admin); s.add(other)
    s.commit(); s.refresh(u); s.refresh(admin); s.refresh(other)

    # --- 1) создаём паки от пользователя ---
    r = client.post("/api/sticker-packs",
                    headers={"Authorization": "Bearer " + create_token(u.id)},
                    json={"name": "Публичный", "emojis": ["😀"], "is_public": True})
    assert r.status_code == 200, r.text
    pub = r.json()
    assert pub["is_public"] is True
    r = client.post("/api/sticker-packs",
                    headers={"Authorization": "Bearer " + create_token(u.id)},
                    json={"name": "Секретный", "emojis": ["🙈"], "is_public": False})
    assert r.status_code == 200, r.text
    priv = r.json()
    assert priv["is_public"] is False
    print("1) create public+private ok")

    # --- 2) каталог для чужого юзера: только публичные ---
    tok_other = {"Authorization": "Bearer " + create_token(other.id)}
    r = client.get("/api/sticker-packs/public", headers=tok_other)
    ids = [p["id"] for p in r.json()]
    assert pub["id"] in ids and priv["id"] not in ids
    print("2) public catalog hides private ok")

    # --- 3) каталог для админа: видит и приватный ---
    tok_admin = {"Authorization": "Bearer " + create_token(admin.id)}
    r = client.get("/api/sticker-packs/public", headers=tok_admin)
    ids = [p["id"] for p in r.json()]
    assert pub["id"] in ids and priv["id"] in ids
    print("3) admin sees private packs ok")

    # --- 4) глобальный пикер: приватный пак скрыт от чужих ---
    r = client.get("/api/sticker-packs", headers=tok_other)
    gids = [p["id"] for p in r.json()]
    assert pub["id"] in gids and priv["id"] not in gids
    r = client.get("/api/sticker-packs", headers={"Authorization": "Bearer " + create_token(u.id)})
    gids = [p["id"] for p in r.json()]
    assert priv["id"] in gids  # владелец видит свой
    print("4) global picker privacy ok")

    # --- 5) переключение видимости владельцем ---
    r = client.post("/api/sticker-packs/%d/visibility" % priv["id"],
                    headers=tok_other, json={"is_public": True})
    assert r.status_code == 403
    r = client.post("/api/sticker-packs/%d/visibility" % priv["id"],
                    headers={"Authorization": "Bearer " + create_token(u.id)},
                    json={"is_public": True})
    assert r.json()["is_public"] is True
    r = client.get("/api/sticker-packs/public", headers=tok_other)
    assert priv["id"] in [p["id"] for p in r.json()]  # теперь виден
    print("5) visibility toggle ok (чужой - 403, свой - ок)")

    # --- 6) админ-список пользовательских паков ---
    r = client.get("/api/admin/user-packs", headers=tok_admin)
    items = r.json()
    assert any(x["id"] == priv["id"] for x in items)
    assert any(x["id"] == pub["id"] for x in items)
    it = [x for x in items if x["id"] == pub["id"]][0]
    assert it["owner_username"] == "pack_user" and it["stickers_count"] >= 1
    print("6) admin user-packs list ok")

    # --- 7) бан пака + бан юзера ---
    r = client.post("/api/admin/user-packs/%d/ban" % pub["id"],
                    headers=tok_admin, json={"ban": True, "ban_user": False})
    assert r.json()["banned"] is True
    r = client.get("/api/sticker-packs/public", headers=tok_other)
    assert pub["id"] not in [p["id"] for p in r.json()]  # забанен скрыт
    r = client.post("/api/admin/user-packs/%d/ban" % pub["id"],
                    headers=tok_admin, json={"ban": False, "ban_user": False})
    assert r.json()["banned"] is False
    print("7) ban/unban pack ok")

    # --- 8) админ-список без прав -> 403 ---
    r = client.get("/api/admin/user-packs", headers=tok_other)
    assert r.status_code == 403
    print("8) admin list 403 for non-admin ok")

print("\nSTICKERS SMOKE: all checks passed")

