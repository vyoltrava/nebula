# 🚀 Миграции при деплое (Alembic)

Runtime DDL удалён из `main.py`. Схема БД создаётся/обновляется **только** через Alembic:

```bash
alembic upgrade head          # применить все миграции
alembic current               # текущая версия схемы
alembic revision --autogenerate -m "..."   # новая миграция по изменениям в models.py
```

## Render / Docker — применять ПЕРЕД стартом uvicorn

```yaml
buildCommand: |
  pip install -r requirements.txt
startCommand: |
  python scripts/run_migrations.py && uvicorn main:app --host 0.0.0.0 --port $PORT
```

или в Dockerfile:

```dockerfile
CMD ["sh", "-c", "python scripts/run_migrations.py && uvicorn main:app --host 0.0.0.0 --port $PORT"]
```

> ⚠️ **НЕ хардкодьте порт!** Render инжектит переменную `PORT` и сканирует
> именно её. Команда с фиксированным `--port 8000` вызывает ошибку деплоя
> «Port scan timeout reached, no open ports detected».

`scripts/run_migrations.py` выполняет `alembic upgrade head` (URL берётся из `DATABASE_URL` в `.env`).

Приложение при старте только проверяет соединение с БД (`SELECT 1`) и НЕ создаёт таблицы.

Существующая (уже созданная старым кодом) БД безопасно накатывается миграцией
`0001_bootstrap`: все её инструкции идемпотентны (`IF NOT EXISTS`), повторный запуск ничего не ломает.
