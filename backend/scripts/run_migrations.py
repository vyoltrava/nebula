"""Запуск миграций Alembic при деплое (Render / Docker / CI).

Использование:
    python scripts/run_migrations.py
или добавить в build/start-команду деплоя ПЕРЕД стартом uvicorn.
"""
import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def main() -> int:
    env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1")
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
    )
    if result.returncode != 0:
        print("❌ Миграции не применились — деплой прерван", file=sys.stderr)
    else:
        print("✅ Миграции применены (alembic upgrade head)")
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
