"""billet_assignment: rename badge_id -> billet_id (0005 пропустил переименование из-за старого имени таблицы).

Revision ID: 0006_billet_col
Revises: 0005_billet
Create Date: 2026-09-01
"""
from alembic import op
from sqlalchemy import inspect

revision = "0006_billet_col"
down_revision = "0005_billet"
branch_labels = None
depends_on = None


def _columns(conn, table):
    try:
        return {c["name"] for c in inspect(conn).get_columns(table)}
    except Exception:
        return set()


def upgrade():
    conn = op.get_bind()
    tables = set(inspect(conn).get_table_names())
    if "billet_assignment" not in tables:
        return
    cols = _columns(conn, "billet_assignment")
    if "badge_id" in cols and "billet_id" not in cols:
        with op.batch_alter_table("billet_assignment") as batch:
            batch.alter_column(column_name="badge_id", new_column_name="billet_id")


def downgrade():
    conn = op.get_bind()
    tables = set(inspect(conn).get_table_names())
    if "billet_assignment" not in tables:
        return
    cols = _columns(conn, "billet_assignment")
    if "billet_id" in cols and "badge_id" not in cols:
        with op.batch_alter_table("billet_assignment") as batch:
            batch.alter_column(column_name="billet_id", new_column_name="badge_id")
