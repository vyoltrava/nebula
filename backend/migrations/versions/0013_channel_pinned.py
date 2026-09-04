"""fix: pinned_at для channel_subscriber (личное закрепление канала)

Revision ID: 0013_channel_pinned
"""
from alembic import op
from sqlalchemy import text

revision = "0013_channel_pinned"
down_revision = "0012_channel_sequences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(text(
            "ALTER TABLE channel_subscriber ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ"
        ))
    else:
        # SQLite: ALTER без IF NOT EXISTS — глушим повторный запуск
        try:
            op.execute(text("ALTER TABLE channel_subscriber ADD COLUMN pinned_at TIMESTAMP"))
        except Exception:
            pass


def downgrade() -> None:
    pass