"""faixa: reply-цепочка админа — колонка reply_to_post_id в channel_post.

Revision ID: 0016_channel_post_reply
"""
from alembic import op
from sqlalchemy import text

revision = "0016_channel_post_reply"
down_revision = "0015_channel_id_fix"
branch_labels = None
depends_on = None

TABLE = "channel_post"
COL = "reply_to_post_id"


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN IF NOT EXISTS {COL} INTEGER REFERENCES channel_post (id)"))
    else:
        # SQLite: нет IF NOT EXISTS — через try
        try:
            op.execute(text(f"ALTER TABLE {TABLE} ADD COLUMN {COL} INTEGER REFERENCES channel_post (id)"))
        except Exception:
            pass
    try:
        op.execute(text(f"CREATE INDEX IF NOT EXISTS ix_channel_post_{COL} ON {TABLE} ({COL})"))
    except Exception:
        pass


def downgrade() -> None:
    pass