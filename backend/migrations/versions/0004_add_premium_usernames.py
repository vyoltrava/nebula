"""Add premium_usernames table (продажа премиум-юзернеймов @).

Revision ID: 0004_add_premium_usernames
Revises: 0003_add_post_reactions
Create Date: 2026-08-31
"""
from alembic import op
from sqlalchemy import text
from sqlmodel import SQLModel
import models  # noqa: F401 — регистрация всех таблиц SQLModel

revision = "0004_add_premium_usernames"
down_revision = "0003_add_post_reactions"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # 1) Колонка credits у user (для покупки за CREDITS)
    #    create_all НЕ добавляет колонки в существующую таблицу → явный ALTER.
    try:
        cols = [r[0] for r in conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='user'")).fetchall()]
    except Exception:
        # SQLite / упрощённый диалект
        cols = [r[1] for r in conn.execute(text("PRAGMA table_info('user')")).fetchall()]

    if "credits" not in cols:
        conn.execute(text("ALTER TABLE \"user\" ADD COLUMN credits BIGINT NOT NULL DEFAULT 0"))

    # 2) Таблица premium_usernames (idempotent create_all создаст отсутствующую)
    SQLModel.metadata.create_all(conn)

    # 3) Явный fallback для премиум-юзернеймов (PostgreSQL/SQLite-совместимый DDL)
    conn.execute(text(
        'CREATE TABLE IF NOT EXISTS premium_usernames ('
        'id INTEGER PRIMARY KEY, '
        'username VARCHAR(50) NOT NULL, '
        'is_available BOOLEAN DEFAULT TRUE, '
        'price BIGINT, '
        'currency VARCHAR(10) DEFAULT \'USD\', '
        'category VARCHAR(50), '
        'created_by INTEGER REFERENCES "user"(id), '
        'created_at TIMESTAMPTZ DEFAULT NOW(), '
        'purchased_by INTEGER REFERENCES "user"(id), '
        'purchased_at TIMESTAMPTZ, '
        'purchase_price BIGINT, '
        'price_history TEXT DEFAULT \'[]\', '
        'is_active BOOLEAN DEFAULT TRUE, '
        'is_reserved BOOLEAN DEFAULT FALSE, '
        'reserved_for INTEGER REFERENCES "user"(id), '
        'reserved_until TIMESTAMPTZ, '
        'views_count BIGINT DEFAULT 0, '
        'analytics TEXT DEFAULT \'{}\''
        ')'
    ))
    conn.execute(text(
        'CREATE UNIQUE INDEX IF NOT EXISTS ix_premium_usernames_username ON premium_usernames(username);'
    ))


def downgrade():
    op.drop_table("premium_usernames")