"""Проверка self-heal: колонка user.is_bot добавляется в старую БД."""
import os, sqlite3
os.environ["DATABASE_URL"] = "sqlite:///./_selfheal_test.db"
DB = "_selfheal_test.db"
if os.path.exists(DB):
    os.remove(DB)

# 1) Полная схема (как create_all), затем эмулируем "старую" БД: DROP is_bot/panel_tabs
import models
from database import init_db, engine
from sqlmodel import SQLModel
SQLModel.metadata.create_all(engine)

conn = sqlite3.connect(DB)
conn.execute('ALTER TABLE "user" DROP COLUMN is_bot')
conn.execute("ALTER TABLE rolecategory DROP COLUMN panel_tabs")
conn.commit(); conn.close()
print("1) старая БД: колонки is_bot/panel_tabs удалены")

# 2) init_db должен добавить колонки обратно
init_db()

conn = sqlite3.connect(DB)
cols_user = {r[1] for r in conn.execute('PRAGMA table_info("user")')}
cols_cat = {r[1] for r in conn.execute("PRAGMA table_info(rolecategory)")}
conn.close()
print("2) user cols has is_bot:", "is_bot" in cols_user)
print("   rolecategory cols has panel_tabs:", "panel_tabs" in cols_cat)
assert "is_bot" in cols_user, "user.is_bot не добавлен!"
assert "panel_tabs" in cols_cat, "rolecategory.panel_tabs не добавлен!"

# 3) модель работает: SELECT с is_bot не падает
from models import User
from sqlmodel import Session, select
with Session(engine) as s:
    u = User(username="u1", display_name="U1", password_hash="x", is_bot=False)
    s.add(u); s.commit(); s.refresh(u)
    got = s.exec(select(User).where(User.username == "u1")).first()
    assert got.is_bot is False
print("3) SELECT/INSERT с is_bot работает")

# 4) бота-аккаунта больше нет — системная диспетчеризация без бота
import main
with Session(engine) as s:
    cat = __import__("models").RoleCategory(name="T")
    s.add(cat); s.commit(); s.refresh(cat)
    main.ensure_team_chat_for_category(cat.id, s)
    assert not hasattr(main, "get_or_create_bot"), "get_or_create_bot должен быть удалён"
    assert not hasattr(main, "ensure_bot_in_team_chats"), "ensure_bot_in_team_chats должен быть удалён"
print("4) бот-аккаунт отсутствует — системная диспетчеризация")

print("\nSELF-HEAL CHECK PASSED")