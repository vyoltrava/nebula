import os
from sqlmodel import SQLModel, create_engine, Session
from models import User, Post, Like, Follow, Notification, Tag, PostTag  # noqa

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///nebula.db")

# 1. Настройки для SQLite, чтобы не падало в FastAPI из-за многопоточности
connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

# 2. Базовые настройки engine
engine_kwargs = {
    "echo": False,
    "pool_pre_ping": True,  # КРИТИЧНО: проверяет, живо ли соединение, перед запросом
    "connect_args": connect_args,
}

# 3. Настройки пула для PostgreSQL (Render и другие PaaS)
if not DATABASE_URL.startswith("sqlite"):
    engine_kwargs.update({
        "pool_size": 10,        # Базовое количество открытых соединений
        "max_overflow": 20,     # Сколько можно создать сверх лимита при пиковой нагрузке
        "pool_recycle": 1800,   # Пересоздавать соединения каждые 30 мин (защита от разрывов связи)
        "pool_timeout": 10,     # Ждать свободное соединение не больше 10 сек, потом отдавать 500 ошибку
    })

engine = create_engine(DATABASE_URL, **engine_kwargs)


def init_db():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session