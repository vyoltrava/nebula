# app_split/main_new.py
# Скопируй это В КОНЕЦ своего старого main.py
# Или замени старый main.py этим файлом после проверки

from fastapi import FastAPI
from database import init_db

# Импортируем все роутеры
from app_split.routers.admin import router as admin_router
from app_split.routers.auth import router as auth_router
from app_split.routers.chats import router as chats_router
from app_split.routers.misc import router as misc_router
from app_split.routers.notifications import router as notifications_router
from app_split.routers.permissions import router as permissions_router
from app_split.routers.posts import router as posts_router
from app_split.routers.reports import router as reports_router
from app_split.routers.search import router as search_router
from app_split.routers.support import router as support_router
from app_split.routers.themes import router as themes_router
from app_split.routers.updates import router as updates_router
from app_split.routers.users import router as users_router

app = FastAPI(title="Nebula API")

# Подключаем роутеры
app.include_router(admin_router)
app.include_router(auth_router)
app.include_router(chats_router)
app.include_router(misc_router)
app.include_router(notifications_router)
app.include_router(permissions_router)
app.include_router(posts_router)
app.include_router(reports_router)
app.include_router(search_router)
app.include_router(support_router)
app.include_router(themes_router)
app.include_router(updates_router)
app.include_router(users_router)

@app.on_event("startup")
def startup():
    init_db()
    # Сюда перенеси свои SQL миграции из старого main.py
