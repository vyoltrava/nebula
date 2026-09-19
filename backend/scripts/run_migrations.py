"""Запуск миграций Alembic при деплое (Render / Docker / CI).

Использование:
    python scripts/run_migrations.py
или добавить в build/start-команду деплоя ПЕРЕД стартом uvicorn.

🛡️ ПО УМОЛЧАНИЮ — мягкий режим: если миграции не применились, печатаем
предупреждение и выходим с 0, чтобы деплой НЕ прерывался и сервис поднялся
(схему добивают init_db()/create_all при импорте main.py и startup self-heal).
Причина: `&&` в старт-команде при ненулевом returncode не даёт uvicorn'у
стартовать → Render не видит порт → «Port scan timeout reached».
Строгий режим (падать при ошибке): MIGRATIONS_STRICT=1.
"""
import os
import subprocess
import sys
from pathlib import Path

# 🛡️ UTF-8 stdout/stderr: в консоли без UTF-8 (Render shell с LANG=C,
# Windows cp1251) print("✅ …") роняет скрипт с UnicodeEncodeError →
# `&&` не пускает uvicorn → «Port scan timeout». Явно включаем UTF-8.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BACKEND_DIR = Path(__file__).resolve().parents[1]


def main() -> int:
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")

    # 🛡️ Render/Heroku иногда отдают DSN как postgres:// — SQLAlchemy+psycopg2
    # понимает только postgresql://. Конвертируем для подпроцесса alembic.
    url = env.get("DATABASE_URL", "")
    if url.startswith("postgres://"):
        env["DATABASE_URL"] = url.replace("postgres://", "postgresql://", 1)
        print("ℹ️ DATABASE_URL: postgres:// → postgresql://")

    # 🅿️ Prisma Postgres (и подобные пулеры): миграции должны идти через
    # DIRECT_URL (db.prisma.io) — pooled-хост не сохраняет session state и
    # рвёт долгие запросы → lock/prepared-statement ошибки в Alembic.
    if env.get("DIRECT_URL"):
        durl = env["DIRECT_URL"]
        if durl.startswith("postgres://"):
            durl = durl.replace("postgres://", "postgresql://", 1)
        env["DATABASE_URL"] = durl
        print("ℹ️ Миграции: используется DIRECT_URL (bypass пулера — для Alembic это обязательно)")

    # 🦆 Импорт database.py запускает failover-пробник. Если Postgres мёртв и
    # включился SQLite-fallback — миграции Alembic НЕ ЗАПУСКАЕМ вовсе:
    # они написаны на Postgres-SQL (SERIAL/TIMESTAMPTZ/DO $$) и на SQLite
    # только шумят синтаксическими ошибками. Схему соберёт init_db()/create_all.
    sys.path.insert(0, str(BACKEND_DIR))
    import database  # noqa: E402 — side-effect: failover-детект
    if database.USING_SQLITE_FALLBACK:
        print("🦆 [db-failover] Активен SQLite-fallback — миграции Alembic пропущены, "
              "схему соберёт init_db()/create_all. После восстановления Postgres "
              "перезапусти сервис — миграции применятся обычным путём.")
        return 0

    # 🚫 MIGRATIONS_SKIP=1 — пропустить Alembic полностью. Для свежей БД это
    # норм: схему целиком соберёт init_db()/create_all при старте приложения.
    if os.getenv("MIGRATIONS_SKIP", "").strip() in ("1", "true", "yes"):
        print("ℹ️ MIGRATIONS_SKIP=1 — миграции Alembic пропущены по настройке.")
        return 0

    strict = os.getenv("MIGRATIONS_STRICT", "") == "1"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
    )
    if result.returncode != 0:
        if strict:
            print("❌ Миграции не применились — деплой прерван (MIGRATIONS_STRICT=1)", file=sys.stderr)
            return result.returncode
        print("⚠️ Миграции не применились — продолжаем запуск сервиса "
              "(схему добьют init_db()/create_all и startup self-heal). "
              "Установите MIGRATIONS_STRICT=1, если нужен строгий режим.")
        return 0
    print("✅ Миграции применены (alembic upgrade head)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
