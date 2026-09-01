"""admin_backup + лента чатов (chatpost/chatpostcomment/chatinvite) + приватность chat.

Таблица admin_backup никогда не была в миграциях (существовала только в
локальном SQLite) — на проде (Postgres) удаление поста падало с
UndefinedTable. Заодно создаются таблицы фида постов и колонки приватности.

Revision ID: 0007_admin_backup_feed
Revises: 0006_billet_col
Create Date: 2026-09-01
"""
from alembic import op
from sqlalchemy import text
from sqlmodel import SQLModel
import models  # noqa: F401 — регистрация всех таблиц SQLModel

revision = "0007_admin_backup_feed"
down_revision = "0006_billet_col"
branch_labels = None
depends_on = None


def upgrade():
    # create_all идемпотентен (checkfirst=True) — создаст только отсутствующие таблицы
    SQLModel.metadata.create_all(op.get_bind())

    conn = op.get_bind()

    # Явный fallback. Диалект-независимый (SQLite не знает NOW()/SERIAL),
    # каждый стейтмент в try — миграция не должна падать ни на одной БД.
    def _safe(sql: str):
        try:
            conn.execute(text(sql))
        except Exception as e:
            print(f"⚠️ [0007] skip: {type(e).__name__}: {str(e)[:120]}")

    _safe(
        'CREATE TABLE IF NOT EXISTS admin_backup ('
        'id INTEGER PRIMARY KEY, '
        'actor_id INTEGER NOT NULL, '
        'action VARCHAR NOT NULL, '
        'target_type VARCHAR NOT NULL, '
        'target_id INTEGER, '
        'payload TEXT DEFAULT \'{}\', '
        'created_at TIMESTAMP, '
        'restored BOOLEAN DEFAULT FALSE, '
        'restored_at TIMESTAMP, '
        'restored_by INTEGER'
        ')'
    )
    _safe('CREATE INDEX IF NOT EXISTS ix_admin_backup_actor_id ON admin_backup(actor_id)')
    _safe('CREATE INDEX IF NOT EXISTS ix_admin_backup_created_at ON admin_backup(created_at)')
    _safe('CREATE INDEX IF NOT EXISTS ix_admin_backup_restored ON admin_backup(restored)')

    _safe(
        'CREATE TABLE IF NOT EXISTS chatpost ('
        'id INTEGER PRIMARY KEY, '
        'chat_id INTEGER NOT NULL, '
        'author_id INTEGER NOT NULL, '
        'text TEXT, '
        'media_url VARCHAR, '
        'media_type VARCHAR, '
        'link_url VARCHAR, '
        'created_at TIMESTAMP, '
        'edited BOOLEAN DEFAULT FALSE, '
        'edited_at TIMESTAMP'
        ')'
    )
    _safe('CREATE INDEX IF NOT EXISTS ix_chatpost_chat_id ON chatpost(chat_id)')
    _safe('CREATE INDEX IF NOT EXISTS ix_chatpost_created_at ON chatpost(created_at)')

    _safe(
        'CREATE TABLE IF NOT EXISTS chatpostcomment ('
        'id INTEGER PRIMARY KEY, '
        'post_id INTEGER NOT NULL, '
        'parent_id INTEGER, '
        'author_id INTEGER NOT NULL, '
        'text TEXT NOT NULL, '
        'created_at TIMESTAMP'
        ')'
    )
    _safe('CREATE INDEX IF NOT EXISTS ix_chatpostcomment_post_id ON chatpostcomment(post_id)')

    _safe(
        'CREATE TABLE IF NOT EXISTS chatinvite ('
        'id INTEGER PRIMARY KEY, '
        'chat_id INTEGER NOT NULL, '
        'token VARCHAR NOT NULL UNIQUE, '
        'created_by INTEGER, '
        'created_at TIMESTAMP, '
        'is_active BOOLEAN DEFAULT TRUE'
        ')'
    )

    # Колонки приватности в chat (SQLite не умеет IF NOT EXISTS — ловим ошибку)
    for col in ("invite_token", "who_can_post", "who_can_comment"):
        _safe(f"ALTER TABLE chat ADD COLUMN {col} VARCHAR")

    conn.commit()


def downgrade():
    conn = op.get_bind()
    for t in ("chatinvite", "chatpostcomment", "chatpost", "admin_backup"):
        try:
            conn.execute(text(f"DROP TABLE IF EXISTS {t}"))
        except Exception:
            pass
    conn.commit()
