"""chat_type: dm | group | channel + бэкфорс старых групп в каналы.

На проде (Postgres) self-heal пропустил ADD COLUMN chat_type из-за аборта
транзакции (DuplicateColumn раньше по циклу) — колонки не было и все
SELECT chat падали с UndefinedColumn. Здесь колонка добавляется идемпотентно
и выполняется бэкфорс: старые is_group-чаты → канал (chat_type='channel',
who_can_post='admins').

Revision ID: 0008_chat_type
Revises: 0007_admin_backup_feed
Create Date: 2026-09-02
"""
from alembic import op
from sqlalchemy import text

revision = "0008_chat_type"
down_revision = "0007_admin_backup_feed"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 1. Колонка chat_type (идемпотентно)
    try:
        conn.execute(text("ALTER TABLE chat ADD COLUMN chat_type VARCHAR DEFAULT 'dm'"))
    except Exception as e:
        conn.rollback()  # Postgres: сброс абортнутой транзакции
        print(f"⚠️ [0008] skip add chat_type: {type(e).__name__}: {str(e)[:120]}")

    # 2. Бэкфорс: старые групповые чаты с лентой → каналы; пишут только админы.
    #    is_group без сравнения с 1 — работает и на SQLite (0/1), и на Postgres (BOOL).
    try:
        conn.execute(text(
            "UPDATE chat SET chat_type = 'channel' "
            "WHERE is_group AND (chat_type IS NULL OR chat_type = '' OR chat_type = 'dm')"
        ))
        conn.execute(text(
            "UPDATE chat SET who_can_post = 'admins' "
            "WHERE chat_type = 'channel' AND (who_can_post IS NULL OR who_can_post = '')"
        ))
    except Exception as e:
        conn.rollback()
        print(f"⚠️ [0008] skip backfill: {type(e).__name__}: {str(e)[:120]}")

    conn.commit()


def downgrade():
    conn = op.get_bind()
    try:
        conn.execute(text("ALTER TABLE chat DROP COLUMN chat_type"))
    except Exception:
        conn.rollback()
    conn.commit()