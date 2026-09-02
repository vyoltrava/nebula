from pathlib import Path
from dotenv import load_dotenv

_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env.local")

import os
from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///nebula.db")

connect_args = {}
engine_kwargs: dict = {
    "echo": False,
    "connect_args": connect_args,
}

if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_size": 20,
        "max_overflow": 40,
        "pool_recycle": 1800,
        "pool_timeout": 10,
    })

engine = create_engine(DATABASE_URL, **engine_kwargs)

def _fix_postgres_sequences() -> None:
    """
    🛡️ Самолечение автоинкрементов PostgreSQL.

    Если строки вставлялись с явными id (сид, импорт, восстановление бэкапа),
    секвенция таблицы отстаёт от MAX(id) и INSERT падает с
    UniqueViolation: duplicate key value violates unique constraint "<table>_pkey".
    Синхронизируем каждую секвенцию с реальным MAX(id). Идемпотентно и безопасно.
    """
    if DATABASE_URL.startswith("sqlite"):
        return
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            rows = conn.execute(text(
                """
                SELECT table_name, pg_get_serial_sequence('"' || table_name || '"', column_name) AS seq
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND column_name = 'id'
                  AND column_default LIKE 'nextval%'
                """
            )).fetchall()
            for table_name, seq in rows:
                if not seq:
                    continue
                conn.execute(text(
                    f'SELECT setval(\'{seq}\', COALESCE((SELECT MAX(id) FROM "{table_name}"), 1))'
                ))
    except Exception as e:
        # Не валим старт приложения из-за самодиагностики — просто логируем.
        print(f"⚠️ fix_postgres_sequences не удался: {e}")

def init_db():
    SQLModel.metadata.create_all(engine)
    _fix_postgres_sequences()

def get_session():
    with Session(engine) as session:
        yield session
