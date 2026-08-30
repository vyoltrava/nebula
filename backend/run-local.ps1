Set-Location $PSScriptRoot
$env:PYTHONUTF8 = '1'  # 🛡️ эмодзи-print'ы бэкенда ломаются на cp1251-консоли Windows
if (-not (Test-Path ".\venv")) {
  python -m venv venv
}
& .\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
# Схема БД — только через Alembic (runtime DDL удалён из main.py)
python scripts/run_migrations.py
uvicorn main:app --reload --host 127.0.0.1 --port 8000
