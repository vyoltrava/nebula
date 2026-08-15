import os
from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///nebula.db")

connect_args = {}
engine_kwargs = {
    "echo": False,
    "pool_pre_ping": True,
    "connect_args": connect_args,
}

if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    # 🚀 КРИТИЧНО для SQLite: увеличиваем пул
    engine_kwargs["pool_size"] = 20
    engine_kwargs["max_overflow"] = 30
    engine_kwargs["pool_timeout"] = 30
else:
    # 🚀 PostgreSQL на Render/VPS
    engine_kwargs.update({
        "pool_size": 20,        # было 10
        "max_overflow": 40,     # было 20
        "pool_recycle": 1800,
        "pool_timeout": 10,
    })

engine = create_engine(DATABASE_URL, **engine_kwargs)

def init_db():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session