"""add privacy settings and chat mute

Revision ID: 0009_privacy_mute
"""
from alembic import op

revision = "0009_privacy_mute"
down_revision = "0008_chat_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS allow_messages VARCHAR NOT NULL DEFAULT \'everyone\';')
    op.execute('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS allow_calls VARCHAR NOT NULL DEFAULT \'everyone\';')
    op.execute('ALTER TABLE chatmember ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;')


def downgrade() -> None:
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS allow_messages;')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS allow_calls;')
    op.execute('ALTER TABLE chatmember DROP COLUMN IF EXISTS muted_until;')
