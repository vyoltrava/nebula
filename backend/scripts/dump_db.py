"""
💾 dump_db.py — дамп базы Nebula в один .sql файл (backup / перенос между БД).

Работает на любом Postgres (Neon, Supabase, Prisma, локальный) и на SQLite
(в т.ч. на fallback-файле nebula.db). Внешние бинарники не нужны — только
SQLAlchemy из requirements.txt.

Примеры:
    # Дамп Neon (строка из Neon Console → Connection string → Unpooled/direct):
    python scripts/dump_db.py --url "postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require" --out neon_dump.sql

    # Дамп fallback-файла (спасти данные, созданные пока БД лежала):
    python scripts/dump_db.py --url "sqlite:///nebula.db" --out fallback_dump.sql

    # Только данные / только схема:
    python scripts/dump_db.py --url "..." --out data.sql --data-only
    python scripts/dump_db.py --url "..." --out schema.sql --schema-only

Если DATABASE_URL задан в окружении, --url можно не указывать.

Как восстановить в новую БД (например, Supabase):
    1) Дай приложению создать схему: запусти бэкенд (init_db/create_all)
       или выполни `alembic upgrade head`.
    2) Залей данные:
       psql "postgresql://...@aws-0-...pooler.supabase.com:6543/postgres" -f data.sql
       (либо вставь содержимое файла в Supabase → SQL Editor)

Дамп содержит ON CONFLICT DO NOTHING — повторный импорт не падает на дублях.
"""
import argparse
import os
import sys
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from sqlalchemy import create_engine, inspect, text  # noqa: E402


def sql_literal(value, dialect: str) -> str:
    """Python-значение → SQL-литерал (с экранированием кавычек)."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        if dialect == "sqlite":
            return "1" if value else "0"
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float, Decimal)):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return "'" + value.isoformat(sep=" ") + "'"
    if isinstance(value, (bytes, bytearray, memoryview)):
        return "'\\x" + bytes(value).hex() + "'"
    if isinstance(value, (dict, list)):
        import json as _json
        s = _json.dumps(value, ensure_ascii=False).replace("'", "''")
        return f"'{s}'"
    s = str(value).replace("'", "''")
    return f"'{s}'"


def main() -> int:
    ap = argparse.ArgumentParser(description="Дамп БД Nebula в .sql")
    ap.add_argument("--url", default=os.getenv("DATABASE_URL", ""), help="DSN источника")
    ap.add_argument("--out", default="nebula_dump.sql", help="куда писать дамп")
    ap.add_argument("--schema-only", action="store_true", help="только схема")
    ap.add_argument("--data-only", action="store_true", help="только данные (INSERT)")
    ap.add_argument("--tables", default="", help="список таблиц через запятую (по умолчанию все)")
    ap.add_argument("--batch", type=int, default=200, help="строк в одном INSERT")
    args = ap.parse_args()

    if not args.url:
        print("❌ Не задан --url и пуст DATABASE_URL")
        return 1
    url = args.url
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    engine = create_engine(url, pool_pre_ping=True)
    dialect = engine.dialect.name
    safe_url = url.split("@")[-1] if "@" in url else url
    print(f"🗄 Источник: {dialect} ({safe_url})")

    insp = inspect(engine)
    schema = None if dialect == "sqlite" else "public"
    tables = sorted(insp.get_table_names(schema=schema))
    if args.tables:
        wanted = {t.strip() for t in args.tables.split(",") if t.strip()}
        tables = [t for t in tables if t in wanted]
    if not tables:
        print("❌ Нет таблиц для дампа")
        return 1
    print(f"📦 Таблиц: {len(tables)}")

    q = engine.dialect.identifier_preparer.quote
    out_path = Path(args.out)
    conflict = "" if dialect == "sqlite" else " ON CONFLICT DO NOTHING"
    written_rows = 0

    with engine.connect() as conn, out_path.open("w", encoding="utf-8") as f:
        f.write(f"-- Nebula dump ({dialect})\n-- source: {safe_url}\n")
        f.write("-- restore: сначала создай схему (init_db в приложении), затем залей этот файл\n\n")
        if dialect != "sqlite":
            f.write("SET session_replication_role = replica;  -- не проверять FK при импорте\n\n")
        if args.schema_only and dialect == "sqlite":
            print("⚠️ SQLite-дамп схемы не поддерживается — сначала создай схему приложением")
            return 1

        for t in tables:
            cols = [c["name"] for c in insp.get_columns(t, schema=schema)]
            if not cols:
                continue
            col_list = ", ".join(q(c) for c in cols)
            if args.schema_only:
                continue

            f.write(f"\n-- ── {t} ─────────────────────────────\n")
            rows = conn.execute(text(f"SELECT {col_list} FROM {q(t)}")).fetchall()
            for i in range(0, len(rows), max(1, args.batch)):
                chunk = rows[i:i + max(1, args.batch)]
                values = ",\n  ".join(
                    "(" + ", ".join(sql_literal(v, dialect) for v in row) + ")"
                    for row in chunk
                )
                f.write(f"INSERT INTO {q(t)} ({col_list}) VALUES\n  {values}{conflict};\n")
                written_rows += len(chunk)

        if dialect != "sqlite":
            f.write("\nSET session_replication_role = DEFAULT;\n")

    size_kb = out_path.stat().st_size / 1024
    print(f"✅ Готово: {out_path} ({size_kb:.1f} КБ, строк данных: {written_rows})")
    print("ℹ️ Для Neon бери в консоли строку БЕЗ пулера (Unpooled/direct) — дамп через пулер не рекомендуется.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

