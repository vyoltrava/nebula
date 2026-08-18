# app_split/main_new.py
# Скопируй это В КОНЕЦ своего старого main.py
# Или замени старый main.py этим файлом после проверки

from fastapi import FastAPI
from database import init_db

# Импортируем все роутеры
from routers.admin import router as admin_router
from routers.auth import router as auth_router
from routers.chats import router as chats_router
from routers.misc import router as misc_router
from routers.notifications import router as notifications_router
from routers.permissions import router as permissions_router
from routers.posts import router as posts_router
from routers.reports import router as reports_router
from routers.search import router as search_router
from routers.support import router as support_router
from routers.themes import router as themes_router
from routers.updates import router as updates_router
from routers.users import router as users_router

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
