# app_split/main_new.py
import os
import logging
from datetime import datetime, timezone
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse
from sqlalchemy import text
from sqlmodel import Session


import json
import jwt
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Depends
from fastapi.concurrency import run_in_threadpool
from websocket_manager import manager
from dependencies import SECRET, ALGORITHM, get_current_user
from models import User


# 1. Локальные импорты (база, модели, зависимости)
from database import init_db, engine, get_session
from models import *  # Нужно для миграций, чтобы SQLAlchemy видел все таблицы
from performance import PerfMiddleware  # Если этот файл есть в проекте

# Импорт глобальных переменных и мидлварей из dependencies
from dependencies import (
    limiter, 
    get_client_ip, 
    is_ip_blocked, 
    _ip_block_cache
)

# 2. Импорт всех роутеров
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
from routers.prism import router as prism_router

# 3. Инициализация приложения
app = FastAPI(title="Nebula API")

# 4. CORS (КРИТИЧЕСКИ ВАЖНО для фронта)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time-Ms", "X-Request-Id"],
)

# 5. Настройка состояния и мидлварей
app.state.limiter = limiter
app.add_middleware(PerfMiddleware)

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

# 6. Обработчики ошибок
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

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

# 7. Статические файлы (загрузки)
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
app.include_router(prism_router) 


# 9. STARTUP: Инициализация и МИГРАЦИИ (перенесено из старого main.py)
@app.on_event("startup")
def startup():
    print("🚀 Инициализация базы данных и применение миграций...")
    init_db()
    
    # Основной блок миграций
    with engine.connect() as conn:
        try:

            # 🆕 ДОБАВИТЬ В БЛОК МИГРАЦИЙ В startup():
            conn.execute(text('ALTER TABLE chat ADD COLUMN IF NOT EXISTS is_prism BOOLEAN DEFAULT FALSE;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS prism_anchor VARCHAR;'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_chat_is_prism ON chat(is_prism);'))


            conn.execute(text('ALTER TABLE notification ADD COLUMN IF NOT EXISTS message_id INTEGER REFERENCES message(id) ON DELETE SET NULL;'))
            conn.execute(text("""CREATE TABLE IF NOT EXISTS support_message (id SERIAL PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES supportticket(id) ON DELETE CASCADE, sender_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());"""))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_support_message_ticket ON support_message(ticket_id, created_at);'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_secret VARCHAR;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS email VARCHAR(255);'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;'))
            conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email ON "user"(email) WHERE email IS NOT NULL;'))
            conn.execute(text('ALTER TABLE userkey ADD COLUMN IF NOT EXISTS is_pending BOOLEAN DEFAULT TRUE;'))
            conn.execute(text("UPDATE userkey SET is_pending = FALSE WHERE public_key NOT LIKE 'pending_%';"))
            conn.execute(text("""CREATE TABLE IF NOT EXISTS sticker_pack (id SERIAL PRIMARY KEY, name VARCHAR(60) NOT NULL, min_level INTEGER DEFAULT 1, is_active BOOLEAN DEFAULT TRUE, is_builtin BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW());"""))
            conn.execute(text("""CREATE TABLE IF NOT EXISTS sticker (id SERIAL PRIMARY KEY, pack_id INTEGER NOT NULL REFERENCES sticker_pack(id) ON DELETE CASCADE, type VARCHAR(10) NOT NULL, content VARCHAR(500) NOT NULL, "order" INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());"""))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_sticker_pack ON sticker(pack_id, "order");'))
            conn.execute(text("""CREATE TABLE IF NOT EXISTS message_reaction (id SERIAL PRIMARY KEY, message_id INTEGER NOT NULL REFERENCES message(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, sticker_id INTEGER REFERENCES sticker(id) ON DELETE CASCADE, emoji VARCHAR(16), created_at TIMESTAMPTZ DEFAULT NOW());"""))
            conn.execute(text('ALTER TABLE message_reaction ADD COLUMN IF NOT EXISTS sticker_id INTEGER;'))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_reaction_unique ON message_reaction(message_id, user_id, COALESCE(sticker_id, 0), COALESCE(emoji, ''));"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_reaction_message ON message_reaction(message_id);"))
            conn.execute(text('DROP TABLE IF EXISTS readprogress;'))
            conn.execute(text("""CREATE TABLE IF NOT EXISTS lastreadpost (user_id INTEGER PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE, saved_at TIMESTAMPTZ DEFAULT NOW());"""))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_lastreadpost_user ON lastreadpost(user_id);'))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS pinned_by INTEGER REFERENCES \"user\"(id);"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chat_pinned ON chat(pinned_at DESC);"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS name VARCHAR(80);"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS avatar_url VARCHAR;"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES \"user\"(id);"))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS is_secret BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chat_is_group ON chat(is_group);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chat_owner ON chat(owner_id);"))
            conn.execute(text("ALTER TABLE chatmember ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'member';"))
            conn.execute(text("ALTER TABLE chatmember ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT NOW();"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_chatmember_user ON chatmember(user_id);"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS forwarded_from_id INTEGER REFERENCES message(id) ON DELETE SET NULL;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES message(id) ON DELETE SET NULL;"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_message_reply ON message(reply_to_id);"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS forwarded_sender_name VARCHAR;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS pinned_by INTEGER REFERENCES \"user\"(id);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_message_pinned ON message(chat_id, pinned, pinned_at DESC);"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS ciphertext TEXT;"))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_message_chat ON message(chat_id, created_at);'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS cover_url VARCHAR;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS bio VARCHAR(500);'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS live_text_enabled BOOLEAN DEFAULT TRUE;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS live_text_broadcast BOOLEAN DEFAULT TRUE;'))
            conn.execute(text("""CREATE TABLE IF NOT EXISTS warning (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, issuer_id INTEGER NOT NULL REFERENCES "user"(id), reason VARCHAR(500) NOT NULL, active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ);"""))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_warning_user ON warning(user_id, active);'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS media_type VARCHAR;'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS repost_of_id INTEGER REFERENCES post(id) ON DELETE SET NULL;'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_repost ON post(repost_of_id);'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS echo_parent_id INTEGER REFERENCES post(id) ON DELETE SET NULL;'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_echo_parent ON post(echo_parent_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_author ON post(author_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_reply ON post(reply_to_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_created ON post(created_at DESC);'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS edited BOOLEAN DEFAULT FALSE;'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;'))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;'))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS description VARCHAR;'))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS is_staff BOOLEAN DEFAULT FALSE;'))
            conn.execute(text("""CREATE TABLE IF NOT EXISTS rolecategory (id SERIAL PRIMARY KEY, name VARCHAR(60) NOT NULL, color VARCHAR(20) DEFAULT '#8b5cf6', description VARCHAR(200), "order" INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());"""))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES rolecategory(id) ON DELETE SET NULL;'))
            conn.execute(text('''CREATE TABLE IF NOT EXISTS pushsubscription (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE, endpoint VARCHAR UNIQUE NOT NULL, p256dh VARCHAR NOT NULL, auth VARCHAR NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());'''))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_push_user ON pushsubscription(user_id);'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS siterules (id SERIAL PRIMARY KEY, content TEXT NOT NULL DEFAULT \'{}\', updated_by INTEGER REFERENCES "user"(id), updated_at TIMESTAMPTZ DEFAULT NOW());'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS bookmark (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES "user"(id), post_id INTEGER REFERENCES post(id) ON DELETE CASCADE, created_at TIMESTAMPTZ, UNIQUE(user_id, post_id));'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS updateread (user_id INTEGER REFERENCES "user"(id), update_id INTEGER REFERENCES "update"(id), read_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (user_id, update_id));'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS iplog (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES "user"(id), ip_address VARCHAR NOT NULL, user_agent VARCHAR, action VARCHAR, created_at TIMESTAMPTZ);'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS ipblock (id SERIAL PRIMARY KEY, ip_address VARCHAR UNIQUE NOT NULL, reason VARCHAR, blocked_by INTEGER REFERENCES "user"(id), created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ);'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS actionlog (id SERIAL PRIMARY KEY, actor_id INTEGER REFERENCES "user"(id), action VARCHAR NOT NULL, target_type VARCHAR, target_id INTEGER, details VARCHAR, ip_address VARCHAR, created_at TIMESTAMPTZ);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_iplog_user ON iplog(user_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_ipblock_ip ON ipblock(ip_address);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_actionlog_created ON actionlog(created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_like_post ON "like"(post_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_follow_follower ON follow(follower_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_follow_followee ON follow(followee_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_postview_post ON postview(post_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_postview_viewer ON postview(viewer_hash);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, read);'))
            conn.execute(text('ALTER TABLE supportmessage ADD COLUMN IF NOT EXISTS media_url VARCHAR;'))
            conn.execute(text('ALTER TABLE supportmessage ADD COLUMN IF NOT EXISTS media_type VARCHAR;'))
            conn.execute(text('ALTER TABLE supportmessage ALTER COLUMN text DROP NOT NULL;'))
            conn.execute(text("""CREATE TABLE IF NOT EXISTS theme (id SERIAL PRIMARY KEY, name VARCHAR(80) NOT NULL, type VARCHAR(20) NOT NULL, colors TEXT DEFAULT '[]', speed FLOAT DEFAULT 24.0, intensity FLOAT DEFAULT 0.22, blur INTEGER DEFAULT 80, is_default BOOLEAN DEFAULT FALSE, min_level INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_by INTEGER REFERENCES "user"(id), created_at TIMESTAMPTZ DEFAULT NOW());"""))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_theme_active ON theme(is_active, min_level);"))
            conn.execute(text("""CREATE TABLE IF NOT EXISTS system_setting (key VARCHAR(50) PRIMARY KEY, value TEXT DEFAULT '', updated_at TIMESTAMPTZ DEFAULT NOW());"""))
            conn.execute(text("""INSERT INTO system_setting (key, value) VALUES ('themes_enabled', 'false') ON CONFLICT (key) DO NOTHING;"""))
            
            # Каскадные удаления
            conn.execute(text('ALTER TABLE "like" DROP CONSTRAINT IF EXISTS like_post_id_fkey;'))
            conn.execute(text('ALTER TABLE "like" ADD CONSTRAINT like_post_id_fkey FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.execute(text('ALTER TABLE notification DROP CONSTRAINT IF EXISTS notification_post_id_fkey;'))
            conn.execute(text('ALTER TABLE notification ADD CONSTRAINT notification_post_id_fkey FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.execute(text('ALTER TABLE posttag DROP CONSTRAINT IF EXISTS posttag_post_id_fkey;'))
            conn.execute(text('ALTER TABLE posttag ADD CONSTRAINT posttag_post_id_fkey FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.execute(text('ALTER TABLE bookmark DROP CONSTRAINT IF EXISTS bookmark_post_id_fkey;'))
            conn.execute(text('ALTER TABLE bookmark ADD CONSTRAINT bookmark_post_id_fkey FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.execute(text('ALTER TABLE postview DROP CONSTRAINT IF EXISTS postview_post_id_fkey;'))
            conn.execute(text('ALTER TABLE postview ADD CONSTRAINT postview_post_id_fkey FOREIGN KEY (post_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.execute(text('ALTER TABLE post DROP CONSTRAINT IF EXISTS post_reply_to_id_fkey;'))
            conn.execute(text('ALTER TABLE post ADD CONSTRAINT post_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES post(id) ON DELETE CASCADE;'))
            conn.execute(text('ALTER TABLE updateread DROP CONSTRAINT IF EXISTS updateread_update_id_fkey;'))
            conn.execute(text('ALTER TABLE updateread ADD CONSTRAINT updateread_update_id_fkey FOREIGN KEY (update_id) REFERENCES "update"(id) ON DELETE CASCADE;'))
            
            # Индексы производительности
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_author_created ON post(author_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_message_chat_id_desc ON message(chat_id, id DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_posttag_tag ON posttag(tag_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_notification_user_created ON notification(user_id, created_at DESC);'))
            conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username_lower ON "user" (LOWER(username));'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_user_display_name_lower ON "user" (LOWER(display_name));'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_bookmark_user_created ON bookmark(user_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_like_user_created ON "like"(user_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_follow_follower_followee ON follow(follower_id, followee_id);'))
            
            conn.commit()
            print("✅ Все основные миграции, таблицы и индексы успешно применены")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ STARTUP MIGRATION ERROR: {e}")

    # Отдельный блок для supportticket.updated_at
    with engine.connect() as conn:
        try:
            conn.execute(text("""
            DO $$
            BEGIN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='supportticket' AND column_name='updated_at') THEN
                ALTER TABLE supportticket ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
                UPDATE supportticket SET updated_at = created_at WHERE updated_at IS NULL;
            END IF;
            END $$;
            """))
            conn.commit()
            print("✅ supportticket.updated_at checked/added")
        except Exception as e:
            print(f"⚠️ ALTER TABLE supportticket warning: {e}")
            conn.rollback()

    # Сброс sequence и lowercase usernames
    with engine.connect() as conn:
        try:
            conn.execute(text('UPDATE "user" SET username = LOWER(username) WHERE username != LOWER(username);'))
            conn.execute(text("""SELECT setval(pg_get_serial_sequence('"user"', 'id'), COALESCE((SELECT MAX(id) FROM "user"), 0) + 1, false);"""))
            conn.commit()
            print("✅ User ID sequence reset & usernames lowercased")
        except Exception as e:
            print(f"⚠️ STARTUP SEQUENCE ERROR: {e}")
            
    print("🎉 Сервер полностью готов к работе!")



def _update_last_seen_sync(user_id: int):
    """Синхронная функция для обновления last_seen (выполняется в threadpool)"""
    with Session(engine) as session:
        user = session.get(User, user_id)
        if user:
            user.last_seen = datetime.now(timezone.utc)
            session.add(user)
            session.commit()



@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # 1. Принимаем соединение ПЕРЕД любыми действиями
    await websocket.accept()
    
    # 2. Достаём токен из query-параметров
    token = websocket.query_params.get("token")
    
    # 3. Аутентификация через JWT
    user_id = None
    if token:
        try:
            payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
            user_id = int(payload["sub"])
        except Exception:
            await websocket.close(code=4001, reason="Invalid token")
            return
    
    if not user_id:
        await websocket.close(code=4001, reason="Not authenticated")
        return
    
    # 4. Проверяем пользователя в БД
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user or user.is_banned:
            await websocket.close(code=4003, reason="Banned or not found")
            return
    
    # 5. Подключаем к менеджеру
    await manager.connect(websocket, user_id)
    
    # 6. ✅ ОБНОВЛЯЕМ last_seen БЕЗ блокировки event loop
    await run_in_threadpool(_update_last_seen_sync, user_id)
    
    try:
        # 7. Держим соединение открытым
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
    except WebSocketDisconnect:
        await manager.disconnect(websocket, user_id)
    except Exception as e:
        print(f"❌ WS error for user {user_id}: {e}")
        await manager.disconnect(websocket, user_id)

@app.get("/api/online-count")
def get_online_count(user: User = Depends(get_current_user)):
    """Сколько пользователей сейчас онлайн"""
    return {"count": manager.total_connections}