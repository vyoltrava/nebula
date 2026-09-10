"""Проверка: /api/admin/user-packs возвращает паки (админ-вкладка)."""
import os
os.environ["DATABASE_URL"] = "sqlite:///./_admpacks_test.db"
if os.path.exists("_admpacks_test.db"):
    os.remove("_admpacks_test.db")
import models
from database import init_db, engine
init_db()
import main  # noqa: E402
from sqlmodel import Session, select  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from main import create_token, hash_password  # noqa: E402

client = TestClient(main.app)

with Session(engine) as s:
    admin = models.User(username="adm", display_name="A", password_hash=hash_password("x"), is_admin=True)
    u = models.User(username="u1", display_name="U", password_hash=hash_password("x"))
    s.add(admin); s.add(u); s.commit(); s.refresh(admin); s.refresh(u)
    a_tok = {"Authorization": "Bearer " + create_token(admin.id)}
    u_tok = {"Authorization": "Bearer " + create_token(u.id)}
    # создаём паки юзером
    for i, name in enumerate(["ПакA", "ПакB"]):
        r = client.post("/api/sticker-packs", headers=u_tok,
                        json={"name": name, "emojis": ["😀"], "is_public": True})
        print("create", name, r.status_code)

    r = client.get("/api/admin/user-packs", headers=a_tok)
    print("ADMIN LIST status:", r.status_code)
    print("ADMIN LIST body:", r.text[:300])
    assert r.status_code == 200, r.text
    items = r.json()
    print("count:", len(items))
    for it in items:
        print("  pack:", it)

    # также проверим не-админ → 403
    r2 = client.get("/api/admin/user-packs", headers=u_tok)
    print("NON-ADMIN status:", r2.status_code)
print("DONE")