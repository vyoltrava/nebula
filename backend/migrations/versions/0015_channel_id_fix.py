"""fix: id BIGSERIAL identity для channel_* таблиц, созданных на проде
как INTEGER PRIMARY KEY (на PostgreSQL это НЕ автоинкремент → NotNullViolation
при INSERT: "null value in column \"id\""). Идемпотентно.

Revision ID: 0015_channel_id_fix
"""
from alembic import op
from sqlalchemy import text

revision = "0015_channel_id_fix"
down_revision = "0014_channel_feat"
branch_labels = None
depends_on = None

# Проверяем, что колонка id — обычный INTEGER (не identity/serial),
# и только тогда добавляем IDENTITY. Для прод-таблиц (уже созданных старой
# версией 0014 с INTEGER PRIMARY KEY на PG).
PROMOTE = [
    "channel_ban",
    "channel_saved_post",
    "channel_post_reaction",
]


def _is_pg(bind) -> bool:
    return bind.dialect.name == "postgresql"


def upgrade() -> None:
    bind = op.get_bind()
    if not _is_pg(bind):
        return  # на SQLite — не нужно

    for table in PROMOTE:
        # Если id уже serial/identity — ничего не делаем (default содержит nextval
        # или is_identity=True). Иначе конвертируем, если есть последовательность —
        # устанавливаем её, если нет — создаём новую.
        rows = bind.execute(text(f"""
            SELECT column_default, is_identity
            FROM information_schema.columns
            WHERE table_name = '{table}' AND column_name = 'id'
        """)).fetchall()
        if not rows:
            continue
        default, is_identity = rows[0]
        if is_identity or (default and "nextval" in (default or "")):
            continue  # уже автоинкремент — пропускаем

        # Алгоритм восстановления:
        # 1) создать последовательность, если нет связанной
        # 2) установить default = nextval(seq)  →  как BIGSERIAL
        seq = f"{table}_id_seq"
        n = bind.execute(text(
            "SELECT count(*) FROM pg_class WHERE relkind='S' AND relname=:s"
        ), {"s": seq}).scalar()
        if not n:
            bind.execute(text(
                f"CREATE SEQUENCE {seq} OWNED BY {table}.id"
            ))
            # стартуем с max(id)+1, чтобы не конфликтовать с существующими
            bind.execute(text(
                f"SELECT setval('{seq}', COALESCE((SELECT MAX(id) FROM {table}), 0) + 1, false)"
            ))
        bind.execute(text(
            f"ALTER TABLE {table} ALTER COLUMN id SET DEFAULT nextval('{seq}')"
        ))


def downgrade() -> None:
    pass