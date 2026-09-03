"""profile privacy: is_private, allow_comments, hide lists, email search opt-out

Revision ID: 0010_profile_privacy
"""
from alembic import op

revision = "0010_profile_privacy"
down_revision = "0009_privacy_mute"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;')
    op.execute('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS allow_comments VARCHAR NOT NULL DEFAULT \'everyone\';')
    op.execute('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS hide_following BOOLEAN NOT NULL DEFAULT FALSE;')
    op.execute('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS hide_followers BOOLEAN NOT NULL DEFAULT FALSE;')
    op.execute('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS search_hide_email BOOLEAN NOT NULL DEFAULT FALSE;')


def downgrade() -> None:
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS is_private;')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS allow_comments;')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS hide_following;')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS hide_followers;')
    op.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS search_hide_email;')
