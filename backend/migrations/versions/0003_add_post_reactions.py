"""Add postreaction table (реакции на посты, одна на юзера).

Revision ID: 0003_add_post_reactions
Revises: 0002_add_nick_history
Create Date: 2026-08-31
"""
from alembic import op
from sqlalchemy import text
from sqlmodel import SQLModel
import models  # noqa: F401 — регистрация всех таблиц SQLModel

revision = "0003_add_post_reactions"
down_revision = "0002_add_nick_history"
branch_labels = None
depends_on = None


def upgrade():
    # create_all идемпотентен (checkfirst=True) — создаст только отсутствующую postreaction
    SQLModel.metadata.create_all(op.get_bind())

    # Явный fallback (PostgreSQL-совместимый DDL)
    conn = op.get_bind()
    conn.execute(text(
        'CREATE TABLE IF NOT EXISTS postreaction ('
        'id INTEGER PRIMARY KEY, '
        'post_id INTEGER NOT NULL REFERENCES "post"(id) ON DELETE CASCADE, '
        'user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, '
        'sticker_id INTEGER REFERENCES "sticker"(id) ON DELETE CASCADE, '
        'emoji VARCHAR(16), '
        'created_at TIMESTAMPTZ DEFAULT NOW()'
        ')'
    ))
    conn.execute(text(
        'CREATE INDEX IF NOT EXISTS idx_postreaction_post ON postreaction(post_id);'
    ))
    conn.execute(text(
        'CREATE INDEX IF NOT EXISTS idx_postreaction_user ON postreaction(user_id);'
    ))
    # Одна реакция на пользователя на пост
    conn.execute(text(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_postreaction_unique '
        'ON postreaction(post_id, user_id);'
    ))


def downgrade():
    op.drop_table("postreaction")
