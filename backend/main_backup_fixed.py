# backend/main.py
import os
import logging
import json
import jwt
from datetime import datetime, timezone
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.concurrency import run_in_threadpool
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse
from sqlalchemy import text
from sqlmodel import Session

# 1. Локальные импорты
from database import init_db, engine, get_session
from models import User
from performance import PerfMiddleware
from websocket_manager import manager

# 2. Импорт ВСЕГО из routers (там есть __init__.py со всеми экспортами)
from dependencies import (
    SECRET, ALGORITHM, get_current_user, get_optional_user,
    require_staff, require_admin, require_founder, require_announcer,
    require_support_staff, get_client_ip, is_ip_blocked, create_token,
    limiter, _update_last_seen, hash_password, check_password,
    ensure_user_has_keys, log_action, user_out,
    generate_code, send_password_reset_email
)
from routers import (
    SECRET, ALGORITHM, get_current_user, limiter,
    get_client_ip, is_ip_blocked
)

# 3. Импорт роутеров
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
from routers import prism
from routers import auth_router

# 4. Создаём приложение
app = FastAPI(title="Nebula API")

# 5. CORS
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time-Ms", "X-Request-Id"],
)

# 6. Rate limiter и middleware
app.state.limiter = limiter
app.add_middleware(PerfMiddleware)

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

@app.middleware("http")
async def ip_block_middleware(request: Request, call_next):
    ip = get_client_ip(request)
    if ip in ("127.0.0.1", "testclient") or request.url.path == "/health":
        return await call_next(request)
    with Session(engine) as session:
        block = is_ip_blocked(session, ip)
        if block:
            return JSONResponse(
                status_code=403,
                content={"detail": f"Ваш IP заблокирован. Причина: {block.reason or 'не указана'}"}
            )
    return await call_next(request)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"❌ Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Внутренняя ошибка сервера"})

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Слишком много запросов. Подождите немного."},
    )

# 7. Статические файлы
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# 8. Подключение роутеров
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
app.include_router(prism.router)  
# ← ТОЛЬКО ОДИН РАЗ!

# 9. Функция обновления last_seen (для WebSocket)
def _update_last_seen_sync(user_id: int):
    """Синхронная функция для обновления last_seen"""
    with Session(engine) as session:
        user = session.get(User, user_id)
        if user:
            user.last_seen = datetime.now(timezone.utc)
            session.add(user)
            session.commit()

# 10. STARTUP: Миграции
@app.on_event("startup")
def startup():
    print("🚀 Инициализация базы данных...")
    init_db()
    
    # Твой огромный блок миграций из старого main.py
    with engine.connect() as conn:
        try:
            # Здесь весь твой блок с ALTER TABLE и CREATE TABLE
            # Я сократил для примера, но ты должен вставить ВСЁ
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;'))
            conn.commit()
            print("✅ Миграции успешно применены")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ STARTUP MIGRATION ERROR: {e}")
    
    print("🎉 Сервер полностью готов!")

# 11. ⭐ ГЛАВНОЕ: WEBSOCKET (исправленный)
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Принимаем соединение
    await websocket.accept()
    
    # Получаем токен
    token = websocket.query_params.get("token")
    user_id = None
    
    if token:
        try:
            payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
            user_id = int(payload["sub"])
        except jwt.ExpiredSignatureError:
            await websocket.close(code=4001, reason="Token expired")
            return
        except jwt.InvalidTokenError:
            await websocket.close(code=4001, reason="Invalid token")
            return
        except Exception as e:
            print(f"❌ WS auth error: {e}")
            await websocket.close(code=4001, reason="Auth error")
            return
    
    if not user_id:
        await websocket.close(code=4001, reason="Not authenticated")
        return
    
    # Проверяем пользователя в БД
    try:
        with Session(engine) as session:
            user = session.get(User, user_id)
            if not user:
                await websocket.close(code=4003, reason="User not found")
                return
            if user.is_banned:
                await websocket.close(code=4003, reason="Banned")
                return
    except Exception as e:
        print(f"❌ WS DB error: {e}")
        await websocket.close(code=4003, reason="Database error")
        return
    
    # Подключаем к менеджеру
    try:
        await manager.connect(websocket, user_id)
        print(f"✅ WS connected: user {user_id}")
    except Exception as e:
        print(f"❌ WS connect error: {e}")
        await websocket.close(code=4000, reason="Connection error")
        return
    
    # Обновляем last_seen в фоне
    try:
        await run_in_threadpool(_update_last_seen_sync, user_id)
    except Exception as e:
        print(f"⚠️ WS last_seen error: {e}")
    
    # Основной цикл
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
            else:
                # Обработка других сообщений (если нужно)
                pass
    except WebSocketDisconnect:
        print(f"⚠️ WS disconnected: user {user_id}")
        await manager.disconnect(websocket, user_id)
    except Exception as e:
        print(f"❌ WS error for user {user_id}: {e}")
        await manager.disconnect(websocket, user_id)

# 12. Online count
@app.get("/api/online-count")
def get_online_count(user: User = Depends(get_current_user)):
    return {"count": manager.total_connections}

# 13. Health check
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "nebula-api"}