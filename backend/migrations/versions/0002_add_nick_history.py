"""Add nick_history table.

Revision ID: 0002_add_nick_history
Revises: 0001_bootstrap
Create Date: 2026-08-30
"""
from alembic import op
from sqlalchemy import text
from sqlmodel import SQLModel
import models  # noqa: F401 — регистрация всех таблиц SQLModel

revision = "0002_add_nick_history"
down_revision = "0001_bootstrap"
branch_labels = None
depends_on = None


def upgrade():
    # create_all идемпотентен (checkfirst=True) и создаст только отсутствующие
    # таблицы, включая новую nick_history.
    SQLModel.metadata.create_all(op.get_bind())

    # Явный fallback для БД, где create_all почему-либо не создал таблицу.
    conn = op.get_bind()
    conn.execute(text(
        "CREATE TABLE IF NOT EXISTS nick_history ("
        "id INTEGER PRIMARY KEY, "
        "user_id INTEGER NOT NULL REFERENCES \"user\"(id) ON DELETE CASCADE, "
        "field VARCHAR NOT NULL, "
        "old_value VARCHAR NOT NULL, "
        "new_value VARCHAR NOT NULL, "
        "changed_by INTEGER NOT NULL REFERENCES \"user\"(id) ON DELETE CASCADE, "
        "changed_at TIMESTAMPTZ"
        ")"
    ))


def downgrade():
    op.drop_table("nick_history")