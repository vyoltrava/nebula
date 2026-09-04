"""channels: изолированная система каналов (7 таблиц)

Revision ID: 0011_channels
"""
from alembic import op
from sqlalchemy import text

revision = "0011_channels"
down_revision = "0010_profile_privacy"
branch_labels = None
depends_on = None


# Идемпотентный DDL: работает и на Postgres, и на SQLite.
# Никаких FK на chat/chat_member/message — только user и внутри системы каналов.
TABLES = [
    """
    CREATE TABLE IF NOT EXISTS channel (
        id INTEGER PRIMARY KEY,
        owner_id INTEGER NOT NULL REFERENCES "user" (id),
        title VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        avatar_url VARCHAR,
        custom_slug VARCHAR(32) NOT NULL UNIQUE,
        is_public BOOLEAN NOT NULL DEFAULT TRUE,
        settings VARCHAR NOT NULL DEFAULT '{}',
        comments_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_channel_owner_id ON channel (owner_id)",
    """
    CREATE TABLE IF NOT EXISTS channel_subscriber (
        id INTEGER PRIMARY KEY,
        channel_id INTEGER NOT NULL REFERENCES channel (id),
        user_id INTEGER NOT NULL REFERENCES "user" (id),
        role VARCHAR(20) NOT NULL DEFAULT 'subscriber',
        joined_at TIMESTAMPTZ,
        muted_until TIMESTAMPTZ,
        last_seen_post_at TIMESTAMPTZ,
        CONSTRAINT uq_channel_subscriber UNIQUE (channel_id, user_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_channel_subscriber_channel_id ON channel_subscriber (channel_id)",
    "CREATE INDEX IF NOT EXISTS ix_channel_subscriber_user_id ON channel_subscriber (user_id)",
    """
    CREATE TABLE IF NOT EXISTS channel_post (
        id INTEGER PRIMARY KEY,
        channel_id INTEGER NOT NULL REFERENCES channel (id),
        author_id INTEGER NOT NULL REFERENCES "user" (id),
        text VARCHAR(8000),
        media VARCHAR NOT NULL DEFAULT '[]',
        is_silent BOOLEAN NOT NULL DEFAULT FALSE,
        is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
        pinned_at TIMESTAMPTZ,
        views_count INTEGER NOT NULL DEFAULT 0,
        scheduled_at TIMESTAMPTZ,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ,
        edited_at TIMESTAMPTZ
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_channel_post_channel_id ON channel_post (channel_id)",
    "CREATE INDEX IF NOT EXISTS ix_channel_post_author_id ON channel_post (author_id)",
    "CREATE INDEX IF NOT EXISTS ix_channel_post_created_at ON channel_post (created_at)",
    """
    CREATE TABLE IF NOT EXISTS channel_comment (
        id INTEGER PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES channel_post (id),
        user_id INTEGER NOT NULL REFERENCES "user" (id),
        parent_comment_id INTEGER REFERENCES channel_comment (id),
        text VARCHAR(2000) NOT NULL,
        media VARCHAR NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ,
        edited_at TIMESTAMPTZ
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_channel_comment_post_id ON channel_comment (post_id)",
    "CREATE INDEX IF NOT EXISTS ix_channel_comment_user_id ON channel_comment (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_channel_comment_parent_comment_id ON channel_comment (parent_comment_id)",
    """
    CREATE TABLE IF NOT EXISTS channel_post_view (
        id INTEGER PRIMARY KEY,
        post_id INTEGER NOT NULL REFERENCES channel_post (id),
        user_id INTEGER NOT NULL REFERENCES "user" (id),
        viewed_at TIMESTAMPTZ,
        CONSTRAINT uq_channel_post_view UNIQUE (post_id, user_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_channel_post_view_post_id ON channel_post_view (post_id)",
    "CREATE INDEX IF NOT EXISTS ix_channel_post_view_user_id ON channel_post_view (user_id)",
    """
    CREATE TABLE IF NOT EXISTS channel_invite (
        id INTEGER PRIMARY KEY,
        channel_id INTEGER NOT NULL REFERENCES channel (id),
        token VARCHAR(64) NOT NULL UNIQUE,
        created_by INTEGER NOT NULL REFERENCES "user" (id),
        created_at TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        auto_approve BOOLEAN NOT NULL DEFAULT FALSE
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_channel_invite_channel_id ON channel_invite (channel_id)",
    """
    CREATE TABLE IF NOT EXISTS channel_invite_request (
        id INTEGER PRIMARY KEY,
        channel_id INTEGER NOT NULL REFERENCES channel (id),
        user_id INTEGER NOT NULL REFERENCES "user" (id),
        invite_token VARCHAR(64),
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ,
        reviewed_by INTEGER REFERENCES "user" (id),
        resolved_at TIMESTAMPTZ,
        CONSTRAINT uq_channel_invite_request UNIQUE (channel_id, user_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS ix_channel_invite_request_channel_id ON channel_invite_request (channel_id)",
    "CREATE INDEX IF NOT EXISTS ix_channel_invite_request_user_id ON channel_invite_request (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_channel_invite_request_status ON channel_invite_request (status)",
]

DROP_ORDER = [
    "channel_invite_request", "channel_invite", "channel_post_view",
    "channel_comment", "channel_post", "channel_subscriber", "channel",
]


def upgrade() -> None:
    for ddl in TABLES:
        op.execute(ddl)


def downgrade() -> None:
    for table in DROP_ORDER:
        op.execute(f"DROP TABLE IF EXISTS {table}")