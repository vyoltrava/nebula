import os
from sqlmodel import SQLModel, create_engine, Session
from models import User, Post, Like, Follow, Notification, Tag, PostTag  # noqa

# Сначала ищем переменную окружения (для Render), если нет — fallback на SQLite (для локалки)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///nebula.db")

engine = create_engine(DATABASE_URL, echo=False)


def init_db():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session