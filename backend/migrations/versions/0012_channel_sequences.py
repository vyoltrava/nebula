"""fix: автоинкремент id для channel-таблиц на PostgreSQL

Проблема: в 0011 колонки id созданы как `INTEGER PRIMARY KEY`.
В PostgreSQL (в отличие от SQLite/MySQL) это НЕ даёт автоинкремента —
INSERT возвращает id = NULL и падает с NotNullViolation.
Решение: создать sequence и привязать DEFAULT nextval к колонке id,
как у остальных таблиц проекта (см. setval в database.py).
На SQLite — no-op (там автоинкремент через rowid работает сам).

Revision ID: 0012_channel_sequences
"""
from alembic import op
from sqlalchemy import text

revision = "0012_channel_sequences"
down_revision = "0011_channels"
branch_labels = None
depends_on = None

CHANNEL_TABLES = [
    "channel", "channel_subscriber", "channel_post", "channel_comment",
    "channel_post_view", "channel_invite", "channel_invite_request",
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return  # SQLite/SQLModel: автоинкремент уже работает

    for table in CHANNEL_TABLES:
        seq = f"{table}_id_seq"
        op.execute(text(f"CREATE SEQUENCE IF NOT EXISTS {seq}"))
        # Синхронизируем значения, если в таблице уже есть строки
        op.execute(text(
            f"SELECT setval('{seq}', COALESCE((SELECT MAX(id) FROM {table}), 1), false)"
        ))
        # Привязываем default nextval → колонка станет автоинкрементом
        op.execute(text(
            f"ALTER TABLE {table} ALTER COLUMN id SET DEFAULT nextval('{seq}')"
        ))
        # «Владение» последовательностью таблицей (для пересоздания схемы)
        op.execute(text(f"ALTER SEQUENCE {seq} OWNED BY {table}"))


def downgrade() -> None:
    # Не откатываем: удаление default сломает строки. Сохраняем идемпотентность.
    pass