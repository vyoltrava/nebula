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

def init_db():
    SQLModel.metadata.create_all(engine)
    _fix_postgres_sequences()

def get_session():
    with Session(engine) as session:
        yield session
