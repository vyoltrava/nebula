from pathlib import Path
from dotenv import load_dotenv

_backend_dir = Path(__file__).resolve().parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env.local")

import os
import sys
from sqlmodel import SQLModel, create_engine, Session

# 🛡️ Консоль без UTF-8 (Windows cp1251 и т.п.) не должна ронять импорт
# из-за эмодзи/юникода в баннерах: просто заменяем непечатаемое.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///nebula.db")

# 🛡️ Render/Heroku иногда отдают DSN как postgres:// — SQLAlchemy+psycopg2
# понимает только postgresql://. Без конверсии create_engine падает на импорте
# → uvicorn не стартует → Render: «Port scan timeout reached, no open ports».
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    print("ℹ️ DATABASE_URL: postgres:// → postgresql://")

# 🔒 Для внешних (serverless) Postgres TLS обязателен; psycopg2 по умолчанию
# sslmode=prefer, что иногда заканчивается «SSL connection has been closed
# unexpectedly». Явный require — если юзер не задал свой sslmode в URL.
# ВАЖНО: делаем это ДО failover-пробника, иначе пробник может забраковать
# живую БД, которая требует TLS.
_host = (DATABASE_URL.split("@", 1)[-1].split("/", 1)[0].split(":", 1)[0] or "").lower()
if not DATABASE_URL.startswith("sqlite") and _host not in ("localhost", "127.0.0.1", "::1", "") and "sslmode=" not in DATABASE_URL:
    sep = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{sep}sslmode=require"
    print("ℹ️ DATABASE_URL: добавлен sslmode=require (внешний Postgres)")

PREFERRED_DATABASE_URL = DATABASE_URL   # «родной» URL (например, Neon Postgres)
USING_SQLITE_FALLBACK = False           # True → работаем на файловой БД

# 🦆 АВАРИЙНЫЙ ПЕРЕКЛЮЧАТЕЛЬ (fallback):
# Если Postgres (Neon) недоступен при старте — исчерпаны лимиты compute-часов,
# БД suspended/quota exceeded, сеть лежит — соцсеть всё равно должна работать.
# Тогда переключаемся на локальный SQLite-файл. Файл берём постоянный
# (nebula.db), чтобы данные накапливались между аварийными запусками, а не
# терялись при каждом рестарте. Вернуть Postgres обратно можно просто
# перезапустив сервис, когда Neon снова доступен.
FALLBACK_DB_URL = os.getenv("NEBULA_FALLBACK_DB", "sqlite:///nebula.db")
FALLBACK_DISABLED = os.getenv("NEBULA_FALLBACK_DISABLE", "").strip() in ("1", "true", "yes")


def _pg_alive(url: str, attempts: int = 3, delay: float = 3.0) -> bool:
    """Может ли приложение прямо сейчас подключиться к Postgres?

    Пытаемся несколько раз с короткой паузой: у Neon/Prisma «холодный старт»
    приостановленного compute — норма, но нельзя долго ждать: Render прибивает
    сервис, если порт не открыт за ~100 секунд (Port scan timeout).
    Пробник: timeout 3 сек, 2 попытки с паузой 1 сек ≈ максимум ~8 сек,
    чтобы суммарный startup всегда укладывался в Port scan timeout Render.
    """
    from sqlalchemy import create_engine as _create_probe, text as _text
    for attempt in range(1, attempts + 1):
        probe = None
        try:
            probe = _create_probe(
                url,
                connect_args={
                    "connect_timeout": 3,
                    "application_name": "nebula-probe",
                    "options": "-c statement_timeout=5000",
                },
            )
            with probe.connect() as conn:
                conn.execute(_text("SELECT 1"))
            return True
        except Exception as e:
            kind = type(e).__name__
            print(f"[db-failover] попытка {attempt}/{attempts}: Postgres недоступен ({kind}): {e}")
            if attempt < attempts:
                import time
                time.sleep(delay)
        finally:
            if probe is not None:
                try:
                    probe.dispose()
                except Exception:
                    pass
    return False


if (
    not DATABASE_URL.startswith("sqlite")
    and not FALLBACK_DISABLED
    and not _pg_alive(DATABASE_URL)
):
    USING_SQLITE_FALLBACK = True
    DATABASE_URL = FALLBACK_DB_URL
    print("=" * 70)
    print("🦆 [db-failover] POSTGRES/NEON НЕДОСТУПЕН — переключаюсь на файловую БД:")
    print(f"🦆 [db-failover] рабочая БД: {FALLBACK_DB_URL}")
    print("🦆 [db-failover] соцсеть продолжает работать на SQLite (fallback-режим).")
    print("🦆 [db-failover] Когда Neon снова доступен — перезапусти сервис, вернёмся на Postgres.")
    print("=" * 70)

connect_args = {}
engine_kwargs: dict = {
    "echo": False,
    "connect_args": connect_args,
}

if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    # 🛡️ psycopg2 по умолчанию ждёт соединение ВЕЧНО (connect_timeout=0).
    # Если Postgres недостижим (SSL/firewall/внешний хост), startup висит
    # навсегда → uvicorn не биндит порт → Render: «No open ports detected».
    connect_args.update({
        "connect_timeout": 10,          # сек на установку TCP+auth
        "application_name": "nebula-api",
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
        # 🛡️ Запрос не имеет права висеть вечно: serverless-БД (Neon/Prisma/
        # Supabase) при холодном старте могут «подвешивать» соединение, из-за
        # чего startup не успевает открыть порт до Port scan timeout Render.
        "options": "-c statement_timeout=20000",
    })
    # 🅿️ Prisma Postgres pooled-хост имеет лимит соединений по тарифу —
    # большой пул (20+40, как для Neon) даёт «Too many connections».
    if "pooled.db.prisma.io" in DATABASE_URL:
        engine_kwargs.update({
            "pool_pre_ping": True,
            "pool_size": 5,
            "max_overflow": 10,
            "pool_recycle": 1800,
            "pool_timeout": 10,
        })
        print("ℹ️ Prisma pooled-хост: пул соединений уменьшен до 5+10 (лимит тарифа)")
    else:
        engine_kwargs.update({
            "pool_pre_ping": True,
            "pool_size": 20,
            "max_overflow": 40,
            "pool_recycle": 1800,
            "pool_timeout": 10,
        })

engine = create_engine(DATABASE_URL, **engine_kwargs)

# 🗄 SQLite-специфика: WAL-журнал (читатели не блокируют писателя и наоборот —
# критично для веб-приложения), таймаут ожидания блокировки и внешние ключи.
if DATABASE_URL.startswith("sqlite"):
    from sqlalchemy import event as _sa_event

    @_sa_event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()

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
                # 🛡️ Бан-система: причина и срок бана (авто-разбан)
                ("user", "ban_reason", "VARCHAR"),
                ("user", "ban_until", "TIMESTAMP"),
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
    """🛡 Неубиваемая инициализация БД: ни одна ошибка не должна помешать
    старту сервиса и открытию порта (иначе Render: «Port scan timeout»).
    Если БД недоступна — приложение всё равно поднимется: таблицы добьются
    при следующем деплое/рестарте, а failover при старте уже решил,
    на какой БД работаем."""
    try:
        SQLModel.metadata.create_all(engine)
    except Exception as e:
        print(f"⚠️ init_db: create_all не удался ({type(e).__name__}: {e}) — продолжаем запуск")
    for _healer in (_ensure_columns, _fix_postgres_sequences, _self_heal_work_schema):
        try:
            _healer()
        except Exception as e:
            print(f"⚠️ init_db: {_healer.__name__} не удался ({type(e).__name__}: {e}) — продолжаем запуск")

def get_session():
    with Session(engine) as session:
        yield session
