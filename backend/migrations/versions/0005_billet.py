"""Rename custom_badge* -> billet* (С‚Р°Р±Р»РёС†С‹, РєРѕР»РѕРЅРєРё).

CustomBadge -> Billet, CustomBadgeTemplate -> BilletTemplate,
CustomBadgeAssignment -> BilletAssignment,
user.custom_badge_url -> user.billet_url,
custom_badge_assignment.badge_id -> custom_badge_assignment.billet_id.

Revision ID: 0005_billet
Revises: 0004_add_premium_usernames
Create Date: 2026-09-01
"""
from alembic import op
from sqlalchemy import inspect

revision = "0005_billet"
down_revision = "0004_add_premium_usernames"
branch_labels = None
depends_on = None

TABLE_MAP = [
    ("custom_badge_template", "billet_template"),
    ("custom_badge_assignment", "billet_assignment"),
    ("custom_badge", "billet"),
]

COLUMN_MAP = [
    ("user", "custom_badge_url", "billet_url"),
    ("billet_assignment", "badge_id", "billet_id"),  # таблица уже переименована на шаге 1
]


def _tables(conn):
    try:
        return set(inspect(conn).get_table_names())
    except Exception:
        return set()


def _columns(conn, table):
    try:
        return {c["name"] for c in inspect(conn).get_columns(table)}
    except Exception:
        return set()


def upgrade():
    conn = op.get_bind()
    tables = _tables(conn)

    # 1) РџРµСЂРµРёРјРµРЅРѕРІР°РЅРёРµ С‚Р°Р±Р»РёС† (СЃРЅР°С‡Р°Р»Р° assignment/template, РїРѕС‚РѕРј Р±Р°Р·РѕРІР°СЏ)
    for old, new in TABLE_MAP:
        if old in tables and new not in tables:
            op.rename_table(old, new)
            tables = _tables(conn)

    # 2) РџРµСЂРµРёРјРµРЅРѕРІР°РЅРёРµ РєРѕР»РѕРЅРѕРє (batch-СЂРµР¶РёРј вЂ” СЃРѕРІРјРµСЃС‚РёРјРѕ СЃ SQLite)
    for table, old, new in COLUMN_MAP:
        if table in tables and old in _columns(conn, table) and new not in _columns(conn, table):
            with op.batch_alter_table(table) as batch:
                batch.alter_column(column_name=old, new_column_name=new)


def downgrade():
    conn = op.get_bind()
    tables = _tables(conn)

    for table, old, new in reversed(COLUMN_MAP):
        if table in tables and new in _columns(conn, table) and old not in _columns(conn, table):
            with op.batch_alter_table(table) as batch:
                batch.alter_column(column_name=new, new_column_name=old)

    for old, new in reversed(TABLE_MAP):
        if new in tables and old not in tables:
            op.rename_table(new, old)
            tables = _tables(conn)
