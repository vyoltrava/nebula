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
