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

    1) Если строки вставлялись с явными id (сид, импорт, восстановление бэкапа),
       секвенция таблицы отстаёт от MAX(id) и INSERT падает с
       UniqueViolation: duplicate key value violates unique constraint "<table>_pkey".
    2) Если колонка id — обычный INTEGER PRIMARY KEY БЕЗ sequence (таблицы могли
       родиться старым кодом/через create_all минуя Alembic — как было с
       channel_post_reaction/ban/saved_post), то INSERT вообще не передаёт id и
       падает с NotNullViolation. Здесь мы промотируем такую колонку в
       автоинкремент (создаём sequence + default nextval), как это делает
       миграция 0015_channel_id_fix.

    Всё идемпотентно и безопасно: колонку с уже существующим nextval/identity
    не трогаем. Вызывается при старте приложения (main.py startup), поэтому
    чинит прод даже если alembic-миграции не были применены.
    """
    if DATABASE_URL.startswith("sqlite"):
        return
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            # 1) Синхронизируем существующие секвенции с реальным MAX(id)
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

            # 2) Промоушен id в автоинкремент, если default отсутствует.
            #    Выбираем только PRIMARY KEY колонки 'id' без nextval/identity
            #    типов integer/bigint — их превращаем в sequence-владельцев.
            promote = conn.execute(text(
                """
                SELECT c.table_name, c.column_name, c.data_type, c.column_default
                FROM information_schema.columns c
                WHERE c.table_schema = 'public'
                  AND c.column_name = 'id'
                  AND c.column_default IS NULL
                  AND c.is_identity = 'NO'
                  AND c.data_type IN ('integer', 'bigint')
                  AND EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                    WHERE tc.table_schema = 'public'
                      AND tc.table_name = c.table_name
                      AND tc.constraint_type = 'PRIMARY KEY'
                      AND kcu.column_name = c.column_name
                  )
                """
            )).fetchall()
            for table_name, _col, _dtype, _default in promote:
                seq = f"{table_name}_id_seq"
                has_seq = conn.execute(text(
                    "SELECT count(*) FROM pg_class WHERE relkind='S' AND relname=:s"
                ), {"s": seq}).scalar()
                if not has_seq:
                    conn.execute(text(
                        f"CREATE SEQUENCE {seq} OWNED BY \"{table_name}\".id"
                    ))
                    conn.execute(text(
                        f"SELECT setval('{seq}', COALESCE((SELECT MAX(id) FROM \"{table_name}\"), 0) + 1, false)"
                    ))
                conn.execute(text(
                    f"ALTER TABLE \"{table_name}\" ALTER COLUMN id SET DEFAULT nextval('{seq}')"
                ))
    except Exception as e:
        # Не валим старт приложения из-за самодиагностики — просто логируем.
        print(f"⚠️ fix_postgres_sequences не удался: {e}")

def _ensure_columns() -> None:
    """🛡️ Идемпотентное добавление колонок, которых нет в старых БД
    (create_all не делает ALTER для существующих таблиц)."""
    from sqlalchemy import text, inspect
    try:
        insp = inspect(engine)
        with engine.begin() as conn:
            existing = {t: {c["name"] for c in insp.get_columns(t)} for t in insp.get_table_names()}
            stmts = [
                ("rolecategory", "panel_tabs", "VARCHAR DEFAULT '[]'"),
                ("user", "is_bot", "BOOLEAN DEFAULT 0"),
                # 🪐 Приватность пользовательских стикерпаков
                ("stickerpack", "is_public", "BOOLEAN DEFAULT 1"),
                # 🤖 Bot API: внешний токен (bcrypt-хэш) + webhook бота
                ("bot", "api_token_hash", "VARCHAR(255)"),
                ("bot", "webhook_url", "VARCHAR(512)"),
                ("bot", "webhook_secret", "VARCHAR(128)"),
                # 💳 Варианты срока покупки роли (JSON: [{days, price, label}])
                ("paymentrole", "duration_options", "TEXT"),
            ]
            for table, col, ddl in stmts:
                if table not in existing or col in existing[table]:
                    continue
                if DATABASE_URL.startswith("sqlite"):
                    conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {col} {ddl}'))
                else:
                    conn.execute(text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS {col} {ddl}'))
                print(f"[ensure_columns] added column {table}.{col}")
    except Exception as e:
        print(f"⚠️ ensure_columns не удался: {e}")


def _self_heal_work_schema():
    """🛡 Само-починка схемы подсистемы «Рабочие чаты / Боты».
    На проде (PostgreSQL) остались legacy-колонки с NOT NULL без default
    (work_chat.assigned_section, work_chat_member.work_chat_id и т.п.),
    которых нет в SQLModel-модели. INSERT их не передаёт → NotNullViolation.
    Снимаем NOT NULL с таких колонок (не трогая PRIMARY KEY и колонки с default)."""
    if DATABASE_URL.startswith("sqlite"):
        return
    from sqlalchemy import text
    try:
        with engine.begin() as conn:
            for t in ("work_chat", "work_chat_member", "work_ticket",
                      "work_section_config", "work_promotion_log", "work_stat_daily",
                      "bot", "bot_log", "bot_command", "bot_trigger"):
                rows = conn.execute(text(
                    "SELECT column_name, column_default FROM information_schema.columns "
                    "WHERE table_name=:t AND table_schema='public'"
                ), {"t": t}).fetchall()
                for col, dflt in rows:
                    if dflt or col == "id":
                        continue
                    nonnull = conn.execute(text(
                        "SELECT is_nullable FROM information_schema.columns "
                        "WHERE table_name=:t AND column_name=:c AND table_schema='public'"
                    ), {"t": t, "c": col}).scalar()
                    if nonnull == "NO":
                        conn.execute(text(
                            'ALTER TABLE "{t}" ALTER COLUMN "{c}" DROP NOT NULL'.format(t=t, c=col)))
                        print(f"[work_schema_heal] {t}.{col} DROP NOT NULL")
    except Exception as e:
        print("work_schema_heal err:", e)


def init_db():
    SQLModel.metadata.create_all(engine)
    _ensure_columns()
    _fix_postgres_sequences()
    _self_heal_work_schema()

def get_session():
    with Session(engine) as session:
        yield session
