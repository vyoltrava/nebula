"""faixa: panel_tabs у RoleCategory (привязка отделов к разделам админки)
и is_bot у User (системный бот для заявок в рабочих чатах).

Revision ID: 0017_panel_tabs_bot
"""
from alembic import op
from sqlalchemy import text

revision = "0017_panel_tabs_bot"
down_revision = "0016_channel_post_reply"
branch_labels = None
depends_on = None

# (таблица, колонка, DDL для Postgres, DDL для SQLite)
COLUMNS = [
    ("rolecategory", "panel_tabs", "VARCHAR DEFAULT '[]'", "VARCHAR DEFAULT '[]'"),
    ("user", "is_bot", "BOOLEAN DEFAULT FALSE", "BOOLEAN DEFAULT 0"),
]


def upgrade() -> None:
    bind = op.get_bind()
    for table, col, pg_ddl, sqlite_ddl in COLUMNS:
        try:
            if bind.dialect.name == "postgresql":
                # "user" — зарезервированное слово, обязательно в кавычках
                op.execute(text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS {col} {pg_ddl}'))
            else:
                try:
                    op.execute(text(f'ALTER TABLE "{table}" ADD COLUMN {col} {sqlite_ddl}'))
                except Exception:
                    pass
        except Exception:
            pass


def downgrade() -> None:
    pass