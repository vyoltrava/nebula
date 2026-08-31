from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile, File, Form, Request, WebSocket, WebSocketDisconnect, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import Session, select, func, col
from sqlalchemy import text, update, delete, case  # 🆕 ДОБАВЛЕНО: case
from typing import Optional, List
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete
from fastapi import BackgroundTasks 
from email.message import EmailMessage

import structlog
import smtplib
import secrets
import jwt
import redis
import sys
import bcrypt
import os
import uuid
import re
import json

# 🛡️ FIX (Windows/cp1251): эмодзи в print() по всему файлу валили процесс
# с UnicodeEncodeError, когда stdout/stderr перенаправлены (сервис, пайпы,
# лог-файлы, Start-Process -RedirectStandardOutput). Форсируем UTF-8 stdio.
# Обратимо: блок можно просто удалить — он не влияет на логику приложения.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    # Нестандартная обёртка stdout (например, reload-воркер uvicorn) — не критично.
    pass
import cloudinary
import cloudinary.uploader
import subprocess
import tempfile
import pyotp
import qrcode
import io
import base64

from link_preview import router as lp_router
from websocket_manager import manager
from validators import validate_upload, check_size_before_read
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse
from cloudinary_config import UPLOAD_FOLDER
from datetime import datetime, timedelta, timezone
from database import init_db, get_session, engine
from models import utcnow
from models import (
    User, Post, Like, Dislike, Follow, Notification, Tag, PostTag, Role,
    Chat, ChatMember, Message, Report, UserKey, ChatSessionKey,
    IPLog, IPBlock, ActionLog, Bookmark, SiteRules, PostView, Update, UpdateRead,
    PushSubscription, StickerPack, Sticker, MessageReaction, PostReaction, Theme, SystemSetting,
    RoleCategory, Warning, LastReadPost, SupportTicket, SupportMessage, Badge,
    CustomBadge, CustomBadgeTemplate, CustomBadgeAssignment, SystemBadge,
    SuggestionCategory, SuggestionThread, SuggestionThreadComment, TeamStatistic, RoleHistory, NickHistory, Suggestion, SuggestionComment, ChatDraft 
    
)
import logging
from fastapi.responses import JSONResponse
from performance import PerfMiddleware, get_perf_summary
import time
import asyncio
from fastapi import Response
from imageio_ffmpeg import get_ffmpeg_exe

import sentry_sdk

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"), # Добавь SENTRY_DSN в .env
    traces_sample_rate=0.1,      # 10% транзакций для трейсинга
    environment=os.getenv("ENV", "development"),
)



ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_AUDIO_EXT = {".mp3", ".wav", ".ogg", ".m4a", ".aac"}
ALLOWED_VIDEO_EXT = {".mp4", ".webm", ".mov", ".mkv"}


# ============================================================
# 🚀 ГЛОБАЛЬНЫЕ КЭШИ (ускоряют работу в разы)
# ============================================================

_ip_block_cache = {}          # ip -> (timestamp, IPBlock|None)
_IP_BLOCK_CACHE_TTL = 300    # 5 минут

_role_cache = {}              # role_id -> (timestamp, Role|None)
_ROLE_CACHE_TTL = 600         # 10 минут

_popular_tags_cache = {}
_POPULAR_TAGS_TTL = 300  # 5 минут

_follow_cache = {}  # (follower_id, followee_id) -> (timestamp, bool)
_FOLLOW_CACHE_TTL = 60  # 1 минута



# ============================================================
# 🌐 ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================

def get_client_ip(request: Request) -> str:
    """Извлекает реальный IP из запроса (с учётом прокси Render/Cloudflare)"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    return request.client.host if request.client else "unknown"


def log_action(
    session: Session,
    actor_id: Optional[int],
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
):
    """Записывает действие в общий лог"""
    log = ActionLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=json.dumps(details, default=str) if details else None,
        ip_address=ip_address,
    )
    session.add(log)


def is_ip_blocked(session: Session, ip: str) -> Optional[IPBlock]:
    """Проверяет, заблокирован ли IP, с кэшированием"""
    now = time.time()

    cached = _ip_block_cache.get(ip)
    if cached:
        cached_time, cached_block = cached
        if now - cached_time < _IP_BLOCK_CACHE_TTL:
            # Проверяем, не истёк ли срок блокировки в кэше
            if cached_block is None:
                return None
            if cached_block.expires_at and cached_block.expires_at < datetime.now(timezone.utc):
                # Истёк — удаляем из кэша и БД
                try:
                    session.delete(cached_block)
                    session.commit()
                except Exception:
                    pass
                _ip_block_cache[ip] = (now, None)
                return None
            return cached_block

    # Запрос в базу
    block = session.exec(
        select(IPBlock).where(IPBlock.ip_address == ip)
    ).first()

    # Проверяем срок действия
    if block and block.expires_at and block.expires_at < datetime.now(timezone.utc):
        session.delete(block)
        session.commit()
        block = None

    _ip_block_cache[ip] = (now, block)
    return block


def get_role_cached(session: Session, role_id: int) -> Optional[Role]:
    """Получает роль из кэша или из базы (ускоряет user_out, permissions, level)"""
    if role_id is None:
        return None

    now = time.time()
    cached = _role_cache.get(role_id)
    if cached:
        cached_time, cached_role = cached
        if now - cached_time < _ROLE_CACHE_TTL:
            return cached_role

    role = session.get(Role, role_id)
    _role_cache[role_id] = (now, role)
    return role


def invalidate_role_cache(role_id: Optional[int] = None):
    """Сбрасывает кэш ролей (вызывать при изменении ролей)"""
    if role_id is None:
        _role_cache.clear()
    else:
        _role_cache.pop(role_id, None)


def invalidate_ip_block_cache(ip: Optional[str] = None):
    """Сбрасывает кэш IP-блоков (вызывать при бане/разбане)"""
    if ip is None:
        _ip_block_cache.clear()
    else:
        _ip_block_cache.pop(ip, None)

def invalidate_follow_cache(follower_id: int, followee_id: int):
    """Сбрасывает кеш подписки"""
    _follow_cache.pop((follower_id, followee_id), None)


async def get_current_user_optional(authorization: str = Header(None), session: Session = Depends(get_session)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id: return None
        return session.get(User, int(user_id))
    except:
        return None

# ============================================================
# 🚀 СОЗДАЁМ ПРИЛОЖЕНИЕ
# ============================================================

app = FastAPI(title="Nebula API")
app.include_router(lp_router, prefix="/api")

@app.on_event("startup")
def print_routes():
    print("=== ЗАРЕГИСТРИРОВАННЫЕ РОУТЫ ===")
    for route in app.routes:
        if hasattr(route, "path"):
            methods = getattr(route, "methods", set())
            print(f"{methods} {route.path}")
    print("=================================")


FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
ENVIRONMENT = os.getenv("ENV", "development")

# 🛡️ CORS: localhost только в development. В production — только доверенный origin.
_cors_origins = [FRONTEND_URL]
if ENVIRONMENT != "production":
    _cors_origins.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time-Ms", "X-Request-Id"],
)


# 🛡️ Redis для защиты от брутфорса и хранения лимитов
REDIS_URL = os.getenv("REDIS_URL", "").strip()

# === ЗАГЛУШКА REDIS ===
class FakeRedis:
    def get(self, *args, **kwargs): return None
    def set(self, *args, **kwargs): return True
    def delete(self, *args, **kwargs): return 1
    def exists(self, *args, **kwargs): return 0
    def expire(self, *args, **kwargs): return True
    def ttl(self, *args, **kwargs): return 0
    def incr(self, *args, **kwargs): return 1
    def pipeline(self): return FakePipeline()
    def ping(self): return True
    def __getattr__(self, name): return lambda *a, **kw: None

class FakePipeline:
    def incr(self, *a, **kw): return self
    def expire(self, *a, **kw): return self
    def execute(self): return []

# Если REDIS_URL пустой или "FAKE" — используем заглушку
if not REDIS_URL or REDIS_URL.upper() == "FAKE" or "localhost" in REDIS_URL:
    print("⚠️ Redis отключен, используем заглушку")
    redis_client = FakeRedis()
    # Для slowapi тоже используем память вместо Redis
    limiter = Limiter(
        key_func=get_remote_address,
        storage_uri="memory://",  # ← заглушка для slowapi
        strategy="moving-window"
    )
else:
    import redis
    if REDIS_URL.startswith("redis://") and "render.com" in REDIS_URL:
        REDIS_URL = REDIS_URL.replace("redis://", "rediss://", 1)
    redis_client = redis.from_url(REDIS_URL, decode_responses=True, ssl_cert_reqs=None)
    limiter = Limiter(
        key_func=get_remote_address,
        storage_uri=REDIS_URL,
        strategy="moving-window"
    )
app.state.limiter = limiter



# Настраиваем structlog
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        # В продакшене пишем JSON, в	dev — красиво в консоль
        structlog.dev.ConsoleRenderer() if os.getenv("ENV") != "production" else structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=False
)
log = structlog.get_logger()

# 🆕 Логируем все необработанные исключения
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # 🛡️ Детали ошибки — только в лог (Sentry/логи), клиенту — общее сообщение
    logging.error(f"❌ Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

app.add_middleware(PerfMiddleware)

# 🚀 Сжатие ответов (JSON-фиды, списки постов/сообщений) — до 70-80% меньше трафика
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=6)


@app.get("/debug/perf")
async def debug_perf():
    return JSONResponse(get_perf_summary())


@app.middleware("http")
async def ip_block_middleware(request: Request, call_next):
    ip = get_client_ip(request)

    # Пропускаем служебные и healthcheck
    if ip in ("127.0.0.1", "testclient") or request.url.path == "/health":
        return await call_next(request)

    # Отдельная сессия только для проверки IP-блоков
    with Session(engine) as session:
        block = is_ip_blocked(session, ip)
        if block:
            return JSONResponse(
                status_code=403,
                content={"detail": f"Ваш IP заблокирован. Причина: {block.reason or 'не указана'}"}
            )

    return await call_next(request)


@app.middleware("http")
async def pwa_headers_middleware(request: Request, call_next):
    """
    PWA/безопасность: единые заголовки для ответов API и статики,
    корректный Cache-Control для uploads (immutable) и динамического API.
    Офлайн-кэширование на стороне SW; здесь не мешаем свежести данных.
    """
    response = await call_next(request)
    path = request.url.path

    # Заголовки безопасности (для случаев, когда бэкенд отвечает напрямую)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=()"

    if path == "/uploads" or path.startswith("/uploads/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif path.startswith("/api/") and request.method in ("GET", "HEAD"):
        # Динамические данные — не кэшируем на HTTP-уровне (кэш управляется SW,
        # чтобы приложение всегда могло показать свежие данные при сети).
        response.headers["Cache-Control"] = "no-store"

    return response


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Слишком много запросов. Подождите немного."},
    )


os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

_raw_secret = os.getenv("SECRET_KEY")
if not _raw_secret or len(_raw_secret) < 48 or _raw_secret.startswith("nebula-super-secret"):
    raise RuntimeError(
        "SECRET_KEY is required (min 48 chars, no default fallback allowed). "
        "Generate with: python scripts/generate_secret.py  или  openssl rand -hex 48"
    )
SECRET = _raw_secret
ALGORITHM = "HS256"

# Типы токенов и время жизни
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))


# ============================================================
# 🔐 АВТОРИЗАЦИЯ
# ============================================================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: int, token_version: int = 0, token_type: str = "access") -> str:
    if token_type == "access":
        exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    else:  # refresh
        exp = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "ver": token_version,
        "type": token_type,
        "exp": exp,
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def set_refresh_cookie(response: Response, user_id: int, token_version: int) -> str:
    """Refresh-токен в httpOnly cookie — недоступен JS, не крадётся через XSS.
    В production фронт и API на разных доменах → SameSite=None + Secure
    (иначе браузер не отправит cookie на кросс-сайтовый /api/auth/refresh).
    Возвращает само значение refresh-токена, чтобы его можно было продублировать
    в теле ответа (для мультиаккаунтного хранилища на фронте)."""
    value = create_token(user_id, token_version, token_type="refresh")
    cross_site = os.getenv("ENV") == "production"
    response.set_cookie(
        key="refresh_token",
        value=value,
        httponly=True,
        secure=cross_site,
        samesite="none" if cross_site else "strict",
        path="/api/auth",
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
    )
    return value


# ============================================================
# 🔄 REFRESH / LOGOUT (httpOnly cookie)
# ============================================================
def _refresh_token_from(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or ""
    if auth.startswith("Bearer refresh:"):
        return auth.split(":", 1)[1]
    return request.cookies.get("refresh_token")


@app.post("/api/auth/refresh")
@limiter.limit("30/minute")
def refresh_access_token(
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
    # 🎯 Привязываем refresh к конкретному пользователю чтобы не выдавать
    # токен чужого аккаунта при переключении между аккаунтами.
            requested_user_id: Optional[int] = Header(default=None, alias="X-User-Id"),
):
    refresh_token = _refresh_token_from(request)
    if not refresh_token:
        raise HTTPException(401, "Refresh token required")

    try:
        payload = jwt.decode(refresh_token, SECRET, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(401, "Invalid refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(401, "Invalid token type")

    token_sub = int(payload["sub"])
    # 🎯 Если клиент просит refresh для другого пользователя — отказ (protect multi-account).
    if requested_user_id is not None and requested_user_id != token_sub:
        raise HTTPException(401, "Refresh token does not match requested user")

    user = session.get(User, token_sub)
    if not user or user.is_banned:
        raise HTTPException(401, "User not found")
    user_token_version = getattr(user, 'token_version', 0)
    if payload.get("ver", 0) != user_token_version:
        raise HTTPException(401, "Session revoked")

    _refresh = set_refresh_cookie(response, user.id, user_token_version)
    return {
        "token": create_token(user.id, user_token_version, token_type="access"),
        "refresh_token": _refresh,
        "user": user_out(user, session),
    }


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response):
    response.delete_cookie("refresh_token", path="/api/auth")
    return {"ok": True}
@app.get("/api/auth/validate")
def auth_validate(request: Request, session: Session = Depends(get_session)):
    """Быстрая проверка сессии для AuthProvider: подтверждает access-токен.
    Токен передаётся в Authorization; refresh-cookie не принимается (только
    диагностически сообщает, живёт ли refresh-сессия)."""
    auth = request.headers.get("authorization") or ""
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "No token")
    token = auth.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(401, "Invalid token")
    if payload.get("type") not in ("access", "refresh"):
        raise HTTPException(401, "Invalid token type")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(401, "Invalid token")
    user = session.get(User, user_id)
    if not user or user.is_banned:
        raise HTTPException(401, "Invalid user")
    if payload.get("ver", 0) != getattr(user, "token_version", 0):
        raise HTTPException(401, "Session revoked")
    return {"valid": True, "user": {"id": user.id, "username": user.username, "display_name": user.display_name}}


def get_current_user(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
    background_tasks: BackgroundTasks = None,  # ← НОВОЕ
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = session.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(401, "User not found")
    user_token_version = getattr(user, 'token_version', 0)
    if payload.get("ver", 0) != user_token_version:
        raise HTTPException(401, "Session revoked")
    if user.is_banned:
        raise HTTPException(403, "Account banned")

    # 🚀 НЕ БЛОКИРУЕМ ОТВЕТ — обновление в фоне
    now = datetime.now(timezone.utc)
    # 🛡 FIX (tz-safe): SQLite возвращает НАИВНЫЙ datetime (без offset), а now — aware.
    # Вычитание смешанных типов давало TypeError и валило 500-й ЛЮБОГО
    # авторизованного REST-запроса пользователя с непустым last_seen
    # (латентный баг вскрыт эндпоинтом /api/ice-servers).
    # Старая строка (для истории):
    #   if not user.last_seen or (now - user.last_seen).total_seconds() > 180:
    last_seen = user.last_seen
    if last_seen is not None and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)  # пишем туда только UTC
    if not last_seen or (now - last_seen).total_seconds() > 180:
        if background_tasks:
            background_tasks.add_task(_update_last_seen_sync, user.id)
        # Убрали session.add(user) и session.commit() отсюда!

    return user

def _update_last_seen_sync(user_id: int):
    """Обновляет last_seen в отдельной транзакции"""
    with Session(engine) as session:
        user = session.get(User, user_id)
        if user:
            user.last_seen = datetime.now(timezone.utc)
            session.add(user)
            session.commit()

    return user


def get_optional_user(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> Optional[User]:
    """Возвращает пользователя, если токен валидный, иначе None"""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.split(" ", 1)[1]

    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    except Exception:
        return None

    user = session.get(User, int(payload["sub"]))
    if not user or user.is_banned:
        return None

    return user


# ============================================================
# 🗑️ ОПТИМИЗИРОВАННОЕ УДАЛЕНИЕ ПОСТА
# ============================================================

async def cascade_delete_post(post_id: int, session: Session):
    """Асинхронная версия — НЕ блокирует Event Loop при Cloudinary"""
    # 1. BFS — оставляем как было
    ids_to_clean = {post_id}
    queue = [post_id]
    while queue:
        current_id = queue.pop(0)
        children = session.exec(
            select(Post.id).where(Post.reply_to_id == current_id)
        ).all()
        for child_id in children:
            if child_id not in ids_to_clean:
                ids_to_clean.add(child_id)
                queue.append(child_id)
    id_list = list(ids_to_clean)

    posts_with_media = session.exec(
        select(Post).where(Post.id.in_(id_list))
    ).all()

    # 2. Массовые DELETE (ОПТИМИЗАЦИЯ 1)
    session.exec(delete(Like).where(Like.post_id.in_(id_list)))
    session.exec(delete(PostReaction).where(PostReaction.post_id.in_(id_list)))
    session.exec(delete(Dislike).where(Dislike.post_id.in_(id_list)))
    session.exec(delete(PostTag).where(PostTag.post_id.in_(id_list)))
    session.exec(delete(Notification).where(Notification.post_id.in_(id_list)))
    session.exec(delete(Bookmark).where(Bookmark.post_id.in_(id_list)))
    session.exec(delete(PostView).where(PostView.post_id.in_(id_list)))
    session.exec(delete(LastReadPost).where(LastReadPost.post_id.in_(id_list)))

    # Обнуляем repost_of_id
    reposts_to_detach = session.exec(
        select(Post).where(Post.repost_of_id.in_(id_list))
    ).all()
    for rp in reposts_to_detach:
        rp.repost_of_id = None
        session.add(rp)

    # 3. 🚀 УДАЛЕНИЕ МЕДИА ЧЕРЕЗ THREAD POOL
    for post in posts_with_media:
        if post.media_url:
            if "cloudinary.com" in post.media_url:
                try:
                    public_id = extract_cloudinary_public_id(post.media_url)
                    if public_id:
                        await run_in_threadpool(
                            cloudinary.uploader.destroy,
                            public_id,
                            resource_type="auto"
                        )
                except Exception:
                    pass
            else:
                file_path = os.path.join("uploads", post.media_url.split("/")[-1])
                if os.path.exists(file_path):
                    try:
                        await run_in_threadpool(os.remove, file_path)
                    except Exception:
                        pass

    # 4. Удаляем корневой пост
    root_post = session.get(Post, post_id)
    if root_post:
        session.delete(root_post)
    
    session.commit()
    return len(ids_to_clean)


# ============================================================
# 🛡️ ПРАВА И ИЕРАРХИЯ
# ============================================================

ALL_PERMISSIONS = [
    "delete_posts",
    "ban_users",
    "remove_avatars",
    "assign_moderator",
    "manage_roles",
    "manage_users",
    "manage_reports",
    "tech_access",
    "delete_users",
    "manage_stickers",        # 🆕 Управление стикерами
    "pin_messages",           # 🆕 Закрепление сообщений в любых чатах
    "edit_posts",             # 🆕 Редактирование чужих постов
    "manage_groups",          # 🆕 Администрирование любых групп
    "manage_announcements",   # 🆕 Публикация объявлений
    "warn_users",             # 🆕 Выдача предупреждений
    "manage_support",   # 🆕 Чат поддержки
    "assign_roles",  
    "manage_team_stats",
    "manage_suggestions", 
]

MODERATOR_PERMISSIONS = ALL_PERMISSIONS.copy()
# ============================================================
# 📋 РЕЕСТР ПРАВ (ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ)
# label + категория используются для /api/permissions (UI),
# set(VALID_PERMISSIONS) — для валидации прав при создании/правке ролей.
# ============================================================
PERMISSION_LABELS: dict = {
    # === Контент ===
    "delete_posts":         ("Удалять посты", "content"),
    "edit_posts":           ("Редактировать чужие посты", "content"),
    "remove_avatars":       ("Удалять аватарки", "content"),
    "manage_stickers":      ("Управлять стикер-паками", "content"),
    "manage_announcements": ("Публиковать объявления", "content"),
    "manage_suggestions":   ("Управлять форумом предложений", "content"),
    # === Пользователи ===
    "ban_users":            ("Банить пользователей", "users"),
    "warn_users":           ("Выдавать предупреждения", "users"),
    "delete_users":         ("Удалять пользователей", "users"),
    "assign_moderator":     ("Назначать разработчиков", "users"),
    "assign_roles":         ("Назначать роли своего отдела", "users"),
    # === Чаты и группы ===
    "pin_messages":         ("Закреплять сообщения везде", "chats"),
    "manage_groups":        ("Администрировать любые группы", "chats"),
    "manage_support":       ("Чат поддержки", "chats"),
    # === Система ===
    "manage_roles":         ("Управлять ролями", "system"),
    "manage_users":         ("Доступ к панели управления", "system"),
    "manage_reports":       ("Управление жалобами", "system"),
    "tech_access":          ("Технический доступ", "system"),
    "manage_team_stats":    ("Статистика команды и предложения", "system"),
}

VALID_PERMISSIONS = set(ALL_PERMISSIONS)


def parse_and_validate_permissions(raw: Optional[str]) -> list:
    """Парсит JSON-строку прав и возвращает валидный дедуплицированный список.

    Кидает 400 при невалидном JSON или неизвестном праве — защита от
    опечаток и «мёртвых» прав, которые сервер никогда не проверяет.
    """
    cleaned = (raw or "").strip()
    if not cleaned:
        return []
    try:
        perms = json.loads(cleaned)
    except Exception:
        raise HTTPException(400, "permissions: невалидный JSON-массив")
    if not isinstance(perms, list):
        raise HTTPException(400, "permissions: ожидается массив строк")

    perms = [str(p).strip() for p in perms if str(p).strip()]
    invalid = sorted({p for p in perms if p not in VALID_PERMISSIONS})
    if invalid:
        raise HTTPException(400, f"Неизвестные права: {', '.join(invalid)}")

    seen = set()
    result = []
    for p in perms:
        if p not in seen:
            seen.add(p)
            result.append(p)
    return result


def require_staff(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    user = get_current_user(authorization=authorization, session=session)
    perms = get_user_permissions(user, session)
    if not perms:
        raise HTTPException(403, "Staff only")
    return user


def require_admin(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    user = get_current_user(authorization=authorization, session=session)
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    return user


def get_user_permissions(user: User, session: Session) -> list:
    """Получает разрешения пользователя (использует кэш ролей)"""
    if user.is_admin or user.is_trelod:
        return ALL_PERMISSIONS.copy()

    permissions = []

    if user.is_moderator:
        permissions.extend(MODERATOR_PERMISSIONS)

    if user.role_id:
        role = get_role_cached(session, user.role_id)  # ← БЫЛО session.get
        if role:
            try:
                role_perms = json.loads(role.permissions)
                for p in role_perms:
                    if p not in permissions:
                        permissions.append(p)
            except Exception:
                pass

    return permissions


def has_permission(user: User, permission: str, session: Session) -> bool:
    if user.is_admin:
        return True
    return permission in get_user_permissions(user, session)


def get_user_level(user: User, session: Session = None) -> int:
    if user.username == "trelod":
        return 11  # Официальный аккаунт — высший уровень
    if user.is_admin:
        return 10
    if user.is_moderator:
        return 9
    if user.role_id:
        try:
            role = get_role_cached(session, user.role_id) if session else None
            if role and role.level:
                return role.level
        except Exception:
            # Роль в кэше стала detached — перезагружаем
            if session:
                try:
                    fresh = session.get(Role, user.role_id)
                    if fresh and fresh.level:
                        return fresh.level
                except Exception:
                    pass
    return 1


def can_moderate(actor: User, target: User, session: Session) -> bool:
    """Может ли actor применять санкции к target"""
    return get_user_level(actor, session) > get_user_level(target, session)


def max_level_for(actor: User, session: Session) -> int:
    """Максимальный уровень роли, которую может создавать/редактировать пользователь"""
    if actor.is_admin:
        return 11
    actor_lvl = get_user_level(actor, session)
    return actor_lvl - 1


def check_hierarchy_or_403(actor: User, target: User, session: Session, action: str = "этого"):
    """Проверяет иерархию и выбрасывает 403, если нельзя"""
    # Админ может управлять Системой в обход иерархии
    if target.is_trelod and actor.is_admin:
        return 
        
    actor_lvl = get_user_level(actor, session)
    target_lvl = get_user_level(target, session)
    if target_lvl >= actor_lvl:
        raise HTTPException(
            status_code=403,
            detail=f"🛡️ Иммунитет: уровень цели ({target_lvl}) ≥ вашего ({actor_lvl}). Вы не можете {action}.",
        )


def protect_system_account(target: User, actor: User = None, action: str = "этого"):
    """Защищает официальный аккаунт @trelod, но позволяет Admin (Founder) управлять им"""
    if target.username == "trelod":
        # Если действие выполняет Админ — разрешаем
        if actor and actor.is_admin:
            return
        raise HTTPException(
            status_code=403,
            detail=f"🛡️ Официальный аккаунт @trelod нельзя {action}.",
        )


def check_sanction_rights(actor: User, target: User, session: Session, action: str = "применять санкции к этому пользователю"):
    """
    ЕДИНАЯ проверка иммунитета для ВСЕХ санкций:
    - Founder (is_admin, lvl 10) может всё и ко всем (даже к System lvl 11)
    - Founder / Developer / System неприкосновенны для всех, КРОМЕ Founder
    - Остальные — иерархия: уровень актора СТРОГО выше уровня цели
    """
    if actor.is_admin:
        return  # Founder может всё
    if target.is_admin or target.is_moderator or target.username == "trelod":
        raise HTTPException(
            status_code=403,
            detail=f"🛡️ Иммунитет: только Founder может {action}.",
        )
    actor_lvl = get_user_level(actor, session)
    target_lvl = get_user_level(target, session)
    if target_lvl >= actor_lvl:
        raise HTTPException(
            status_code=403,
            detail=f"🛡️ Иммунитет: уровень цели ({target_lvl}) ≥ вашего ({actor_lvl}). Вы не можете {action}.",
        )


def user_out(user: User, session: Session = None, preloaded: tuple = None) -> dict:
    """Сериализует пользователя в dict (использует кэш ролей).

    preloaded — результат batch_get_users() для этого пользователя
    (assignment_dict | None, system_badge_dict | None). Позволяет избежать
    N+1 запросов при сериализации списков пользователей.
    """
    role_data = None
    permissions = []

    if session:
        permissions = get_user_permissions(user, session)
        if user.role_id:
            role = get_role_cached(session, user.role_id)  # ← БЫЛО session.get
            if role:
                try:
                    role_data = {
                        "id": role.id,
                        "name": role.name,
                        "color": role.color,
                        "level": role.level,
                        "permissions": json.loads(role.permissions),
                        "two_fa_enabled": bool(user.totp_enabled),
                    }
                except Exception:
                    role_data = None

    result = {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "is_admin": user.is_admin,
        "is_moderator": user.is_moderator,
        "is_banned": user.is_banned,
        "is_trelod": user.is_trelod,
        "role": role_data,
        "permissions": permissions,
        "level": get_user_level(user, session) if session else 1,
        "bio": user.bio,
        "last_seen": user.last_seen.isoformat() if user.last_seen else None,
        "cover_url": user.cover_url,
        "two_fa_enabled": user.totp_enabled,  # 🆕
        "email_linked": bool(user.email),      # 🆕
        "selected_badge_id": user.selected_badge_id,
        "custom_badge_url": user.custom_badge_url,  # 🆕

    }
   
    #  Системная плашка (уровни 9-11) + активная кастомная плашка
    if session:
        if preloaded is not None:
            result["active_custom_badge_assignment"] = preloaded[0]
            result["system_badge"] = preloaded[1]
        else:
            result["active_custom_badge_assignment"] = get_active_custom_badge_for(user.id, session)
            result["system_badge"] = get_system_badge_for(get_user_level(user, session), session)

    return result


def batch_get_users(users: list, session: Session) -> dict:
    """Batch-предзагрузка данных для списка пользователей (устраняет N+1 в user_out).

    Вместо ~6 запросов на каждого пользователя — 4-5 запросов на весь список:
      1) роли (прогрев кэша ролей → permissions/level без запросов);
      2) активные кастомные плашки;
      3) сами плашки + выдавшие их пользователи;
      4) системные плашки (levels 9-11).

    Возвращает {user_id: (assignment_dict | None, system_badge_dict | None)}.
    Результат передаётся в user_out(user, session, preloaded=...).
    """
    from collections import defaultdict

    if not users:
        return {}

    user_ids = [u.id for u in users]

    # 1. Роли одним запросом → прогрев кэша ролей
    role_ids = {u.role_id for u in users if u.role_id}
    if role_ids:
        _now = time.time()
        for r in session.exec(select(Role).where(Role.id.in_(role_ids))).all():
            _role_cache[r.id] = (_now, r)

    # 2. Активные назначения кастомных плашек одним запросом
    assigns = session.exec(
        select(CustomBadgeAssignment).where(
            CustomBadgeAssignment.user_id.in_(user_ids),
            CustomBadgeAssignment.is_active == True,  # noqa: E712
        ).order_by(CustomBadgeAssignment.override_priority.desc(), CustomBadgeAssignment.id.desc())
    ).all()

    badge_ids = {a.badge_id for a in assigns if a.badge_id}
    badges = (
        {b.id: b for b in session.exec(select(CustomBadge).where(CustomBadge.id.in_(badge_ids))).all()}
        if badge_ids else {}
    )

    issuer_ids = {a.granted_by for a in assigns if a.granted_by}
    issuers = (
        {u.id: u for u in session.exec(select(User).where(User.id.in_(issuer_ids))).all()}
        if issuer_ids else {}
    )
    users_by_id = {u.id: u for u in users}

    _now_utc = datetime.now(timezone.utc)
    assign_map = defaultdict(list)
    for a in assigns:
        if a.expires_at and a.expires_at < _now_utc:
            continue
        badge = badges.get(a.badge_id)
        if badge and badge.is_active:
            assign_map[a.user_id].append(a)

    # 3. Системные плашки одним запросом
    levels = {get_user_level(u, session) for u in users} & {9, 10, 11}
    sys_map = {}
    if levels:
        for b in session.exec(select(SystemBadge).where(SystemBadge.level.in_(levels))).all():
            if b.is_active:
                sys_map[b.level] = _system_badge_out(b)

    def _assignment_out_batch(a: CustomBadgeAssignment) -> dict:
        badge = badges.get(a.badge_id)
        user = users_by_id.get(a.user_id)
        issuer = issuers.get(a.granted_by)
        return {
            "id": a.id,
            "user_id": a.user_id,
            "badge_id": a.badge_id,
            "badge": _badge_out(badge) if badge else None,
            "granted_by": a.granted_by,
            "granted_at": a.granted_at.isoformat() if a.granted_at else None,
            "expires_at": a.expires_at.isoformat() if a.expires_at else None,
            "is_active": a.is_active,
            "custom_message": a.custom_message,
            "override_priority": a.override_priority,
            "is_expired": a.is_expired,
            "user_avatar": user.avatar_url if user else None,
            "user_display_name": user.display_name if user else None,
            "user_username": user.username if user else None,
            "issuer_name": issuer.display_name if issuer else None,
        }

    preloaded = {}
    for u in users:
        lst = assign_map.get(u.id)
        preloaded[u.id] = (
            _assignment_out_batch(lst[0]) if lst else None,
            sys_map.get(get_user_level(u, session)),
        )
    return preloaded


def resolve_user(identifier: str, session: Session) -> User:
    """Находит пользователя по ID (цифры) или username (строка)"""
    if identifier.isdigit():
        user = session.get(User, int(identifier))
    else:
        clean = identifier.lstrip("@").lower()
        user = session.exec(
            select(User).where(func.lower(User.username) == clean)
        ).first()
    if not user:
        raise HTTPException(404, "User not found")
    return user


# ============================================================
# 🛠️ УТИЛИТЫ
# ============================================================

def extract_cloudinary_public_id(url: str) -> Optional[str]:
    try:
        parts = url.split("/upload/")
        if len(parts) < 2:
            return None
        path = parts[1]
        if "/" in path:
            path_parts = path.split("/")
            path_parts = [p for p in path_parts if not p.startswith("v") or not p[1:].isdigit()]
            path = "/".join(path_parts)
        public_id = os.path.splitext(path)[0]
        return public_id
    except Exception:
        return None


def get_author_role(user: User, session: Session) -> Optional[dict]:
    """Получает роль автора для отображения (использует кэш)"""
    if user.role_id:
        role = get_role_cached(session, user.role_id)  # ← БЫЛО session.get
        if role:
            return {"name": role.name, "color": role.color, "level": role.level}
    return None


def extract_tags(text: str) -> list:
    return list({t.lower() for t in re.findall(r"#(\w+)", text)})


def extract_mentions(text: str) -> list:
    return list({m.lower() for m in re.findall(r"@(\w+)", text)})





class RegisterIn(BaseModel):
    username: str
    display_name: str
    password: str

    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[a-z0-9_]{3,30}$", v):
            raise ValueError("Username: 3-30 символов, только латиница, цифры и _")
        return v


class LoginIn(BaseModel):
    username: str
    password: str


class PostIn(BaseModel):
    text: str


class PostOut(BaseModel):
    id: int
    author_id: int
    author: str
    handle: str
    author_avatar: Optional[str] = None
    author_is_admin: bool = False
    author_is_moderator: bool = False
    author_is_banned: bool = False
    author_role: Optional[dict] = None
    text: str
    media_url: Optional[str] = None
    likes_count: int = 0
    liked_by_me: bool = False
    dislikes_count: int = 0
    disliked_by_me: bool = False
    replies_count: int = 0
    created_at: datetime  # когда пост создан
    bookmarked_by_me: bool = False  # в закладках ли у меня
    author_level: int = 1  # уровень автора
    author_bio: Optional[str] = None  # био автора


class UpdateUserIn(BaseModel):
    display_name: str
    bio: Optional[str] = None


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str



@app.get("/health")
def health_check():
    return {"status": "ok", "service": "nebula-api"}

# PWA: версия приложения/SW — клиент опрашивает перед принудительным update(),
# чтобы не дёргать сеть вхолостую и показывать актуальный баннер обновления.
@app.get("/api/pwa/version")
def pwa_version():
    return {
        "service": "nebula-api",
        "version": "2.0.0",
        "manifest": "/manifest.json",
        "sw": "/sw.js",
        "offline_page": "/offline.html",
        "periodic_sync_tag": "nebula-periodic-update",
        "last_updated": "2026-08-30",
    }

@app.post("/api/register")
@limiter.limit("5/minute")
def register(request: Request, data: RegisterIn, session: Session = Depends(get_session)):
    username = data.username.strip().lower()
    if not re.match(r"^[a-z0-9_]{3,30}$", username):
        raise HTTPException(400, "Username: 3-30 символов, только латиница, цифры и _")
    existing = session.exec(
        select(User).where(func.lower(User.username) == username)
    ).first()
    if existing:
        raise HTTPException(400, "Username already taken")
    user = User(
        username=username,
        display_name=data.display_name,
        password_hash=hash_password(data.password),
        
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    ensure_user_has_keys(user.id, session)
        # Логируем IP регистрации
    ip = get_client_ip(request)
    session.add(IPLog(user_id=user.id, ip_address=ip, user_agent=request.headers.get("user-agent"), action="register"))
    session.commit()
    user_token_version = getattr(user, 'token_version', 0)
    return {"token": create_token(user.id, user_token_version), "user": user_out(user, session)}



@app.post("/api/me/logout-all")
def logout_all(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user.token_version = getattr(user, "token_version", 0) + 1  # все старые токены становятся невалидными
    session.add(user)
    session.commit()
    return {"ok": True}


@app.get("/api/me")
def me(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return user_out(user, session)


@app.patch("/api/me")
def update_profile(
    data: UpdateUserIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    old_name = user.display_name
    user.display_name = data.display_name
    if data.bio is not None:
        user.bio = data.bio.strip()[:500] if data.bio.strip() else None
    session.add(user)
    session.add(NickHistory(
        user_id=user.id,
        field="display_name",
        old_value=old_name or "",
        new_value=data.display_name or "",
        changed_by=user.id,  # сам себе
    ))
    session.commit()
    session.refresh(user)
    return user_out(user, session)


@app.post("/api/me/password")
@limiter.limit("5/minute")
def change_password(
    request: Request,
    data: ChangePasswordIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not check_password(data.old_password, user.password_hash):
        raise HTTPException(400, "Неверный старый пароль")
    if len(data.new_password) < 6:
        raise HTTPException(400, "Пароль должен быть не менее 6 символов")
    user.password_hash = hash_password(data.new_password)
    session.add(user)
    session.commit()
    return {"ok": True}

@app.get("/api/me/live-text-settings")
def get_live_text_settings(
    user: User = Depends(get_current_user),
):
    """🆕 Настройки живых сообщений"""
    return {
        "enabled": bool(user.live_text_enabled),
        "broadcast": bool(user.live_text_broadcast),
    }

@app.post("/api/me/live-text-settings")
def set_live_text_settings(
    enabled: Optional[bool] = Form(None),
    broadcast: Optional[bool] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """🆕 Обновление настроек живых сообщений"""
    if enabled is not None:
        user.live_text_enabled = enabled
    if broadcast is not None:
        user.live_text_broadcast = broadcast
    session.add(user)
    session.commit()
    return {"ok": True, "enabled": bool(user.live_text_enabled), "broadcast": bool(user.live_text_broadcast)}


@app.post("/api/me/avatar")
@limiter.limit("5/minute")
async def upload_avatar(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    print(f"\n📸 === AVATAR UPLOAD START ===")
    print(f"  filename: {file.filename}")
    print(f"  content_type: {file.content_type}")
    print(f"  size: {file.size}")
    
    if not file.filename:
        print(f"  ❌ No filename")
        raise HTTPException(400, "No file provided")
    
    ext = os.path.splitext(file.filename)[1].lower()
    print(f"  extension: {ext}")
    
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        print(f"  ❌ Invalid extension: {ext}")
        raise HTTPException(400, f"Неверный формат файла: {ext}. Поддерживаются: .jpg, .jpeg, .png, .gif, .webp")
    
    content = await file.read()
    actual_size = len(content)
    print(f"  actual_size: {actual_size} bytes ({actual_size / (1024*1024):.2f} MB)")

    # 🛡️ Magic bytes check: real file type, not client-declared extension
    ok, verr = validate_upload(content[:16], file.filename, file.content_type,
                               allowed_categories={"image"},
                               allowed_exts={".jpg", ".jpeg", ".png", ".gif", ".webp"})
    if not ok:
        raise HTTPException(400, verr)
    
    if actual_size > 5 * 1024 * 1024:
        print(f"  ❌ File too large: {actual_size} bytes")
        raise HTTPException(400, f"Файл слишком большой: {actual_size / (1024*1024):.1f} МБ (максимум 5 МБ)")
    
    print(f"  ✅ File validation passed")
    
    # Удаляем старую аватарку
    if user.avatar_url and "cloudinary.com" in user.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(user.avatar_url)
            if public_id:
                print(f"  Deleting old avatar: {public_id}")
                cloudinary.uploader.destroy(public_id)
        except Exception as e:
            print(f"  ⚠️ Failed to delete old avatar: {e}")
    
    # Загружаем новую
    try:
        print(f"  Uploading to Cloudinary...")
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder=UPLOAD_FOLDER,
                resource_type="image",
                transformation=[{"width": 400, "height": 400, "crop": "fill"}],
            )
        )
        user.avatar_url = result.get("secure_url")
        print(f"  ✅ Cloudinary upload success: {user.avatar_url}")
    except Exception as e:
        print(f"  ❌ Cloudinary upload failed: {e}")
        raise HTTPException(400, f"Ошибка загрузки на сервер: {str(e)}")
    
    session.add(user)
    session.commit()
    session.refresh(user)
    print(f"📸 === AVATAR UPLOAD END ===\n")
    return {"avatar_url": user.avatar_url}


@app.post("/api/me/cover")
@limiter.limit("5/minute")
async def upload_cover(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not file.filename:
        raise HTTPException(400, "No file provided")
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(400, f"Неверный формат: {ext}. GIF для обложки не поддерживается.")

    # 🛡️ Проверяем размер ДО чтения + magic bytes
    err = check_size_before_read(file.headers, 10 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)

    err = check_size_before_read(file.headers, 10 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, f"Файл слишком большой (максимум 10 МБ)")

    ok, verr = validate_upload(content[:16], file.filename, file.content_type,
                               allowed_categories={"image"},
                               allowed_exts={".jpg", ".jpeg", ".png", ".webp"})
    if not ok:
        raise HTTPException(400, verr)
    
    # Удаляем старую обложку
    if user.cover_url and "cloudinary.com" in user.cover_url:
        try:
            public_id = extract_cloudinary_public_id(user.cover_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    
    # Загружаем новую (широкий формат 1500x500)
    try:
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder=UPLOAD_FOLDER,
                resource_type="image",
                transformation=[{"width": 1500, "height": 500, "crop": "fill"}],
            )
        )
        user.cover_url = result.get("secure_url")
    except Exception as e:
        raise HTTPException(400, f"Ошибка загрузки: {str(e)}")
    
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return {"cover_url": user.cover_url}


@app.delete("/api/me/cover")
def remove_cover(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удалить обложку профиля"""
    if user.cover_url and "cloudinary.com" in user.cover_url:
        try:
            public_id = extract_cloudinary_public_id(user.cover_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    
    user.cover_url = None
    session.add(user)
    session.commit()
    return {"ok": True}


@app.get("/api/users/recommended")
def recommended_users(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    followed_ids = set(session.exec(
        select(Follow.followee_id).where(Follow.follower_id == user.id)
    ).all())

    query = (
        select(User, func.count(Follow.follower_id).label("followers_count"))
        .outerjoin(Follow, Follow.followee_id == User.id)
        .where(
            User.is_banned == False,
            User.id != user.id,
            ~User.id.in_(followed_ids)
        )
        .group_by(User.id)
        .order_by(func.count(Follow.follower_id).desc())
        .limit(5)
    )

    results = session.exec(query).all()

    _pre = batch_get_users([u for u, _ in results], session)
    return [
        {**user_out(user_obj, session, _pre.get(user_obj.id)), "followers_count": count}
        for user_obj, count in results
    ]

@app.get("/api/users")
def search_users_by_query(
    q: str = "",
    limit: int = 20,
    session: Session = Depends(get_session),
):
    """Поиск пользователей и постов по query-параметру"""
    if not q.strip():
        return {"users": [], "posts": []}

    pattern = f"%{q.strip().lower()}%"
    users = session.exec(
        select(User)
        .where(
            User.username.ilike(pattern) | User.display_name.ilike(pattern)  # 🚀 ilike вместо func.lower().like()
        )
        .limit(limit)
    ).all()

    # Поиск постов
    posts = session.exec(
        select(Post)
        .where(
            func.lower(Post.text).like(pattern),
            Post.reply_to_id == None,
        )
        .order_by(Post.created_at.desc())
        .limit(limit)
    ).all()

    _pre = batch_get_users(users, session)
    if not posts:
        return {
            "users": [user_out(u, session, _pre.get(u.id)) for u in users],
            "posts": []
        }

    # Массовые запросы вместо N+1
    post_ids = [p.id for p in posts]
    author_ids = list({p.author_id for p in posts})

    authors = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(author_ids))
        ).all()
    }

    likes_counts = dict(session.exec(
        select(Like.post_id, func.count(Like.id))
        .where(Like.post_id.in_(post_ids))
        .group_by(Like.post_id)
    ).all())

    replies_counts = dict(session.exec(
        select(Post.reply_to_id, func.count(Post.id))
        .where(Post.reply_to_id.in_(post_ids))
        .group_by(Post.reply_to_id)
    ).all())

    result_posts = []
    for p in posts:
        author = authors.get(p.author_id)
        result_posts.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "author_avatar": author.avatar_url if author else None,
            "author_is_admin": author.is_admin if author else False,
            "author_is_moderator": author.is_moderator if author else False,
            "author_is_banned": author.is_banned if author else False,
            "author_role": get_author_role(author, session) if author else None,
            "text": p.text,
            "media_url": p.media_url,
            "likes_count": likes_counts.get(p.id, 0),
            "liked_by_me": False,
            "dislikes_count": 0,
            "disliked_by_me": False,
            "replies_count": replies_counts.get(p.id, 0),
            "media_type": p.media_type,  # 🆕
        })

    _pre = batch_get_users(users, session)
    return {
        "users": [user_out(u, session, _pre.get(u.id)) for u in users],
        "posts": result_posts
    }


@app.post("/api/users/{identifier}/follow")
@limiter.limit("20/minute")
def toggle_follow(
    request: Request,
    identifier: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    target = resolve_user(identifier, session)
    if target.id == user.id:
        raise HTTPException(400, "Cannot follow yourself")
    existing = session.exec(
        select(Follow).where(Follow.follower_id == user.id, Follow.followee_id == target.id)
    ).first()
    if existing:
        session.delete(existing)
        session.commit()
        invalidate_follow_cache(user.id, target.id)  # 🔥 Сбрасываем кеш
        return {"following": False}
    follow = Follow(follower_id=user.id, followee_id=target.id)
    session.add(follow)
    notif = Notification(user_id=target.id, actor_id=user.id, type="follow")
    session.add(notif)
    session.commit()
    invalidate_follow_cache(user.id, target.id)  # 🔥 Сбрасываем кеш
    return {"following": True}


@app.get("/api/users/{identifier}/is-following")
def is_following(
    identifier: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    target = resolve_user(identifier, session)
    cache_key = (user.id, target.id)
    
    # Проверяем кеш
    now = time.time()
    cached = _follow_cache.get(cache_key)
    if cached:
        cached_time, cached_val = cached
        if now - cached_time < _FOLLOW_CACHE_TTL:
            return {"following": cached_val}
    
    existing = session.exec(
        select(Follow).where(Follow.follower_id == user.id, Follow.followee_id == target.id)
    ).first()
    result = existing is not None
    
    _follow_cache[cache_key] = (now, result)
    return {"following": result}


@app.get("/api/users/{identifier}")
def get_user_profile(identifier: str, session: Session = Depends(get_session)):
    user = resolve_user(identifier, session)
    followers_count = session.exec(
        select(func.count()).select_from(Follow).where(Follow.followee_id == user.id)
    ).one()
    following_count = session.exec(
        select(func.count()).select_from(Follow).where(Follow.follower_id == user.id)
    ).one()
    posts_count = session.exec(
        select(func.count()).select_from(Post)
        .where(Post.author_id == user.id, Post.reply_to_id == None)
    ).one()
    return {
        **user_out(user, session),
        "followers_count": followers_count,
        "following_count": following_count,
        "posts_count": posts_count,
    }





@app.get("/api/users/by-username/{username}")
def get_user_by_username(username: str, session: Session = Depends(get_session)):
    """Получить профиль пользователя по username (без @)"""
    # Убираем @ если пользователь передал с ним
    clean_username = username.lstrip("@").lower()
    
    user = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not user:
        raise HTTPException(404, "User not found")
    
    # Возвращаем те же данные, что и обычный профиль
    followers_count = session.exec(
        select(func.count()).select_from(Follow).where(Follow.followee_id == user.id)
    ).one()
    following_count = session.exec(
        select(func.count()).select_from(Follow).where(Follow.follower_id == user.id)
    ).one()
    posts_count = session.exec(
        select(func.count()).select_from(Post)
        .where(Post.author_id == user.id, Post.reply_to_id == None)
    ).one()
    
    return {
        **user_out(user, session),
        "followers_count": followers_count,
        "following_count": following_count,
        "posts_count": posts_count,
    }


@app.get("/api/users/{identifier}/posts")
def get_user_posts(
    identifier: str,
    cursor: Optional[int] = None,
    limit: int = 20,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    user = resolve_user(identifier, session)
    query = (
        select(Post)
        .where(Post.author_id == user.id, Post.reply_to_id == None)
        .order_by(Post.created_at.desc())
    )
    if cursor:
        last_post = session.get(Post, cursor)
        if last_post:
            # 🚀 Учитываем одинаковое время создания
            query = query.where(
                (Post.created_at < last_post.created_at) |
                ((Post.created_at == last_post.created_at) & (Post.id < last_post.id))
            )

    posts = session.exec(query.limit(limit)).all()

    if not posts:
        return {"posts": [], "has_more": False, "next_cursor": None}

    # Массовые запросы вместо N+1
    post_ids = [p.id for p in posts]
    author_ids = list({p.author_id for p in posts})

    authors = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(author_ids))
        ).all()
    }

    likes_counts = dict(session.exec(
        select(Like.post_id, func.count(Like.id))
        .where(Like.post_id.in_(post_ids))
        .group_by(Like.post_id)
    ).all())

    replies_counts = dict(session.exec(
        select(Post.reply_to_id, func.count(Post.id))
        .where(Post.reply_to_id.in_(post_ids))
        .group_by(Post.reply_to_id)
    ).all())

    dislikes_counts = dict(session.exec(
        select(Dislike.post_id, func.count(Dislike.id))
        .where(Dislike.post_id.in_(post_ids))
        .group_by(Dislike.post_id)
    ).all())

    # 🆕 Загрузка лайков и дизлайков текущего пользователя (viewer)
    liked_ids = set()
    disliked_ids = set()
    if viewer:
        liked_ids = set(session.exec(
            select(Like.post_id).where(Like.user_id == viewer.id, Like.post_id.in_(post_ids))
        ).all())
        disliked_ids = set(session.exec(
            select(Dislike.post_id).where(Dislike.user_id == viewer.id, Dislike.post_id.in_(post_ids))
        ).all())

    # 🆕 Массовая загрузка оригинальных постов для репостов
    repost_ids = list({p.repost_of_id for p in posts if p.repost_of_id})
    originals_map = {}
    if repost_ids:
        orig_posts = session.exec(select(Post).where(Post.id.in_(repost_ids))).all()
        orig_author_ids = {p.author_id for p in orig_posts}
        orig_authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(orig_author_ids))).all()}
        for op in orig_posts:
            originals_map[op.id] = {
                "id": op.id,
                "author_id": op.author_id,
                "author": orig_authors.get(op.author_id),
                "text": op.text,
                "media_url": op.media_url,
                "created_at": op.created_at.isoformat(),
                "media_type": op.media_type,  # 🆕
            }

    result = []
    for p in posts:
        author = authors.get(p.author_id)
        
        # 🆕 Формируем данные репоста/цитаты
        repost_data = None
        is_repost = False
        is_quote = False
        if p.repost_of_id:
            orig = originals_map.get(p.repost_of_id)
            if orig:
                orig_author = orig["author"]
                repost_data = {
                    "id": orig["id"],
                    "author_id": orig["author_id"],
                    "author": orig_author.display_name if orig_author else "Удалённый пользователь",
                    "handle": f"@{orig_author.username}" if orig_author else "@deleted",
                    "author_avatar": orig_author.avatar_url if orig_author else None,
                    "author_is_admin": orig_author.is_admin if orig_author else False,
                    "author_is_moderator": orig_author.is_moderator if orig_author else False,
                    "author_role": get_author_role(orig_author, session) if orig_author else None,
                    "text": orig["text"],
                    "media_url": orig["media_url"],
                    "created_at": orig["created_at"],
                }
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())
            else:
                # Оригинал был удалён
                repost_data = {"deleted": True}
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())

        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "author_avatar": author.avatar_url if author else None,
            "author_is_admin": author.is_admin if author else False,
            "author_is_moderator": author.is_moderator if author else False,
            "author_is_banned": author.is_banned if author else False,
            "author_role": get_author_role(author, session) if author else None,
            "text": p.text,
            "media_url": p.media_url,
            "likes_count": likes_counts.get(p.id, 0),
            "liked_by_me": p.id in liked_ids,
            "dislikes_count": dislikes_counts.get(p.id, 0),
            "disliked_by_me": p.id in disliked_ids,
            "replies_count": replies_counts.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
            "media_type": p.media_type,  # 🆕
            "repost_of": repost_data,      # 🆕
            "is_repost": is_repost,         # 🆕
            "is_quote": is_quote,           # 🆕
            
        })

    has_more = len(posts) == limit

    return {
        "posts": result,
        "has_more": has_more,
        "next_cursor": posts[-1].id if posts else None,
    }


@app.get("/api/users/{identifier}/followers")
def get_followers(identifier: str, session: Session = Depends(get_session)):
    user = resolve_user(identifier, session)
    follows = session.exec(
        select(Follow).where(Follow.followee_id == user.id)
    ).all()
    
    if not follows:
        return []
    
    user_ids = [f.follower_id for f in follows]
    users = session.exec(
        select(User).where(User.id.in_(user_ids))
    ).all()
    
    _pre = batch_get_users(users, session)
    return [user_out(u, session, _pre.get(u.id)) for u in users]


@app.get("/api/users/{identifier}/following")
def get_following(identifier: str, session: Session = Depends(get_session)):
    user = resolve_user(identifier, session)
    follows = session.exec(
        select(Follow).where(Follow.follower_id == user.id)
    ).all()
    
    if not follows:
        return []
    
    user_ids = [f.followee_id for f in follows]
    users = session.exec(
        select(User).where(User.id.in_(user_ids))
    ).all()
    
    _pre = batch_get_users(users, session)
    return [user_out(u, session, _pre.get(u.id)) for u in users]


@app.get("/api/search")
@limiter.limit("30/minute")
def search(
    request: Request,
    q: str = "",
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    q = q.strip()
    if not q:
        return {"users": [], "posts": []}
    pattern = f"%{q.lower()}%"

    users = session.exec(
        select(User)
        .where(
            User.is_banned == False,
            User.username.ilike(pattern) | User.display_name.ilike(pattern)
        )
        .limit(15)
    ).all()

    posts = session.exec(
        select(Post)
        .where(
            Post.reply_to_id == None,
            func.lower(Post.text).like(pattern),
        )
        .order_by(Post.created_at.desc())
        .limit(30)
    ).all()

    if not posts:
        _pre = batch_get_users(users, session)
        return {"users": [user_out(u, session, _pre.get(u.id)) for u in users], "posts": []}

    post_ids = [p.id for p in posts]
    author_ids = list({p.author_id for p in posts})
    authors = {u.id: u for u in session.exec(
        select(User).where(User.id.in_(author_ids))
    ).all()}

    likes_counts = dict(session.exec(
        select(Like.post_id, func.count(Like.id))
        .where(Like.post_id.in_(post_ids))
        .group_by(Like.post_id)
    ).all())

    dislikes_counts = dict(session.exec(
        select(Dislike.post_id, func.count(Dislike.id))
        .where(Dislike.post_id.in_(post_ids))
        .group_by(Dislike.post_id)
    ).all())

    replies_counts = dict(session.exec(
        select(Post.reply_to_id, func.count(Post.id))
        .where(Post.reply_to_id.in_(post_ids))
        .group_by(Post.reply_to_id)
    ).all())

    # 🆕 Подгружаем лайки и закладки для текущего пользователя
    liked_ids = set()
    bookmarked_ids = set()
    if viewer:
        liked_ids = set(session.exec(
            select(Like.post_id).where(Like.user_id == viewer.id, Like.post_id.in_(post_ids))
        ).all())
        bookmarked_ids = set(session.exec(
            select(Bookmark.post_id).where(Bookmark.user_id == viewer.id, Bookmark.post_id.in_(post_ids))
        ).all())
        disliked_ids = set(session.exec(
            select(Dislike.post_id).where(Dislike.user_id == viewer.id, Dislike.post_id.in_(post_ids))
        ).all())

    # 🆕 Загружаем оригиналы для репостов
    repost_ids = list({p.repost_of_id for p in posts if p.repost_of_id})
    originals_map = {}
    if repost_ids:
        orig_posts = session.exec(select(Post).where(Post.id.in_(repost_ids))).all()
        orig_author_ids = {op.author_id for op in orig_posts}
        orig_authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(orig_author_ids))).all()}
        for op in orig_posts:
            originals_map[op.id] = {
                "id": op.id, "author_id": op.author_id,
                "author": orig_authors.get(op.author_id),
                "text": op.text, "media_url": op.media_url,
                "media_type": op.media_type,
                "created_at": op.created_at.isoformat(),
            }

    result_posts = []
    for p in posts:
        author = authors.get(p.author_id)
        repost_data = None
        is_repost = False
        is_quote = False
        if p.repost_of_id:
            orig = originals_map.get(p.repost_of_id)
            if orig:
                orig_author = orig["author"]
                repost_data = {
                    "id": orig["id"], "author_id": orig["author_id"],
                    "author": orig_author.display_name if orig_author else "Удалённый пользователь",
                    "handle": f"@{orig_author.username}" if orig_author else "@deleted",
                    "author_avatar": orig_author.avatar_url if orig_author else None,
                    "author_is_admin": orig_author.is_admin if orig_author else False,
                    "author_is_moderator": orig_author.is_moderator if orig_author else False,
                    "author_role": get_author_role(orig_author, session) if orig_author else None,
                    "text": orig["text"], "media_url": orig["media_url"],
                    "media_type": orig["media_type"],
                    "created_at": orig["created_at"],
                }
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())
            else:
                repost_data = {"deleted": True}
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())

        result_posts.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "username": author.username if author else "unknown",
            "author_avatar": author.avatar_url if author else None,
            "author_is_admin": author.is_admin if author else False,
            "author_is_moderator": author.is_moderator if author else False,
            "author_is_banned": author.is_banned if author else False,
            "author_role": get_author_role(author, session) if author else None,
            "text": p.text,
            "media_url": p.media_url,
            "media_type": p.media_type,
            "likes_count": likes_counts.get(p.id, 0),
            "liked_by_me": p.id in liked_ids,
            "dislikes_count": dislikes_counts.get(p.id, 0),
            "disliked_by_me": p.id in disliked_ids,
            "bookmarked": p.id in bookmarked_ids,
            "replies_count": replies_counts.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
            "repost_of": repost_data,
            "is_repost": is_repost,
            "is_quote": is_quote,
        })

    _pre = batch_get_users(users, session)
    return {
        "users": [user_out(u, session, _pre.get(u.id)) for u in users],
        "posts": result_posts,
    }

@app.get("/api/posts/following")
def get_following_posts(
    cursor: Optional[int] = None,
    limit: int = 20,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    follows = session.exec(select(Follow).where(Follow.follower_id == user.id)).all()
    followee_ids = [f.followee_id for f in follows]

    if not followee_ids:
        return {"posts": [], "has_more": False, "next_cursor": None}

    query = (
        select(Post)
        .where(Post.reply_to_id == None, Post.author_id.in_(followee_ids))
        .order_by(Post.created_at.desc())
    )

    if cursor:
        last_post = session.get(Post, cursor)
        if last_post:
            # 🚀 Учитываем одинаковое время создания
            query = query.where(
                (Post.created_at < last_post.created_at) |
                ((Post.created_at == last_post.created_at) & (Post.id < last_post.id))
            )

    posts = session.exec(query.limit(limit)).all()

    if not posts:
        return {"posts": [], "has_more": False, "next_cursor": None}

    # Массовые запросы
    post_ids = [p.id for p in posts]
    author_ids = list({p.author_id for p in posts})

    authors = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(author_ids))
        ).all()
    }

    likes_counts = dict(session.exec(
        select(Like.post_id, func.count(Like.id))
        .where(Like.post_id.in_(post_ids))
        .group_by(Like.post_id)
    ).all())

    replies_counts = dict(session.exec(
        select(Post.reply_to_id, func.count(Post.id))
        .where(Post.reply_to_id.in_(post_ids))
        .group_by(Post.reply_to_id)
    ).all())

    dislikes_counts = dict(session.exec(
        select(Dislike.post_id, func.count(Dislike.id))
        .where(Dislike.post_id.in_(post_ids))
        .group_by(Dislike.post_id)
    ).all())

    liked_ids = set(session.exec(
        select(Like.post_id).where(Like.user_id == user.id, Like.post_id.in_(post_ids))
    ).all())

    # ... (предыдущий код функции) ...
    bookmarked_ids = set(session.exec(
        select(Bookmark.post_id).where(Bookmark.user_id == user.id, Bookmark.post_id.in_(post_ids))
    ).all())

    disliked_ids = set(session.exec(
        select(Dislike.post_id).where(Dislike.user_id == user.id, Dislike.post_id.in_(post_ids))
    ).all())

    # 🆕 Массовая загрузка оригинальных постов для репостов
    repost_ids = list({p.repost_of_id for p in posts if p.repost_of_id})
    originals_map = {}
    if repost_ids:
        orig_posts = session.exec(select(Post).where(Post.id.in_(repost_ids))).all()
        orig_author_ids = {p.author_id for p in orig_posts}
        orig_authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(orig_author_ids))).all()}
        for op in orig_posts:
            originals_map[op.id] = {
                "id": op.id, "author_id": op.author_id,
                "author": orig_authors.get(op.author_id),
                "text": op.text, "media_url": op.media_url,
                "created_at": op.created_at.isoformat(),
                "media_type": op.media_type,  # 🆕
            }

    result = []
    for p in posts:
        author = authors.get(p.author_id)
        
        # 🆕 Формируем данные репоста/цитаты
        repost_data = None
        is_repost = False
        is_quote = False
        if p.repost_of_id:
            orig = originals_map.get(p.repost_of_id)
            if orig:
                orig_author = orig["author"]
                repost_data = {
                    "id": orig["id"], "author_id": orig["author_id"],
                    "author": orig_author.display_name if orig_author else "Удалённый пользователь",
                    "handle": f"@{orig_author.username}" if orig_author else "@deleted",
                    "author_avatar": orig_author.avatar_url if orig_author else None,
                    "author_is_admin": orig_author.is_admin if orig_author else False,
                    "author_is_moderator": orig_author.is_moderator if orig_author else False,
                    "author_role": get_author_role(orig_author, session) if orig_author else None,
                    "text": orig["text"], "media_url": orig["media_url"],
                    "created_at": orig["created_at"],
                }
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())
            else:
                repost_data = {"deleted": True}
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())

        result.append({
            "id": p.id, "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "author_avatar": author.avatar_url if author else None,
            "author_is_admin": author.is_admin if author else False,
            "author_is_moderator": author.is_moderator if author else False,
            "author_is_banned": author.is_banned if author else False,
            "author_role": get_author_role(author, session) if author else None,
            "text": p.text, "media_url": p.media_url,
            "likes_count": likes_counts.get(p.id, 0),
            "liked_by_me": p.id in liked_ids,
            "dislikes_count": dislikes_counts.get(p.id, 0),
            "disliked_by_me": p.id in disliked_ids,
            "bookmarked": p.id in bookmarked_ids,
            "replies_count": replies_counts.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
            "media_type": p.media_type,  # 🆕
            "repost_of": repost_data,
            "is_repost": is_repost,
            "is_quote": is_quote,
        })
    has_more = len(posts) == limit

    return {
        "posts": result,
        "has_more": has_more,
        "next_cursor": posts[-1].id if posts else None,
    }


@app.get("/api/posts/liked", response_model=list[PostOut])
def get_liked_posts(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    likes = session.exec(
        select(Like).where(Like.user_id == user.id).order_by(Like.created_at.desc())
    ).all()

    post_ids = [l.post_id for l in likes]

    if not post_ids:
        return []

    posts = session.exec(select(Post).where(Post.id.in_(post_ids))).all()

    if not posts:
        return []

    # Массовые запросы
    ids = [p.id for p in posts]
    author_ids = list({p.author_id for p in posts})

    authors = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(author_ids))
        ).all()
    }

    likes_counts = dict(session.exec(
        select(Like.post_id, func.count(Like.id))
        .where(Like.post_id.in_(ids))
        .group_by(Like.post_id)
    ).all())

    result = []
    for p in posts:
        author = authors.get(p.author_id)
        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "author_avatar": author.avatar_url if author else None,
            "author_is_admin": author.is_admin if author else False,
            "author_is_moderator": author.is_moderator if author else False,
            "author_is_banned": author.is_banned if author else False,
            "author_role": get_author_role(author, session) if author else None,
            "text": p.text,
            "media_url": p.media_url,
            "likes_count": likes_counts.get(p.id, 0),
            "liked_by_me": True,
            "dislikes_count": 0,
            "disliked_by_me": False,
            "replies_count": 0,
            "views_count": p.views_count or 0,
            "media_type": p.media_type,  # 🆕
            "created_at": p.created_at.isoformat(),
        })
    return result


@app.get("/api/posts/{post_id}/replies")
def get_replies(post_id: int, session: Session = Depends(get_session)):
    # 1. BFS для сбора всех ID в дереве
    post_ids_in_thread = {post_id}
    queue = [post_id]

    while queue:
        current_id = queue.pop(0)
        children = session.exec(
            select(Post.id).where(Post.reply_to_id == current_id)
        ).all()
        for child_id in children:
            if child_id not in post_ids_in_thread:
                post_ids_in_thread.add(child_id)
                queue.append(child_id)

    id_list = list(post_ids_in_thread)

    # 2. Один запрос на все ответы
    replies = session.exec(
        select(Post).where(Post.id.in_(id_list), Post.id != post_id)
        .order_by(Post.created_at.asc())
    ).all()

    if not replies:
        return []

    reply_ids = [p.id for p in replies]

    # 3. Массовые запросы для лайков и ответов
    likes_counts = dict(session.exec(
        select(Like.post_id, func.count(Like.id))
        .where(Like.post_id.in_(reply_ids))
        .group_by(Like.post_id)
    ).all())

    replies_counts = dict(session.exec(
        select(Post.reply_to_id, func.count(Post.id))
        .where(Post.reply_to_id.in_(reply_ids))
        .group_by(Post.reply_to_id)
    ).all())

    # 4. Массовый запрос авторов
    author_ids = list({p.author_id for p in replies})
    authors = {u.id: u for u in session.exec(
        select(User).where(User.id.in_(author_ids))
    ).all()}

    # 5. Собираем результат
    result = []
    for p in replies:
        author = authors.get(p.author_id)

        parent_info = None
        if p.reply_to_id and p.reply_to_id != post_id:
            parent_post = session.get(Post, p.reply_to_id)
            if parent_post:
                parent_author = authors.get(parent_post.author_id)
                if parent_author:
                    parent_info = {
                        "id": parent_post.id,
                        "author_id": parent_author.id,
                        "author_name": parent_author.display_name,
                        "author_username": parent_author.username,
                    }

        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "username": author.username if author else "unknown",
            "author_avatar": author.avatar_url if author else None,
            "author_is_admin": author.is_admin if author else False,
            "author_is_moderator": author.is_moderator if author else False,
            "author_is_banned": author.is_banned if author else False,
            "author_role": get_author_role(author, session) if author else None,
            "text": p.text,
            "media_url": p.media_url,
            "likes_count": likes_counts.get(p.id, 0),
            "liked_by_me": False,
            "dislikes_count": 0,
            "disliked_by_me": False,
            "replies_count": replies_counts.get(p.id, 0),
            "reply_to_id": p.reply_to_id,
            "parent": parent_info,
            "media_type": p.media_type,  # 🆕
            "created_at": p.created_at.isoformat(),
        })

    return result



# ============================================================
# 🌳 ЭХО ПОСТА (ДЕРЕВО РЕПОСТОВ И ЦИТАТ)
# ============================================================
@app.get("/api/posts/{post_id}/echo")
def get_echo_tree(post_id: int, session: Session = Depends(get_session)):
    """Рекурсивный сбор всей цепочки репостов и цитат ОТ КОРНЯ"""
    # 1. Находим корневой пост (оригинал), поднимаясь вверх по repost_of_id
    root_id = post_id
    current = session.get(Post, post_id)
    while current and current.repost_of_id:
        root_id = current.repost_of_id
        current = session.get(Post, root_id)
    
    # 2. BFS от корня — собираем ВСЕХ потомков
    visited = set()
    queue = [root_id]
    all_ids = []
    while queue:
        curr = queue.pop(0)
        if curr in visited:
            continue
        visited.add(curr)
        all_ids.append(curr)
        children = session.exec(select(Post.id).where(Post.repost_of_id == curr)).all()
        for c in children:
            if c not in visited:
                queue.append(c)
    
    if not all_ids:
        return []
    
    posts = session.exec(select(Post).where(Post.id.in_(all_ids))).all()
    author_ids = list({p.author_id for p in posts})
    authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(author_ids))).all()}
    
    # Массовый подсчет лайков
    likes_map = dict(session.exec(
        select(Like.post_id, func.count(Like.id))
        .where(Like.post_id.in_(all_ids))
        .group_by(Like.post_id)
    ).all())
    
    result = []
    for p in posts:
        author = authors.get(p.author_id)
        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "author_avatar": author.avatar_url if author else None,
            "text": p.text,
            "media_url": p.media_url,
            "created_at": p.created_at.isoformat(),
            "repost_of_id": p.repost_of_id,
            "is_quote": bool(p.text.strip()),
            "likes_count": likes_map.get(p.id, 0),
            "dislikes_count": 0,
        })
    return result

@app.get("/api/posts/{post_id}")
def get_single_post(
    post_id: int,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    
    author = session.get(User, post.author_id)
    likes_count = session.exec(select(func.count()).select_from(Like).where(Like.post_id == post_id)).one()
    dislikes_count = session.exec(select(func.count()).select_from(Dislike).where(Dislike.post_id == post_id)).one()
    replies_count = session.exec(select(func.count()).select_from(Post).where(Post.reply_to_id == post_id)).one()
    
    liked_by_me = False
    bookmarked = False
    disliked_by_me = False
    if viewer:
        liked_by_me = session.exec(select(Like).where(Like.user_id == viewer.id, Like.post_id == post_id)).first() is not None
        bookmarked = session.exec(select(Bookmark).where(Bookmark.user_id == viewer.id, Bookmark.post_id == post_id)).first() is not None
        disliked_by_me = session.exec(select(Dislike).where(Dislike.user_id == viewer.id, Dislike.post_id == post_id)).first() is not None

    repost_data = None
    is_repost = False
    is_quote = False
    if post.repost_of_id:
        orig = session.get(Post, post.repost_of_id)
        if orig:
            orig_author = session.get(User, orig.author_id)
            repost_data = {
                "id": orig.id, "author_id": orig.author_id,
                "author": orig_author.display_name if orig_author else "Удалённый пользователь",
                "handle": f"@{orig_author.username}" if orig_author else "@deleted",
                "author_avatar": orig_author.avatar_url if orig_author else None,
                "author_is_admin": orig_author.is_admin if orig_author else False,
                "author_is_moderator": orig_author.is_moderator if orig_author else False,
                "author_role": get_author_role(orig_author, session) if orig_author else None,
                "text": orig.text, "media_url": orig.media_url,
                "media_type": orig.media_type, "created_at": orig.created_at.isoformat(),
            }
            is_repost = not post.text.strip()
            is_quote = bool(post.text.strip())
        else:
            repost_data = {"deleted": True}
            is_repost = not post.text.strip()
            is_quote = bool(post.text.strip())

    return {
        "id": post.id, "author_id": post.author_id,
        "author": author.display_name if author else "Unknown",
        "handle": f"@{author.username}" if author else "@unknown",
        "author_avatar": author.avatar_url if author else None,
        "author_is_admin": author.is_admin if author else False,
        "author_is_moderator": author.is_moderator if author else False,
        "author_is_banned": author.is_banned if author else False,
        "author_role": get_author_role(author, session) if author else None,
        "text": post.text, "media_url": post.media_url, "media_type": post.media_type,
        "likes_count": likes_count, "liked_by_me": liked_by_me, "bookmarked": bookmarked,
        "dislikes_count": dislikes_count, "disliked_by_me": disliked_by_me,
        "replies_count": replies_count, "views_count": post.views_count or 0,
        "created_at": post.created_at.isoformat(), "reply_to_id": post.reply_to_id,
        "repost_of": repost_data, "is_repost": is_repost, "is_quote": is_quote,
    }

@app.post("/api/posts/{post_id}/like")
@limiter.limit("30/minute")
async def toggle_like(
    request: Request,
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(Like).where(Like.user_id == user.id, Like.post_id == post_id)
    ).first()
    
    # True, если мы ставим лайк. False, если снимаем.
    is_liking = not bool(existing)
    
    if existing:
        session.delete(existing)
    else:
        like = Like(user_id=user.id, post_id=post_id)
        session.add(like)
        log_action(session, user.id, "like_post", target_type="post", target_id=post_id)
        
        # Уведомление автору поста
        post = session.get(Post, post_id)
        if post and post.author_id != user.id:
            notif = Notification(user_id=post.author_id, actor_id=user.id, type="like", post_id=post_id)
            session.add(notif)

        # Взаимное исключение: лайк снимает дизлайк
        existing_dislike = session.exec(
            select(Dislike).where(Dislike.user_id == user.id, Dislike.post_id == post_id)
        ).first()
        if existing_dislike:
            session.delete(existing_dislike)
            
    session.commit()
    
    # Считаем актуальное количество лайков/дизлайков после коммита
    cnt = session.exec(
        select(func.count()).select_from(Like).where(Like.post_id == post_id)
    ).one()
    dislike_cnt = session.exec(
        select(func.count()).select_from(Dislike).where(Dislike.post_id == post_id)
    ).one()
    
    # 🚀 Единый payload для WebSocket (всё, что нужно фронту)
    ws_payload = {
        "post_id": post_id,
        "likes_count": cnt,
        "dislikes_count": dislike_cnt,
        "liker_id": user.id,      # 👈 КРИТИЧЕСКИ ВАЖНО: фронт должен знать, КТО лайкнул
        "liked": is_liking,       # 👈 True (поставил) / False (снял)
        "disliked": False,
    }
    
    # Рассылаем ВСЕМ подключенным клиентам (включая второе/третье устройство этого же юзера)
    await manager.broadcast_all("post_liked", ws_payload)
    
    # Возвращаем полные данные на фронт, чтобы UI обновился мгновенно из HTTP-ответа
    return {
        "liked": is_liking,
        "likes_count": cnt,
        "disliked": False,
        "dislikes_count": dislike_cnt,
    }


@app.post("/api/posts/{post_id}/dislike")
@limiter.limit("30/minute")
async def toggle_dislike(
    request: Request,
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")

    existing = session.exec(
        select(Dislike).where(Dislike.user_id == user.id, Dislike.post_id == post_id)
    ).first()

    # True, если мы ставим дизлайк. False, если снимаем.
    is_disliking = not bool(existing)

    if existing:
        session.delete(existing)
    else:
        dislike = Dislike(user_id=user.id, post_id=post_id)
        session.add(dislike)
        log_action(session, user.id, "dislike_post", target_type="post", target_id=post_id)

        # Взаимное исключение: дизлайк снимает лайк
        existing_like = session.exec(
            select(Like).where(Like.user_id == user.id, Like.post_id == post_id)
        ).first()
        if existing_like:
            session.delete(existing_like)

    session.commit()

    # Считаем актуальное количество лайков/дизлайков после коммита
    cnt = session.exec(
        select(func.count()).select_from(Like).where(Like.post_id == post_id)
    ).one()
    dislike_cnt = session.exec(
        select(func.count()).select_from(Dislike).where(Dislike.post_id == post_id)
    ).one()

    # 🚀 Единый payload для WebSocket (всё, что нужно фронту)
    ws_payload = {
        "post_id": post_id,
        "dislikes_count": dislike_cnt,
        "likes_count": cnt,
        "disliker_id": user.id,
        "disliked": is_disliking,
        "liked": False,
    }

    await manager.broadcast_all("post_disliked", ws_payload)

    return {
        "disliked": is_disliking,
        "dislikes_count": dislike_cnt,
        "liked": False,
        "likes_count": cnt,
    }


# ============================================================
# ✏️ ЧЕРНОВИКИ СООБЩЕНИЙ В ЧАТАХ (синхронизация между устройствами)
# ============================================================

class ChatDraftIn(BaseModel):
    text: str = ""

def _ensure_chatdraft_table(session: Session):
    """Самовосстановление: если таблицы chatdraft нет (миграция не прошла) — создать."""
    try:
        session.exec(select(ChatDraft).limit(1))
    except Exception:
        ChatDraft.__table__.create(session.get_bind(), checkfirst=True)
        session.rollback()

@app.get("/api/chat-drafts")
def get_my_chat_drafts(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _ensure_chatdraft_table(session)
    rows = session.exec(
        select(ChatDraft).where(ChatDraft.user_id == user.id)
    ).all()
    return [
        {"chat_id": d.chat_id, "text": d.text, "updated_at": d.updated_at}
        for d in rows
    ]
@app.get("/api/chat-drafts/{chat_id}")
def get_chat_draft(
    chat_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Один черновик (для инпута чата / поста на другом устройстве)."""
    _ensure_chatdraft_table(session)
    row = session.exec(
        select(ChatDraft).where(
            ChatDraft.user_id == user.id, ChatDraft.chat_id == chat_id
        )
    ).first()
    return {"chat_id": chat_id, "text": row.text if row else ""}

@app.put("/api/chat-drafts/{chat_id}")

@app.put("/api/chat-drafts/{chat_id}")
def put_chat_draft(
    chat_id: str,
    body: ChatDraftIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _ensure_chatdraft_table(session)
    text = (body.text or "").strip()
    if len(chat_id) > 64 or len(text) > 20000:
        raise HTTPException(status_code=422, detail="Draft too long")
    row = session.exec(
        select(ChatDraft).where(
            ChatDraft.user_id == user.id, ChatDraft.chat_id == chat_id
        )
    ).first()
    if not text:
        # пустой текст = черновик стёрт
        if row:
            session.delete(row)
            session.commit()
        return {"ok": True, "cleared": True}
    if row:
        row.text = text
        row.updated_at = utcnow()
    else:
        row = ChatDraft(user_id=user.id, chat_id=chat_id, text=text)
        session.add(row)
    session.commit()
    return {"ok": True, "cleared": False}

@app.delete("/api/chat-drafts/{chat_id}")
def delete_chat_draft(
    chat_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _ensure_chatdraft_table(session)
    row = session.exec(
        select(ChatDraft).where(
            ChatDraft.user_id == user.id, ChatDraft.chat_id == chat_id
        )
    ).first()
    if row:
        session.delete(row)
        session.commit()
    return {"ok": True}

@app.get("/api/counts")
def get_all_counts(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Чаты — один запрос
    chats_unread = session.exec(
        select(func.count(Message.id))
        .join(ChatMember, ChatMember.chat_id == Message.chat_id)
        .where(
            ChatMember.user_id == user.id,
            Message.sender_id != user.id,
            Message.read == False,
        )
    ).one()
    
    # Уведомления — один запрос
    notifications_unread = session.exec(
        select(func.count(Notification.id))
        .where(
            Notification.user_id == user.id,
            Notification.read == False,
        )
    ).one()

    # 🆕 ОБНОВЛЕНИЯ: считаем сколько всего обновлений и сколько юзер прочитал
    total_updates = session.exec(select(func.count()).select_from(Update)).one()
    read_updates = session.exec(
        select(func.count()).select_from(UpdateRead).where(UpdateRead.user_id == user.id)
    ).one()
    # Если прочитанных somehow больше чем всего (например, удалили пост), страховка от минуса
    updates_unread = max(0, total_updates - read_updates) 

    return {
        "chats_unread": chats_unread,
        "notifications_unread": notifications_unread,
        "updates_unread": updates_unread,  # 👈 ДОБАВИЛИ
    }

# ---------- ЗАКЛАДКИ ----------

@app.post("/api/posts/{post_id}/bookmark")
@limiter.limit("30/minute")
def toggle_bookmark(
    request: Request,
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    
    existing = session.exec(
        select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.post_id == post_id)
    ).first()
    if existing:
        session.delete(existing)
        session.commit()
        return {"bookmarked": False}
    
    session.add(Bookmark(user_id=user.id, post_id=post_id))
    session.commit()
    return {"bookmarked": True}


@app.get("/api/posts/{post_id}/is-bookmarked")
def is_bookmarked(
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.post_id == post_id)
    ).first()
    return {"bookmarked": existing is not None}


@app.get("/api/bookmarks")
def list_bookmarks(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    bookmarks = session.exec(
        select(Bookmark).where(Bookmark.user_id == user.id).order_by(Bookmark.created_at.desc())
    ).all()

    if not bookmarks:
        return []

    post_ids = [b.post_id for b in bookmarks]

    # 1. Массовый запрос постов
    posts = session.exec(select(Post).where(Post.id.in_(post_ids))).all()
    posts_map = {p.id: p for p in posts}

    # 2. Массовый запрос авторов
    author_ids = list({p.author_id for p in posts})
    authors = session.exec(select(User).where(User.id.in_(author_ids))).all()
    authors_map = {u.id: u for u in authors}

    # 3. Массовые счётчики лайков и ответов
    likes_map = dict(session.exec(
        select(Like.post_id, func.count()).where(Like.post_id.in_(post_ids)).group_by(Like.post_id)
    ).all())

    dislikes_map = dict(session.exec(
        select(Dislike.post_id, func.count()).where(Dislike.post_id.in_(post_ids)).group_by(Dislike.post_id)
    ).all())

    replies_map = dict(session.exec(
        select(Post.reply_to_id, func.count()).where(Post.reply_to_id.in_(post_ids)).group_by(Post.reply_to_id)
    ).all())

    # 4. Какие из них лайкнуты текущим пользователем
    liked_ids = set(session.exec(
        select(Like.post_id).where(Like.user_id == user.id, Like.post_id.in_(post_ids))
    ).all())

    disliked_ids = set(session.exec(
        select(Dislike.post_id).where(Dislike.user_id == user.id, Dislike.post_id.in_(post_ids))
    ).all())

    result = []
    # Сохраняем порядок закладок (от новых к старым)
    for b in bookmarks:
        post = posts_map.get(b.post_id)
        if not post:
            continue
        author = authors_map.get(post.author_id)

        result.append({
            "id": post.id,
            "author_id": post.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "author_avatar": author.avatar_url if author else None,
            "author_is_admin": author.is_admin if author else False,
            "author_is_moderator": author.is_moderator if author else False,
            "author_is_banned": author.is_banned if author else False,
            "author_role": get_author_role(author, session) if author else None,
            "text": post.text,
            "media_url": post.media_url,
            "likes_count": likes_map.get(post.id, 0),
            "liked_by_me": post.id in liked_ids,
            "dislikes_count": dislikes_map.get(post.id, 0),
            "disliked_by_me": post.id in disliked_ids,
            "bookmarked": True,
            "replies_count": replies_map.get(post.id, 0),
            # ✅ ИСПРАВЛЕНО: заменили 'p' на 'post'
            "views_count": post.views_count or 0,
            # ✅ ИСПРАВЛЕНО: заменили 'p' на 'post' и добавили безопасный .isoformat() для времени
            "created_at": post.created_at.isoformat() if post.created_at else None,
            "media_type": post.media_type,  # 🆕
        })
        
    return result


@app.get("/api/posts/{post_id}/is-liked")
def is_liked(
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(Like).where(Like.user_id == user.id, Like.post_id == post_id)
    ).first()
    return {"liked": existing is not None}


@app.delete("/api/posts/{post_id}")
async def delete_post(
    request: Request,
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    if post.author_id != user.id and not has_permission(user, "delete_posts", session):
        raise HTTPException(403, "Not your post")
    # 🛡️ Чужой пост — только если цель ниже по иерархии (Founder/Developer неприкосновенны)
    if post.author_id != user.id:
        author = session.get(User, post.author_id)
        if author:
            check_sanction_rights(user, author, session, "удалять посты этого пользователя")
    await cascade_delete_post(post_id, session)
    log_action(
        session, user.id, "delete_post",
        target_type="post", target_id=post_id,
        details={"text": post.text[:100] if post.text else None},
        ip_address=get_client_ip(request),
    )
    session.commit()
    await manager.broadcast_all("post_deleted", {"post_id": post_id})
    return {"ok": True}


@app.delete("/api/posts/{post_id}/repost")
async def cancel_repost(
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отменить свой репост (удаляет пост-репост, а не оригинал)"""
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    if post.author_id != user.id:
        raise HTTPException(403, "Это не ваш репост")
    if not post.repost_of_id:
        raise HTTPException(400, "Это не репост")
    
    # Каскадно удаляем сам репост
    cascade_delete_post(post.id, session)
    await manager.broadcast_all("post_deleted", {"post_id": post.id})
    return {"ok": True}

@app.get("/api/posts")
def get_posts(
    cursor: Optional[int] = None,
    limit: int = 20,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    query = select(Post).where(Post.reply_to_id == None).order_by(Post.created_at.desc())
    if cursor:
        last_post = session.get(Post, cursor)
        if last_post:
            # 🚀 Учитываем одинаковое время создания
            query = query.where(
                (Post.created_at < last_post.created_at) |
                ((Post.created_at == last_post.created_at) & (Post.id < last_post.id))
            )

    posts = session.exec(query.limit(limit)).all()

    if not posts:
        return {"posts": [], "has_more": False, "next_cursor": None}

    ids = [p.id for p in posts]
    repost_ids = list({p.repost_of_id for p in posts if p.repost_of_id})

    authors = session.exec(select(User).where(User.id.in_({p.author_id for p in posts}))).all()
    authors_map = {u.id: u for u in authors}

    likes_map = dict(session.exec(
        select(Like.post_id, func.count()).where(Like.post_id.in_(ids)).group_by(Like.post_id)
    ).all())
    dislikes_map = dict(session.exec(
        select(Dislike.post_id, func.count()).where(Dislike.post_id.in_(ids)).group_by(Dislike.post_id)
    ).all())
    replies_map = dict(session.exec(
        select(Post.reply_to_id, func.count()).where(Post.reply_to_id.in_(ids)).group_by(Post.reply_to_id)
    ).all())

    # 🆕 Загрузка оригинальных постов для репостов
    originals_map = {}
    if repost_ids:
        orig_posts = session.exec(select(Post).where(Post.id.in_(repost_ids))).all()
        orig_author_ids = {op.author_id for op in orig_posts}
        orig_authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(orig_author_ids))).all()}
        for op in orig_posts:
            originals_map[op.id] = {
                "id": op.id,
                "author_id": op.author_id,
                "author": orig_authors.get(op.author_id),
                "text": op.text,
                "media_url": op.media_url,
                "media_type": op.media_type,  # ✅ op, не p!
                "created_at": op.created_at.isoformat(),
            }

    liked_ids = set()
    bookmarked_ids = set()
    disliked_ids = set()
    if viewer:
        liked_ids = set(session.exec(
            select(Like.post_id).where(Like.user_id == viewer.id, Like.post_id.in_(ids))
        ).all())
        bookmarked_ids = set(session.exec(
            select(Bookmark.post_id).where(Bookmark.user_id == viewer.id, Bookmark.post_id.in_(ids))
        ).all())
        disliked_ids = set(session.exec(
            select(Dislike.post_id).where(Dislike.user_id == viewer.id, Dislike.post_id.in_(ids))
        ).all())

    result = []
    for p in posts:
        author = authors_map.get(p.author_id)

        repost_data = None
        is_repost = False
        is_quote = False
        if p.repost_of_id:
            orig = originals_map.get(p.repost_of_id)
            if orig:
                orig_author = orig["author"]
                repost_data = {
                    "id": orig["id"],
                    "author_id": orig["author_id"],
                    "author": orig_author.display_name if orig_author else "Удалённый пользователь",
                    "handle": f"@{orig_author.username}" if orig_author else "@deleted",
                    "author_avatar": orig_author.avatar_url if orig_author else None,
                    "author_is_admin": orig_author.is_admin if orig_author else False,
                    "author_is_moderator": orig_author.is_moderator if orig_author else False,
                    "author_role": get_author_role(orig_author, session) if orig_author else None,
                    "text": orig["text"],
                    "media_url": orig["media_url"],
                    "media_type": orig["media_type"],  # ✅ из originals_map
                    "created_at": orig["created_at"],
                }
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())
            else:
                repost_data = {"deleted": True}
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())

        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "author_avatar": author.avatar_url if author else None,
            "author_is_admin": author.is_admin if author else False,
            "author_is_moderator": author.is_moderator if author else False,
            "author_is_banned": author.is_banned if author else False,
            "author_role": get_author_role(author, session) if author else None,
            "text": p.text,
            "media_url": p.media_url,
            "media_type": p.media_type,  # ✅ p здесь — это текущий пост
            "likes_count": likes_map.get(p.id, 0),
            "liked_by_me": p.id in liked_ids,
            "dislikes_count": dislikes_map.get(p.id, 0),
            "disliked_by_me": p.id in disliked_ids,
            "bookmarked": p.id in bookmarked_ids,
            "replies_count": replies_map.get(p.id, 0),
            "created_at": p.created_at.isoformat(),
            "views_count": p.views_count or 0,
            "repost_of": repost_data,
            "is_repost": is_repost,
            "is_quote": is_quote,
        })

    return {
        "posts": result,
        "has_more": len(posts) == limit,
        "next_cursor": posts[-1].id if posts else None,
    }

@app.post("/api/posts")
@limiter.limit("10/minute")
async def create_post(
    request: Request,
    text: str = Form(""),
    reply_to: Optional[int] = Form(None),
    repost_of: Optional[int] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not text.strip() and not file and not repost_of:
        raise HTTPException(400, "Пост не может быть пустым")
    
    if repost_of and reply_to:
        raise HTTPException(400, "Нельзя одновременно отвечать и репостить")

    original_post = None
    if repost_of:
        original_post = session.get(Post, repost_of)
        if not original_post:
            raise HTTPException(404, "Оригинальный пост не найден")
        if original_post.repost_of_id:
            raise HTTPException(400, "Нельзя репостить репост")
        if original_post.author_id == user.id:
            raise HTTPException(400, "Нельзя репостить свой же пост")

    media_url = None
    media_type = None
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
        content_type = (file.content_type or "").lower()
        
        # 🎯 ПРАВИЛЬНОЕ определение типа: по MIME, а не по расширению
        # audio/webm → аудио, video/webm → видео
        is_audio = (
            ext in ALLOWED_AUDIO_EXT 
            or content_type.startswith("audio/")
            or (ext == ".webm" and "audio" in content_type)
        )
        is_video = (
            ext in ALLOWED_VIDEO_EXT 
            or content_type.startswith("video/")
            or (ext == ".webm" and "video" in content_type)
        )
        is_image = ext in ALLOWED_IMAGE_EXT or content_type.startswith("image/")
        
        if is_audio:
            user_level = get_user_level(user, session)
            if user_level < 2:
                raise HTTPException(403, "🎙️ Голосовые посты доступны только со 2-го уровня и выше")
            media_type = "audio"
            resource_type = "video"  # Cloudinary хранит аудио как video
        elif is_image:
            media_type = "image"
            resource_type = "image"
        elif is_video:
            media_type = "video"
            resource_type = "video"
        else:
            raise HTTPException(400, f"Неподдерживаемый формат файла: {ext} ({content_type})")

        err = check_size_before_read(file.headers, 50 * 1024 * 1024)
        if err:
            raise HTTPException(413, err)

        content = await file.read()
        if len(content) > 50 * 1024 * 1024:  # 50 МБ для аудио/видео
            raise HTTPException(400, "Файл слишком большой (максимум 50 МБ)")
        
        try:
            result = await run_in_threadpool(
                lambda: cloudinary.uploader.upload(
                    content, folder=UPLOAD_FOLDER, resource_type=resource_type
                )
            )
            media_url = result.get("secure_url")
        except Exception as e:
            raise HTTPException(400, f"Ошибка загрузки: {str(e)}")

    if repost_of and not text.strip() and media_url:
        raise HTTPException(400, "Обычный репост не может содержать медиа")

    post = Post(
        author_id=user.id,
        text=text.strip() if text else "",
        media_url=media_url,
        media_type=media_type,  # 🆕
        reply_to_id=reply_to,
        repost_of_id=repost_of,
    )
    session.add(post)
    session.commit()
    session.refresh(post)


    # Теги и упоминания (только для цитат и обычных постов)
    if text.strip():
        for tag_name in extract_tags(text):
            tag = session.exec(select(Tag).where(Tag.name == tag_name)).first()
            if not tag:
                tag = Tag(name=tag_name)
                session.add(tag)
                session.commit()
                session.refresh(tag)
            session.add(PostTag(post_id=post.id, tag_id=tag.id))

        for username in extract_mentions(text):
            mentioned = session.exec(
                select(User).where(func.lower(User.username) == username)
            ).first()
            if mentioned and mentioned.id != user.id:
                session.add(Notification(
                    user_id=mentioned.id, actor_id=user.id,
                    type="mention", post_id=post.id,
                ))

    # Уведомление автору оригинала о репосте/цитате
    if original_post and original_post.author_id != user.id:
        notif_type = "quote" if text.strip() else "repost"
        session.add(Notification(
            user_id=original_post.author_id,
            actor_id=user.id,
            type=notif_type,
            post_id=post.id,
        ))

    # Ответ на пост
    if reply_to:
        parent = session.get(Post, reply_to)
        if parent and parent.author_id != user.id:
            session.add(Notification(
                user_id=parent.author_id, actor_id=user.id, type="reply",
            ))

    log_action(
        session, user.id, "create_post",
        target_type="post", target_id=post.id,
        details={
            "text": post.text[:100] if post.text else None,
            "is_repost": bool(repost_of),
        },
        ip_address=get_client_ip(request),
    )
    session.commit()

    # WebSocket рассылка (только для корневых постов)
    if not reply_to:
        post_data = {
            "id": post.id,
            "author_id": post.author_id,
            "author": user.display_name,
            "handle": f"@{user.username}",
            "username": user.username,
            "author_avatar": user.avatar_url,
            "author_is_admin": user.is_admin,
            "author_is_moderator": user.is_moderator,
            "author_is_banned": user.is_banned,
            "author_role": get_author_role(user, session),
            "text": post.text,
            "media_url": post.media_url,
            "likes_count": 0,
            "liked_by_me": False,
            "bookmarked": False,
            "replies_count": 0,
            "created_at": post.created_at.isoformat(),
            "views_count": 0,
            "repost_of_id": post.repost_of_id,  # 🆕
            "media_type": post.media_type,  # 🆕
        }
        
        # Если это репост/цитата — подгружаем оригинал для WebSocket
        if post.repost_of_id and original_post:
            orig_author = session.get(User, original_post.author_id)
            post_data["repost_of"] = {
                "id": original_post.id,
                "author_id": original_post.author_id,
                "author": orig_author.display_name if orig_author else "Unknown",
                "handle": f"@{orig_author.username}" if orig_author else "@unknown",
                "author_avatar": orig_author.avatar_url if orig_author else None,
                "text": original_post.text,
                "media_url": original_post.media_url,
            }
        
        await manager.broadcast_all("new_post", post_data)

    return {
        "id": post.id,
        "author_id": post.author_id,
        "author": user.display_name,
        "handle": f"@{user.username}",
        "author_avatar": user.avatar_url,
        "author_is_admin": user.is_admin,
        "author_is_moderator": user.is_moderator,
        "author_is_banned": user.is_banned,
        "author_role": get_author_role(user, session),
        "text": post.text,
        "media_url": post.media_url,
        "likes_count": 0,
        "liked_by_me": False,
        "replies_count": 0,
        "created_at": post.created_at.isoformat(),
        "views_count": 0,
        "repost_of_id": post.repost_of_id,  # 🆕
        "media_type": post.media_type,
    }



@app.post("/api/video-note")
@limiter.limit("10/minute")
async def process_video_note(
    request: Request,
    file: UploadFile = File(...),
    mirror: str = Form("0"),
    size: str = Form("640"),
    user: User = Depends(get_current_user),
):
    """Обрезает видео в квадрат, применяет зеркало, отдаёт mp4"""
    if not file.filename:
        raise HTTPException(400, "No file provided")
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_VIDEO_EXT:
        raise HTTPException(400, f"Неверный формат: {ext}")
    
    err = check_size_before_read(file.headers, 50 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (макс 50 МБ)")
    
    target_size = int(size) if size.isdigit() else 640
    
    # Временные файлы
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_in:
        tmp_in.write(content)
        input_path = tmp_in.name
    
    output_path = input_path.replace(ext, "_square.mp4")
    
    try:
        # Фильтр ffmpeg: квадрат по центру → ресайз → зеркало (если нужно)
        vf = f"crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2,scale={target_size}:{target_size}"
        if mirror == "1":
            vf += ",hflip"
        
        cmd = [
            get_ffmpeg_exe(), "-y", "-i", input_path,
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "128k",
            "-pix_fmt", "yuv420p",
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            print(f"FFMPEG ERROR: {result.stderr}")
            raise HTTPException(500, "Ошибка обработки видео")
        
        with open(output_path, "rb") as f:
            output_bytes = f.read()
        
        return Response(
            content=output_bytes,
            media_type="video/mp4",
            headers={"Content-Disposition": f"attachment; filename=video-note-{int(time.time())}.mp4"}
        )
        
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Видео обрабатывается слишком долго")
    except Exception as e:
        raise HTTPException(500, f"Ошибка обработки: {str(e)}")
    finally:
        # Чистим мусор
        for p in [input_path, output_path]:
            try:
                if os.path.exists(p):
                    os.unlink(p)
            except:
                pass


@app.get("/api/admin/permission-tabs")
def get_permission_tabs(staff: User = Depends(require_staff), session: Session = Depends(get_session)):
    """Получить список кастомных вкладок и привязанных к ним прав"""
    setting = session.get(SystemSetting, "permission_tabs_config")
    if not setting:
        return []
    return json.loads(setting.value)

@app.post("/api/admin/permission-tabs")
def save_permission_tabs(
    tabs: str = Form(...), # JSON массив вкладок
    staff: User = Depends(require_staff), 
    session: Session = Depends(get_session)
):
    """Сохранить кастомные вкладки"""
    setting = session.get(SystemSetting, "permission_tabs_config")
    if not setting:
        setting = SystemSetting(key="permission_tabs_config", value=tabs)
    else:
        setting.value = tabs
    session.add(setting)
    session.commit()
    return {"ok": True}

@app.get("/api/settings/shell-switcher")
def get_shell_switcher_enabled(session: Session = Depends(get_session)):
    """🆕 Включено ли отображение смены оболочек (Zune / Old iOS) в настройках.
    Публичный: флаг нужен клиенту до логина (для сброса всех на классику)."""
    setting = session.get(SystemSetting, "shell_switcher_enabled")
    return {"enabled": bool(setting and setting.value == "1")}

@app.post("/api/admin/settings/shell-switcher")
def set_shell_switcher_enabled(
    enabled: bool = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session)
):
    """🆕 Админ-переключатель отображения смены оболочек (Темы → Компоненты)"""
    value = "1" if enabled else "0"
    setting = session.get(SystemSetting, "shell_switcher_enabled")
    if not setting:
        setting = SystemSetting(key="shell_switcher_enabled", value=value)
    else:
        setting.value = value
    session.add(setting)
    session.commit()
    return {"ok": True, "enabled": enabled}

@app.get("/api/permissions")
def list_permissions():
    return [
        {"id": perm_id, "label": label, "category": cat}
        for perm_id, (label, cat) in PERMISSION_LABELS.items()
    ]




@app.get("/api/tags/popular")
def popular_tags(session: Session = Depends(get_session)):
    import time
    now = time.time()

    cached = _popular_tags_cache.get("tags")
    if cached:
        cached_time, cached_data = cached
        if now - cached_time < _POPULAR_TAGS_TTL:
            return cached_data

    # JOIN вместо N+1
    rows = session.exec(
        select(Tag.name, func.count(PostTag.post_id).label("cnt"))
        .join(PostTag, Tag.id == PostTag.tag_id)
        .group_by(Tag.id, Tag.name)
        .order_by(func.count(PostTag.post_id).desc())
        .limit(10)
    ).all()

    result = [{"name": name, "count": cnt} for name, cnt in rows]

    _popular_tags_cache["tags"] = (now, result)
    return result


@app.get("/api/tags/{tag_name}/posts")
def tag_posts(tag_name: str, session: Session = Depends(get_session)):
    tag = session.exec(select(Tag).where(Tag.name == tag_name.lower())).first()
    if not tag:
        return []

    links = session.exec(select(PostTag.post_id).where(PostTag.tag_id == tag.id)).all()
    post_ids = list(links)
    if not post_ids:
        return []

    posts = session.exec(
        select(Post).where(Post.id.in_(post_ids)).order_by(Post.created_at.desc())
    ).all()

    if not posts:
        return []

    # Массовые запросы
    author_ids = list({p.author_id for p in posts})
    authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(author_ids))).all()}

    likes_map = dict(session.exec(
        select(Like.post_id, func.count()).where(Like.post_id.in_(post_ids)).group_by(Like.post_id)
    ).all())

    replies_map = dict(session.exec(
        select(Post.reply_to_id, func.count()).where(Post.reply_to_id.in_(post_ids)).group_by(Post.reply_to_id)
    ).all())

    result = []
    for p in posts:
        author = authors.get(p.author_id)
        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "author_avatar": author.avatar_url if author else None,
            "author_is_admin": author.is_admin if author else False,
            "author_is_moderator": author.is_moderator if author else False,
            "author_is_banned": author.is_banned if author else False,
            "author_role": get_author_role(author, session) if author else None,
            "text": p.text,
            "media_url": p.media_url,
            "likes_count": likes_map.get(p.id, 0),
            "liked_by_me": False,
            "dislikes_count": 0,
            "disliked_by_me": False,
            "replies_count": replies_map.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
            "media_type": p.media_type,  # 🆕
        })
    return result


@app.get("/api/roles")
def list_roles(session: Session = Depends(get_session)):
    roles = session.exec(select(Role)).all()
    
    # Сортируем: сначала staff по position, потом остальные по level DESC
    staff_roles = sorted(
        [r for r in roles if r.is_staff],
        key=lambda r: (r.position or 0)
    )
    other_roles = sorted(
        [r for r in roles if not r.is_staff],
        key=lambda r: -(r.level or 0)
    )
    
    sorted_roles = staff_roles + other_roles
    
    return [
        {
            "id": r.id,
            "name": r.name,
            "color": r.color,
            "level": r.level,
            "description": r.description or "",
            "is_staff": r.is_staff,
            "show_in_payments": r.show_in_payments,
            "position": r.position or 0,
            "category_id": r.category_id,
            "permissions": json.loads(r.permissions),
        }
        for r in sorted_roles
    ]

@app.post("/api/roles")
def create_role(
    name: str = Form(...),
    color: str = Form("#8b5cf6"),
    level: int = Form(1),
    description: Optional[str] = Form(None),
    is_staff: bool = Form(False),
    show_in_payments: bool = Form(False),
    permissions: str = Form("[]"),
    category_id: Optional[int] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    max_lvl = max_level_for(staff, session)
    if level < 1 or level > max_lvl:
        raise HTTPException(403, f"Уровень должен быть от 1 до {max_lvl}")

    if session.exec(select(Role).where(Role.name == name)).first():
        raise HTTPException(400, "Role name already exists")

    position = 0
    if is_staff:
        staff_roles = session.exec(select(Role).where(Role.is_staff == True)).all()
        position = max([r.position for r in staff_roles], default=0) + 1

    role = Role(
        name=name, color=color, level=level,
        description=description, is_staff=is_staff,
        show_in_payments=show_in_payments,
        position=position, permissions=json.dumps(parse_and_validate_permissions(permissions)),
        category_id=category_id,
    )
    session.add(role)
    session.commit()
    session.refresh(role)
    invalidate_role_cache()
    return {
        "id": role.id, "name": role.name, "color": role.color, "level": role.level,
        "description": role.description, "is_staff": role.is_staff,
        "show_in_payments": role.show_in_payments,
        "position": role.position, "permissions": json.loads(role.permissions),
    }


@app.patch("/api/roles/{role_id}")
def update_role(
    role_id: int,
    name: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    level: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    is_staff: Optional[bool] = Form(None),
    show_in_payments: Optional[bool] = Form(None),
    permissions: Optional[str] = Form(None),
    category_id: Optional[int] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")

    if get_user_level(staff, session) <= role.level and not staff.is_admin:
        raise HTTPException(403, f"Недостаточно уровня (роль: {role.level})")

    if level is not None:
        max_lvl = max_level_for(staff, session)
        if level < 1 or level > max_lvl:
            raise HTTPException(403, f"Уровень должен быть от 1 до {max_lvl}")
        role.level = level

    if name:
        role.name = name
    if color:
        role.color = color
    if description is not None:
        role.description = description
    if is_staff is not None:
        if is_staff and not role.is_staff:
            staff_roles = session.exec(select(Role).where(Role.is_staff == True)).all()
            role.position = max([r.position for r in staff_roles], default=0) + 1
        role.is_staff = is_staff
    if show_in_payments is not None:
        role.show_in_payments = show_in_payments
    if permissions is not None:
        role.permissions = json.dumps(parse_and_validate_permissions(permissions))
    if category_id is not None:
        role.category_id = category_id if category_id > 0 else None
    session.add(role)
    session.commit()
    session.refresh(role)
    invalidate_role_cache()
    return {
        "id": role.id, "name": role.name, "color": role.color, "level": role.level,
        "description": role.description, "is_staff": role.is_staff,
        "show_in_payments": role.show_in_payments,
        "position": role.position, "permissions": json.loads(role.permissions),
    }


@app.delete("/api/roles/{role_id}")
def delete_role(
    role_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")

    if get_user_level(staff, session) <= role.level and not staff.is_admin:
        raise HTTPException(403, f"Недостаточно уровня (роль: {role.level})")

    users = session.exec(select(User).where(User.role_id == role_id)).all()
    for u in users:
        u.role_id = None
        session.add(u)
    session.delete(role)
    session.commit()
    invalidate_role_cache()
    return {"ok": True}


@app.post("/api/roles/{role_id}/move")
def move_role(
    role_id: int,
    direction: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")

    staff_roles = session.exec(select(Role).where(Role.is_staff == True)).all()
    staff_roles.sort(key=lambda r: ((r.position or 0), -(r.level or 0)))

    # Нормализуем позиции в 1..N — без этого кнопки ↑↓ меняют 0 на 0
    for i, r in enumerate(staff_roles, start=1):
        r.position = i

    idx = next((i for i, r in enumerate(staff_roles) if r.id == role_id), -1)
    if idx == -1:
        raise HTTPException(400, "Роль не отмечена как staff")

    swap_with = None
    if direction == "up" and idx > 0:
        swap_with = staff_roles[idx - 1]
    elif direction == "down" and idx < len(staff_roles) - 1:
        swap_with = staff_roles[idx + 1]

    if swap_with is not None:
        role.position, swap_with.position = swap_with.position, role.position
        session.add(role)
        session.add(swap_with)

    session.commit()
    invalidate_role_cache()
    return {"ok": True}


def assignable_roles_for(staff: User, session: Session) -> list:
    """ЕДИНЫЙ источник правды: роли, которые этот staff может назначить."""
    can_manage = has_permission(staff, "manage_roles", session)
    can_assign = has_permission(staff, "assign_roles", session)
    if not can_manage and not can_assign:
        return []
    staff_level = get_user_level(staff, session)
    max_lvl = max_level_for(staff, session) if can_manage else staff_level - 1
    staff_role = session.get(Role, staff.role_id) if staff.role_id else None
    my_cat = staff_role.category_id if staff_role else None
    out = []
    for r in session.exec(select(Role)).all():
        if r.level > max_lvl:
            continue
        if not can_manage:
            # 🆕 ЛИДЕР ОТДЕЛА: is_staff БОЛЬШЕ не преграда (это просто «показывать в правилах»)
            # Видит СТРОГО свой отдел. Нет своего отдела — только роли без отдела.
            if my_cat:
                if r.category_id != my_cat:
                    continue
            else:
                if r.category_id:
                    continue
        out.append(r)
    return out



@app.get("/api/roles/assignable")
def list_assignable_roles(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    roles = assignable_roles_for(staff, session)
    return sorted(
        [
            {
                "id": r.id, "name": r.name, "color": r.color, "level": r.level,
                "category_id": r.category_id, "is_staff": r.is_staff,
            }
            for r in roles
        ],
        key=lambda r: (r["category_id"] or 0, -r["level"]),
    )


@app.post("/api/users/{user_id}/role")
def assign_role(
    user_id: int,
    role_id: Optional[int] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    can_manage = has_permission(staff, "manage_roles", session)
    can_assign = has_permission(staff, "assign_roles", session)
    if not can_manage and not can_assign:
        raise HTTPException(403, "Нет права: manage_roles или assign_roles")

    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    protect_system_account(target, staff, "менять роль")

    if target.id != staff.id:
        check_sanction_rights(staff, target, session, "изменять роль этого пользователя")

    allowed_ids = {r.id for r in assignable_roles_for(staff, session)}
    if role_id:
        if role_id not in allowed_ids:
            raise HTTPException(403, "Эту роль назначить нельзя: уровень или чужой отдел")
    else:
        # Снятие роли: лидер может снять только ту, которую сам мог выдать
        if not can_manage and target.role_id and target.role_id not in allowed_ids:
            raise HTTPException(403, "Недостаточно прав, чтобы снять эту роль")

    old_role_id = target.role_id
    target.role_id = role_id
    session.add(target)
    session.commit()

    session.add(RoleHistory(
        user_id=target.id,
        old_role_id=old_role_id,
        new_role_id=role_id,
        changed_by=staff.id,
    ))
    session.commit()

    return {"ok": True}


@app.get("/api/admin/users")
def admin_list_users(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_users", session):   # 🆕
        raise HTTPException(403, "Нет права: manage_users")
    users = session.exec(select(User).order_by(User.created_at.desc())).all()

    if not users:
        return []

    user_ids = [u.id for u in users]

    # Массовые запросы вместо N+1
    posts_counts = dict(session.exec(
        select(Post.author_id, func.count()).where(Post.author_id.in_(user_ids)).group_by(Post.author_id)
    ).all())

    followers_counts = dict(session.exec(
        select(Follow.followee_id, func.count()).where(Follow.followee_id.in_(user_ids)).group_by(Follow.followee_id)
    ).all())

    # Последние IP: подзапрос или оконная функция. Проще через group_by с max(id)
    last_ip_map = {}
    last_seen_map = {}
    # Берём последний IPLog для каждого пользователя
    ip_logs = session.exec(
        select(IPLog).where(IPLog.user_id.in_(user_ids)).order_by(IPLog.created_at.desc())
    ).all()
    for log in ip_logs:
        if log.user_id not in last_ip_map:
            last_ip_map[log.user_id] = log.ip_address
            last_seen_map[log.user_id] = log.created_at

    _pre = batch_get_users(users, session)
    result = []
    for u in users:
        data = user_out(u, session, _pre.get(u.id))
        data["last_ip"] = last_ip_map.get(u.id)
        data["last_seen"] = last_seen_map.get(u.id).isoformat() if last_seen_map.get(u.id) else None
        data["posts_count"] = posts_counts.get(u.id, 0)
        data["followers_count"] = followers_counts.get(u.id, 0)
        result.append(data)

    return result


@app.post("/api/admin/users/{user_id}/ban")
def admin_ban_user(
    user_id: int,
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(admin, "ban_users", session):
        raise HTTPException(403, "No permission: ban_users")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    # Нельзя банить себя
    if target.id == admin.id:
        raise HTTPException(400, "Нельзя забанить самого себя")
    # 🛡️ Единый иммунитет: Founder/Developer/System трогает только Founder
    check_sanction_rights(admin, target, session, "банить этого пользователя")
    
    target.is_banned = not target.is_banned
    session.add(target)
    session.commit()
    log_action(session, admin.id, "ban_user" if target.is_banned else "unban_user",
               target_type="user", target_id=target.id,
               details={"username": target.username})
    session.commit()
    return {"is_banned": target.is_banned}


# ============================================================
# ⚠️ ПРЕДУПРЕЖДЕНИЯ (ПРАВО warn_users)
# ============================================================
@app.post("/api/admin/users/{user_id}/warn")
def admin_warn_user(
    user_id: int,
    reason: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "warn_users", session):
        raise HTTPException(403, "Нет права: warn_users")
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    protect_system_account(target, staff, "выдавать предупреждения")
    check_hierarchy_or_403(staff, target, session, action="выдать предупреждение этому пользователю")
    if len(reason.strip()) < 3:
        raise HTTPException(400, "Причина слишком короткая")
    w = Warning(user_id=user_id, issuer_id=staff.id, reason=reason.strip())
    session.add(w)
    session.add(Notification(user_id=user_id, actor_id=staff.id, type="warning"))
    log_action(session, staff.id, "warn_user", target_type="user", target_id=user_id,
               details={"reason": reason.strip()})
    session.commit()
    session.refresh(w)
    return {"ok": True, "id": w.id}

@app.get("/api/admin/users/{user_id}/warnings")
def admin_list_warnings(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "warn_users", session):
        raise HTTPException(403, "Нет права: warn_users")
    warns = session.exec(
        select(Warning).where(Warning.user_id == user_id).order_by(Warning.created_at.desc())
    ).all()
    issuer_ids = list({w.issuer_id for w in warns})
    issuers = {u.id: u for u in session.exec(select(User).where(User.id.in_(issuer_ids or [0]))).all()}
    _pre = batch_get_users(list(issuers.values()), session)
    return [{
        "id": w.id,
        "reason": w.reason,
        "active": w.active,
        "issuer": user_out(issuers.get(w.issuer_id), session, _pre.get(w.issuer_id)) if issuers.get(w.issuer_id) else None,
        "created_at": w.created_at.isoformat(),
        "expires_at": w.expires_at.isoformat() if w.expires_at else None,
    } for w in warns]

@app.delete("/api/admin/warnings/{warning_id}")
def admin_revoke_warning(
    warning_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "warn_users", session):
        raise HTTPException(403, "Нет права: warn_users")
    w = session.get(Warning, warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    w.active = False
    session.add(w)
    log_action(session, staff.id, "revoke_warning", target_type="warning", target_id=warning_id)
    session.commit()
    return {"ok": True}



@app.delete("/api/admin/users/{user_id}/avatar")
def admin_remove_avatar(
    user_id: int,
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(admin, "remove_avatars", session):
        raise HTTPException(403, "No permission: remove_avatars")
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    
    check_sanction_rights(admin, target, session, "удалять аватар этого пользователя")
    
    if target.avatar_url and "cloudinary.com" in target.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(target.avatar_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    elif target.avatar_url:
        old_path = os.path.join("uploads", target.avatar_url.split("/")[-1])
        if os.path.exists(old_path):
            os.remove(old_path)
    
    target.avatar_url = None
    session.add(target)
    session.commit()
    return {"ok": True}


@app.post("/api/admin/users/{user_id}/moderator")
def admin_toggle_moderator(
    user_id: int,
    admin: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not (admin.is_admin or has_permission(admin, "assign_moderator", session)):
        raise HTTPException(403, "Нет права: assign_moderator")
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.id == admin.id:
        raise HTTPException(400, "Нельзя менять свой статус")
    check_sanction_rights(admin, target, session, "менять статус этого пользователя")
    target.is_moderator = not target.is_moderator
    session.add(target)
    session.commit()
    log_action(session, admin.id, "toggle_moderator", target_type="user", target_id=target.id,
            details={"is_moderator": target.is_moderator})
    return {"is_moderator": target.is_moderator}


@app.delete("/api/admin/posts/{post_id}")
async def admin_delete_post(
    request: Request,
    post_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    # 🛡️ Иммунитет автора поста
    author = session.get(User, post.author_id)
    if author and author.id != staff.id:
        check_sanction_rights(staff, author, session, "удалять посты этого пользователя")
    await cascade_delete_post(post_id, session)
    log_action(
        session, staff.id, "delete_post",
        target_type="post", target_id=post_id,
        details={"text": post.text[:100] if post.text else None, "by_admin": True},
        ip_address=get_client_ip(request),
    )
    session.commit()
    await manager.broadcast_all("post_deleted", {"post_id": post_id})
    return {"ok": True}


@app.delete("/api/admin/users/{user_id}/posts")
async def admin_delete_all_user_posts(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "delete_posts", session):
        raise HTTPException(403, "No permission: delete_posts")
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    # 🛡️ Единый иммунитет (Founder/Developer/System + иерархия)
    check_sanction_rights(staff, target, session, "удалять посты этого пользователя")
    
    # Находим все посты пользователя (ТОЛЬКО корни, не ответы)
    user_posts = session.exec(
        select(Post).where(Post.author_id == user_id, Post.reply_to_id == None)
    ).all()
    
    total_deleted = 0
    for post in user_posts:
        total_deleted += await cascade_delete_post(post.id, session)
    
    # Также удаляем ответы пользователя на чужие посты
    user_replies = session.exec(
        select(Post).where(Post.author_id == user_id, Post.reply_to_id != None)
    ).all()
    
    reply_ids = [r.id for r in user_replies]
    if reply_ids:
        session.exec(delete(Like).where(Like.post_id.in_(reply_ids)))
        session.exec(delete(Dislike).where(Dislike.post_id.in_(reply_ids)))
        session.exec(delete(PostTag).where(PostTag.post_id.in_(reply_ids)))
        session.exec(delete(Notification).where(Notification.post_id.in_(reply_ids)))
        session.exec(delete(PostView).where(PostView.post_id.in_(reply_ids)))

    for reply in user_replies:
        if reply.media_url and "cloudinary.com" in reply.media_url:
            try:
                public_id = extract_cloudinary_public_id(reply.media_url)
                if public_id:
                    await run_in_threadpool(
                        cloudinary.uploader.destroy,
                        public_id,
                        resource_type="auto"
                    )
            except Exception:
                pass
        elif reply.media_url:
            file_path = os.path.join("uploads", reply.media_url.split("/")[-1])
            if os.path.exists(file_path):
                try:
                    await run_in_threadpool(os.remove, file_path)
                except Exception:
                    pass
        session.delete(reply)
        total_deleted += 1
    
    log_action(
        session, staff.id, "delete_user_posts",
        target_type="user", target_id=user_id,
        details={"deleted_count": total_deleted},
    )
    session.commit()
    return {"ok": True, "deleted_count": total_deleted}



# ============================================================
# 🎛️ АДМИНКА: УПРАВЛЕНИЕ СТИКЕР-ПАКАМИ (НОВАЯ МОДЕЛЬ)
# ============================================================

@app.get("/api/admin/sticker-packs")
def admin_list_packs(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    packs = session.exec(select(StickerPack).order_by(StickerPack.id)).all()
    result = []
    for p in packs:
        stickers = session.exec(
            select(Sticker).where(Sticker.pack_id == p.id).order_by(Sticker.order)
        ).all()
        result.append({
            "id": p.id,
            "name": p.name,
            "min_level": p.min_level,
            "is_active": p.is_active,
            "is_builtin": p.is_builtin,
            "stickers": [{
                "id": s.id,
                "type": s.type,
                "content": s.content,
                "order": s.order,
            } for s in stickers],
        })
    return result


@app.post("/api/admin/sticker-packs")
async def admin_create_pack(
    name: str = Form(...),
    min_level: int = Form(1),
    is_active: bool = Form(True),
    emojis: str = Form("[]"),          # 🆕 JSON-массив эмодзи
    files: List[UploadFile] = File([]), # 🆕 Картинки (можно из папки)
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    
    pack = StickerPack(
        name=name.strip(),
        min_level=min_level,
        is_active=is_active,
        # 🛡️ КРИТИЧЕСКИ ВАЖНО: emojis больше не NOT NULL, но для страховки пишем пустой список
    )
    session.add(pack)
    session.commit()
    session.refresh(pack)
    
    added = []
    max_order = 0
    
    # 1. Эмодзи
    try:
        emoji_list = json.loads(emojis) if isinstance(emojis, str) else emojis
        if not isinstance(emoji_list, list):
            emoji_list = []
    except Exception:
        emoji_list = []
    
    for e in emoji_list:
        if not e:
            continue
        max_order += 1
        s = Sticker(pack_id=pack.id, type="emoji", content=str(e), order=max_order)
        session.add(s)
        session.commit()
        session.refresh(s)
        added.append({"id": s.id, "type": "emoji", "content": e})
    
    # 2. Картинки
    import cloudinary.uploader
    for file in files:
        if not file.content_type or not file.content_type.startswith("image/"):
            continue
        contents = await file.read()
        if len(contents) > 5 * 1024 * 1024:  # 5MB на стикер
            continue
        try:
            result = cloudinary.uploader.upload(contents, folder="stickers", resource_type="image")
            url = result["secure_url"]
            max_order += 1
            s = Sticker(pack_id=pack.id, type="image", content=url, order=max_order)
            session.add(s)
            session.commit()
            session.refresh(s)
            added.append({"id": s.id, "type": "image", "content": url})
        except Exception as e:
            print(f"[Stickers] Failed to upload image: {e}")
    
    return {"ok": True, "id": pack.id, "added": added}


@app.put("/api/admin/sticker-packs/{pack_id}")
async def admin_update_pack(
    pack_id: int,
    name: str = Form(...),
    min_level: int = Form(1),
    is_active: bool = Form(True),
    files: List[UploadFile] = File([]),  # 🆕 можно докинуть картинки при редактировании
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    pack = session.get(StickerPack, pack_id)
    if not pack:
        raise HTTPException(404, "Пак не найден")
    
    pack.name = name.strip()
    pack.min_level = min_level
    pack.is_active = is_active
    session.add(pack)
    
    added = []
    if files:
        max_order = session.exec(
            select(func.max(Sticker.order)).where(Sticker.pack_id == pack_id)
        ).one() or 0
        import cloudinary.uploader
        for file in files:
            if not file.content_type or not file.content_type.startswith("image/"):
                continue
            contents = await file.read()
            try:
                result = cloudinary.uploader.upload(contents, folder="stickers", resource_type="image")
                url = result["secure_url"]
                max_order += 1
                s = Sticker(pack_id=pack_id, type="image", content=url, order=max_order)
                session.add(s)
                session.commit()
                session.refresh(s)
                added.append({"id": s.id, "type": "image", "content": url})
            except Exception as e:
                print(f"[Stickers] Failed to upload: {e}")
    
    session.commit()
    return {"ok": True, "added": added}


@app.delete("/api/admin/sticker-packs/{pack_id}")
def admin_delete_pack(
    pack_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    pack = session.get(StickerPack, pack_id)
    if not pack:
        raise HTTPException(404, "Пак не найден")
    session.delete(pack)
    session.commit()
    return {"ok": True}


@app.post("/api/admin/sticker-packs/{pack_id}/stickers")
async def admin_add_stickers(
    pack_id: int,
    files: List[UploadFile] = File([]),  # Картинки (PNG/WebP)
    emojis: str = Form("[]"),  # JSON-массив эмодзи
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Массовое добавление стикеров: эмодзи + картинки"""
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    pack = session.get(StickerPack, pack_id)
    if not pack:
        raise HTTPException(404, "Пак не найден")
    
    # Текущий максимальный order
    max_order = session.exec(
        select(func.max(Sticker.order)).where(Sticker.pack_id == pack_id)
    ).one() or 0
    
    added = []
    
    # 1. Добавляем эмодзи
    try:
        emoji_list = json.loads(emojis)
        if not isinstance(emoji_list, list):
            emoji_list = []
    except:
        emoji_list = []
    
    for e in emoji_list:
        if not e:
            continue
        max_order += 1
        s = Sticker(pack_id=pack_id, type="emoji", content=e, order=max_order)
        session.add(s)
        session.commit()
        session.refresh(s)
        added.append({"id": s.id, "type": "emoji", "content": e, "order": s.order})
    
    # 2. Загружаем картинки в Cloudinary
    import cloudinary.uploader
    for file in files:
        if not file.content_type or not file.content_type.startswith("image/"):
            continue
        
        contents = await file.read()
        try:
            result = cloudinary.uploader.upload(contents, folder="stickers", resource_type="image")
            url = result["secure_url"]
            
            max_order += 1
            s = Sticker(pack_id=pack_id, type="image", content=url, order=max_order)
            session.add(s)
            session.commit()
            session.refresh(s)
            added.append({"id": s.id, "type": "image", "content": url, "order": s.order})
        except Exception as e:
            print(f"[Stickers] Failed to upload image: {e}")
    
    return {"ok": True, "added": added}


@app.delete("/api/admin/stickers/{sticker_id}")
def admin_delete_sticker(
    sticker_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    sticker = session.get(Sticker, sticker_id)
    if not sticker:
        raise HTTPException(404, "Стикер не найден")
    
    # Удаляем из Cloudinary если это картинка
    if sticker.type == "image" and sticker.content:
        try:
            import cloudinary.uploader
            # Извлекаем public_id из URL
            public_id = sticker.content.split("/")[-1].split(".")[0]
            cloudinary.uploader.destroy(f"stickers/{public_id}")
        except Exception as e:
            print(f"[Stickers] Failed to delete from cloudinary: {e}")
    
    session.delete(sticker)
    session.commit()
    return {"ok": True}


@app.put("/api/admin/stickers/reorder")
def admin_reorder_stickers(
    sticker_ids: str = Form(...),  # JSON массив id в новом порядке
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Изменить порядок стикеров"""
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    try:
        ids = json.loads(sticker_ids)
    except:
        raise HTTPException(400, "Неверный формат")
    
    for i, sid in enumerate(ids):
        sticker = session.get(Sticker, int(sid))
        if sticker:
            sticker.order = i
            session.add(sticker)
    session.commit()
    return {"ok": True}

# ============================================================
# 💬 АДМИНКА: МОДЕРАЦИЯ ЧАТОВ (право manage_groups)
# ============================================================
# ---------- АДМИНКА: настройка реакций на посты ----------

@app.get("/api/admin/post-reaction-packs")
def admin_get_post_reaction_packs(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    cfg = get_post_reaction_config(session)
    packs = session.exec(select(StickerPack).order_by(StickerPack.id)).all()
    result = []
    for p in packs:
        stickers = session.exec(
            select(Sticker).where(Sticker.pack_id == p.id).order_by(Sticker.order)
        ).all()
        allowed = cfg.get(str(p.id))
        result.append({
            "id": p.id,
            "name": p.name,
            "is_active": p.is_active,
            "stickers": [{
                "id": s.id,
                "type": s.type,
                "content": s.content,
            } for s in stickers],
            # какие реакции пака разрешены на постах (None = пак не включён)
            "selected": allowed if isinstance(allowed, list) else None,
        })
    return result


@app.put("/api/admin/post-reaction-packs")
def admin_set_post_reaction_packs(
    config: str = Form(...),  # JSON: {pack_id: [sticker_id, ...]}
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not has_permission(user, "manage_stickers", session):
        raise HTTPException(403, "Нет права: manage_stickers")
    try:
        cfg = json.loads(config)
        if not isinstance(cfg, dict):
            raise ValueError
        clean = {}
        for pid, ids in cfg.items():
            if isinstance(ids, list) and ids:
                clean[str(int(pid))] = [int(i) for i in ids]
    except Exception:
        raise HTTPException(400, "config должен быть JSON объектом {pack_id: [sticker_id, ...]}")
    set_post_reaction_config(session, clean)
    return {"ok": True, "config": get_post_reaction_config(session)}


@app.get("/api/admin/chats")
def admin_list_chats(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Все чаты КРОМЕ секретных. Личные чаты Founder/Developer/System — только для Founder."""
    if not has_permission(staff, "manage_groups", session):
        raise HTTPException(403, "Нет права: manage_groups")

    chats = session.exec(
        select(Chat).where(Chat.is_secret == False).order_by(Chat.created_at.desc())
    ).all()
    if not chats:
        return []
    chat_ids = [c.id for c in chats]

    members = session.exec(select(ChatMember).where(ChatMember.chat_id.in_(chat_ids))).all()
    user_ids = list({m.user_id for m in members})
    users = {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}
    members_by_chat = {}
    for m in members:
        members_by_chat.setdefault(m.chat_id, []).append(users.get(m.user_id))

    msgs = session.exec(
        select(Message).where(Message.chat_id.in_(chat_ids)).order_by(Message.created_at.desc())
    ).all()
    last_by_chat = {}
    for m in msgs:
        if m.chat_id not in last_by_chat:
            last_by_chat[m.chat_id] = m

    result = []
    for c in chats:
        chat_users = [u for u in members_by_chat.get(c.id, []) if u]
        # 🛡️ Личные чаты (DM) с иммунитетом скрыты от всех, кроме Founder
        if not c.is_group:
            has_immune = any(u.is_admin or u.is_moderator or u.is_trelod for u in chat_users)
            if has_immune and not staff.is_admin:
                continue
        last = last_by_chat.get(c.id)
        last_data = None
        if last:
            sender = users.get(last.sender_id)
            last_data = {
                "text": (last.text or "📎 Вложение")[:40],
                "sender_name": sender.display_name if sender else "Unknown",
                "created_at": last.created_at.isoformat(),
            }
        result.append({
            "id": c.id,
            "is_group": c.is_group,
            "name": c.name if c.is_group else (" / ".join([u.display_name for u in chat_users]) or "Диалог"),
            "avatar_url": c.avatar_url,
            "members_count": len(chat_users),
            "last_message": last_data,
            "created_at": c.created_at.isoformat(),
        })
    return result


@app.get("/api/admin/chats/{chat_id}/messages")
def admin_chat_messages(
    chat_id: int,
    limit: int = 200,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Просмотр сообщений чата. Личные чаты Founder/Developer/System — только для Founder."""
    if not has_permission(staff, "manage_groups", session):
        raise HTTPException(403, "Нет права: manage_groups")
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")
    if chat.is_secret:
        raise HTTPException(403, "🔒 Секретные чаты недоступны для модерации")

    # 🛡️ Защита личных чатов с иммунитетом
    if not chat.is_group:
        member_rows = session.exec(select(ChatMember).where(ChatMember.chat_id == chat_id)).all()
        member_users = [session.get(User, m.user_id) for m in member_rows]
        has_immune = any(u and (u.is_admin or u.is_moderator or u.is_trelod) for u in member_users)
        if has_immune and not staff.is_admin:
            raise HTTPException(403, "🛡️ Личные чаты Founder/Developer недоступны для модерации")

    messages = session.exec(
        select(Message).where(Message.chat_id == chat_id)
        .order_by(Message.created_at.desc()).limit(limit)
    ).all()
    messages.reverse()

    sender_ids = list({m.sender_id for m in messages})
    senders = {u.id: u for u in session.exec(select(User).where(User.id.in_(sender_ids))).all()}

    return [{
        "id": m.id,
        "sender_id": m.sender_id,
        "sender_name": senders[m.sender_id].display_name if senders.get(m.sender_id) else "Unknown",
        "sender_avatar": senders[m.sender_id].avatar_url if senders.get(m.sender_id) else None,
        "text": m.text,
        "media_url": m.media_url,
        "media_type": m.media_type,
        "pinned": m.pinned,
        "created_at": m.created_at.isoformat(),
    } for m in messages]



# ============================================================
# 🗂️ КАТЕГОРИИ РОЛЕЙ (ГРУППЫ/ОТДЕЛЫ)
# ============================================================
@app.get("/api/role-categories")
def list_role_categories(session: Session = Depends(get_session)):
    cats = session.exec(select(RoleCategory).order_by(RoleCategory.order, RoleCategory.id)).all()
    return [{"id": c.id, "name": c.name, "color": c.color, "description": c.description, "order": c.order} for c in cats]

@app.post("/api/role-categories")
def create_role_category(
    name: str = Form(...),
    color: str = Form("#8b5cf6"),
    description: Optional[str] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "Нет права: manage_roles")
    if not name.strip():
        raise HTTPException(400, "Название обязательно")
    max_order = session.exec(select(func.max(RoleCategory.order))).one() or 0
    cat = RoleCategory(name=name.strip(), color=color, description=description.strip() if description else None, order=max_order + 1)
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return {"ok": True, "id": cat.id, "name": cat.name, "color": cat.color, "description": cat.description, "order": cat.order}

@app.put("/api/role-categories/{cat_id}")
def update_role_category(
    cat_id: int,
    name: str = Form(...),
    color: str = Form("#8b5cf6"),
    description: Optional[str] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "Нет права: manage_roles")
    cat = session.get(RoleCategory, cat_id)
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    cat.name = name.strip()
    cat.color = color
    cat.description = description.strip() if description else None
    session.add(cat)
    session.commit()
    return {"ok": True}

@app.delete("/api/role-categories/{cat_id}")
def delete_role_category(
    cat_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "Нет права: manage_roles")
    cat = session.get(RoleCategory, cat_id)
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    session.delete(cat)
    session.commit()
    return {"ok": True}




# ---------- техническая панель ----------

@app.get("/api/admin/stats")
def admin_get_stats(
    request: Request,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    ip = get_client_ip(request)
    session.add(IPLog(
        user_id=staff.id,
        ip_address=ip,
        user_agent=request.headers.get("user-agent"),
        action="tech_access"
    ))
    log_action(session, staff.id, "tech_panel_access", ip_address=ip)
    session.commit()
    
    # Общие счётчики
    total_users = session.exec(select(func.count()).select_from(User)).one()
    total_posts = session.exec(select(func.count()).select_from(Post)).one()
    total_likes = session.exec(select(func.count()).select_from(Like)).one()
    total_chats = session.exec(select(func.count()).select_from(Chat)).one()
    
    # Топ по подписчикам — ОДИН запрос с JOIN
    top_followers_query = (
        select(User, func.count(Follow.follower_id).label("followers_count"))
        .outerjoin(Follow, Follow.followee_id == User.id)
        .group_by(User.id)
        .order_by(func.count(Follow.follower_id).desc())
        .limit(5)
    )
    _tf = session.exec(top_followers_query).all()
    _tf_pre = batch_get_users([u for u, _ in _tf], session)
    top_followers = [
        {**user_out(u, session, _tf_pre.get(u.id)), "followers_count": count}
        for u, count in _tf
    ]
    
    # Топ по постам — ОДИН запрос с JOIN
    top_posts_query = (
        select(User, func.count(Post.id).label("posts_count"))
        .outerjoin(Post, Post.author_id == User.id)
        .group_by(User.id)
        .order_by(func.count(Post.id).desc())
        .limit(5)
    )
    _tp = session.exec(top_posts_query).all()
    _tp_pre = batch_get_users([u for u, _ in _tp], session)
    top_posts = [
        {**user_out(u, session, _tp_pre.get(u.id)), "posts_count": count}
        for u, count in _tp
    ]
    
    # Последние регистрации
    recent_users = session.exec(
        select(User).order_by(User.created_at.desc()).limit(10)
    ).all()
    
    _rr_pre = batch_get_users(recent_users, session)
    return {
        "total_users": total_users,
        "total_posts": total_posts,
        "total_likes": total_likes,
        "total_chats": total_chats,
        "top_followers": top_followers,
        "top_posts": top_posts,
        "recent_registrations": [
            {**user_out(u, session, _rr_pre.get(u.id)), "created_at": u.created_at.isoformat()}
            for u in recent_users
        ],
    }


@app.get("/api/admin/users/{user_id}/full")
def admin_get_user_full(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    
    posts_count = session.exec(
        select(func.count()).select_from(Post).where(Post.author_id == user_id)
    ).one()
    followers_count = session.exec(
        select(func.count()).select_from(Follow).where(Follow.followee_id == user_id)
    ).one()
    likes_given = session.exec(
        select(func.count()).select_from(Like).where(Like.user_id == user_id)
    ).one()
    
    return {
        **user_out(user, session),
        "created_at": user.created_at.isoformat(),
        "posts_count": posts_count,
        "followers_count": followers_count,
        "likes_given": likes_given,
    }


@app.patch("/api/admin/users/{user_id}/technical")
def admin_edit_user_technical(
    user_id: int,
    username: Optional[str] = Form(None),
    display_name: Optional[str] = Form(None),
    new_password: Optional[str] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    protect_system_account(target, staff, "редактировать")
    
    # 🛡️ НОВАЯ ЛОГИКА:
    # - Founder может редактировать ВСЕХ (включая других Founder и себя)
    # - Tech Admin и ниже НЕ могут редактировать Founder
    if target.is_admin and not staff.is_admin:
        raise HTTPException(403, "Только Founder может редактировать аккаунт Founder")
    
    # 🛡️ Developer не может редактировать Founder (двойная защита)
    if target.is_admin and staff.is_moderator and not staff.is_admin:
        raise HTTPException(403, "Только Founder может редактировать аккаунт Founder")
    
    # Смена username с проверкой уникальности
    if username:
        username = username.strip().lower()
        if not re.match(r"^[a-z0-9_]{3,30}$", username):
            raise HTTPException(400, "Username: 3-30 символов, латиница/цифры/_")
        existing = session.exec(
            select(User).where(User.username == username, User.id != user_id)
        ).first()
        if existing:
            raise HTTPException(400, "Username уже занят")
        if username != target.username:
            session.add(NickHistory(
                user_id=target.id,
                field="username",
                old_value=target.username or "",
                new_value=username,
                changed_by=staff.id,
            ))
        target.username = username
    
    # Смена display_name
    if display_name:
        if len(display_name.strip()) < 1 or len(display_name.strip()) > 50:
            raise HTTPException(400, "Display name: 1-50 символов")
        display_name = display_name.strip()
        if display_name != target.display_name:
            session.add(NickHistory(
                user_id=target.id,
                field="display_name",
                old_value=target.display_name or "",
                new_value=display_name,
                changed_by=staff.id,
            ))
        target.display_name = display_name
    
    # Смена пароля (без проверки старого — это техпанель)
    if new_password:
        if len(new_password) < 6:
            raise HTTPException(400, "Пароль минимум 6 символов")
        target.password_hash = hash_password(new_password)
    
    session.add(target)
    session.commit()
    session.refresh(target)
    
    return {
        "ok": True,
        "user": user_out(target, session),
    }



@app.post("/api/admin/users/{user_id}/reset-2fa")
def admin_reset_2fa(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Сброс 2FA пользователю. Founder может сбросить себе."""
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    
    # 🆕 Сброс СЕБЕ — всегда разрешаем
    is_self = target.id == staff.id
    
    if not is_self:
        # 🛡️ Единый иммунитет для чужих аккаунтов
        check_sanction_rights(staff, target, session, "сбрасывать 2FA этому пользователю")
    
    # Проверяем что 2FA вообще включена
    if not target.totp_enabled:
        raise HTTPException(400, "У пользователя 2FA не включена")
    
    # Очищаем все данные 2FA
    target.totp_enabled = False
    target.totp_secret = None
    target.totp_backup_codes = None
    session.add(target)
    
    log_action(
        session, staff.id, "reset_2fa",
        target_type="user", target_id=target.id,
        details={"username": target.username, "self_reset": is_self},
    )
    session.commit()
    
    return {"ok": True, "username": target.username}


@app.get("/api/admin/nick-history")
def admin_nick_history(
    limit: int = 100,
    user_id: Optional[int] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Лог смены ников всех пользователей (для окна техников).

    Опционально фильтр по user_id (чей ник менялся). Права: tech_access.
    """
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "Нет права: tech_access")

    query = select(NickHistory).order_by(NickHistory.changed_at.desc()).limit(limit)
    if user_id:
        query = query.where(NickHistory.user_id == user_id)
    rows = session.exec(query).all()

    user_ids = {r.user_id for r in rows} | {r.changed_by for r in rows}
    users = {}
    for u in session.exec(select(User).where(User.id.in_(user_ids))).all():
        users[u.id] = u

    result = []
    for r in rows:
        target = users.get(r.user_id)
        actor = users.get(r.changed_by)
        result.append({
            "id": r.id,
            "field": r.field,
            "old_value": r.old_value,
            "new_value": r.new_value,
            "changed_at": r.changed_at.isoformat() if r.changed_at else None,
            "user": {
                "id": target.id,
                "username": target.username,
                "display_name": target.display_name,
                "avatar_url": target.avatar_url,
            } if target else None,
            "changed_by": {
                "id": actor.id,
                "username": actor.username,
                "display_name": actor.display_name,
                "avatar_url": actor.avatar_url,
            } if actor else None,
        })
    return result


@app.post("/api/admin/users/{user_id}/avatar/set")
async def admin_set_user_avatar(
    user_id: int,
    file: UploadFile = File(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    protect_system_account(target, staff, "менять аватар") 
    if target.is_admin:
        raise HTTPException(403, "Cannot edit admin account")
    
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        raise HTTPException(400, "Invalid image type")
    
    err = check_size_before_read(file.headers, 5 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 5MB)")
    
    if target.avatar_url and "cloudinary.com" in target.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(target.avatar_url)
            if public_id:
                await run_in_threadpool(
                    lambda: cloudinary.uploader.destroy(public_id)
                )
        except Exception:
            pass
    
    try:
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder=UPLOAD_FOLDER,
                resource_type="image",
                transformation=[{"width": 400, "height": 400, "crop": "fill"}],
            )
        )
        target.avatar_url = result.get("secure_url")
    except Exception as e:
        raise HTTPException(400, f"Upload failed: {str(e)}")
    
    session.add(target)
    session.commit()
    
    return {"ok": True, "avatar_url": target.avatar_url}


def serialize_chat_for_user(chat: Chat, user_id: int, session: Session) -> dict:
    """Возвращает данные чата, готовые для отправки на фронт"""
    members = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat.id)
    ).all()
    member_user_ids = [m.user_id for m in members]
    users = session.exec(
        select(User).where(User.id.in_(member_user_ids))
    ).all()
    users_map = {u.id: u for u in users}
    members_map = {m.user_id: m for m in members}

    # Последнее сообщение
    last_msg = session.exec(
        select(Message)
        .where(Message.chat_id == chat.id)
        .order_by(Message.created_at.desc())
        .limit(1)
    ).first()

    # Непрочитанные
    unread = session.exec(
        select(func.count(Message.id)).where(
            Message.chat_id == chat.id,
            Message.sender_id != user_id,
            Message.read == False,
        )
    ).one()

    last_message_data = None
    if last_msg:
        sender = users_map.get(last_msg.sender_id)
        if chat.is_secret:
            last_message_data = {"text": "🔒 Секретное сообщение", "is_encrypted": True,
                                   "sender_id": last_msg.sender_id,
                                   "created_at": last_msg.created_at.isoformat()}
        else:
            if last_msg.text:
                preview = last_msg.text[:50]
            elif last_msg.media_type in ("image", "gif"):
                preview = "📷 Фото"
            elif last_msg.media_type == "video":
                preview = "🎬 Видео"
            elif last_msg.media_type == "audio":
                preview = "🎙️ Голосовое"
            else:
                preview = "Сообщение"
            # В группах добавляем имя отправителя в превью
            if chat.is_group and sender:
                preview = f"{sender.display_name}: {preview}"
            last_message_data = {
                "text": preview,
                "is_encrypted": False,
                "sender_id": last_msg.sender_id,
                "created_at": last_msg.created_at.isoformat(),
            }

    # Мой статус в группе
    my_role = members_map.get(user_id).role if user_id in members_map else None

    if chat.is_group:
        return {
            "id": chat.id,
            "is_group": True,
            "is_secret": False,  # группы без E2EE
            "is_prism": chat.is_prism, 
            "name": chat.name or "Без названия",
            "avatar_url": chat.avatar_url,
            "owner_id": chat.owner_id,
            "members_count": len(members),
            "members": [
                {"user": user_out(users_map[m.user_id], session), "role": m.role}
                for m in members if m.user_id in users_map
            ],
            "my_role": my_role,
            "last_message": last_message_data,
            "unread_count": unread,
            "pinned": chat.pinned_by == user_id,  # 🆕
            "pinned_at": chat.pinned_at.isoformat() if chat.pinned_at else None,
        }
    else:
        # DM — как раньше
        other_member = next((m for m in members if m.user_id != user_id), None)
        
        # 🆕 ЧАТ С САМИМ СОБОЙ (избранное)
        if not other_member:
            other = users_map.get(user_id)  # Берём самого себя
            return {
                "id": chat.id,
                "is_group": False,
                "is_secret": chat.is_secret,
                "is_saved": True,  # 🆕 Флаг для фронта
                "other": user_out(other, session) if other else None,
                "last_message": last_message_data,
                "unread_count": unread,
                "pinned": chat.pinned_by == user_id,
                "pinned_at": chat.pinned_at.isoformat() if chat.pinned_at else None,
            }
        
        other = users_map.get(other_member.user_id) if other_member else None
        return {
            "id": chat.id,
            "is_group": False,
            "is_secret": chat.is_secret,
            "is_prism": chat.is_prism, 
            "other": user_out(other, session) if other else None,
            "last_message": last_message_data,
            "unread_count": unread,
            "pinned": chat.pinned_by == user_id,
            "pinned_at": chat.pinned_at.isoformat() if chat.pinned_at else None,
        }

@app.get("/api/chats")
def list_chats_v2(
    q: str = "",
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    memberships = session.exec(
        select(ChatMember.chat_id).where(ChatMember.user_id == user.id)
    ).all()
    if not memberships:
        return []
    chat_ids = list(memberships)


    if not chat_ids:
        return []

    chats = session.exec(select(Chat).where(Chat.id.in_(chat_ids))).all()

    result = []
    for chat in chats:
        data = serialize_chat_for_user(chat, user.id, session)

        # Фильтрация по поиску
        if q.strip():
            q_lower = q.lower()
            if chat.is_group:
                if q_lower not in (chat.name or "").lower():
                    continue
            else:
                other = data.get("other")
                if not other or (q_lower not in other["display_name"].lower()
                                  and q_lower not in other["username"].lower()):
                    continue

        result.append(data)

    # Сортировка:
    # 1. Закреплённые чаты ВСЕГДА сверху
    # 2. Среди закреплённых — по времени закрепления (новые выше)
    # 3. Среди незакреплённых — непрочитанные выше
    # 4. Потом по дате последнего сообщения
    def sort_key(x):
        is_pinned = 0 if x.get("pinned") else 1
        pinned_time = -(datetime.fromisoformat(x["pinned_at"]).timestamp()) if x.get("pinned_at") else 0
        has_unread = 0 if x["unread_count"] > 0 else 1
        last_msg_time = -(datetime.fromisoformat(x["last_message"]["created_at"]).timestamp()) if x.get("last_message") else 0
        return (is_pinned, pinned_time, has_unread, last_msg_time)

    result.sort(key=sort_key)
    return result



class CreateGroupIn(BaseModel):
    name: str
    user_ids: list[int]  # ID пользователей, которых добавляем (кроме себя)


class CreatePrismChatIn(BaseModel):
    other_user_id: int
    shard1_encrypted: str  
    shard2_genesis: str    
    avatar_url: str   


@app.post("/api/chats/group")
@limiter.limit("5/minute")
async def create_group_chat(
    request: Request,
    data: CreateGroupIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not data.name or not data.name.strip():
        raise HTTPException(400, "Название группы обязательно")
    if len(data.name.strip()) > 80:
        raise HTTPException(400, "Название максимум 80 символов")
    if len(data.user_ids) < 1:
        raise HTTPException(400, "Добавьте хотя бы одного участника")
    if len(data.user_ids) > 49:  # 50 всего включая создателя
        raise HTTPException(400, "Максимум 50 участников в группе")
    if user.id in data.user_ids:
        raise HTTPException(400, "Нельзя добавить себя")

    # Проверка, что все пользователи существуют и не забанены
    valid_ids = set()
    for uid in set(data.user_ids):
        target = session.get(User, uid)
        if target and not target.is_banned:
            valid_ids.add(uid)
    if not valid_ids:
        raise HTTPException(400, "Нет валидных пользователей для добавления")

    chat = Chat(is_group=True, name=data.name.strip(), owner_id=user.id)
    session.add(chat)
    session.commit()
    session.refresh(chat)

    # Создатель = owner
    session.add(ChatMember(chat_id=chat.id, user_id=user.id, role="owner"))
    # Остальные = member
    for uid in valid_ids:
        session.add(ChatMember(chat_id=chat.id, user_id=uid, role="member"))
        # Уведомление о добавлении в группу
        session.add(Notification(
            user_id=uid, actor_id=user.id,
            type="group_invite",
            details=f'{{"chat_id": {chat.id}, "chat_name": "{chat.name}"}}' if False else None,
        ))
    session.commit()

    log_action(session, user.id, "create_group",
               target_type="chat", target_id=chat.id,
               details={"name": chat.name, "members_count": len(valid_ids) + 1},
               ip_address=get_client_ip(request))

    # Уведомляем всех через WebSocket
    asyncio.create_task(manager.broadcast_to_users(
        [user.id] + list(valid_ids),
        "group_created",
        {"chat_id": chat.id, "name": chat.name}
    ))

    return {"chat_id": chat.id}


@app.get("/api/chats/{chat_id}/members")
def get_chat_members(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")

    members = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id)
    ).all()
    user_ids = [m.user_id for m in members]
    users = {u.id: u for u in session.exec(
        select(User).where(User.id.in_(user_ids))
    ).all()}
    return [
        {"user": user_out(users[m.user_id], session), "role": m.role,
         "joined_at": m.joined_at.isoformat() if m.joined_at else None}
        for m in members if m.user_id in users
    ]


@app.post("/api/chats/{chat_id}/members")
@limiter.limit("10/minute")
async def add_group_member(
    request: Request,
    chat_id: int,
    user_id: int = Form(...),
    actor: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    chat = session.get(Chat, chat_id)
    if not chat or not chat.is_group:
        raise HTTPException(404, "Группа не найдена")

    actor_member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == actor.id)
    ).first()
    can_manage = has_permission(actor, "manage_groups", session)   # 🆕
    if not actor_member and not can_manage:
        raise HTTPException(403, "Не участник чата")
    if not can_manage and actor_member.role not in ("owner", "admin"):
        raise HTTPException(403, "Только админы группы или право manage_groups")

    existing = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    ).first()
    if existing:
        raise HTTPException(400, "Уже в группе")

    target = session.get(User, user_id)
    if not target or target.is_banned:
        raise HTTPException(404, "Пользователь не найден")

    # Лимит участников
    current_count = session.exec(
        select(func.count()).select_from(ChatMember).where(ChatMember.chat_id == chat_id)
    ).one()
    if current_count >= 50:
        raise HTTPException(400, "Достигнут лимит участников (50)")

    session.add(ChatMember(chat_id=chat_id, user_id=user_id, role="member"))
    session.add(Notification(user_id=user_id, actor_id=actor.id, type="group_added"))
    session.commit()

    log_action(session, actor.id, "add_group_member",
               target_type="chat", target_id=chat_id,
               details={"added_user_id": user_id}, ip_address=get_client_ip(request))

    # Все участники узнают о новом
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    asyncio.create_task(manager.broadcast_to_users(
        all_member_ids,
        "group_member_added",
        {"chat_id": chat_id, "user": user_out(target, session)}
    ))

    return {"ok": True}


@app.delete("/api/chats/{chat_id}/members/{user_id}")
async def remove_group_member(
    chat_id: int,
    user_id: int,
    actor: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    chat = session.get(Chat, chat_id)
    if not chat or not chat.is_group:
        raise HTTPException(404, "Группа не найдена")

    actor_member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == actor.id)
    ).first()
    target_member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user_id)
    ).first()

    if user_id == actor.id:
        # === ВЫХОД ИЗ ГРУППЫ ===
        if not actor_member:
            raise HTTPException(404, "Не участник")
        
        if actor_member.role == "owner":
            # Передача владения старшему админу или удаление группы
            others = session.exec(
                select(ChatMember).where(
                    ChatMember.chat_id == chat_id,
                    ChatMember.user_id != actor.id
                )
            ).all()
            if not others:
                cascade_delete_chat(chat_id, session)
                return {"ok": True, "deleted": True}
            new_owner = next((m for m in others if m.role == "admin"), others[0])
            new_owner.role = "owner"
            chat.owner_id = new_owner.user_id
            session.add(chat)
            session.add(new_owner)
        
        # Удаляем membership выходящего участника (и owner после передачи, и обычного)
        session.delete(actor_member)
        session.commit()
        
    else:
        # === КИК ДРУГОГО УЧАСТНИКА ===
        can_manage = has_permission(actor, "manage_groups", session)
        if not can_manage and (not actor_member or actor_member.role not in ("owner", "admin")):
            raise HTTPException(403, "Только админы или право manage_groups могут кикать")
        if not target_member:
            raise HTTPException(404, "Участник не найден")
        if target_member.role == "owner":
            raise HTTPException(403, "Нельзя кикнуть создателя")
        session.delete(target_member)
        session.add(Notification(user_id=user_id, actor_id=actor.id, type="group_kicked"))
        session.commit()

    # Рассылаем оставшимся
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    target_user = session.get(User, user_id)
    asyncio.create_task(manager.broadcast_to_users(
        all_member_ids + [user_id],
        "group_member_removed",
        {"chat_id": chat_id, "user_id": user_id,
         "user": user_out(target_user, session) if target_user else None}
    ))

    return {"ok": True}


@app.patch("/api/chats/{chat_id}")
async def update_group_info(
    chat_id: int,
    name: Optional[str] = Form(None),
    avatar_url: Optional[str] = Form(None),
    actor: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    chat = session.get(Chat, chat_id)
    if not chat or not chat.is_group:
        raise HTTPException(404, "Группа не найдена")

    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == actor.id)
    ).first()
    can_manage = has_permission(actor, "manage_groups", session)   # 🆕
    if not can_manage and (not member or member.role not in ("owner", "admin")):
        raise HTTPException(403, "Только админы или право manage_groups могут изменять группу")

    if name is not None:
        if not name.strip() or len(name.strip()) > 80:
            raise HTTPException(400, "Название: 1-80 символов")
        chat.name = name.strip()
    if avatar_url is not None:
        chat.avatar_url = avatar_url or None

    session.add(chat)
    session.commit()

    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    asyncio.create_task(manager.broadcast_to_users(
        all_member_ids,
        "group_info_updated",
        {"chat_id": chat_id, "name": chat.name, "avatar_url": chat.avatar_url}
    ))
    return {"ok": True}


def cascade_delete_chat(chat_id: int, session: Session):
    """Удаляет чат со всеми сообщениями и участниками (массовые DELETE для правильного порядка)"""
    # 0. Получаем ID всех сообщений в чате (для удаления зависимостей)
    message_ids = session.exec(
        select(Message.id).where(Message.chat_id == chat_id)
    ).all()
    
    if message_ids:
        # 1. Удаляем реакции на сообщения
        session.exec(delete(MessageReaction).where(MessageReaction.message_id.in_(message_ids)))
        
        # 2. Обнуляем reply_to_id в ДРУГИХ чатах, если они ссылаются на эти сообщения
        session.exec(
            update(Message)
            .where(Message.reply_to_id.in_(message_ids))
            .values(reply_to_id=None)
        )
        
        # 3. Обнуляем forwarded_from_id в ДРУГИХ чатах
        session.exec(
            update(Message)
            .where(Message.forwarded_from_id.in_(message_ids))
            .values(forwarded_from_id=None)
        )
    
    # 4. Удаляем сообщения
    session.exec(delete(Message).where(Message.chat_id == chat_id))
    
    # 5. Удаляем сессионные ключи
    session.exec(delete(ChatSessionKey).where(ChatSessionKey.chat_id == chat_id))
    
    # 6. Удаляем участников чата
    session.exec(delete(ChatMember).where(ChatMember.chat_id == chat_id))
    
    # 7. Удаляем сам чат
    session.exec(delete(Chat).where(Chat.id == chat_id))
    
    session.commit()

@app.delete("/api/chats/{chat_id}")
async def delete_chat(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удалить чат (DM или группа). Для DM — удаляет у обоих."""
    try:
        chat = session.get(Chat, chat_id)
        if not chat:
            raise HTTPException(404, "Чат не найден")
        member = session.exec(
            select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
        ).first()
        if not member:
            raise HTTPException(403, "Не участник")
        # Для групп: создатель, админ сайта или право manage_groups
        if chat.is_group and member.role != "owner" and not user.is_admin and not has_permission(user, "manage_groups", session):
            raise HTTPException(403, "Только создатель или право manage_groups может удалить группу")
        # Собираем ID всех участников ДО удаления (для рассылки)
        all_member_ids = session.exec(
            select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
        ).all()
        # Каскадное удаление
        cascade_delete_chat(chat_id, session)
        # 🆕 Рассылаем событие ВСЕМ бывшим участникам
        await manager.broadcast_to_users(
            list(all_member_ids),
            "chat_deleted",
            {"chat_id": chat_id}
        )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        session.rollback()
        print(f"❌ Error deleting chat {chat_id}: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Ошибка удаления чата: {str(e)}")



@app.on_event("startup")
def startup():
    """Только проверка соединения с БД. Схема создаётся/мигрируется через Alembic."""
    # Применение миграций: alembic upgrade head (см. scripts/run_migrations.py, деплой)
    from sqlalchemy import text as _t
    try:
        with engine.connect() as conn:
            conn.execute(_t("SELECT 1"))
        print("✅ База данных доступна")
    except Exception as e:
        print(f"❌ Нет соединения с БД: {e}")



# ============================================================
# 📖 ПОСЛЕДНИЙ ЧИТАЕМЫЙ ПОСТ (вместо прогресса скролла)
# ============================================================

class MarkReadingIn(BaseModel):
    post_id: int

@app.post("/api/me/last-read")
def mark_as_last_read(
    data: MarkReadingIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Запоминаем последний открытый пост. Вызывается с /post/{id}."""
    post = session.get(Post, data.post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    
    existing = session.get(LastReadPost, user.id)
    if existing:
        existing.post_id = data.post_id
        existing.saved_at = datetime.now(timezone.utc)
    else:
        session.add(LastReadPost(user_id=user.id, post_id=data.post_id))
    session.commit()
    return {"ok": True}


@app.get("/api/me/last-read")
def get_last_read_post(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Возвращает последний читаемый пост для кнопки 'Продолжить'"""
    record = session.get(LastReadPost, user.id)
    if not record:
        return {"has_post": False}
    
    post = session.get(Post, record.post_id)
    if not post:
        session.delete(record)
        session.commit()
        return {"has_post": False}
    
    author = session.get(User, post.author_id)
    return {
        "has_post": True,
        "post_id": post.id,
        "text_preview": (post.text or "📎 Медиа")[:100],
        "author_name": author.display_name if author else "Удалённый пользователь",
        "author_avatar": author.avatar_url if author else None,
        "saved_at": record.saved_at.isoformat(),
    }


@app.delete("/api/me/last-read")
def clear_last_read_post(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Стираем запись. Вызывается при открытии поста ИЛИ при клике '✕'."""
    record = session.get(LastReadPost, user.id)
    if record:
        session.delete(record)
        session.commit()
    return {"ok": True}


# ============================================================
# 😂 РЕАКЦИИ НА СООБЩЕНИЯ
# ============================================================

def reaction_limit_for(user: User, session: Session) -> int:
    """Level 1 → 3 реакции, Level 2+ → 5"""
    return 5 if get_user_level(user, session) >= 2 else 3


def build_reactions_map(session: Session, message_ids: list, current_user_id: int) -> dict:
    """Массово собирает реакции (стикеры + эмодзи) для списка сообщений"""
    if not message_ids:
        return {}
    
    rows = session.exec(
        select(MessageReaction).where(MessageReaction.message_id.in_(message_ids))
    ).all()
    
    # Загружаем все стикеры одним запросом
    sticker_ids = [r.sticker_id for r in rows if r.sticker_id]
    stickers_map = {}
    if sticker_ids:
        for s in session.exec(select(Sticker).where(Sticker.id.in_(sticker_ids))).all():
            stickers_map[s.id] = s
    
    grouped: dict = {}
    for r in rows:
        grouped.setdefault(r.message_id, {})
        
        if r.sticker_id:
            key = f"sticker_{r.sticker_id}"
            sticker = stickers_map.get(r.sticker_id)
            if not sticker:
                continue
            item = grouped[r.message_id].setdefault(key, {
                "type": "sticker",
                "sticker_id": r.sticker_id,
                "content": sticker.content,  # URL картинки
                "count": 0,
                "me": False,
            })
        else:
            key = f"emoji_{r.emoji}"
            item = grouped[r.message_id].setdefault(key, {
                "type": "emoji",
                "emoji": r.emoji,
                "content": r.emoji,
                "count": 0,
                "me": False,
            })
        
        item["count"] += 1
        if r.user_id == current_user_id:
            item["me"] = True
    
    result = {}
    for mid, reactions in grouped.items():
        result[mid] = sorted(reactions.values(), key=lambda x: -x["count"])
    return result


@app.get("/api/sticker-packs")
def get_sticker_packs(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Паки стикеров с учётом уровня пользователя"""
    packs = session.exec(
        select(StickerPack).where(StickerPack.is_active == True).order_by(StickerPack.id)
    ).all()
    user_level = get_user_level(user, session)
    
    result = []
    for p in packs:
        locked = (user_level < p.min_level) and not user.is_admin
        # Загружаем стикеры пака
        stickers = session.exec(
            select(Sticker).where(Sticker.pack_id == p.id).order_by(Sticker.order)
        ).all()
        
        result.append({
            "id": p.id,
            "name": p.name,
            "min_level": p.min_level,
            "locked": locked,
            "stickers": [{
                "id": s.id,
                "type": s.type,
                "content": s.content,
            } for s in stickers],
        })
    
    return result


# ============================================================
# 😀 РЕАКЦИИ НА ПОСТЫ (одна реакция на пользователя на пост)
# ============================================================

POST_REACTION_SETTING_KEY = "post_reaction_packs"


def get_post_reaction_config(session: Session) -> dict:
    """Конфиг реакций на посты: {pack_id: [sticker_id, ...]} — какие конкретно реакции из пака доступны"""
    row = session.get(SystemSetting, POST_REACTION_SETTING_KEY)
    if not row or not row.value:
        return {}
    try:
        data = json.loads(row.value)
        if isinstance(data, list):
            # legacy-формат (список pack_id целиком) — считаем что весь пак разрешён
            return {str(int(pid)): None for pid in data if str(pid).lstrip("-").isdigit()}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def set_post_reaction_config(session: Session, cfg: dict):
    row = session.get(SystemSetting, POST_REACTION_SETTING_KEY)
    if row:
        row.value = json.dumps(cfg)
        row.updated_at = datetime.now(timezone.utc)
    else:
        session.add(SystemSetting(key=POST_REACTION_SETTING_KEY, value=json.dumps(cfg)))
    session.commit()


def is_sticker_allowed_for_posts(session: Session, sticker: "Sticker") -> bool:
    cfg = get_post_reaction_config(session)
    allowed = cfg.get(str(sticker.pack_id))
    if allowed is None:
        return False  # пак не включён
    if isinstance(allowed, list):
        return sticker.id in allowed
    return False


@app.get("/api/post-reactions")
def get_post_reactions_config(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Паки + конкретные реакции, включённые админом для постов (с учётом уровня юзера)"""
    cfg = get_post_reaction_config(session)
    if not cfg:
        return []
    packs = session.exec(
        select(StickerPack).where(StickerPack.is_active == True).order_by(StickerPack.id)
    ).all()
    user_level = get_user_level(user, session)

    result = []
    for p in packs:
        allowed = cfg.get(str(p.id))
        if not allowed:
            continue
        locked = (user_level < p.min_level) and not user.is_admin
        stickers = session.exec(
            select(Sticker)
            .where(Sticker.pack_id == p.id, Sticker.id.in_([int(i) for i in allowed]))
            .order_by(Sticker.order)
        ).all()
        if not stickers:
            continue
        result.append({
            "id": p.id,
            "name": p.name,
            "locked": locked,
            "stickers": [{
                "id": s.id,
                "type": s.type,
                "content": s.content,
            } for s in stickers],
        })
    return result


@app.get("/api/posts/{post_id}/reactions")
def get_post_reactions(
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Реакции поста с агрегацией и флагом 'моя'"""
    return {"reactions": build_post_reactions_map(session, [post_id], user.id).get(post_id, [])}


def build_post_reactions_map(session: Session, post_ids: list, current_user_id: int) -> dict:
    """Массово собирает реакции на посты: {post_id: [{type, content, count, mine}]}"""
    if not post_ids:
        return {}

    rows = session.exec(
        select(PostReaction).where(PostReaction.post_id.in_(post_ids))
    ).all()

    sticker_ids = [r.sticker_id for r in rows if r.sticker_id]
    stickers_map = {}
    if sticker_ids:
        for s in session.exec(select(Sticker).where(Sticker.id.in_(sticker_ids))).all():
            stickers_map[s.id] = s

    grouped: dict = {}
    for r in rows:
        grouped.setdefault(r.post_id, {})
        if r.sticker_id:
            key = f"sticker_{r.sticker_id}"
            sticker = stickers_map.get(r.sticker_id)
            if not sticker:
                continue
            content = sticker.content
            rtype = "sticker" if sticker.type == "image" else "emoji"
        else:
            if not r.emoji:
                continue
            key = f"emoji_{r.emoji}"
            content = r.emoji
            rtype = "emoji"

        entry = grouped[r.post_id].setdefault(key, {"type": rtype, "content": content, "count": 0, "mine": False, "sticker_id": r.sticker_id})
        entry["count"] += 1
        if r.user_id == current_user_id:
            entry["mine"] = True

    result = {}
    for pid, reactions in grouped.items():
        result[pid] = sorted(reactions.values(), key=lambda x: -x["count"])
    return result


@app.post("/api/posts/{post_id}/reactions")
async def toggle_post_reaction(
    post_id: int,
    sticker_id: int = Form(None),
    emoji: str = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Toggle реакции на пост. У пользователя ТОЛЬКО ОДНА реакция на пост:
    клик по другой реакции — заменяет, по той же — снимает."""
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Пост не найден")

    # Валидация стикера: должен быть разрешён админом для постов
    sticker_obj = None
    if sticker_id:
        sticker_obj = session.get(Sticker, sticker_id)
        if not sticker_obj:
            raise HTTPException(404, "Стикер не найден")
        if not is_sticker_allowed_for_posts(session, sticker_obj):
            raise HTTPException(403, "🔒 Эта реакция недоступна для постов")
        pack = session.get(StickerPack, sticker_obj.pack_id)
        user_level = get_user_level(user, session)
        if not pack.is_active or (user_level < pack.min_level and not user.is_admin):
            raise HTTPException(403, "🔒 Стикер недоступен")
    elif not emoji:
        raise HTTPException(400, "Укажите sticker_id или emoji")

    # Одна реакция на пользователя на пост: снимаем предыдущую, если она другая
    existing = session.exec(select(PostReaction).where(
        PostReaction.post_id == post_id,
        PostReaction.user_id == user.id,
    )).first()

    if existing:
        same = (
            (sticker_obj and existing.sticker_id == sticker_id)
            or (not sticker_obj and existing.sticker_id is None and existing.emoji == emoji)
        )
        session.delete(existing)
        session.commit()
        if not same:
            # Заменяем реакцию
            session.add(PostReaction(
                post_id=post_id,
                user_id=user.id,
                sticker_id=sticker_id if sticker_obj else None,
                emoji=emoji if not sticker_obj else None,
            ))
            session.commit()
    else:
        session.add(PostReaction(
            post_id=post_id,
            user_id=user.id,
            sticker_id=sticker_id if sticker_obj else None,
            emoji=emoji if not sticker_obj else None,
        ))
        session.commit()

    reactions = build_post_reactions_map(session, [post_id], user.id).get(post_id, [])
    return {"ok": True, "reactions": reactions}


@app.post("/api/chats/{chat_id}/messages/{message_id}/reactions")
async def toggle_reaction(
    chat_id: int,
    message_id: int,
    sticker_id: int = Form(None),
    emoji: str = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Участник чата?
    member = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat_id, ChatMember.user_id == user.id
    )).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    
    # 2. Сообщение существует?
    msg = session.get(Message, message_id)
    if not msg or msg.chat_id != chat_id:
        raise HTTPException(404, "Сообщение не найдено")
    
    # 3. Проверяем доступ к стикеру/эмодзи
    user_level = get_user_level(user, session)
    sticker_obj = None
    
    if sticker_id:
        sticker_obj = session.get(Sticker, sticker_id)
        if not sticker_obj:
            raise HTTPException(404, "Стикер не найден")
        pack = session.get(StickerPack, sticker_obj.pack_id)
        if not pack.is_active or (user_level < pack.min_level and not user.is_admin):
            raise HTTPException(403, "🔒 Стикер недоступен")
    elif not emoji:
        raise HTTPException(400, "Укажите sticker_id или emoji")
    
    # 4. Toggle: уже стоит — убираем
    if sticker_obj:
        existing = session.exec(select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user.id,
            MessageReaction.sticker_id == sticker_id,
        )).first()
    else:
        existing = session.exec(select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user.id,
            MessageReaction.emoji == emoji,
            MessageReaction.sticker_id == None,
        )).first()
    
    if existing:
        session.delete(existing)
        session.commit()
    else:
        # 5. Лимит реакций на этом сообщении от меня
        my_count = session.exec(select(func.count(MessageReaction.id)).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user.id,
        )).one()
        limit = reaction_limit_for(user, session)
        if my_count >= limit:
            raise HTTPException(400, f"Максимум {limit} реакций на вашем уровне")
        
        session.add(MessageReaction(
            message_id=message_id,
            user_id=user.id,
            sticker_id=sticker_id if sticker_obj else None,
            emoji=emoji if not sticker_obj else None,
        ))
        session.commit()
    
    # 6. Собираем актуальные реакции и шлём всем
    reactions = build_reactions_map(session, [message_id], user.id).get(message_id, [])
    all_member_ids = session.exec(select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)).all()
    await manager.broadcast_to_users(list(all_member_ids), "message_reaction", {
        "chat_id": chat_id,
        "message_id": message_id,
        "reactions": reactions,
    })
    return {"ok": True, "reactions": reactions}


@app.post("/api/chats/{chat_id}/messages/sticker")
async def send_sticker_message(
    chat_id: int,
    sticker_id: int = Form(...),
    reply_to_id: int = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отправить стикер как отдельное сообщение в чат"""
    # 1. Участник?
    member = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat_id, ChatMember.user_id == user.id
    )).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    
    # 2. Стикер существует и доступен?
    sticker = session.get(Sticker, sticker_id)
    if not sticker:
        raise HTTPException(404, "Стикер не найден")
    pack = session.get(StickerPack, sticker.pack_id)
    user_level = get_user_level(user, session)
    if not pack.is_active or (user_level < pack.min_level and not user.is_admin):
        raise HTTPException(403, "🔒 Стикер недоступен")
    
    # 3. Reply
    valid_reply_to = None
    if reply_to_id:
        reply_msg = session.get(Message, reply_to_id)
        if reply_msg and reply_msg.chat_id == chat_id:
            valid_reply_to = reply_to_id
    
    # 4. Создаём сообщение (стикер-картинка или эмодзи как текст)
    if sticker.type == "image":
        msg = Message(
            chat_id=chat_id,
            sender_id=user.id,
            media_url=sticker.content,
            media_type="sticker",
            reply_to_id=valid_reply_to,
        )
    else:
        msg = Message(
            chat_id=chat_id,
            sender_id=user.id,
            text=sticker.content,  # эмодзи как текст
            reply_to_id=valid_reply_to,
        )
    session.add(msg)
    session.commit()
    session.refresh(msg)
    
    # 5. Рассылка
    sender = session.get(User, user.id)
    all_member_ids = session.exec(select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)).all()
    await manager.broadcast_to_users(list(all_member_ids), "new_message", {
        "id": msg.id,
        "chat_id": chat_id,
        "sender_id": user.id,
        "sender_name": sender.display_name if sender else "User",
        "sender_avatar": sender.avatar_url if sender else None,
        "text": msg.text,
        "media_url": msg.media_url,
        "media_type": msg.media_type,
        "is_encrypted_media": False,
        "reply_to_id": msg.reply_to_id,
        "reply_preview": get_reply_preview(session, msg.reply_to_id) if msg.reply_to_id else None,
        "reactions": [],
        "pinned": False,
        "created_at": msg.created_at.isoformat(),
    })
    
    return {"ok": True, "message_id": msg.id}



# ============================================================
# 🎨 ТЕМЫ (АНИМИРОВАННЫЕ ФОНЫ)
# ============================================================

from typing import List
import json

def theme_to_dict(t: Theme) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "type": t.type,
        "colors": json.loads(t.colors) if isinstance(t.colors, str) else t.colors,
        "speed": t.speed,
        "intensity": t.intensity,
        "blur": t.blur,
        "is_default": t.is_default,
        "min_level": t.min_level,
        "is_active": t.is_active,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


@app.get("/api/themes")
def get_themes(
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    """Публичный список тем — фильтруем по уровню доступа пользователя"""
    # Глобальный тумблер
    enabled_row = session.get(SystemSetting, "themes_enabled")
    themes_enabled = enabled_row.value == "true" if enabled_row else False
    
    if not themes_enabled:
        return []

    user_level = get_user_level(user, session) if user else 0
    is_admin = user.is_admin if user else False

    # Берём активные темы, доступные пользователю по уровню
    query = select(Theme).where(Theme.is_active == True)
    themes = session.exec(query).all()

    result = []
    for t in themes:
        # Пропускаем недоступные (кроме админов — они видят всё)
        if not is_admin and t.min_level > user_level:
            continue
        result.append(theme_to_dict(t))
    return result


@app.get("/api/themes/all")
def get_all_themes(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Все темы — для админки"""
    if not user.is_admin:
        raise HTTPException(403, "Только для админов")
    
    themes = session.exec(select(Theme).order_by(Theme.created_at.desc())).all()
    return [theme_to_dict(t) for t in themes]


@app.post("/api/themes")
def create_theme(
    name: str,
    type: str,
    colors: str,  # JSON
    speed: float = 24.0,
    intensity: float = 0.22,
    blur: int = 80,
    min_level: int = 0,
    is_default: bool = False,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Только для админов")
    
    if type not in {"aurora", "gradient", "liquid", "neon"}:
        raise HTTPException(400, "Неверный тип анимации")
    
    # Валидация JSON цветов
    try:
        colors_list = json.loads(colors) if isinstance(colors, str) else colors
        if not isinstance(colors_list, list) or len(colors_list) < 2 or len(colors_list) > 4:
            raise ValueError
    except:
        raise HTTPException(400, "Цвета должны быть JSON массивом из 2-4 цветов")
    
    # Если делаем дефолтной — снимаем флаг с других
    if is_default:
        for existing in session.exec(select(Theme).where(Theme.is_default == True)).all():
            existing.is_default = False
            session.add(existing)
    
    theme = Theme(
        name=name,
        type=type,
        colors=json.dumps(colors_list),
        speed=speed,
        intensity=intensity,
        blur=blur,
        is_default=is_default,
        min_level=min_level,
        is_active=True,
        created_by=user.id,
    )
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme_to_dict(theme)


@app.put("/api/themes/{theme_id}")
def update_theme(
    theme_id: int,
    name: str,
    type: str,
    colors: str,
    speed: float,
    intensity: float,
    blur: int,
    min_level: int,
    is_default: bool,
    is_active: bool,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Только для админов")
    
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "Тема не найдена")
    
    try:
        colors_list = json.loads(colors) if isinstance(colors, str) else colors
    except:
        raise HTTPException(400, "Неверный формат цветов")
    
    # Снимаем is_default с других если эта становится дефолтной
    if is_default and not theme.is_default:
        for existing in session.exec(select(Theme).where(
            Theme.is_default == True, Theme.id != theme_id
        )).all():
            existing.is_default = False
            session.add(existing)
    
    theme.name = name
    theme.type = type
    theme.colors = json.dumps(colors_list)
    theme.speed = speed
    theme.intensity = intensity
    theme.blur = blur
    theme.min_level = min_level
    theme.is_default = is_default
    theme.is_active = is_active
    
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme_to_dict(theme)


@app.delete("/api/themes/{theme_id}")
def delete_theme(
    theme_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Только для админов")
    
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "Тема не найдена")
    
    session.delete(theme)
    session.commit()
    return {"ok": True}


@app.get("/api/themes/settings")
def get_themes_settings(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403)
    
    enabled_row = session.get(SystemSetting, "themes_enabled")
    return {"themes_enabled": enabled_row.value == "true" if enabled_row else False}


@app.post("/api/themes/settings")
def update_themes_settings(
    enabled: bool,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403)
    
    row = session.get(SystemSetting, "themes_enabled")
    if not row:
        row = SystemSetting(key="themes_enabled", value=str(enabled).lower())
    else:
        row.value = str(enabled).lower()
        row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    return {"ok": True, "enabled": enabled}





@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Мягкое удаление — анонимизация в стиле Telegram/VK"""
    if not staff.is_admin:
        if not has_permission(staff, "tech_access", session) or not has_permission(staff, "delete_users", session):
            raise HTTPException(403, "No permission: delete_users")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    
    if target.id == staff.id:
        raise HTTPException(400, "Cannot delete your own account via admin panel")
    
    # 🛡️ Иммунитет системных аккаунтов
    check_sanction_rights(staff, target, session, "удалять этот аккаунт")

    # === МЯГКОЕ УДАЛЕНИЕ: анонимизируем вместо физического ===
    target.username = f"deleted_{target.id}"
    target.display_name = "Удаленный аккаунт"
    target.avatar_url = None
    target.cover_url = None
    target.bio = ""
    target.is_banned = True
    target.token_version = (target.token_version or 0) + 1  # выкидываем из всех сессий
    
    # Очищаем 2FA чтобы не висела
    target.totp_enabled = False
    target.totp_secret = None
    target.totp_backup_codes = None
    
    session.add(target)
    
    log_action(
        session, staff.id, "user_soft_deleted",
        target_type="user", target_id=target.id,
        details={"username": target.username},
    )
    session.commit()
    
    return {
        "ok": True,
        "message": "Аккаунт анонимизирован и заблокирован",
    }

@app.post("/api/chats")
def open_or_create_chat(
    other_user_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if other_user_id == user.id:
        raise HTTPException(400, "Cannot chat with yourself")
    other = session.get(User, other_user_id)
    if not other:
        raise HTTPException(404, "User not found")
    
    # 🔥 Ищем существующий DM-чат (ровно 2 участника, не группа, не секретный)
    my_chats = session.exec(
        select(ChatMember.chat_id).where(ChatMember.user_id == user.id)
    ).all()
    
    for chat_id_row in my_chats:
        chat_id = chat_id_row  # это уже число из .all()
        chat = session.get(Chat, chat_id)
        if not chat:
            continue
        # Пропускаем секретные и групповые
        if chat.is_secret or chat.is_group:
            continue
        # ✅ КЛЮЧЕВАЯ ПРОВЕРКА: в чате должно быть РОВНО 2 участника (настоящий DM)
        member_count = session.exec(
            select(func.count()).select_from(ChatMember).where(ChatMember.chat_id == chat_id)
        ).one()
        if member_count != 2:
            continue  # Это не DM — пропускаем
        # Проверяем, что второй участник — именно тот, кого мы ищем
        other_in_chat = session.exec(
            select(ChatMember).where(
                ChatMember.chat_id == chat_id,
                ChatMember.user_id == other_user_id,
            )
        ).first()
        if other_in_chat:
            return {"chat_id": chat_id}
    
    # Не нашли — создаём новый DM
    chat = Chat()
    session.add(chat)
    session.commit()
    session.refresh(chat)
    session.add(ChatMember(chat_id=chat.id, user_id=user.id, role="member"))
    session.add(ChatMember(chat_id=chat.id, user_id=other_user_id, role="member"))
    session.commit()
    return {"chat_id": chat.id}




# ============================================================
# 🔐 2FA (TOTP) + EMAIL
# ============================================================

# ---------- 2FA: НАСТРОЙКА ----------

@app.post("/api/2fa/setup")
@limiter.limit("5/minute")
def setup_2fa(
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Генерирует секрет и QR-код для привязки аутентификатора"""
    if user.totp_enabled:
        raise HTTPException(400, "2FA уже включена")
    
    # Генерируем новый секрет
    secret = pyotp.random_base32()
    
    # Сохраняем секрет (пока не активирован)
    user.totp_secret = secret
    session.add(user)
    session.commit()
    
    # Генерируем URI для QR
    totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=user.username,
        issuer_name="Nebula"  # ← Замени на название своего приложения
    )
    
    # Генерируем QR-код как base64
    img = qrcode.make(totp_uri)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    # Генерируем резервные коды
    backup_codes = [uuid.uuid4().hex[:8].upper() for _ in range(10)]
    
    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "backup_codes": backup_codes,  # Показываем ОДИН РАЗ
        "uri": totp_uri,
    }


@app.post("/api/2fa/activate")
@limiter.limit("5/minute")
def activate_2fa(
    request: Request,
    code: str = Form(...),
    backup_codes: str = Form(...),  # JSON массив кодов
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Активирует 2FA после проверки кода из аутентификатора"""
    if user.totp_enabled:
        raise HTTPException(400, "2FA уже включена")
    
    if not user.totp_secret:
        raise HTTPException(400, "Сначала вызовите /api/2fa/setup")
    
    # Проверяем код
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code, valid_window=1):  # valid_window=1 для учёта рассинхрона времени
        raise HTTPException(400, "Неверный код. Проверьте и попробуйте снова.")
    
    # Парсим и хешируем резервные коды
    try:
        codes_list = json.loads(backup_codes)
        if not isinstance(codes_list, list) or len(codes_list) != 10:
            raise ValueError
    except:
        raise HTTPException(400, "Неверный формат резервных кодов")
    
    # Храним хеши резервных кодов (не сами коды!)
    hashed_codes = [hash_password(c) for c in codes_list]
    
    user.totp_enabled = True
    user.totp_backup_codes = json.dumps(hashed_codes)
    session.add(user)
    session.commit()
    
    log_action(session, user.id, "2fa_enabled")
    session.commit()
    
    return {"ok": True, "message": "2FA успешно активирована"}


@app.post("/api/2fa/disable")
@limiter.limit("5/minute")
def disable_2fa(
    request: Request,
    code: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отключает 2FA (нужен код из аутентификатора ИЛИ резервный код)"""
    if not user.totp_enabled:
        raise HTTPException(400, "2FA не включена")
    
    # Проверяем: это TOTP код или резервный?
    totp = pyotp.TOTP(user.totp_secret)
    
    if totp.verify(code, valid_window=1):
        # Это валидный TOTP код
        pass
    else:
        # Проверяем как резервный код
        backup_codes = json.loads(user.totp_backup_codes) if user.totp_backup_codes else []
        found = False
        for i, hashed in enumerate(backup_codes):
            if check_password(code.upper(), hashed):
                # Удаляем использованный резервный код
                backup_codes.pop(i)
                user.totp_backup_codes = json.dumps(backup_codes)
                found = True
                break
        if not found:
            raise HTTPException(400, "Неверный код")
    
    user.totp_enabled = False
    user.totp_secret = None
    user.totp_backup_codes = None
    session.add(user)
    session.commit()
    
    log_action(session, user.id, "2fa_disabled")
    session.commit()
    
    return {"ok": True, "message": "2FA отключена"}


@app.get("/api/2fa/status")
def get_2fa_status(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Статус 2FA для отображения в настройках"""
    backup_codes_left = 0
    if user.totp_backup_codes:
        try:
            backup_codes_left = len(json.loads(user.totp_backup_codes))
        except:
            pass
    
    return {
        "enabled": user.totp_enabled,
        "backup_codes_left": backup_codes_left,
        "email_linked": bool(user.email),
        "email_verified": user.email_verified,
        "email": user.email,
    }


@app.post("/api/2fa/backup-codes/regenerate")
def regenerate_backup_codes(
    code: str = Form(...),  # Текущий TOTP код для подтверждения
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Перегенерирует резервные коды (старые становятся невалидными)"""
    if not user.totp_enabled:
        raise HTTPException(400, "2FA не включена")
    
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(400, "Неверный код")
    
    backup_codes = [uuid.uuid4().hex[:8].upper() for _ in range(10)]
    hashed_codes = [hash_password(c) for c in backup_codes]
    
    user.totp_backup_codes = json.dumps(hashed_codes)
    session.add(user)
    session.commit()
    
    return {"ok": True, "backup_codes": backup_codes}


# ---------- 2FA: ПРОВЕРКА ПРИ ЛОГИНЕ ----------

@app.post("/api/login")
@limiter.limit("5/minute")
def login(request: Request, response: Response, data: LoginIn, session: Session = Depends(get_session)):
    # 🛡️ 1. ЗАЩИТА ОТ БРУТФОРСА ПО USERNAME
    fail_key = f"failed_login:{data.username.lower()}"
    fail_count = redis_client.get(fail_key)
    
    if fail_count and int(fail_count) >= 5:
        ttl = redis_client.ttl(fail_key)
        raise HTTPException(429, f"Слишком много попыток для этого аккаунта. Подождите {ttl // 60} мин.")

    # 2. ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ
    user = session.exec(select(User).where(User.username == data.username)).first()
    
    if not user or not check_password(data.password, user.password_hash):
        # 🔥 Увеличиваем счетчик неудачных попыток в Redis
        pipe = redis_client.pipeline()
        pipe.incr(fail_key)
        pipe.expire(fail_key, 900)  # Блок на 15 минут (900 секунд)
        pipe.execute()
        raise HTTPException(401, "Wrong username or password")
    
    if user.is_banned:
        raise HTTPException(403, "Account banned")

    # 🆕 3. ЕСЛИ 2FA ВКЛЮЧЕНА — не отдаём токен, просим код
    if user.totp_enabled:
        return {
            "requires_2fa": True,
            "user_id": user.id,
            "username": user.username,
        }
    
    # 4. ОБЫЧНЫЙ ЛОГИН БЕЗ 2FA
    ensure_user_has_keys(user.id, session)
    
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent")
    last_log = session.exec(
        select(IPLog).where(IPLog.user_id == user.id).order_by(IPLog.created_at.desc()).limit(1)
    ).first()
    if last_log and (last_log.ip_address != ip or last_log.user_agent != ua):
        session.add(Notification(user_id=user.id, actor_id=user.id, type="login_alert"))
    session.add(IPLog(user_id=user.id, ip_address=ip, user_agent=ua, action="login"))
    log_action(session, user.id, "login", ip_address=ip)
    session.commit()

    _tv = getattr(user, "token_version", 0) or 0
    _refresh = set_refresh_cookie(response, user.id, _tv)
    return {"token": create_token(user.id, _tv), "refresh_token": _refresh, "user": user_out(user, session)}


@app.post("/api/login/2fa")
@limiter.limit("5/minute")
def login_2fa(
    request: Request,
    response: Response,
    user_id: int = Form(...),
    code: str = Form(...),
    session: Session = Depends(get_session),
):
    """Второй этап логина — проверка 2FA кода"""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if not user.totp_enabled:
        raise HTTPException(400, "2FA не включена")
    
    totp = pyotp.TOTP(user.totp_secret)
    
    # Проверяем TOTP код
    if totp.verify(code, valid_window=1):
        pass  # OK
    else:
        # Проверяем как резервный код
        backup_codes = json.loads(user.totp_backup_codes) if user.totp_backup_codes else []
        found = False
        for i, hashed in enumerate(backup_codes):
            if check_password(code.upper(), hashed):
                backup_codes.pop(i)
                user.totp_backup_codes = json.dumps(backup_codes)
                found = True
                break
        if not found:
            raise HTTPException(400, "Неверный код 2FA")
    
    # Успех — выдаём токен
    ensure_user_has_keys(user.id, session)
    
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent")
    session.add(IPLog(user_id=user.id, ip_address=ip, user_agent=ua, action="login_2fa"))
    log_action(session, user.id, "login_2fa", ip_address=ip)
    session.commit()

    _tv = getattr(user, "token_version", 0) or 0
    _refresh = set_refresh_cookie(response, user.id, _tv)
    return {"token": create_token(user.id, _tv), "refresh_token": _refresh, "user": user_out(user, session)}





# ============================================================
# 🔐 E2EE: НОВАЯ СИСТЕМА (автогенерация ключей)
# ============================================================

def ensure_user_has_keys(user_id: int, session: Session):
    """
    Вызывается при каждом логине/регистрации.
    Создаёт placeholder если ключей нет.
    Реальные ключи клиент перезапишет при первом входе.
    """
    import hashlib
    existing = session.exec(
        select(UserKey).where(UserKey.user_id == user_id)
    ).first()
    if existing:
        return
    placeholder_key = f"pending_{user_id}_{uuid.uuid4().hex[:16]}"
    fingerprint = hashlib.sha256(placeholder_key.encode()).hexdigest()[:16]
    key = UserKey(
        user_id=user_id,
        public_key=placeholder_key,
        fingerprint=fingerprint,
        is_pending=True,
    )
    session.add(key)
    session.commit()


@app.get("/api/keys/me")
def get_my_public_key(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    key = session.exec(select(UserKey).where(UserKey.user_id == user.id)).first()
    if not key:
        raise HTTPException(404, "Ключ не зарегистрирован")
    return {"public_key": key.public_key, "fingerprint": key.fingerprint}


@app.post("/api/keys/register")
@limiter.limit("10/minute")
def register_public_key(
    request: Request,
    public_key: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Клиент регистрирует РЕАЛЬНЫЕ ключи. Перезаписывает placeholder."""
    import hashlib
    fingerprint = hashlib.sha256(public_key.encode()).hexdigest()[:16]

    existing = session.exec(select(UserKey).where(UserKey.user_id == user.id)).first()
    if existing:
        # ✅ ПЕРЕЗАПИСЫВАЕМ — клиент прислал реальный ключ
        existing.public_key = public_key
        existing.fingerprint = fingerprint
        existing.is_pending = False
        session.add(existing)
        session.commit()
        return {"ok": True, "fingerprint": fingerprint, "already_existed": True}

    key = UserKey(user_id=user.id, public_key=public_key, fingerprint=fingerprint, is_pending=False)
    session.add(key)
    session.commit()
    return {"ok": True, "fingerprint": fingerprint, "already_existed": False}


@app.get("/api/users/{user_id}/public-key")
def get_user_public_key(user_id: int, session: Session = Depends(get_session)):
    key = session.exec(select(UserKey).where(UserKey.user_id == user_id)).first()
    if not key:
        raise HTTPException(404, "У пользователя нет ключа")
    return {
        "public_key": key.public_key,
        "fingerprint": key.fingerprint,
        "is_pending": getattr(key, 'is_pending', False),
    }


@app.post("/api/chats/{chat_id}/session-key")
async def store_session_key(
    chat_id: int,
    recipient_id: int = Form(...),
    encrypted_session_key: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    my_member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    other_member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == recipient_id)
    ).first()
    if not my_member or not other_member:
        raise HTTPException(403, "Оба должны быть в чате")

    existing = session.exec(
        select(ChatSessionKey).where(
            ChatSessionKey.chat_id == chat_id,
            ChatSessionKey.user_id == recipient_id,
        )
    ).first()
    if existing:
        existing.encrypted_session_key = encrypted_session_key
        session.add(existing)
    else:
        sk = ChatSessionKey(
            chat_id=chat_id,
            user_id=recipient_id,
            encrypted_session_key=encrypted_session_key,
        )
        session.add(sk)
    session.commit()

    # Уведомляем получателя
    if recipient_id != user.id:
        await manager.broadcast_to_users([recipient_id], "session_key_available", {
            "chat_id": chat_id,
        })

    return {"ok": True}


@app.get("/api/chats/{chat_id}/session-key")
def get_my_session_key(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    sk = session.exec(
        select(ChatSessionKey).where(
            ChatSessionKey.chat_id == chat_id,
            ChatSessionKey.user_id == user.id,
        )
    ).first()
    if not sk:
        raise HTTPException(404, "Session key не найден")
    return {"encrypted_session_key": sk.encrypted_session_key}


@app.post("/api/chats/secret")
async def create_secret_chat(
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    other_user_id = request.query_params.get("other_user_id")
    if other_user_id is None:
        try:
            form = await request.form()
            other_user_id = form.get("other_user_id")
        except Exception:
            pass
    if other_user_id is None:
        try:
            data = await request.json()
            other_user_id = data.get("other_user_id")
        except Exception:
            pass
    if other_user_id is None:
        raise HTTPException(400, "other_user_id обязателен")
    other_user_id = int(other_user_id)

    if other_user_id == user.id:
        raise HTTPException(400, "Нельзя создать чат с собой")

    other = session.get(User, other_user_id)
    if not other:
        raise HTTPException(404, "Пользователь не найден")

    # ✅ Автогенерация ключей для обоих (placeholder если нет)
    ensure_user_has_keys(user.id, session)
    ensure_user_has_keys(other_user_id, session)

    # Уже есть секретный чат?
    my_chats = session.exec(select(ChatMember.chat_id).where(ChatMember.user_id == user.id)).all()
    for cid in my_chats:
        chat = session.get(Chat, cid)
        if chat and chat.is_secret:
            other_in = session.exec(
                select(ChatMember).where(ChatMember.chat_id == cid, ChatMember.user_id == other_user_id)
            ).first()
            if other_in:
                return {"chat_id": cid, "already_existed": True}

    chat = Chat(is_secret=True)
    session.add(chat)
    session.commit()
    session.refresh(chat)
    session.add(ChatMember(chat_id=chat.id, user_id=user.id))
    session.add(ChatMember(chat_id=chat.id, user_id=other_user_id))

    # Уведомление
    session.add(Notification(
        user_id=other_user_id, actor_id=user.id, type="secret_chat_created",
        details=json.dumps({"chat_id": chat.id}),
    ))
    session.commit()

    await manager.broadcast_to_users([other_user_id], "secret_chat_created", {
        "chat_id": chat.id,
        "from_user": user.display_name,
    })

    return {"chat_id": chat.id, "already_existed": False}


@app.post("/api/chats/{chat_id}/messages/encrypted-media")
@limiter.limit("10/minute")
async def upload_encrypted_media(
    request: Request, 
    chat_id: int,
    file: UploadFile = File(...),
    media_type: str = Form(...),
    reply_to_id: int | None = Form(None),  # 🆕
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Загрузка шифрованного медиа для секретных чатов"""
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")

    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")

    if not chat.is_secret:
        raise HTTPException(400, "Шифрованное медиа только для секретных чатов")

    err = check_size_before_read(file.headers, 50 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (макс 50 МБ)")

    # Сохраняем шифрованный файл как .enc
    file_id = str(uuid.uuid4())
    ext = {
        "video_note": ".webm.enc",
        "audio": ".webm.enc",
        "image": ".enc",
    }.get(media_type, ".enc")
    
    filename = f"{file_id}{ext}"
    filepath = os.path.join("uploads", filename)
    
    with open(filepath, "wb") as f:
        f.write(content)

    media_url = filename  # Относительный путь

    # 🆕 Проверяем что сообщение для ответа существует и в том же чате
    valid_reply_to = None
    if reply_to_id:
        reply_msg = session.get(Message, reply_to_id)
        if reply_msg and reply_msg.chat_id == chat_id:
            valid_reply_to = reply_to_id

    msg = Message(chat_id=chat_id,
        sender_id=user.id,
        text=None,
        ciphertext="[encrypted_media]",
        media_url=media_url,
        media_type=media_type,
        reply_to_id=valid_reply_to,  # 🆕
    )
    session.add(msg)

    # Уведомление другому участнику
    other_members = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id != user.id,
        )
    ).all()
    for other in other_members:
        session.add(Notification(
            user_id=other.user_id, actor_id=user.id, type="message",
        ))

    session.commit()
    session.refresh(msg)

    # WS рассылка
    await manager.broadcast_to_chat(
        chat_id,
        "new_message",
        {
            "id": msg.id,
            "chat_id": chat_id,
            "sender_id": msg.sender_id,
            "sender_name": user.display_name,
            "sender_avatar": user.avatar_url,
            "text": "[encrypted_media]",
            "ciphertext": "[encrypted_media]",
            "media_url": media_url,
            "media_type": media_type,
            "is_encrypted_media": True,
            "created_at": msg.created_at.isoformat(),
            "reply_to_id": msg.reply_to_id,
            "reply_preview": get_reply_preview(session, msg.reply_to_id) if msg.reply_to_id else None,
            "reactions": [],
        },
        session,
    )


    from push_service import send_push
    for other in other_members:
        asyncio.create_task(run_in_threadpool(
            send_push, other.user_id,
            "🔒 Секретное сообщение",
            f"{user.display_name}: вложение",
            f"/messages/{chat_id}",
        ))

    return {
        "id": msg.id,
        "media_url": media_url,
        "media_type": media_type,
    }


@app.get("/api/media/{filename}")
async def download_encrypted_media(
    filename: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Скачивание шифрованного медиа (с проверкой доступа)"""
    # Проверяем, что файл существует
    filepath = os.path.join("uploads", filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, "Файл не найден")

    # Проверяем, что пользователь имеет доступ к чату с этим медиа
    # Находим сообщение с этим media_url
    msg = session.exec(
        select(Message).where(Message.media_url == filename)
    ).first()
    if not msg:
        raise HTTPException(404, "Медиа не найдено")

    # Проверяем, что пользователь участник чата
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == msg.chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Нет доступа к этому медиа")

    # Отдаём файл
    from fastapi.responses import FileResponse
    return FileResponse(filepath, media_type="application/octet-stream")


def get_reply_preview(session: Session, reply_to_id: int) -> dict | None:
    """Возвращает краткое превью сообщения, на которое отвечают"""
    if not reply_to_id:
        return None
    original = session.get(Message, reply_to_id)
    if not original:
        return None
    sender = session.get(User, original.sender_id)
    # Обрезаем текст для превью
    preview_text = original.text or ""
    if original.media_type and not original.text:
        media_labels = {
            "image": "📷 Фото",
            "video": "🎬 Видео",
            "audio": "🎙️ Голосовое",
            "video_note": "📹 Видеокружок",
            "gif": "🎞️ GIF",
            "sticker": "😀 Стикер", 
        }
        preview_text = media_labels.get(original.media_type, "📎 Вложение")
    return {
        "id": original.id,
        "sender_name": sender.display_name if sender else "Unknown",
        "sender_id": original.sender_id,
        "text": preview_text[:120],
        "media_type": original.media_type,
    }



@app.post("/api/chats/{chat_id}/messages")
@limiter.limit("30/minute")
async def send_message_v2(
    request: Request,
    chat_id: int,
    text: str = Form(""),
    ciphertext: str = Form(""),
    reply_to_id: int | None = Form(None),  
    file: Optional[UploadFile] = File(None),
    media_type: Optional[str] = Form(None),
    is_encrypted_media: Optional[str] = Form(None),  # 🆕
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    valid_reply_to = None  # ← ДОБАВЬ ЭТУ СТРОКУ
    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")

    media_url = None
    media_type_final = None
    
    if file and file.filename:
        ext = os.path.splitext(file.filename or "")[1].lower()
        content = await file.read()
        
        # 🆕 ШИФРОВАННОЕ МЕДИА — сохраняем локально, не на Cloudinary
        if is_encrypted_media == "true" or (chat.is_secret and ciphertext):
            if len(content) > 50 * 1024 * 1024:
                raise HTTPException(400, "File too large (max 50MB)")
            
            file_id = str(uuid.uuid4())
            filename = f"{file_id}.enc"
            filepath = os.path.join("uploads", filename)
            with open(filepath, "wb") as f:
                f.write(content)
            media_url = filename
            
            if media_type in ("video_note", "audio", "image", "gif", "video"):
                media_type_final = media_type
            else:
                media_type_final = "image"
        else:
            # Обычное медиа — на Cloudinary
            if len(content) > 20 * 1024 * 1024:
                raise HTTPException(400, "File too large (max 20MB)")
            try:
                result = await run_in_threadpool(
                    lambda: cloudinary.uploader.upload(
                        content, folder=UPLOAD_FOLDER, resource_type="auto",
                    )
                )
                media_url = result.get("secure_url")
                resource_type = result.get("resource_type")
                
                if media_type in ("video_note", "audio", "image", "gif"):
                    media_type_final = media_type
                else:
                    if resource_type == "video":
                        content_type = (file.content_type or "").lower()
                        is_audio = (
                            content_type.startswith("audio/")
                            or ext in {".mp3", ".wav", ".ogg", ".m4a", ".aac"}
                            or (ext == ".webm" and "audio" in content_type)
                        )
                        is_video = (
                            content_type.startswith("video/")
                            or ext in {".mp4", ".mov"}
                            or (ext == ".webm" and "video" in content_type)
                        )
                        if is_audio:
                            media_type_final = "audio"
                        elif ext == ".gif":
                            media_type_final = "gif"
                        elif is_video:
                            media_type_final = "video"
                        else:
                            media_type_final = "image"
                    elif ext == ".gif":
                        media_type_final = "gif"
                    else:
                        media_type_final = "image"
            except Exception as e:
                raise HTTPException(400, f"Upload failed: {str(e)}")

    if chat.is_secret:
        if not ciphertext.strip() and not media_url:
            raise HTTPException(400, "Пустое сообщение")
        if text.strip():
            raise HTTPException(400, "В секретных чатах нельзя отправлять plain text")
    else:
        if not text.strip() and not media_url:
            raise HTTPException(400, "Пустое сообщение")

        # 🆕 Проверяем что сообщение для ответа существует и в том же чате
        valid_reply_to = None
        if reply_to_id:
            reply_msg = session.get(Message, reply_to_id)
            if reply_msg and reply_msg.chat_id == chat_id:
                valid_reply_to = reply_to_id

    msg = None
    try:
        msg = Message(
            chat_id=chat_id,
            sender_id=user.id,
            text=text.strip() if text else None,
            ciphertext=ciphertext.strip() if ciphertext else None,
            media_url=media_url,
            media_type=media_type_final,
            reply_to_id=valid_reply_to,
        )
    except Exception as e:
        print(f"❌ Failed to create Message: {e}")
        raise HTTPException(500, f"Ошибка создания сообщения: {str(e)}")
    
    if msg is None:
        raise HTTPException(500, "Не удалось создать сообщение")
    
    session.add(msg)

    other_members = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id != user.id,
        )
    ).all()
    notif_type = "group_message" if chat.is_group else "message"
    for other in other_members:
        session.add(Notification(
            user_id=other.user_id, actor_id=user.id, type=notif_type,
        ))
    session.commit()
    session.refresh(msg)

    # 🆕 === СИСТЕМА УПОМИНАНИЙ В ЧАТАХ ===
    if text.strip():
        mentions = extract_mentions(text)
        if mentions:
            # Находим всех упомянутых пользователей
            mentioned_users = session.exec(
                select(User).where(func.lower(User.username).in_(mentions))
            ).all()
            
            # Получаем ID всех участников чата
            chat_member_ids = set(session.exec(
                select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
            ).all())
            
            for mu in mentioned_users:
                # Уведомляем только если это не сам автор и он есть в чате
                if mu.id != user.id and mu.id in chat_member_ids:
                    session.add(Notification(
                        user_id=mu.id,
                        actor_id=user.id,
                        type="mention",
                        message_id=msg.id
                    ))
                    # 🚀 Пушаем уведомление в реальном времени через WS
                    await manager.broadcast_to_users([mu.id], "new_notification", {
                        "type": "mention",
                        "actor_id": user.id,
                        "actor_name": user.display_name,
                        "message_id": msg.id,
                        "chat_id": chat_id,
                        "text_preview": text[:100]
                    })
            session.commit()




    # 🆕 Добавляем флаг is_encrypted_media в WS рассылку
    is_enc = bool(is_encrypted_media == "true" or (chat.is_secret and media_url and not media_url.startswith("http")))
    
    await manager.broadcast_to_chat(
        chat_id,
        "new_message",
        {
            "id": msg.id,
            "chat_id": chat_id,
            "sender_id": msg.sender_id,
            "sender_name": user.display_name,
            "sender_avatar": user.avatar_url,
            "text": msg.text,
            "ciphertext": msg.ciphertext,
            "media_url": msg.media_url,
            "media_type": msg.media_type,
            "is_encrypted_media": is_enc,
            "created_at": msg.created_at.isoformat(),
            "pinned": False,
            "pinned_by": None,
            "reply_to_id": msg.reply_to_id,
            "reply_preview": get_reply_preview(session, msg.reply_to_id) if msg.reply_to_id else None,
            "reactions": [],
        },
        session,
    )

    # 🆕 PUSH-УВЕДОМЛЕНИЯ получателям
    from push_service import send_push
    for other in other_members:
        if chat.is_secret:
            asyncio.create_task(run_in_threadpool(
                send_push, other.user_id,
                "🔒 Секретное сообщение",
                f"{user.display_name}: новое сообщение",
                f"/messages/{chat_id}",
            ))
        else:
            body = (msg.text or ("📎 Вложение" if media_url else "Сообщение"))[:100]
            asyncio.create_task(run_in_threadpool(
                send_push, other.user_id,
                f"💬 {user.display_name}",
                body,
                f"/messages/{chat_id}",
            ))

    return {
        "id": msg.id,
        "chat_id": chat_id,
        "sender_id": msg.sender_id,
        "sender_name": user.display_name,
        "sender_avatar": user.avatar_url,
        "text": msg.text,
        "ciphertext": msg.ciphertext,
        "media_url": msg.media_url,
        "media_type": msg.media_type,
        "is_encrypted_media": is_enc,
        "read": msg.read,
        "edited": msg.edited,
        "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
        "created_at": msg.created_at.isoformat(),
        "pinned": False,
        "pinned_by": None,
        "reply_to_id": msg.reply_to_id,
        "reply_preview": get_reply_preview(session, msg.reply_to_id) if msg.reply_to_id else None,
        "reactions": [],
    }

@app.post("/api/chats/{chat_id}/typing")
async def send_typing(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),         # ← добавить
):
    
    # Проверяем что юзер участник чата
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == current_user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")

    # Собираем всех, КРОМЕ себя
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    other_ids = [uid for uid in all_member_ids if uid != current_user.id]
    
    if other_ids:
        await manager.broadcast_to_users(other_ids, "typing", {
            "chat_id": chat_id,
            "user_id": current_user.id,
            "user_name": current_user.display_name,
        })
    
    return {"ok": True}


@app.post("/api/chats/{chat_id}/live-text")
async def send_live_text(
    chat_id: int,
    text: str = Form(""),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """🆕 ЖИВЫЕ СООБЩЕНИЯ с учётом приватности"""
    # 🛡️ Пользователь выключил трансляцию своего набора — не шлём
    if not user.live_text_broadcast:
        return {"ok": True}

    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")

    # В секретных чатах не светим plaintext
    chat = session.get(Chat, chat_id)
    if chat and chat.is_secret:
        return {"ok": True}

    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    other_ids = [uid for uid in all_member_ids if uid != user.id]
    if not other_ids:
        return {"ok": True}

    # 🛡️ Шлём ТОЛЬКО тем, у кого включён показ живых сообщений
    recipients = session.exec(
        select(User.id).where(
            User.id.in_(other_ids),
            User.live_text_enabled == True,
        )
    ).all()
    if recipients:
        await manager.broadcast_to_users(recipients, "live_text", {
            "chat_id": chat_id,
            "user_id": user.id,
            "user_name": user.display_name,
            "text": text[:2000],
        })
    return {"ok": True}


@app.get("/api/chats/{chat_id}/messages")
def get_messages_v2(
    chat_id: int,
    cursor: Optional[int] = None,  # ← НОВОЕ: ID последнего сообщения
    limit: int = 50,               # ← НОВОЕ: лимит
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    
    # 🚀 Курсорная пагинация — загружаем только последние N сообщений
    query = (
        select(Message)
        .where(Message.chat_id == chat_id)
        .order_by(Message.id.desc())
    )
    if cursor:
        query = query.where(Message.id < cursor)
    
    messages = session.exec(query.limit(limit)).all()
    messages = list(reversed(messages))  # Хронологический порядок
    
    if not messages:
        return {"messages": [], "has_more": False, "next_cursor": None}
    
    sender_ids = list({msg.sender_id for msg in messages})
    senders = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(sender_ids))
        ).all()
    }
    reactions_map = build_reactions_map(session, [m.id for m in messages], user.id)
    
    result = []
    for msg in messages:
        sender = senders.get(msg.sender_id)
        is_enc = bool(
            msg.media_url and
            not msg.media_url.startswith("http") and
            msg.media_url.endswith(".enc")
        )
        result.append({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "sender_name": sender.display_name if sender else "Unknown",
            "sender_avatar": sender.avatar_url if sender else None,
            "text": msg.text,
            "ciphertext": msg.ciphertext,
            "media_url": msg.media_url,
            "media_type": msg.media_type,
            "is_encrypted_media": msg.ciphertext == "[encrypted_media]",
            "read": msg.read,
            "edited": msg.edited,
            "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
            "created_at": msg.created_at.isoformat(),
            "pinned": msg.pinned,
            "pinned_by": msg.pinned_by,
            "forwarded_from_id": msg.forwarded_from_id,
            "forwarded_sender_name": msg.forwarded_sender_name,
            "reply_to_id": msg.reply_to_id,
            "reply_preview": get_reply_preview(session, msg.reply_to_id) if msg.reply_to_id else None,
            "reactions": reactions_map.get(msg.id, []),
        })
    
    has_more = len(messages) == limit
    return {
        "messages": result,
        "has_more": has_more,
        "next_cursor": messages[0].id if messages else None,  # ID самого старого
    }

@app.patch("/api/chats/{chat_id}/messages/{message_id}")
def edit_message(
    chat_id: int,
    message_id: int,
    text: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Редактирование своего сообщения"""
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Not a member of this chat")
    
    msg = session.get(Message, message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.chat_id != chat_id:
        raise HTTPException(403, "Message not in this chat")
    if msg.sender_id != user.id:
        raise HTTPException(403, "You can only edit your own messages")
    
    if not text.strip():
        raise HTTPException(400, "Message cannot be empty")
    
    msg.text = text.strip()
    msg.edited = True  # Добавьте поле edited в модель Message
    session.add(msg)
    session.commit()
    
    return {
        "id": msg.id,
        "text": msg.text,
        "edited": msg.edited,
        "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
        "pinned": msg.pinned,
    }


@app.delete("/api/chats/{chat_id}/messages/{message_id}")
def delete_message(
    chat_id: int,
    message_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удаление своего сообщения"""
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Not a member of this chat")
    
    msg = session.get(Message, message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    if msg.chat_id != chat_id:
        raise HTTPException(403, "Message not in this chat")
    can_mod = has_permission(user, "manage_groups", session)
    if msg.sender_id != user.id:
        can_mod = has_permission(user, "manage_groups", session)
        if not user.is_admin and not can_mod:
            raise HTTPException(403, "Можно удалять только свои сообщения")
        sender = session.get(User, msg.sender_id)
        if sender:
            check_sanction_rights(user, sender, session, "удалять сообщения этого пользователя")
    
    session.delete(msg)
    session.commit()
    
    return {"ok": True}


@app.post("/api/chats/{chat_id}/messages/{message_id}/forward")
async def forward_message(
    chat_id: int,
    message_id: int,
    target_chat_id: int = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Находим оригинальное сообщение
    original = session.get(Message, message_id)
    if not original or original.chat_id != chat_id:
        raise HTTPException(404, "Сообщение не найдено")
    
    # 2. Проверяем доступ к исходному чату
    orig_member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id
        )
    ).first()
    if not orig_member:
        raise HTTPException(403, "Нет доступа к сообщению")
    
    # 3. Запрет пересылки из секретных чатов
    orig_chat = session.get(Chat, chat_id)
    if orig_chat and orig_chat.is_secret:
        raise HTTPException(403, "Нельзя пересылать из секретных чатов")
    
    # 4. Проверяем доступ к целевому чату
    target_member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == target_chat_id,
            ChatMember.user_id == user.id
        )
    ).first()
    if not target_member:
        raise HTTPException(403, "Нет доступа к целевому чату")
    
    # 5. Получаем имя оригинального отправителя
    orig_sender = session.get(User, original.sender_id)
    
    # 6. Создаём новое сообщение (медиа не копируем — Cloudinary ссылка работает везде)
    new_msg = Message(
        chat_id=target_chat_id,
        sender_id=user.id,
        text=original.text,
        ciphertext=None,  # обычное сообщение, не шифрованное
        media_url=original.media_url,
        media_type=original.media_type,
        forwarded_from_id=original.id,
        forwarded_sender_name=orig_sender.display_name if orig_sender else "Unknown",
    )
    session.add(new_msg)
    
    # 7. Уведомляем участников целевого чата
    other_members = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == target_chat_id,
            ChatMember.user_id != user.id
        )
    ).all()
    
    notif_type = "group_message" if session.get(Chat, target_chat_id).is_group else "message"
    for other in other_members:
        session.add(Notification(
            user_id=other.user_id, actor_id=user.id, type=notif_type,
        ))
    session.commit()
    session.refresh(new_msg)
    
    # 8. WS рассылка
    target_chat = session.get(Chat, target_chat_id)
    await manager.broadcast_to_chat(
        target_chat_id,
        "new_message",
        {
            "id": new_msg.id,
            "chat_id": target_chat_id,
            "sender_id": new_msg.sender_id,
            "sender_name": user.display_name,
            "sender_avatar": user.avatar_url,
            "text": new_msg.text,
            "ciphertext": None,
            "media_url": new_msg.media_url,
            "media_type": new_msg.media_type,
            "is_encrypted_media": False,
            "forwarded_from_id": new_msg.forwarded_from_id,
            "forwarded_sender_name": new_msg.forwarded_sender_name,
            "created_at": new_msg.created_at.isoformat(),
            "pinned": False,
            "pinned_by": None,
        },
        session,
    )
    
    # 9. Push-уведомления
    from push_service import send_push
    for other in other_members:
        body = (new_msg.text or "📎 Вложение")[:100]
        asyncio.create_task(run_in_threadpool(
            send_push, other.user_id,
            f"💬 {user.display_name}",
            body,
            f"/messages/{target_chat_id}",
        ))
    
    return {"ok": True, "message_id": new_msg.id}



class PushSubscribeIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str

@app.get("/api/push/vapid")
def get_vapid_public_key():
    from push_service import get_vapid
    return {"public_key": get_vapid()["public_raw"]}

@app.post("/api/push/subscribe")
def push_subscribe(
    data: PushSubscribeIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(PushSubscription).where(PushSubscription.endpoint == data.endpoint)
    ).first()
    if existing:
        existing.user_id = user.id
        existing.p256dh = data.p256dh
        existing.auth = data.auth
        session.add(existing)
    else:
        session.add(PushSubscription(
            user_id=user.id, endpoint=data.endpoint,
            p256dh=data.p256dh, auth=data.auth,
        ))
    session.commit()
    return {"ok": True}

@app.post("/api/push/unsubscribe")
def push_unsubscribe(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    for s in session.exec(
        select(PushSubscription).where(PushSubscription.user_id == user.id)
    ).all():
        session.delete(s)
    session.commit()
    return {"ok": True}

@app.get("/api/push/status")
def push_status(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    count = session.exec(
        select(func.count()).select_from(PushSubscription)
        .where(PushSubscription.user_id == user.id)
    ).one()
    return {"subscribed": count > 0}




# ============================================================
# 📌 ЗАКРЕПЛЁННЫЕ СООБЩЕНИЯ (ЛЮБОЙ УЧАСТНИК МОЖЕТ)
# ============================================================

@app.post("/api/chats/{chat_id}/messages/{message_id}/pin")
async def pin_message(
    chat_id: int,
    message_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Получаем чат — ДО проверки членства: иначе при обращении к
    #    несуществующему/удалённому чату человек получал бы бессмысленное
    #    «Вы не участник чата» вместо честного 404.
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")

    # 2. Проверяем, что пользователь участник чата.
    #    🆕 Исключение: админ сайта или право pin_messages могут закреплять
    #    даже без записи в ChatMember (модерация и т.п.).
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    can_site_pin = has_permission(user, "pin_messages", session)
    if not member and not can_site_pin:
        raise HTTPException(403, "Вы не участник чата")

    # 3. Права закрепления:
    #    • Личный/секретный чат («Избранное» тоже) — ЛЮБОЙ участник:
    #      если пользователь видит чат и может отправлять в него сообщения,
    #      он может закреплять;
    #    • Группа — владелец или админ группы (либо сайт-право
    #      pin_messages / manage_groups). Обычному участнику — ПОНЯТНАЯ
    #      ошибка вместо вводящего в заблуждение отказа.
    if bool(chat.is_group):
        is_group_admin = (
            (member is not None and member.role in ("owner", "admin"))
            or chat.owner_id == user.id
        )
        if not is_group_admin and not (can_site_pin or has_permission(user, "manage_groups", session)):
            raise HTTPException(403, "Закрепление сообщений доступно только администраторам")
    

    
    # 4. Получаем сообщение
    msg = session.get(Message, message_id)
    if not msg or msg.chat_id != chat_id:
        raise HTTPException(404, "Сообщение не найдено")
    
    # 🆕 Повторное закрепление того же сообщения — не ошибка
    if msg.pinned:
        return {"ok": True, "already_pinned": True}

    # 5. Считаем уже закреплённые (макс 5)
    pinned_count = session.exec(
        select(func.count(Message.id)).where(
            Message.chat_id == chat_id,
            Message.pinned == True,
        )
    ).one()
    
    if pinned_count >= 5:
        raise HTTPException(400, "Максимум 5 закреплённых сообщений")
    
    # 6. Закрепляем (ЛЮБОЙ УЧАСТНИК)
    msg.pinned = True
    msg.pinned_at = datetime.now(timezone.utc)
    msg.pinned_by = user.id
    session.add(msg)
    session.commit()
    
    # 7. Уведомляем участников через WS
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    await manager.broadcast_to_users(
        [m for m in all_member_ids],
        "message_pinned",
        {"chat_id": chat_id, "message_id": message_id, "pinned_by": user.id}
    )
    
    return {"ok": True}


# ============================================================
# 📌 ЗАКРЕПЛЕНИЕ ЧАТОВ (ДО 5 ШТУК НА ПОЛЬЗОВАТЕЛЯ)
# ============================================================

@app.post("/api/chats/{chat_id}/pin")
async def pin_chat(chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Проверяем, что пользователь участник чата
    member = session.exec(select(ChatMember).where(
        ChatMember.chat_id == chat_id,
        ChatMember.user_id == user.id
    )).first()
    if not member:
        raise HTTPException(403, "Не участник чата")

    # 2. Получаем чат
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")

    # 3. Уже закреплён?
    if chat.pinned_by == user.id:
        return {"ok": True, "already_pinned": True}

    # 4. Лимит 5 закреплённых чатов
    pinned_count = session.exec(
        select(func.count()).select_from(Chat).where(Chat.pinned_by == user.id)
    ).one()
    if pinned_count >= 5:
        raise HTTPException(400, "Максимум 5 закреплённых чатов. Открепите один из них.")

    # 5. Закрепляем
    chat.pinned_by = user.id
    chat.pinned_at = datetime.now(timezone.utc)
    session.add(chat)
    session.commit()
    return {"ok": True}


@app.delete("/api/chats/{chat_id}/pin")
async def unpin_chat(chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Получаем чат
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")

    # 2. Проверяем, что чат закреплён именно этим пользователем
    if chat.pinned_by != user.id:
        raise HTTPException(400, "Этот чат не закреплён")

    # 3. Открепляем
    chat.pinned_by = None
    chat.pinned_at = None
    session.add(chat)
    session.commit()
    return {"ok": True}


@app.get("/api/chats/{chat_id}/pinned")
def get_pinned_messages(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
        
    pinned_msgs = session.exec(
        select(Message)
        .where(Message.chat_id == chat_id, Message.pinned == True)
        .order_by(Message.pinned_at.desc())
    ).all()
    
    if not pinned_msgs:
        return []
        
    sender_ids = list({m.sender_id for m in pinned_msgs})
    senders = {u.id: u for u in session.exec(select(User).where(User.id.in_(sender_ids))).all()}
    
    result = []
    for msg in pinned_msgs:
        sender = senders.get(msg.sender_id)
        result.append({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "sender_name": sender.display_name if sender else "Unknown",
            "sender_avatar": sender.avatar_url if sender else None,
            "text": msg.text,
            "ciphertext": msg.ciphertext,
            "media_url": msg.media_url,
            "media_type": msg.media_type,
            "pinned_at": msg.pinned_at.isoformat() if msg.pinned_at else None,
            "pinned_by": msg.pinned_by,
            "created_at": msg.created_at.isoformat(),
        })
    return result

@app.delete("/api/chats/{chat_id}/messages/{message_id}/unpin")
async def unpin_message(
    chat_id: int,
    message_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Чат — ДО проверки членства (см. pin_message)
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")

    # 2. Участник? (админ сайта / право pin_messages — исключение)
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    can_site_pin = has_permission(user, "pin_messages", session)
    if not member and not can_site_pin:
        raise HTTPException(403, "Вы не участник чата")

    # 3. Права открепления — те же, что и на закрепление
    if bool(chat.is_group):
        is_group_admin = (
            (member is not None and member.role in ("owner", "admin"))
            or chat.owner_id == user.id
        )
        if not is_group_admin and not (can_site_pin or has_permission(user, "manage_groups", session)):
            raise HTTPException(403, "Открепление сообщений доступно только администраторам")

    # 4. Получаем сообщение
    msg = session.get(Message, message_id)
    if not msg or msg.chat_id != chat_id:
        raise HTTPException(404, "Сообщение не найдено")

    # 5. Открепляем (повторный вызов — не ошибка)
    if not msg.pinned:
        return {"ok": True, "already_unpinned": True}
    msg.pinned = False
    msg.pinned_at = None
    msg.pinned_by = None
    session.add(msg)
    session.commit()

    # 6. Уведомляем участников через WS (как при pin — консистентность UI)
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    await manager.broadcast_to_users(
        [m for m in all_member_ids],
        "message_unpinned",
        {"chat_id": chat_id, "message_id": message_id, "unpinned_by": user.id},
    )

    return {"ok": True}


# ============================================================
# 🖼️ АВАТАРКА ГРУППЫ
# ============================================================

@app.post("/api/chats/{chat_id}/avatar")
@limiter.limit("5/minute")
async def upload_group_avatar(
    request: Request,
    chat_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # 1. Проверяем, что пользователь участник чата
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    
    # 2. Получаем чат
    chat = session.get(Chat, chat_id)
    if not chat or not chat.is_group:
        raise HTTPException(404, "Группа не найдена")
    
    # 3. Проверяем права (админы группы или право manage_groups)
    if member.role not in ("owner", "admin") and not has_permission(user, "manage_groups", session):
        raise HTTPException(403, "Только админы или право manage_groups могут менять аватарку")
    
    # 4. Валидация файла
    if not file.filename:
        raise HTTPException(400, "No file provided")
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        raise HTTPException(400, f"Неверный формат: {ext}. Поддерживаются: .jpg, .jpeg, .png, .gif, .webp")
    
    err = check_size_before_read(file.headers, 5 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (максимум 5 МБ)")
    
    # 5. Удаляем старую аватарку
    if chat.avatar_url and "cloudinary.com" in chat.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(chat.avatar_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    
    # 6. Загружаем новую
    try:
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder=UPLOAD_FOLDER,
                resource_type="image",
                transformation=[{"width": 400, "height": 400, "crop": "fill"}],
            )
        )
        chat.avatar_url = result.get("secure_url")
    except Exception as e:
        raise HTTPException(400, f"Ошибка загрузки: {str(e)}")
    
    session.add(chat)
    session.commit()
    
    # 7. Уведомляем всех участников
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    await manager.broadcast_to_users(
        [m for m in all_member_ids],
        "group_info_updated",
        {"chat_id": chat_id, "avatar_url": chat.avatar_url}
    )
    
    return {"ok": True, "avatar_url": chat.avatar_url}



@app.get("/api/chats/{chat_id}/media")
def get_chat_media(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Получить все медиа-файлы из чата"""
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Not a member of this chat")
    
    messages = session.exec(
        select(Message)
        .where(Message.chat_id == chat_id, Message.media_url != None)
        .order_by(Message.created_at.desc())
    ).all()
    
    result = []
    for msg in messages:
        result.append({
            "id": msg.id,
            "media_url": msg.media_url,
            "media_type": msg.media_type,
            "sender_id": msg.sender_id,
            "created_at": msg.created_at.isoformat(),
        })
    
    return result



@app.post("/api/chats/{chat_id}/read")
async def mark_chat_read(                        # ← def → async def
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Not a member of this chat")
    
    # ОДИН массовый UPDATE
    session.exec(
        update(Message)
        .where(
            Message.chat_id == chat_id,
            Message.sender_id != user.id,
            Message.read == False,
        )
        .values(read=True)
    )
    session.commit()

    # 🆕 Находим ID последнего сообщения в чате (для галочек ✓✓)
    last_msg = session.exec(
        select(Message.id)
        .where(Message.chat_id == chat_id)
        .order_by(Message.id.desc())
        .limit(1)
    ).first()

    # 🆕 Рассылаем событие "прочитано" всем ДРУГИМ участникам
    all_member_ids = session.exec(
        select(ChatMember.user_id).where(ChatMember.chat_id == chat_id)
    ).all()
    other_ids = [uid for uid in all_member_ids if uid != user.id]
    
    if other_ids:
        await manager.broadcast_to_users(other_ids, "message_read", {
            "chat_id": chat_id,
            "reader_id": user.id,
            "reader_name": user.display_name,
            "last_read_message_id": last_msg or 0,
        })

    return {"ok": True}


@app.get("/api/chats/unread-count")
def chats_unread_count(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    total = session.exec(
        select(func.count(Message.id))
        .join(ChatMember, ChatMember.chat_id == Message.chat_id)
        .where(
            ChatMember.user_id == user.id,
            Message.sender_id != user.id,
            Message.read == False,
        )
    ).one()
    return {"count": total}

@app.get("/api/chats/{chat_id}")
def get_chat_info(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")
    return serialize_chat_for_user(chat, user.id, session)



@app.post("/api/chats/saved")
def get_or_create_saved_chat(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Ищем существующий чат избранного
    chat = session.exec(
        select(Chat).where(Chat.is_saved == True, Chat.owner_id == user.id)
    ).first()
    
    if not chat:
        # Создаем новый
        chat = Chat(is_saved=True, owner_id=user.id)
        session.add(chat)
        session.commit()
        session.refresh(chat)
        
        # Добавляем себя как участника (для авторизации и read-status)
        member = ChatMember(chat_id=chat.id, user_id=user.id, role="owner")
        session.add(member)
        session.commit()
        
    return {
        "id": chat.id,
        "is_saved": True,
        "name": "Избранное"
    }



@app.get("/api/notifications")
def get_notifications(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    notifs = session.exec(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    ).all()

    if not notifs:
        return []

    actor_ids = list({n.actor_id for n in notifs})
    actors = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(actor_ids))
        ).all()
    }

    result = []
    for n in notifs:
        actor = actors.get(n.actor_id)
        result.append({
            "id": n.id,
            "type": n.type,
            "actor": user_out(actor, session) if actor else None,
            "post_id": n.post_id,
            "read": n.read,
            "created_at": n.created_at.isoformat(),
        })
    return result


@app.get("/api/notifications/unread-count")
def get_unread_count(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    count = session.exec(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read == False)
    ).one()
    return {"count": count}


@app.post("/api/notifications/{notif_id}/read")
def mark_read(
    notif_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    notif = session.get(Notification, notif_id)
    if notif and notif.user_id == user.id:
        notif.read = True
        session.add(notif)
        session.commit()
    return {"ok": True}

@app.post("/api/notifications/read-all")
def mark_all_notifications_read(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    unread = session.exec(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.read == False,
        )
    ).all()
    count = 0
    for notif in unread:
        notif.read = True
        session.add(notif)
        count += 1
    session.commit()
    return {"ok": True, "marked": count}



@app.patch("/api/posts/{post_id}")
async def edit_post(
    post_id: int,
    text: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Редактирование поста: автор ИЛИ право edit_posts (с учётом иерархии)"""
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    is_author = post.author_id == user.id
    if not is_author and not has_permission(user, "edit_posts", session):
        raise HTTPException(403, "Нет права: edit_posts")
    if not text.strip():
        raise HTTPException(400, "Пост не может быть пустым")
    # 🛡️ Чужой пост — только если можешь санкционировать автора
    if not is_author:
        author = session.get(User, post.author_id)
        if author:
            check_sanction_rights(user, author, session, "редактировать посты этого пользователя")
    old_text = post.text
    post.text = text.strip()
    session.add(post)
    log_action(session, user.id, "edit_post",
               target_type="post", target_id=post_id,
               details={"by_moderator": not is_author,
                        "old_text": (old_text or "")[:100],
                        "new_text": text.strip()[:100]})
    session.commit()
    return {"ok": True, "id": post.id, "text": post.text}


@app.get("/api/team")
def get_team(session: Session = Depends(get_session)):
    users = session.exec(
        select(User).where(User.is_banned == False).order_by(User.created_at)
    ).all()

    if not users:
        return {"groups": []}

    # Массовый запрос ролей
    role_ids = list({u.role_id for u in users if u.role_id})
    roles = {
        r.id: r for r in session.exec(
            select(Role).where(Role.id.in_(role_ids))
        ).all()
    } if role_ids else {}

    groups = {
        "level_11": {"label": "System", "color": "#00ff41", "order": 0, "members": []},
        "level_10": {"label": "Founder", "color": "#ffffff", "order": 1, "members": []},
        "level_9": {"label": "Developer", "color": "#3b82f6", "order": 2, "members": []},
        "level_8": {"label": "Глава администрации", "color": "#B91C1C", "order": 3, "members": []},
        "level_7": {"label": "Технический раздел", "color": "#0E7490", "order": 4, "members": []},
        "level_6_3": {"label": "Модерация форума", "color": "#065F46", "order": 5, "members": []},
    }

    for u in users:
        level = get_user_level(u, session)

        u_role = roles.get(u.role_id) if u.role_id else None
        # Уровни 9-11 (Developer/Founder/System) отображаются всегда.
        # Остальные — только если их роль отмечена is_staff
        # (спец. плашки, в т.ч. купленные, в окне команды не показываются).
        is_top_level = level in (9, 10, 11)
        if not is_top_level and (not u_role or not u_role.is_staff):
            continue

        member_data = {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
            "is_admin": u.is_admin,
            "is_moderator": u.is_moderator,
            "is_trelod": u.is_trelod,
            "level": level,
            "role": None,
        }

        if u.role_id:
            role = roles.get(u.role_id)  # ← из словаря, не из БД
            if role:
                member_data["role"] = {"id": role.id, "name": role.name, "color": role.color}

        if level == 11:
            groups["level_11"]["members"].append(member_data)
        elif level == 10:
            groups["level_10"]["members"].append(member_data)
        elif level == 9:
            groups["level_9"]["members"].append(member_data)
        elif level == 8:
            groups["level_8"]["members"].append(member_data)
        elif level == 7:
            groups["level_7"]["members"].append(member_data)
        elif 3 <= level <= 6:
            groups["level_6_3"]["members"].append(member_data)

    result = []
    for key, g in sorted(groups.items(), key=lambda x: x[1]["order"]):
        if g["members"]:
            result.append({
                "key": key,
                "label": g["label"],
                "color": g["color"],
                "members": g["members"],
            })

    return {"groups": result}

# ---------- правила ----------

def _strip_roles_sections(rules_data: dict) -> dict:
    """Убирает из JSON правил запёкшуюся секцию команды — роли рендерятся отдельно"""
    if rules_data and isinstance(rules_data.get("sections"), list):
        rules_data["sections"] = [
            s for s in rules_data["sections"]
            if not (
                (s.get("id") in ("roles", "team", "staff"))
                or ("команда" in str(s.get("heading", "")).lower())
            )
        ]
    return rules_data

@app.get("/api/rules")
def get_rules(session: Session = Depends(get_session)):
    # 1. Пытаемся взять сохранённые правила из БД
    saved = None
    try:
        saved = session.exec(
            select(SiteRules).order_by(SiteRules.id.desc()).limit(1)
        ).first()
        if saved:
            rules_data = json.loads(saved.content)
        else:
            # Дефолтные правила
            rules_data = {
                "title": "Правила сообщества trelod",
                "subtitle": "trelod — пространство для свободного и уважительного общения.",
                "sections": [
                    {"id": "safety", "heading": "1. Безопасность", "items": ["Запрещены угрозы, насилие, ненависть.", "Запрещён терроризм, экстремизм.", "Запрещена пропаганда наркотиков."]},
                    {"id": "respect", "heading": "2. Уважение", "items": ["Запрещены оскорбления, буллинг.", "Запрещён доксинг.", "Запрещена имперсонация."]},
                    {"id": "content", "heading": "3. Контент", "items": ["Запрещён спам, накрутка.", "Запрещён порно-контент.", "Запрещено мошенничество."]},
                    {"id": "punishments", "heading": "4. Меры наказания", "table": [{"num": "1", "measure": "Предупреждение", "description": "Фиксируется на 30 дней.", "violations": "Мелкий спам."}, {"num": "2", "measure": "Блокировка", "description": "От 1 до 30 дней.", "violations": "Повторные нарушения."}], "note": "Администрация применяет меры по своему усмотрению."}
                ],
                "footer": "Используя trelod, вы соглашаетесь с правилами."
            }
    except Exception as e:
        print(f"⚠️ Failed to load rules: {e}")
        rules_data = {"title": "Правила", "sections": [], "footer": ""}

    # 2. 🆕 Загружаем роли администрации (только is_staff=True)
    try:
        staff_roles = session.exec(
            select(Role)
            .where(Role.is_staff == True)
            .order_by(Role.position.asc())
        ).all()

        roles_section = {
            "id": "roles",
            "heading": "Команда trelod",
            "roles": [
                {
                    "name": role.name,
                    "color": role.color,
                    "level": role.level,
                    "description": role.description or "Описание отсутствует"
                }
                for role in staff_roles
            ]
        }
        
        # Добавляем секцию ролей в правила
        if "sections" not in rules_data:
            rules_data["sections"] = []
        rules_data["sections"].append(roles_section)
        
    except Exception as e:
        print(f"⚠️ Failed to load roles: {e}")

    return rules_data


class RulesUpdate(BaseModel):
    content: str


@app.put("/api/rules")
def update_rules(
    data: RulesUpdate,
    user: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    # Валидация JSON
    try:
        json.loads(data.content)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"Невалидный JSON: {e}")

    try:
        existing = session.exec(
            select(SiteRules).order_by(SiteRules.id.desc()).limit(1)
        ).first()

        if existing:
            existing.content = data.content
            existing.updated_by = user.id
            existing.updated_at = datetime.now(timezone.utc)
            session.add(existing)
        else:
            session.add(SiteRules(content=data.content, updated_by=user.id))

        session.commit()
        return {"ok": True}
    except Exception as e:
        session.rollback()
        raise HTTPException(500, f"Ошибка сохранения: {str(e)}")

# ---------- жалобы ----------

@app.post("/api/reports")
@limiter.limit("10/minute")
def create_report(
    request: Request,
    target_type: str = Form(...),
    target_id: int = Form(...),
    reason: str = Form(...),
    comment: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Валидация типа
    if target_type not in ("post", "user"):
        raise HTTPException(400, "Invalid target type")
    
    # Валидация причины
    valid_reasons = ["spam", "insult", "nsfw", "rules_violation", "other"]
    if reason not in valid_reasons:
        raise HTTPException(400, "Invalid reason")
    
    # Проверка что цель существует
    if target_type == "post":
        target = session.get(Post, target_id)
        if not target:
            raise HTTPException(404, "Post not found")
        # Нельзя жаловаться на свой пост
        if target.author_id == user.id:
            raise HTTPException(400, "Cannot report your own post")
    else:
        target = session.get(User, target_id)
        if not target:
            raise HTTPException(404, "User not found")
        # Нельзя жаловаться на себя
        if target.id == user.id:
            raise HTTPException(400, "Cannot report yourself")
    
    # Проверка на дубликат жалобы
    existing = session.exec(
        select(Report).where(
            Report.reporter_id == user.id,
            Report.target_type == target_type,
            Report.target_id == target_id,
            Report.status == "pending",
        )
    ).first()
    if existing:
        raise HTTPException(400, "Вы уже пожаловались на это. Жалоба рассматривается.")
    
    report = Report(
        reporter_id=user.id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        comment=comment,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    
    return {"ok": True, "id": report.id}


@app.get("/api/reports")
def list_reports(
    status: Optional[str] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_reports", session):
        raise HTTPException(403, "No permission: manage_reports")
    
    query = select(Report).order_by(Report.created_at.desc())
    if status:
        query = query.where(Report.status == status)
    
    reports = session.exec(query.limit(100)).all()
    _pre = batch_get_users([session.get(User, r.reporter_id) for r in reports if r.reporter_id], session)
    
    result = []
    for r in reports:
        reporter = session.get(User, r.reporter_id)
        
        target_info = None
        if r.target_type == "post":
            post = session.get(Post, r.target_id)
            if post:
                author = session.get(User, post.author_id)
                target_info = {
                    "type": "post",
                    "id": post.id,
                    "text": post.text[:200] if post.text else "",
                    "author_name": author.display_name if author else "Unknown",
                    "author_id": post.author_id,
                }
        else:
            target_user = session.get(User, r.target_id)
            if target_user:
                target_info = {
                    "type": "user",
                    "id": target_user.id,
                    "username": target_user.username,
                    "display_name": target_user.display_name,
                    "avatar_url": target_user.avatar_url,
                }
        
        result.append({
            "id": r.id,
            "reporter": user_out(reporter, session, _pre.get(reporter.id)) if reporter else None,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "target": target_info,
            "reason": r.reason,
            "comment": r.comment,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        })
    
    return result


@app.post("/api/reports/{report_id}/resolve")
async def resolve_report( 
    request: Request,  # ← ДОБАВЬ
    report_id: int,
    action: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_reports", session):
        raise HTTPException(403, "No permission: manage_reports")
    
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "pending":
        raise HTTPException(400, "Report already processed")



    if action == "delete_post" and report.target_type == "post":
        if not has_permission(staff, "delete_posts", session):
            raise HTTPException(403, "No permission: delete_posts")
        post = session.get(Post, report.target_id)
        if post:
            # 🛡️ Иммунитет автора поста
            author = session.get(User, post.author_id)
            if author and author.id != staff.id:
                check_sanction_rights(staff, author, session, "удалять посты этого пользователя")
            cascade_delete_post(post.id, session)
    elif action == "ban_user":
        if not has_permission(staff, "ban_users", session):
            raise HTTPException(403, "No permission: ban_users")
        target_user_id = None
        if report.target_type == "user":
            target_user_id = report.target_id
        elif report.target_type == "post":
            post = session.get(Post, report.target_id)
            if post:
                target_user_id = post.author_id
        if target_user_id:
            target = session.get(User, target_user_id)
            if target and target.id != staff.id:
                # 🛡️ Единый иммунитет (Founder/Developer нельзя банить через жалобы)
                check_sanction_rights(staff, target, session, "банить этого пользователя")
                target.is_banned = True
                session.add(target)
    
    elif action != "ignore":
        raise HTTPException(400, "Invalid action")
    
    # Помечаем жалобу как обработанную
    report.status = "resolved"
    report.resolved_by = staff.id
    report.resolved_at = datetime.now(timezone.utc)
    session.add(report)
    
    # Логируем действие
    log_action(
        session, staff.id, f"resolve_report_{action}",
        target_type=report.target_type,
        target_id=report.target_id,
        details={"action": action, "reason": report.reason},
        ip_address=get_client_ip(request) if hasattr(request, 'headers') else None,
    )
    session.commit()
    
    return {"ok": True}


@app.post("/api/reports/{report_id}/reject")
def reject_report(
    report_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_reports", session):
        raise HTTPException(403, "No permission: manage_reports")
    
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "pending":
        raise HTTPException(400, "Report already processed")
    
    report.status = "rejected"
    report.resolved_by = staff.id
    report.resolved_at = datetime.now(timezone.utc)
    session.add(report)
    session.commit()
    
    return {"ok": True}


# ---------- IP И ЛОГИ ----------

@app.get("/api/admin/users/{user_id}/ip-history")
def get_user_ip_history(
    user_id: int,
    limit: int = 20,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """История IP-адресов пользователя"""
    logs = session.exec(
        select(IPLog)
        .where(IPLog.user_id == user_id)
        .order_by(IPLog.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": log.id,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "action": log.action,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@app.get("/api/admin/ip-blocks")
def list_ip_blocks(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Список заблокированных IP"""
    blocks = session.exec(select(IPBlock).order_by(IPBlock.created_at.desc())).all()
    result = []
    for b in blocks:
        blocker = session.get(User, b.blocked_by) if b.blocked_by else None
        result.append({
            "id": b.id,
            "ip_address": b.ip_address,
            "reason": b.reason,
            "created_at": b.created_at.isoformat(),
            "expires_at": b.expires_at.isoformat() if b.expires_at else None,
            "blocked_by": user_out(blocker, session) if blocker else None,
        })
    return result


@app.post("/api/admin/ip-blocks")
def create_ip_block(
    request: Request,
    ip_address: str = Form(...),
    reason: str = Form(""),
    hours: Optional[int] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "ban_users", session):
        raise HTTPException(403, "Нет прав: ban_users")
    
    existing = session.exec(select(IPBlock).where(IPBlock.ip_address == ip_address)).first()
    if existing:
        raise HTTPException(400, "Этот IP уже заблокирован")
    
    expires_at = None
    if hours and hours > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)
    
    block = IPBlock(
        ip_address=ip_address.strip(),
        reason=reason.strip() if reason else None,
        blocked_by=staff.id,
        expires_at=expires_at,
    )
    session.add(block)
    
    log_action(
        session, staff.id, "block_ip",
        target_type="ip", details={"ip": ip_address, "reason": reason},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return {"ok": True, "id": block.id}


@app.delete("/api/admin/ip-blocks/{block_id}")
def delete_ip_block(
    request: Request,
    block_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "ban_users", session):
        raise HTTPException(403, "Нет прав: ban_users")
    
    block = session.get(IPBlock, block_id)
    if not block:
        raise HTTPException(404, "Блок не найден")
    
    ip = block.ip_address
    session.delete(block)
    log_action(
        session, staff.id, "unblock_ip",
        target_type="ip", details={"ip": ip},
        ip_address=get_client_ip(request),
    )
    session.commit()
    return {"ok": True}


@app.get("/api/admin/logs")
def list_action_logs(
    request: Request,
    limit: int = 100,
    action: Optional[str] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "Нет прав")
    
    print(f"📋 Loading logs: limit={limit}, action={action}")
    
    query = select(ActionLog).order_by(ActionLog.created_at.desc()).limit(limit)
    if action:
        query = query.where(ActionLog.action == action)
    
    logs = session.exec(query).all()
    print(f"📋 Found {len(logs)} logs in DB")
    
    result = []
    for log in logs:
        try:
            actor = session.get(User, log.actor_id) if log.actor_id else None
            
            # Безопасный парсинг JSON
            details_parsed = None
            if log.details:
                try:
                    details_parsed = json.loads(log.details)
                except Exception:
                    details_parsed = {"raw": str(log.details)}
            
            result.append({
                "id": log.id,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "details": details_parsed,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat(),
                "actor": user_out(actor, session) if actor else None,
            })
        except Exception as e:
            print(f"❌ Error parsing log {log.id}: {e}")
            continue
    
    print(f"📋 Returning {len(result)} logs")
    return result

@app.get("/api/admin/logs/debug")
def debug_logs(
    request: Request,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Диагностика: сколько логов в БД и их структура"""
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "Нет прав")
    
    total = session.exec(select(func.count()).select_from(ActionLog)).one()
    sample = session.exec(select(ActionLog).order_by(ActionLog.created_at.desc()).limit(3)).all()
    
    sample_data = []
    for log in sample:
        sample_data.append({
            "id": log.id,
            "action": log.action,
            "actor_id": log.actor_id,
            "target_type": log.target_type,
            "target_id": log.target_id,
            "details_type": type(log.details).__name__,
            "details_value": str(log.details)[:200] if log.details else None,
            "ip_address": log.ip_address,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        })
    
    return {
        "total_in_db": total,
        "sample": sample_data,
    }

@app.delete("/api/admin/logs")
def clear_action_logs(
    staff: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    """Очистить логи (только для Founder)"""
    logs = session.exec(select(ActionLog)).all()
    count = len(logs)
    for log in logs:
        session.delete(log)
    session.commit()
    return {"ok": True, "deleted": count}

# ---------- БАГ-ТРЕКЕР ----------

from models import BugReport

@app.post("/api/bugs")
@limiter.limit("5/minute")
def create_bug_report(
    request: Request,
    title: str = Form(...),
    description: str = Form(...),
    priority: str = Form("medium"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if len(title.strip()) < 5:
        raise HTTPException(400, "Заголовок должен быть не менее 5 символов")
    if len(description.strip()) < 20:
        raise HTTPException(400, "Описание должно быть не менее 20 символов")
    if priority not in ("low", "medium", "high", "critical"):
        raise HTTPException(400, "Неверный приоритет")
    
    bug = BugReport(
        reporter_id=user.id,
        title=title.strip(),
        description=description.strip(),
        priority=priority,
    )
    session.add(bug)
    session.commit()
    session.refresh(bug)
    
    return {"ok": True, "id": bug.id}


@app.get("/api/bugs")
def list_bugs(
    status: Optional[str] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    query = select(BugReport).order_by(BugReport.created_at.desc())
    if status:
        query = query.where(BugReport.status == status)
    
    bugs = session.exec(query.limit(200)).all()
    _pre = batch_get_users(
        [u for u in (session.get(User, b.reporter_id) for b in bugs) if u], session
    )
    
    result = []
    for bug in bugs:
        reporter = session.get(User, bug.reporter_id)
        resolver = session.get(User, bug.resolved_by) if bug.resolved_by else None
        
        result.append({
            "id": bug.id,
            "reporter": user_out(reporter, session, _pre.get(reporter.id)) if reporter else None,
            "title": bug.title,
            "description": bug.description,
            "status": bug.status,
            "priority": bug.priority,
            "resolver": user_out(resolver, session) if resolver else None,
            "resolved_at": bug.resolved_at.isoformat() if bug.resolved_at else None,
            "created_at": bug.created_at.isoformat(),
        })
    
    return result


@app.patch("/api/bugs/{bug_id}")
def update_bug_status(
    bug_id: int,
    status: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    if status not in ("new", "in_progress", "resolved", "rejected"):
        raise HTTPException(400, "Неверный статус")
    
    bug = session.get(BugReport, bug_id)
    if not bug:
        raise HTTPException(404, "Bug report not found")
    
    bug.status = status
    
    if status in ("resolved", "rejected"):
        bug.resolved_by = staff.id
        bug.resolved_at = datetime.now(timezone.utc)
    else:
        bug.resolved_by = None
        bug.resolved_at = None
    
    session.add(bug)
    session.commit()
    
    return {"ok": True, "status": bug.status}


@app.delete("/api/bugs/{bug_id}")
def delete_bug(
    bug_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    bug = session.get(BugReport, bug_id)
    if not bug:
        raise HTTPException(404, "Bug report not found")
    
    session.delete(bug)
    session.commit()
    
    return {"ok": True}


# ---------- ЭНДПОИНТЫ ПО USERNAME ----------

@app.get("/api/users/by-username/{username}/posts")
def get_user_posts_by_username(
    username: str,
    cursor: Optional[int] = None,
    limit: int = 20,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    """Получить посты пользователя по username"""
    clean_username = username.lstrip("@").lower()

    user = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()

    if not user:
        raise HTTPException(404, "User not found")

    # Используем ту же логику, что и get_user_posts
    return get_user_posts(str(user.id), cursor, limit, viewer, session)


@app.get("/api/users/by-username/{username}/followers")
def get_followers_by_username(username: str, session: Session = Depends(get_session)):
    """Получить подписчиков по username"""
    clean_username = username.lstrip("@").lower()
    
    user = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not user:
        raise HTTPException(404, "User not found")
    
    return get_followers(str(user.id), session)


@app.get("/api/users/by-username/{username}/following")
def get_following_by_username(username: str, session: Session = Depends(get_session)):
    """Получить подписки по username"""
    clean_username = username.lstrip("@").lower()
    
    user = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not user:
        raise HTTPException(404, "User not found")
    
    return get_following(str(user.id), session)


@app.get("/api/users/by-username/{username}/is-following")
def is_following_by_username(
    username: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Проверить подписку по username"""
    clean_username = username.lstrip("@").lower()
    
    target = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not target:
        raise HTTPException(404, "User not found")
    
    return is_following(str(target.id), user, session)


@app.post("/api/users/by-username/{username}/follow")
@limiter.limit("20/minute")
def toggle_follow_by_username(
    request: Request,
    username: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Подписаться/отписаться по username"""
    clean_username = username.lstrip("@").lower()
    
    target = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not target:
        raise HTTPException(404, "User not found")
    
    return toggle_follow(request, str(target.id), user, session)


# ---------- БЛОГ ОБНОВЛЕНИЙ ----------


def require_founder(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    """Только уровень 10 (Founder) и 11 (System)"""
    user = get_current_user(authorization=authorization, session=session)
    if get_user_level(user, session) < 10:
        raise HTTPException(403, "Только Founder и System могут писать обновления")
    return user

def require_announcer(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    """Founder/System ИЛИ право manage_announcements"""
    user = get_current_user(authorization=authorization, session=session)
    if get_user_level(user, session) >= 10 or has_permission(user, "manage_announcements", session):
        return user
    raise HTTPException(403, "Нужен уровень Founder или право manage_announcements")

@app.get("/api/updates")
def list_updates(
    user: Optional[User] = Depends(get_optional_user),  # ← Изменили get_current_user на get_optional_user
    session: Session = Depends(get_session),
):
    updates = session.exec(select(Update).order_by(Update.created_at.desc())).all()
    if not updates:
        return []

    author_ids = list({u.author_id for u in updates if u.author_id})
    authors = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(author_ids))
        ).all()
    } if author_ids else {}

    # 🆕 Получаем список ID прочитанных обновлений для текущего юзера
    read_update_ids = set()
    if user:
        read_rows = session.exec(
            select(UpdateRead.update_id).where(UpdateRead.user_id == user.id)
        ).all()
        read_update_ids = set(read_rows)

    result = []
    for u in updates:
        author = authors.get(u.author_id)
        result.append({
            "id": u.id,
            "title": u.title,
            "content": u.content,
            "importance": u.importance,
            "author": user_out(author, session) if author else None,
            "created_at": u.created_at.isoformat(),
            "edited_at": u.edited_at.isoformat() if u.edited_at else None,
            "is_read": u.id in read_update_ids,  # ← ДОБАВИЛИ ПОЛЕ
        })
    return result




@app.post("/api/updates/{update_id}/read")
def mark_update_read(
    update_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отметить обновление как прочитанное"""
    existing = session.exec(
        select(UpdateRead).where(
            UpdateRead.user_id == user.id, 
            UpdateRead.update_id == update_id
        )
    ).first()
    
    if not existing:
        session.add(UpdateRead(user_id=user.id, update_id=update_id))
        session.commit()
    
    return {"ok": True}


@app.post("/api/updates/read-all")
def mark_all_updates_read(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отметить ВСЕ обновления как прочитанные"""
    all_updates = session.exec(select(Update.id)).all()
    existing = {
        r.update_id for r in session.exec(
            select(UpdateRead.update_id).where(UpdateRead.user_id == user.id)
        ).all()
    }
    
    new_ids = set(all_updates) - existing
    
    for uid in new_ids:
        session.add(UpdateRead(user_id=user.id, update_id=uid))
    
    session.commit()
    return {"ok": True, "marked": len(new_ids)}

@app.post("/api/updates")
@limiter.limit("10/minute")
async def create_update( # 👈 ИЗМЕНИЛИ def на async def
    request: Request,
    title: str = Form(...),
    content: str = Form(...),
    importance: str = Form("minor"),
    user: User = Depends(require_announcer),
    session: Session = Depends(get_session),
):
    if len(title.strip()) < 3:
        raise HTTPException(400, "Заголовок: минимум 3 символа")
    if len(content.strip()) < 10:
        raise HTTPException(400, "Текст: минимум 10 символов")
    if importance not in ("major", "minor", "patch"):
        raise HTTPException(400, "Неверный тип важности")
        
    update = Update(
        title=title.strip(),
        content=content.strip(),
        importance=importance,
        author_id=user.id,
    )
    session.add(update)
    session.commit()
    session.refresh(update)
    
    # 🆕 РАССЫЛАЕМ СОБЫТИЕ ВСЕМ КЛИЕНТАМ ЧЕРЕЗ WEBSOCKET
    await manager.broadcast_all("new_update", {
        "id": update.id,
        "title": update.title,
        "importance": update.importance
    })
    
    return {"ok": True, "id": update.id}


@app.delete("/api/updates/{update_id}")
def delete_update(
    update_id: int,
    user: User = Depends(require_announcer),   # 🆕 было require_founder
    session: Session = Depends(get_session),
):
    update = session.get(Update, update_id)
    if not update:
        raise HTTPException(404, "Update not found")
    
    # Один запрос вместо N+1
    session.exec(delete(UpdateRead).where(UpdateRead.update_id == update_id))
    session.delete(update)
    session.commit()
    return {"ok": True}

def _update_last_seen_sync(user_id: int):
    """Синхронная функция для обновления last_seen (выполняется в threadpool)"""
    with Session(engine) as session:
        user = session.get(User, user_id)
        if user:
            user.last_seen = datetime.now(timezone.utc)
            session.add(user)
            session.commit()


def _track_view_sync(post_id: int, viewer_hash: str):
    """Синхронная функция для обновления views (выполняется в фоне)"""
    with Session(engine) as session:
        post = session.get(Post, post_id)
        if not post:
            return
        yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
        existing = session.exec(
            select(PostView).where(
                PostView.post_id == post_id,
                PostView.viewer_hash == viewer_hash,
                PostView.viewed_at > yesterday
            )
        ).first()
        if not existing:
            session.add(PostView(post_id=post_id, viewer_hash=viewer_hash))
            post.views_count = (post.views_count or 0) + 1
            session.add(post)
            session.commit()

@app.post("/api/posts/{post_id}/view")
async def track_view(
    request: Request, 
    post_id: int, 
    background_tasks: BackgroundTasks,
):
    """🔥 Асинхронный view-трекинг — не блокирует ответ"""
    token = request.headers.get("Authorization", "")
    if token.startswith("Bearer "):
        try:
            payload = jwt.decode(token.split(" ", 1)[1], SECRET, algorithms=[ALGORITHM])
            viewer_hash = f"u{payload['sub']}"
        except Exception:
            viewer_hash = f"ip:{get_client_ip(request)}"
    else:
        viewer_hash = f"ip:{get_client_ip(request)}"
    
    # Запускаем в фоне — ответ возвращается мгновенно
    background_tasks.add_task(_track_view_sync, post_id, viewer_hash)
    return {"ok": True}

# ============================================================
# 📞 ICE-SERVERS: выдаём клиенту конфиг TURN для RTCPeerConnection.
# Секреты живут ТОЛЬКО здесь (Render env): METERED_USERNAME / METERED_PASSWORD /
# METERED_API_KEY (+ опционально METERED_DOMAIN, METERED_TURN_HOST).
# Фронтенд забирает их через GET /api/ice-servers — ключи НЕ попадают в его бандл.
# ============================================================

_ice_servers_cache: dict = {"servers": None, "expires": 0.0}


@app.get("/api/ice-servers")
async def api_get_ice_servers(user: User = Depends(get_current_user)):
    """Список iceServers для WebRTC-звонков.

    Приоритет источников:
      1) Эфемерные креды через Metered API (если задан METERED_API_KEY)
      2) Статические METERED_USERNAME / METERED_PASSWORD
      3) Пустой список -> фронтенд использует свой локальный STUN-фолбэк
    Кэш 4 минуты, чтобы не дёргать внешний API на каждый звонок.
    """
    now = time.time()
    if _ice_servers_cache["servers"] is not None and now < _ice_servers_cache["expires"]:
        return {"iceServers": _ice_servers_cache["servers"], "cached": True, "configured": True}

    api_key = os.getenv("METERED_API_KEY", "").strip()
    username = os.getenv("METERED_USERNAME", "").strip()
    password = os.getenv("METERED_PASSWORD", "").strip()
    domain = os.getenv("METERED_DOMAIN", "").strip() or "nebula"

    servers: list = []

    # --- 1) Эфемерные креды через Metered API ---
    if api_key:
        import httpx  # локальный импорт: больше нигде в main.py не нужен
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(
                    f"https://{domain}.metered.live/api/v1/turn/credentials",
                    params={"secretKey": api_key},
                )
                resp.raise_for_status()
                raw = resp.json()
            if isinstance(raw, list):
                servers = [
                    s for s in raw
                    if isinstance(s, dict) and s.get("urls")
                ]
                # 🔥 FIX: публичный Google-STUN добавляем ВСЕГДА первым.
                # Если DNS провайдера блокирует домен TURN-сервера (errorCode 701),
                # srflx через Google остаётся шансом на прямое P2P-соединение.
                servers.insert(0, {
                    "urls": [
                        "stun:stun.l.google.com:19302",
                        "stun:stun1.l.google.com:19302",
                    ]
                })
        except Exception as e:  # noqa: BLE001 — внешний сервис, любой сбой => фолбэк
            print(f"⚠️ Metered API failed ({e}) — fallback to static creds")

    # --- 2) Статические креды из env (фолбэк) ---
    if not servers and username and password:
        # 🔥 Поддержка НЕСКОЛЬКИХ хостов через запятую:
        #   METERED_TURN_HOST=vps-turn.mydomain.ru,relay.metered.ca
        # Так можно поставить свой coturn на доступный из РФ VPS и оставить
        # Metered вторым эшелоном. Креды применяются ко всем хостам одинаково.
        raw_hosts = os.getenv("METERED_TURN_HOST", "").strip() or "relay.metered.ca"
        hosts = [h.strip() for h in raw_hosts.split(",") if h.strip()]
        entries = []
        for h in hosts:
            entries.append({
                "urls": [
                    f"turns:{h}:443?transport=tcp",
                    f"turn:{h}:443?transport=tcp",
                    f"turn:{h}:80?transport=tcp",
                    f"turn:{h}:3478?transport=udp",
                ],
                "username": username,
                "credential": password,
            })
        servers = [
            {"urls": [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302",
            ]},
            *entries,
        ]

    if servers:
        _ice_servers_cache["servers"] = servers
        _ice_servers_cache["expires"] = now + 240.0

    return {"iceServers": servers, "cached": False, "configured": bool(servers)}


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
        # 7. Держим соединение открытым + 📞 РЕТРАНСЛЯЦИЯ СИГНАЛОВ ЗВОНКОВ
        #
        # 🔄 ИЗМЕНЕНО (fix WebRTC signaling): старый цикл обрабатывал ТОЛЬКО
        # "ping" и молча отбрасывал все остальные сообщения, из-за чего
        # SDP-offer/answer и ICE-кандидаты никогда не доходили до собеседника.
        # Старый код (для отката через git history):
        #   while True:
        #       data = await websocket.receive_text()
        #       if data == "ping":
        #           await websocket.send_text(json.dumps({"event": "pong"}))
        while True:
            raw = await websocket.receive_text()

            # Keep-alive (как раньше)
            if raw == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
                continue

            # Все остальные сообщения — это JSON-сигналы WebRTC
            try:
                msg = json.loads(raw)
                if not isinstance(msg, dict):
                    raise ValueError("not an object")
            except (ValueError, TypeError):
                print(f"⚠️ WS: non-JSON message from user {user_id}: {raw[:120]}")
                continue

            mtype = msg.get("type")
            target_id = msg.get("target_user_id")

            # --- call_initiate: сервер генерирует call_id и рассылает обеим сторонам.
            # Фронтенд НЕ генерирует call_id сам: инициатор ждёт его в 'call_initiated'
            # (useWebRTC.ts case 'call_initiated'), вызываемый ждёт его в 'call_incoming'.
            if mtype == "call_initiate":
                if not isinstance(target_id, int):
                    continue
                call_id = f"call-{user_id}-{target_id}-{uuid.uuid4().hex[:8]}"
                # 1) Входящий вызов адресату (useWebRTC.ts case 'call_incoming')
                await manager.send_to_user(target_id, "call_incoming", {
                    "call_id": call_id,
                    "call_type": msg.get("call_type", "audio"),
                    "caller_id": user_id,
                    "caller_name": msg.get("caller_name", ""),
                    "caller_avatar": msg.get("caller_avatar", ""),
                })
                # 2) Подтверждение инициатору (useWebRTC.ts case 'call_initiated')
                await manager.send_to_user(user_id, "call_initiated", {
                    "call_id": call_id,
                    "target_user_id": target_id,
                })
                continue

            # --- Остальные сигналы: релей адресату «как есть».
            # Маппинг имён клиент -> сервер -> клиент сверен с подписками
            # в l_frontend/components/WebSocketProvider.tsx (call_accepted /
            # call_rejected / call_ended / call_offer / call_answer / call_ice_candidate).
            if mtype in ("call_accept", "call_reject", "call_end",
                         "call_offer", "call_answer", "call_ice_candidate"):
                if not isinstance(target_id, int):
                    continue
                out_event = {
                    "call_accept": "call_accepted",
                    "call_reject": "call_rejected",
                    "call_end": "call_ended",
                }.get(mtype, mtype)
                payload = {
                    k: v for k, v in msg.items()
                    if k not in ("type", "target_user_id")
                }
                # 📞 ДИАГНОСТИКА ЗВОНКОВ: каждое релеированное событие видно в
                # логах сервера. send_to_user теперь сообщает, было ли хотя бы
                # одно ЖИВОЕ соединение у адресата — иначе честно пишем
                # TARGET OFFLINE (например, собеседник перезагрузил страницу
                # сразу после нажатия «Принять»).
                _sdp = payload.get("sdp")
                sdp_len = len(_sdp.get("sdp", "")) if isinstance(_sdp, dict) else 0
                suffix = f" sdp={sdp_len}b" if mtype in ("call_offer", "call_answer") else ""
                print(f"[📞 RELAY] {mtype}: {user_id} -> {target_id}{suffix}")
                try:
                    ok = await manager.send_to_user(target_id, out_event, payload)
                    if ok:
                        print(f"[📞 RELAY] {mtype}: {user_id} -> {target_id} delivered")
                    else:
                        print(
                            f"[📞 RELAY] {mtype}: {user_id} -> {target_id} "
                            "⚠️ TARGET OFFLINE — сообщение НЕ доставлено!"
                        )
                except Exception as e:  # noqa: BLE001 — мёртвый получатель не должен ронять сокет отправителя
                    print(f"[📞 RELAY] {mtype}: {user_id} -> {target_id} FAILED: {e}")
                continue

            print(f"⚠️ WS: unknown/unroutable signal '{mtype}' from user {user_id}")
    except WebSocketDisconnect:
        # Штатное отключение клиента
        await manager.disconnect(websocket, user_id)
    except RuntimeError as e:
        # 🛡 FIX (zombie-loop): Starlette бросает RuntimeError('Cannot call
        # "receive" once a disconnect message has been received'), когда сокет
        # уже мёртв — частая ситуация при флапающей сети. Раньше ниже торчал
        # старый ping-only цикл, который делал повторный receive() по трупу
        # сокета и сыпал «❌ WS error» в лог. Старый цикл удалён; здесь же
        # штатно выходим без шума.
        if "disconnect" in str(e).lower():
            await manager.disconnect(websocket, user_id)
        else:
            print(f"❌ WS error for user {user_id}: {e}")
            await manager.disconnect(websocket, user_id)
    except Exception as e:
        print(f"❌ WS error for user {user_id}: {e}")
        await manager.disconnect(websocket, user_id)


@app.get("/api/online-count")
def get_online_count(user: User = Depends(get_current_user)):
    """Сколько пользователей сейчас онлайн"""
    return {"count": manager.total_connections}



# ============================================================
# 🎧 АДМИНКА: СПИСОК ЗАЯВОК + ЗАКРЫТИЕ
# ============================================================
@app.get("/api/support/tickets")
def support_list_tickets(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Список всех заявок для админки"""
    if not user.is_admin and not has_permission(user, "manage_support", session):
        raise HTTPException(403, "Нет права: manage_support")

    tickets = session.exec(
        select(SupportTicket).order_by(SupportTicket.updated_at.desc())
    ).all()
    if not tickets:
        return []

    ticket_ids = [t.id for t in tickets]
    user_ids = list({t.user_id for t in tickets})
    users = {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}

    last_msgs = session.exec(
        select(SupportMessage)
        .where(SupportMessage.ticket_id.in_(ticket_ids))
        .order_by(SupportMessage.created_at.desc())
    ).all()
    last_by_ticket = {}
    for m in last_msgs:
        if m.ticket_id not in last_by_ticket:
            last_by_ticket[m.ticket_id] = m

    result = []
    for t in tickets:
        u = users.get(t.user_id)
        last = last_by_ticket.get(t.id)
        result.append({
            "id": t.id,
            "user": user_out(u, session) if u else None,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat() if t.updated_at else t.created_at.isoformat(),
            "last_message": {
                "text": (last.text or "📷 Фото")[:60] if last else None,
                "created_at": last.created_at.isoformat() if last else None,
            } if last else None,
        })
    return result


@app.post("/api/support/tickets/{ticket_id}/close")
async def support_close_ticket(
    ticket_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Закрыть заявку — автор или саппортер"""
    ticket = session.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Заявка не найдена")

    is_author = ticket.user_id == user.id
    is_staff = user.is_admin or has_permission(user, "manage_support", session)
    if not is_author and not is_staff:
        raise HTTPException(403, "Нет доступа")

    ticket.status = "closed"
    ticket.updated_at = datetime.now(timezone.utc)
    session.add(ticket)
    session.add(SupportMessage(ticket_id=ticket.id, sender_id=user.id, text="🔒 Заявка закрыта."))
    session.commit()

    if is_staff:
        await manager.broadcast_to_users([ticket.user_id], "support_ticket_closed", {"ticket_id": ticket.id})
    else:
        staff_ids = [u.id for u in session.exec(select(User)).all()
                     if u.is_admin or has_permission(u, "manage_support", session)]
        if staff_ids:
            await manager.broadcast_to_users(staff_ids, "support_ticket_closed", {"ticket_id": ticket.id})
    return {"ok": True}





# ============================================================
# 🎧 ПОДДЕРЖКА: МНОЖЕСТВЕННЫЕ ЗАЯВКИ + ФОТО
# ============================================================

@app.post("/api/support/start")
async def support_start(  # <-- СТАЛО async def
    background_tasks: BackgroundTasks,
    text: str = Form(""),
    file: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать НОВУЮ заявку (разрешено иметь несколько открытых)"""
    ticket = SupportTicket(user_id=user.id, status="open")
    session.add(ticket)
    session.commit()
    session.refresh(ticket)

    # 🚀 ИСПРАВЛЕННЫЙ БЛОК ЗАГРУЗКИ ФОТО
    media_url = None
    media_type = None
    
    if file and file.filename:
        ext = os.path.splitext(file.filename or "")[1].lower()
        content_type = (file.content_type or "").lower()

        # Если расширения нет, но браузер говорит, что это картинка - верим
        if not ext and content_type.startswith("image/"):
            ext = ".jpg" 

        # 🛡️ ЯВНАЯ ПРОВЕРКА: Если это вообще не картинка - прерываем с понятной ошибкой
        if ext not in ALLOWED_IMAGE_EXT and not content_type.startswith("image/"):
            raise HTTPException(400, f"Неподдерживаемый формат ({ext or 'unknown'}). Разрешены только изображения.")

        # Читаем файл (используем await, так как функция теперь async)
        content = await file.read()

        try:
            # 🚀 format="jpg" заставляет Cloudinary конвертировать HEIC/WebP в обычный JPG
            result = await run_in_threadpool(
                lambda: cloudinary.uploader.upload(
                    content, 
                    folder="support", 
                    resource_type="image",
                    format="jpg" 
                )
            )
            media_url = result.get("secure_url")
            media_type = "image"
        except Exception as e:
            print(f"[Support] Upload failed: {e}")
            raise HTTPException(400, f"Ошибка загрузки фото: {str(e)}")

    first_text = text.strip() or ("📷 Фото без описания" if media_url else "👋 Привет! Мне нужна помощь.")
    
    msg = SupportMessage(
        ticket_id=ticket.id,
        sender_id=user.id,
        text=first_text,
        media_url=media_url,
        media_type=media_type,
    )
    session.add(msg)
    ticket.updated_at = datetime.now(timezone.utc)
    session.add(ticket)
    session.commit()

    # ✅ БЕЗОПАСНАЯ рассылка через BackgroundTasks
    staff_ids = [
        u.id for u in session.exec(select(User)).all()
        if u.is_admin or has_permission(u, "manage_support", session)
    ]
    if staff_ids:
        background_tasks.add_task(
            manager.broadcast_to_users,
            staff_ids,
            "support_new_ticket",
            {"ticket_id": ticket.id, "user_name": user.display_name}
        )

    return {"ticket_id": ticket.id}


@app.post("/api/support/messages")
async def support_send_message(
    background_tasks: BackgroundTasks,  # ← На всякий случай
    ticket_id: int = Form(...),
    text: str = Form(""),
    file: Optional[UploadFile] = File(None),  # ← НОВОЕ: фото
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отправить сообщение в заявку (текст + фото)"""
    ticket = session.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Заявка не найдена")
    if ticket.status != "open":
        raise HTTPException(400, "Заявка закрыта")

    is_author = ticket.user_id == user.id
    is_staff = user.is_admin or has_permission(user, "manage_support", session)
    if not is_author and not is_staff:
        raise HTTPException(403, "Нет доступа")

    # Загрузка фото
    media_url = None
    media_type = None
    
    if file:
        # 1. Пытаемся получить расширение из имени файла
        ext = os.path.splitext(file.filename or "")[1].lower()
        
        # 2. Если имени нет, проверяем MIME-тип (content_type)
        if not ext and file.content_type:
            if "jpeg" in file.content_type or "jpg" in file.content_type: ext = ".jpg"
            elif "png" in file.content_type: ext = ".png"
            elif "gif" in file.content_type: ext = ".gif"
            elif "webp" in file.content_type: ext = ".webp"
            elif "heic" in file.content_type: ext = ".heic" # Cloudinary умеет конвертировать HEIC!

        # 🛡️ ЯВНАЯ ПРОВЕРКА: Если формат не поддерживается, сразу прерываем с понятной ошибкой
        if ext not in ALLOWED_IMAGE_EXT and not (file.content_type and file.content_type.startswith("image/")):
            raise HTTPException(
                400, 
                f"Неподдерживаемый формат файла ({ext or 'unknown'}). Разрешены: JPG, PNG, GIF, WEBP"
            )
            
        content = await file.read()
        try:
            # Cloudinary сам сконвертирует HEIC/WEBP в JPG, если указать resource_type="image"
            result = await run_in_threadpool(
                lambda: cloudinary.uploader.upload(
                    content, 
                    folder="support", 
                    resource_type="image",
                    format="jpg" # 🚀 Принудительно конвертируем всё в JPG на стороне Cloudinary
                )
            )
            media_url = result.get("secure_url")
            media_type = "image"
        except Exception as e:
            raise HTTPException(400, f"Ошибка загрузки фото: {str(e)}")

    msg = SupportMessage(
        ticket_id=ticket.id,
        sender_id=user.id,
        text=text.strip() if text.strip() else None,
        media_url=media_url,
        media_type=media_type,
    )
    session.add(msg)
    ticket.updated_at = datetime.now(timezone.utc)
    session.add(ticket)
    session.commit()
    session.refresh(msg)

    # Формируем данные для WS
    msg_data = {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "sender_name": user.display_name,
        "sender_is_staff": is_staff,
        "text": msg.text,
        "media_url": msg.media_url,
        "media_type": msg.media_type,
        "created_at": msg.created_at.isoformat(),
    }

    recipients = []
    if is_author:
        recipients = [u.id for u in session.exec(select(User)).all()
                      if u.is_admin or has_permission(u, "manage_support", session)]
    else:
        recipients = [ticket.user_id]

    if recipients:
        await manager.broadcast_to_users(recipients, "support_new_message", {
            "ticket_id": ticket.id,
            "message": msg_data,
        })

    return {"ok": True, "message": msg_data}


@app.get("/api/support/my-tickets")
def support_my_tickets(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """ВСЕ заявки пользователя (открытые + закрытые)"""
    tickets = session.exec(
        select(SupportTicket)
        .where(SupportTicket.user_id == user.id)
        .order_by(SupportTicket.updated_at.desc())
    ).all()

    if not tickets:
        return []

    ticket_ids = [t.id for t in tickets]
    # Последние сообщения для превью
    last_msgs = {}
    all_last = session.exec(
        select(SupportMessage)
        .where(SupportMessage.ticket_id.in_(ticket_ids))
        .order_by(SupportMessage.created_at.desc())
    ).all()
    for m in all_last:
        if m.ticket_id not in last_msgs:
            last_msgs[m.ticket_id] = m

    result = []
    for t in tickets:
        last = last_msgs.get(t.id)
        preview = None
        if last:
            if last.media_url and not last.text:
                preview = "📷 Фото"
            else:
                preview = (last.text or "")[:60]
        result.append({
            "id": t.id,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat() if t.updated_at else t.created_at.isoformat(),
            "last_message": {
                "text": preview,
                "is_mine": last.sender_id == user.id if last else False,
                "created_at": last.created_at.isoformat() if last else None,
            } if last else None,
        })
    return result


@app.get("/api/support/tickets/{ticket_id}/messages")
def support_ticket_messages(
    ticket_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Сообщения конкретной заявки (для пользователя И админа)"""
    ticket = session.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(404, "Заявка не найдена")

    is_author = ticket.user_id == user.id
    is_staff = user.is_admin or has_permission(user, "manage_support", session)
    if not is_author and not is_staff:
        raise HTTPException(403, "Нет доступа")

    messages = session.exec(
        select(SupportMessage)
        .where(SupportMessage.ticket_id == ticket_id)
        .order_by(SupportMessage.created_at.asc())
    ).all()

    sender_ids = list({m.sender_id for m in messages})
    senders = {u.id: u for u in session.exec(select(User).where(User.id.in_(sender_ids))).all()}

    return [
        {
            "id": m.id,
            "sender_id": m.sender_id,
            "sender_name": senders[m.sender_id].display_name if m.sender_id in senders else "—",
            "sender_is_staff": (
                senders[m.sender_id].is_admin
                or has_permission(senders[m.sender_id], "manage_support", session)
            ) if m.sender_id in senders else False,
            "text": m.text,
            "media_url": m.media_url,
            "media_type": m.media_type,
            "created_at": m.created_at.isoformat(),
        }
        for m in messages
    ]

@app.post("/api/chats/prism")
async def create_prism_chat(
    data: CreatePrismChatIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создание чата типа 'Призма'"""
    if data.other_user_id == user.id:
        raise HTTPException(400, "Нельзя создать чат с собой")
    
    other = session.get(User, data.other_user_id)
    if not other:
        raise HTTPException(404, "Пользователь не найден")

    # 1. Проверяем, нет ли уже активной Призмы с этим юзером
    my_chats = session.exec(select(ChatMember.chat_id).where(ChatMember.user_id == user.id)).all()
    for cid in my_chats:
        chat = session.get(Chat, cid)
        if chat and getattr(chat, 'is_prism', False):
            other_in = session.exec(select(ChatMember).where(
                ChatMember.chat_id == cid, ChatMember.user_id == data.other_user_id
            )).first()
            if other_in:
                return {"chat_id": cid, "already_existed": True}

    # 2. Создаем чат
    chat = Chat(is_prism=True, avatar_url=data.avatar_url)
    session.add(chat)
    
    # 🔥 КРИТИЧЕСКИ ВАЖНО: получаем ID чата из базы данных ДО создания участников
    session.commit()
    session.refresh(chat)
    
    # 3. Теперь chat.id известен, добавляем участников
    session.add(ChatMember(chat_id=chat.id, user_id=user.id, role="member"))
    session.add(ChatMember(chat_id=chat.id, user_id=data.other_user_id, role="member"))
    
    # 4. Сохраняем "Спектр 1" (Якорь) в профиль текущего пользователя
    user.prism_anchor = data.shard1_encrypted
    session.add(user)
    
    # 5. Создаем ПЕРВОЕ системное сообщение, которое хранит "Спектр 2" (Генезис)
    genesis_msg = Message(
        chat_id=chat.id,
        sender_id=user.id,
        text=f"__PRISM_GENESIS__:{data.shard2_genesis}",
        media_type="system",
    )
    session.add(genesis_msg)
    
    # 6. Уведомление
    session.add(Notification(
        user_id=data.other_user_id,
        actor_id=user.id,
        type="prism_chat_created",
        details=json.dumps({"chat_id": chat.id}),
    ))
    session.commit()

    # 7. WebSocket уведомление
    await manager.broadcast_to_users([data.other_user_id], "prism_chat_created", {
        "chat_id": chat.id,
        "from_user": user.display_name,
    })

    return {"chat_id": chat.id, "already_existed": False}


@app.patch("/api/users/me/prism-anchor")
async def update_prism_anchor(
    shard1_encrypted: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Обновление Якоря пользователя (например, при смене PIN-кода)"""
    user.prism_anchor = shard1_encrypted
    session.add(user)
    session.commit()
    return {"ok": True}


@app.post("/api/chats/prism-avatar")
@limiter.limit("5/minute")
async def upload_prism_avatar(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith('.png'):
        raise HTTPException(400, "Для Призмы требуется формат PNG (без сжатия)")
    
    err = check_size_before_read(file.headers, 5 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (макс 5 МБ)")
    
    try:
        # 🔥 ИСПРАВЛЕНО: quality="100" и flags="lossless" ГАРАНТИРУЮТ сохранение каждого бита
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder=UPLOAD_FOLDER,
                resource_type="image",
                format="png",
                quality="100",
                flags="lossless"
            )
        )
        return {"avatar_url": result.get("secure_url")}
    except Exception as e:
        raise HTTPException(400, f"Ошибка загрузки: {str(e)}")


# ============================================================
# 🏅 ЗНАЧКИ (BADGES)
# ============================================================
from models import Badge  # убедись, что Badge импортирован в main.py

@app.get("/api/badges")
def get_badges(
    user: Optional[User] = Depends(get_optional_user),  # 🆕 ИЗМЕНЕНО: теперь токен не обязателен
    session: Session = Depends(get_session),
):
    """Получить все значки (доступно всем, чтобы фронт мог рендерить аватарки)"""
    badges = session.exec(select(Badge).order_by(Badge.id)).all()
    return [
        {
            "id": b.id,
            "name": b.name,
            "icon_url": b.icon_url,
            "glow_color": b.glow_color,
            "effect_type": b.effect_type,
            "role_id": b.role_id,
            "user_id": b.user_id,
            "is_selectable": b.is_selectable,
            # 🆕 Безопасное получение новых полей (на случай, если миграция ещё не прошла)
            "enable_ring": getattr(b, 'enable_ring', True),
            "enable_glow": getattr(b, 'enable_glow', True),
        }
        for b in badges
    ]

@app.post("/api/badges")
async def create_badge(
    name: str = Form(...),
    glow_color: Optional[str] = Form(None),
    effect_type: str = Form("none"),
    role_id: Optional[int] = Form(None),
    user_id: Optional[int] = Form(None),
    is_selectable: bool = Form(False),
    enable_ring: bool = Form(True),
    enable_glow: bool = Form(True),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать новый значок (только админ)"""
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    content = await file.read()
    result = await run_in_threadpool(
        lambda: cloudinary.uploader.upload(content, folder="badges", resource_type="image")
    )
    
    badge = Badge(
        name=name,
        icon_url=result["secure_url"],
        glow_color=glow_color if glow_color else None,
        effect_type=effect_type,
        role_id=role_id if role_id else None,
        user_id=user_id if user_id else None,
        is_selectable=is_selectable,
        enable_ring=enable_ring,
        enable_glow=enable_glow,
    )
    session.add(badge)
    session.commit()
    session.refresh(badge)
    return {"ok": True, "id": badge.id}

@app.post("/api/me/badge")
def select_my_badge(
    badge_id: Optional[int] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if badge_id:
        badge = session.get(Badge, badge_id)
        if not badge:
            raise HTTPException(404, "Badge not found")
        
        user_level = get_user_level(user, session)
        can_select = (
            (badge.role_id == user.role_id) or 
            (badge.user_id == user.id) or
            (badge.is_selectable and user_level >= 3)
        )
        if not can_select:
            raise HTTPException(403, "У вас нет прав на этот значок")
        
        user.selected_badge_id = badge_id
        user.custom_badge_url = None  # 🆕 СБРАСЫВАЕМ КАСТОМНЫЙ ПРИ ВЫБОРЕ СТОКОВОГО
    else:
        user.selected_badge_id = None
        user.custom_badge_url = None
    
    session.add(user)
    session.commit()
    return {"ok": True}

@app.put("/api/badges/{badge_id}")
async def update_badge(
    badge_id: int,
    name: str = Form(...),
    glow_color: Optional[str] = Form(None),
    effect_type: str = Form("none"),
    role_id: Optional[int] = Form(None),
    user_id: Optional[int] = Form(None),
    is_selectable: bool = Form(False),
    enable_ring: bool = Form(True),
    enable_glow: bool = Form(True),
    file: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Обновить существующий значок"""
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    badge = session.get(Badge, badge_id)
    if not badge:
        raise HTTPException(404, "Badge not found")
    
    badge.name = name
    badge.glow_color = glow_color if glow_color else None
    badge.effect_type = effect_type
    badge.role_id = role_id if role_id else None
    badge.user_id = user_id if user_id else None
    badge.is_selectable = is_selectable
    badge.enable_ring = enable_ring
    badge.enable_glow = enable_glow
    
    # Если загружен новый файл - обновляем иконку
    if file and file.filename:
        content = await file.read()
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(content, folder="badges", resource_type="image")
        )
        badge.icon_url = result["secure_url"]
    
    session.add(badge)
    session.commit()
    session.refresh(badge)
    return {"ok": True, "id": badge.id}



@app.post("/api/me/custom-badge")
@limiter.limit("5/minute")
async def upload_custom_badge(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Загрузить свой значок (только если есть доступ к selectable бейджам)"""
    user_level = get_user_level(user, session)
    has_selectable_badge = session.exec(
        select(func.count(Badge.id)).where(
            Badge.is_selectable == True,
            Badge.user_id == user.id
        )
    ).one() > 0
    
    if not has_selectable_badge and user_level < 3:
        raise HTTPException(403, "У вас нет права загружать значок")
    
    if not file.filename:
        raise HTTPException(400, "No file provided")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        raise HTTPException(400, f"Неверный формат: {ext}")
    
    err = check_size_before_read(file.headers, 2 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (макс 2 МБ)")
    
    # Удаляем старый значок
    if user.custom_badge_url and "cloudinary.com" in user.custom_badge_url:
        try:
            public_id = extract_cloudinary_public_id(user.custom_badge_url)
            if public_id:
                await run_in_threadpool(lambda: cloudinary.uploader.destroy(public_id))
        except Exception:
            pass
    
    # Загружаем новый
    try:
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder="user_badges",
                resource_type="image",
                transformation=[{"width": 100, "height": 100, "crop": "fill"}],
            )
        )
        user.custom_badge_url = result.get("secure_url")
        user.selected_badge_id = None  # 🆕 СБРАСЫВАЕМ СТОКОВЫЙ БЕЙДЖ
        session.add(user)
        session.commit()
        return {"ok": True, "custom_badge_url": user.custom_badge_url}
    except Exception as e:
        raise HTTPException(400, f"Ошибка загрузки: {str(e)}")

@app.delete("/api/me/custom-badge")
def delete_custom_badge(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удалить загруженный значок"""
    if user.custom_badge_url and "cloudinary.com" in user.custom_badge_url:
        try:
            public_id = extract_cloudinary_public_id(user.custom_badge_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    user.custom_badge_url = None
    session.add(user)
    session.commit()
    return {"ok": True}


@app.post("/api/admin/stock-badges")
async def admin_upload_stock_badges(
    name: str = Form(...),
    glow_color: str = Form("#8b5cf6"),
    effect_type: str = Form("none"),
    min_level: int = Form(1),
    is_selectable: bool = Form(True),
    files: List[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Массовая загрузка стоковых значков"""
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    # Создаём пак для стоковых значков
    pack = StickerPack(
        name=f"Stock: {name}",
        min_level=min_level,
        is_active=True,
        is_builtin=True,
    )
    session.add(pack)
    session.commit()
    session.refresh(pack)
    
    # Загружаем файлы
    import cloudinary.uploader
    uploaded_count = 0
    
    for file in files:
        if not file.content_type or not file.content_type.startswith("image/"):
            continue
        
        content = await file.read()
        try:
            result = cloudinary.uploader.upload(content, folder="badges", resource_type="image")
            
            # Создаём бейдж
            badge = Badge(
                name=f"{name} #{uploaded_count + 1}",
                icon_url=result["secure_url"],
                glow_color=glow_color if glow_color else None,
                effect_type=effect_type,
                role_id=None,  # Не привязан к роли
                user_id=None,  # Не привязан к пользователю
                is_selectable=is_selectable,
                enable_ring=True,
                enable_glow=True,
            )
            session.add(badge)
            uploaded_count += 1
        except Exception as e:
            print(f"[Stock Badges] Failed to upload: {e}")
    
    session.commit()
    return {"ok": True, "uploaded": uploaded_count}


@app.delete("/api/badges/{badge_id}")
def admin_delete_badge(
    badge_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    badge = session.get(Badge, badge_id)
    if not badge:
        raise HTTPException(404, "Badge not found")
    
    # 🆕 СБРАСЫВАЕМ значок у всех пользователей, у кого он выбран
    users_with_badge = session.exec(
        select(User).where(User.selected_badge_id == badge_id)
    ).all()
    
    for u in users_with_badge:
        u.selected_badge_id = None
        session.add(u)
    
    session.delete(badge)
    session.commit()
    
    # 🆕 РАССЫЛАЕМ всем, что значок удалён
    asyncio.create_task(manager.broadcast_all("badge_deleted", {"badge_id": badge_id}))
    
    return {"ok": True}

# ============================================================
# 🏷️ КАСТОМНЫЕ ПЛАШКИ (BADGES 2.0)
# ============================================================

def get_custom_badge_out(b: CustomBadge) -> dict:
    """Сериализация кастомной плашки"""
    try:
        anims = json.loads(b.animations) if b.animations else []
    except Exception:
        anims = []
    try:
        grads = json.loads(b.gradient_colors) if b.gradient_colors else []
    except Exception:
        grads = []
    return {
        "id": b.id,
        "name": b.name,
        "description": b.description,
        "icon_url": b.icon_url,
        "text": b.text,
        "bg_type": b.bg_type,
        "bg_color": b.bg_color,
        "gradient_colors": grads,
        "gradient_type": b.gradient_type,
        "gradient_angle": b.gradient_angle,
        "bg_image_url": b.bg_image_url,
        "bg_image_mode": b.bg_image_mode,
        "border_color": b.border_color,
        "border_width": b.border_width,
        "border_style": b.border_style,
        "border_glow": b.border_glow,
        "animations": anims,
        "animation_speed": b.animation_speed,
        "drop_shadow": b.drop_shadow,
        "inner_glow": b.inner_glow,
        "specular": b.specular,
        "metallic": b.metallic,
        "preset": b.preset,
        "is_active": b.is_active,
        "created_by": b.created_by,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }


async def _upload_custom_badge_file(file: Optional[UploadFile], folder: str = "custom-badges") -> Optional[str]:
    """Загружает файл плашки в Cloudinary (если файл передан)"""
    if not file:
        return None
    content = await file.read()
    result = await run_in_threadpool(
        lambda: cloudinary.uploader.upload(content, folder=folder, resource_type="image")
    )
    return result.get("secure_url")


def _require_badge_admin(user: User, session: Session) -> int:
    """Проверяет право на управление плашками. Возвращает уровень."""
    level = get_user_level(user, session)
    if level < 9:
        raise HTTPException(403, "Доступ к кастомным плашкам только с 9 уровня")
    return level


def _can_grant_to(target: User, lvl: int, session: Session) -> int:
    """Проверка кому можно дать плашку: 9 → до 8, 10 → до 9, 11 → до 10."""
    target_lvl = get_user_level(target, session)
    if target.username == "trelod":
        raise HTTPException(403, "Нельзя выдать плашку @trelod")
    if lvl == 9 and target_lvl >= 9:
        raise HTTPException(403, "С 9 уровня можно выдавать плашки только до 8 уровня")
    if lvl == 10 and target_lvl >= 10:
        raise HTTPException(403, "С 10 уровня можно выдавать плашки только до 9 уровня")
    if lvl == 11 and target_lvl >= 11:
        raise HTTPException(403, "Нельзя выдать плашку пользователю 11 уровня")
    return target_lvl




# ---------- АКТИВНАЯ ПЛАШКА (для AvatarFrame) ----------

def get_active_custom_badge_for(user_id: int, session: Session) -> Optional[dict]:
    """Возвращает активную (не истёкшую, не отменённую) плашку пользователя."""
    now = datetime.now(timezone.utc)
    assigns = session.exec(
        select(CustomBadgeAssignment).where(
            CustomBadgeAssignment.user_id == user_id,
            CustomBadgeAssignment.is_active == True,  # noqa: E712
                ).order_by(CustomBadgeAssignment.override_priority.desc(), CustomBadgeAssignment.id.desc())
    ).all()
    for a in assigns:
        if a.expires_at and a.expires_at < now:
            continue
        badge = session.get(CustomBadge, a.badge_id) if a.badge_id else None
        if badge and badge.is_active:
            # 🆕 Отдаём в формате assignment (badge, is_active, override_priority...),
            # чтобы фронт (RoleBadge) получал все поля новой модели плашек
            return _assignment_out(a, session)
    return None

# ============================================================
# ⭐ СИСТЕМНЫЕ ПЛАШКИ (уровни 9-11: Developer / Founder / System)
# ============================================================

def _system_badge_out(b: SystemBadge) -> dict:
    """Сериализация системной плашки"""
    try:
        anims = json.loads(b.animation_flags) if b.animation_flags else []
    except Exception:
        anims = []
    return {
        "level": b.level,
        "name": b.name,
        "text_content": b.text_content,
        "text_color": b.text_color or "#ffffff",
        "bg_type": b.bg_type,
        "bg_color": b.bg_color,
        "bg_gradient": b.bg_gradient,
        "icon_url": b.icon_url,
        "border_color": b.border_color,
        "border_width": b.border_width,
        "border_style": b.border_style,
        "border_glow": b.border_glow,
        "border_glow_intensity": b.border_glow_intensity,
        "animation_flags": anims,
        "animation_speed": b.animation_speed,
        "shadow_enabled": b.shadow_enabled,
        "shadow_blur": b.shadow_blur,
        "shadow_offset_x": b.shadow_offset_x,
        "shadow_offset_y": b.shadow_offset_y,
        "shadow_color": b.shadow_color,
        "inner_glow_enabled": b.inner_glow_enabled,
        "inner_glow_intensity": b.inner_glow_intensity,
        "specular_enabled": b.specular_enabled,
        "metallic_enabled": b.metallic_enabled,
        "is_active": b.is_active,
        "updated_at": b.updated_at.isoformat() if b.updated_at else None,
    }


def get_system_badge_for(level: int, session: Session) -> Optional[dict]:
    """Активная системная плашка для уровня (если задана)."""
    if level not in (9, 10, 11):
        return None
    b = session.get(SystemBadge, level)
    if not b or not b.is_active:
        return None
    return _system_badge_out(b)


@app.get("/api/system-badges")
def list_system_badges(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Список всех системных плашек (levels 9-11)"""
    _require_badge_admin(staff, session)
    rows = session.exec(select(SystemBadge).order_by(SystemBadge.level)).all()
    return [_system_badge_out(b) for b in rows]


@app.put("/api/system-badges/{level}")
def upsert_system_badge(
    level: int,
    data: dict = Body(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Создать/обновить системную плашку для уровня 9-11"""
    lvl_req = _require_badge_admin(staff, session)
    if level not in (9, 10, 11):
        raise HTTPException(400, "Уровень должен быть 9, 10 или 11")
    # Менять плашку уровня 11 может только уровень 11+ (в т.ч. 10 → нет)
    if level == 11 and lvl_req < 11:
        raise HTTPException(403, "Менять плашку System (level 11) может только level 11+")
    if level == 10 and lvl_req < 10:
        raise HTTPException(403, "Менять плашку Founder (level 10) может только level 10+")

    b = session.get(SystemBadge, level)
    if not b:
        b = SystemBadge(level=level, name=data.get("name") or "Level")
        session.add(b)

    field_map = {
        "name": "name",
        "text_content": "text_content",
        "text_color": "text_color",
        "bg_type": "bg_type",
        "bg_color": "bg_color",
        "bg_gradient": "bg_gradient",
        "icon_url": "icon_url",
        "border_color": "border_color",
        "border_width": "border_width",
        "border_style": "border_style",
        "border_glow": "border_glow",
        "border_glow_intensity": "border_glow_intensity",
        "animation_flags": "animation_flags",
        "animation_speed": "animation_speed",
        "shadow_enabled": "shadow_enabled",
        "shadow_blur": "shadow_blur",
        "shadow_offset_x": "shadow_offset_x",
        "shadow_offset_y": "shadow_offset_y",
        "shadow_color": "shadow_color",
        "inner_glow_enabled": "inner_glow_enabled",
        "inner_glow_intensity": "inner_glow_intensity",
        "specular_enabled": "specular_enabled",
        "metallic_enabled": "metallic_enabled",
        "is_active": "is_active",
    }
    for src, dst in field_map.items():
        if src in data:
            setattr(b, dst, data[src])
    # animation_flags храним как JSON-строку
    if "animation_flags" in data and isinstance(data["animation_flags"], list):
        b.animation_flags = json.dumps(data["animation_flags"])
    b.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(b)
    return _system_badge_out(b)


@app.delete("/api/system-badges/{level}")
def delete_system_badge(
    level: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Удалить системную плашку (сбросить на дефолт)"""
    lvl_req = _require_badge_admin(staff, session)
    if level in (10, 11) and lvl_req < level:
        raise HTTPException(403, f"Сбросить плашку уровня {level} может только level {level}+")
    b = session.get(SystemBadge, level)
    if b:
        session.delete(b)
        session.commit()
    return {"ok": True}


# ============================================================
# 📊 СТАТИСТИКА КОМАНДЫ
# ============================================================

@app.get("/api/admin/team-dashboard/stats")
def get_team_dashboard_stats(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Полная статистика для менеджеров"""
    now = datetime.now(timezone.utc)
    
    return {
        "total_users": session.exec(select(func.count()).select_from(User)).one(),
        "total_posts": session.exec(select(func.count()).select_from(Post)).one(),
        "registrations_7d": session.exec(select(func.count()).select_from(User).where(User.created_at >= now - timedelta(days=7))).one(),
        "registrations_30d": session.exec(select(func.count()).select_from(User).where(User.created_at >= now - timedelta(days=30))).one(),
        "online_count": manager.total_connections,
    }


@app.get("/api/admin/team-statistics")
def get_team_statistics(
    user_id: Optional[int] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Статистика команды с группировкой по отделам"""
    if user_id:
        # Детальная статистика пользователя
        target = session.get(User, user_id)
        if not target:
            raise HTTPException(404, "Пользователь не найден")
        
        role_history = session.exec(select(RoleHistory).where(RoleHistory.user_id == user_id).order_by(RoleHistory.changed_at.desc())).all()
        actions = session.exec(select(TeamStatistic).where(TeamStatistic.user_id == user_id).order_by(TeamStatistic.created_at.desc()).limit(50)).all()
        nick_history = session.exec(select(NickHistory).where(NickHistory.user_id == user_id).order_by(NickHistory.changed_at.desc())).all()
        actor_ids = {h.changed_by for h in role_history if h.changed_by}
        actor_ids = {h.changed_by for h in role_history if h.changed_by} | {h.changed_by for h in nick_history if h.changed_by}
        actors: dict = {}
        if actor_ids:
            for u in session.exec(select(User).where(User.id.in_(actor_ids))).all():
                actors[u.id] = u

        return {
            "user": user_out(target, session),
            "role_history": [{
                "old_role": session.get(Role, h.old_role_id).name if h.old_role_id else None,
                "new_role": session.get(Role, h.new_role_id).name if h.new_role_id else None,
                "changed_at": h.changed_at.isoformat(),
                "changed_by": {
                    "id": actors[h.changed_by].id,
                    "username": actors[h.changed_by].username,
                    "display_name": actors[h.changed_by].display_name,
                    "avatar_url": actors[h.changed_by].avatar_url,
                } if h.changed_by in actors else None,
            } for h in role_history],
            "nick_history": [{
                "field": h.field,
                "old_value": h.old_value,
                "new_value": h.new_value,
                "changed_at": h.changed_at.isoformat(),
                "changed_by": {
                    "id": actors[h.changed_by].id,
                    "username": actors[h.changed_by].username,
                    "display_name": actors[h.changed_by].display_name,
                    "avatar_url": actors[h.changed_by].avatar_url,
                } if h.changed_by in actors else None,
            } for h in nick_history],
            "actions": [{"action_type": a.action_type, "target_type": a.target_type, "target_id": a.target_id, "created_at": a.created_at.isoformat()} for a in actions],
            "total_actions": session.exec(select(func.count(TeamStatistic.id)).where(TeamStatistic.user_id == user_id)).one() or 0,
        }
    else:
        # Общая статистика команды (3+ уровень)
        all_users = session.exec(select(User)).all()
        team_members = []
        
        for u in all_users:
            lvl = get_user_level(u, session)
            if lvl >= 3:
                role = session.get(Role, u.role_id) if u.role_id else None
                category = session.get(RoleCategory, role.category_id) if role and role.category_id else None
                actions_count = session.exec(select(func.count(TeamStatistic.id)).where(TeamStatistic.user_id == u.id)).one() or 0
                
                team_members.append({
                    "user": {"id": u.id, "username": u.username, "display_name": u.display_name, "avatar_url": u.avatar_url, "created_at": u.created_at.isoformat() if u.created_at else None, "last_seen": u.last_seen.isoformat() if u.last_seen else None},
                    "role": {"name": role.name if role else "Без роли", "color": role.color if role else "#8b5cf6", "level": lvl, "category_name": category.name if category else "Общие", "category_id": category.id if category else 0, "category_color": category.color if category else "#6b7280"},
                    "actions_count": actions_count,
                })
        
        # Группировка по категориям
        grouped = {}
        for m in team_members:
            cat_id = m["role"]["category_id"]
            if cat_id not in grouped:
                grouped[cat_id] = {"id": cat_id, "name": m["role"]["category_name"], "color": m["role"]["category_color"], "members": []}
            grouped[cat_id]["members"].append(m)
        
        sorted_groups = sorted(list(grouped.values()), key=lambda x: (0 if x["id"] == 0 else 1, x["name"]))
        for group in sorted_groups:
            group["members"].sort(key=lambda x: (-x["role"]["level"], x["user"]["display_name"]))
        
        return {"groups": sorted_groups}


@app.get("/api/admin/statistics/overview")
def get_statistics_overview(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Общая статистика платформы"""
    now = datetime.now(timezone.utc)
    
    return {
        "registrations": {
            "24h": session.exec(select(func.count(User.id)).where(User.created_at >= now - timedelta(hours=24))).one(),
            "7d": session.exec(select(func.count(User.id)).where(User.created_at >= now - timedelta(days=7))).one(),
            "30d": session.exec(select(func.count(User.id)).where(User.created_at >= now - timedelta(days=30))).one(),
        },
        "activity": {
            "posts_24h": session.exec(select(func.count(Post.id)).where(Post.created_at >= now - timedelta(hours=24))).one(),
            "mod_actions_24h": session.exec(select(func.count(ActionLog.id)).where(ActionLog.created_at >= now - timedelta(hours=24))).one(),
        },
        "online": {"count": manager.total_connections},
        "totals": {
            "users": session.exec(select(func.count(User.id))).one(),
            "posts": session.exec(select(func.count(Post.id))).one(),
            "chats": session.exec(select(func.count(Chat.id))).one(),
        },
    }
# ============================================================
# 💡 ФОРУМ ПРЕДЛОЖЕНИЙ (XENFORO-STYLE) — право manage_suggestions
# ============================================================

def _get_prefixes_list(session: Session) -> list:
    """Список префиксов из SystemSetting"""
    setting = session.get(SystemSetting, "suggestion_prefixes")
    if not setting or not setting.value:
        return []
    try:
        data = json.loads(setting.value)
        return data if isinstance(data, list) else []
    except Exception:
        return []

def _can_manage_suggestions(user: User, session: Session) -> bool:
    """Founder/Developer (is_admin) ИЛИ право manage_suggestions"""
    return has_permission(user, "manage_suggestions", session)

# ---------- КАТЕГОРИИ ----------

@app.get("/api/suggestions/categories")
def get_suggestion_categories(session: Session = Depends(get_session)):
    """Разделы со статистикой и последней активностью (как в XenForo)"""
    categories = session.exec(select(SuggestionCategory).order_by(SuggestionCategory.order)).all()
    result = []
    for c in categories:
        threads = session.exec(
            select(SuggestionThread).where(SuggestionThread.category_id == c.id)
        ).all()
        thread_ids = [t.id for t in threads]
        comments_count = 0
        last_data = None
        if thread_ids:
            comments_count = session.exec(
                select(func.count(SuggestionThreadComment.id))
                .where(SuggestionThreadComment.thread_id.in_(thread_ids))
            ).one() or 0
            last_thread = max(threads, key=lambda t: (t.updated_at or t.created_at))
            last_comment = session.exec(
                select(SuggestionThreadComment)
                .where(SuggestionThreadComment.thread_id == last_thread.id)
                .order_by(SuggestionThreadComment.created_at.desc()).limit(1)
            ).first()
            last_author = None
            last_time = last_thread.created_at
            if last_comment:
                last_author = session.get(User, last_comment.author_id)
                last_time = last_comment.created_at
            else:
                last_author = session.get(User, last_thread.author_id)
            last_data = {
                "thread_id": last_thread.id,
                "thread_title": last_thread.title,
                "author": user_out(last_author, session) if last_author else None,
                "created_at": last_time.isoformat(),
            }
        result.append({
            "id": c.id,
            "name": c.name,
            "description": c.description or "",
            "icon": c.icon,
            "color": c.color,
            "order": c.order,
            "is_archived": c.is_archived,   # = раздел закрыт
            "threads_count": len(thread_ids),
            "comments_count": comments_count,
            "last_activity": last_data,
        })
    return result

@app.post("/api/suggestions/categories")
def create_suggestion_category(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    icon: str = Form("message-square"),
    color: str = Form("#8b5cf6"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать раздел — только с правом manage_suggestions"""
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    if not name.strip():
        raise HTTPException(400, "Название обязательно")
    max_order = session.exec(select(func.max(SuggestionCategory.order))).one() or 0
    cat = SuggestionCategory(
        name=name.strip(),
        description=description.strip() if description else None,
        icon=icon, color=color,
        order=max_order + 1,
        is_archived=False,
    )
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return {"ok": True, "id": cat.id}

@app.patch("/api/suggestions/categories/{cat_id}")
def update_suggestion_category(
    cat_id: int,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    icon: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    is_archived: Optional[bool] = Form(None),   # 🆕 закрыть/открыть раздел
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Редактирование раздела + закрытие (никто не сможет создавать темы)"""
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    cat = session.get(SuggestionCategory, cat_id)
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    if name is not None:
        if not name.strip():
            raise HTTPException(400, "Название обязательно")
        cat.name = name.strip()
    if description is not None:
        cat.description = description.strip() or None
    if icon is not None:
        cat.icon = icon
    if color is not None:
        cat.color = color
    if is_archived is not None:
        cat.is_archived = is_archived
    session.add(cat)
    session.commit()
    return {"ok": True}

# ---------- ПРЕФИКСЫ ----------

@app.get("/api/suggestions/prefixes")
def list_suggestion_prefixes_public(session: Session = Depends(get_session)):
    """Публичный список префиксов (для отображения бейджей)"""
    return _get_prefixes_list(session)

@app.post("/api/admin/suggestion-prefixes")
def create_suggestion_prefix(
    name: str = Form(...),
    color: str = Form("#ffffff"),
    bg_color: str = Form("#ef4444"),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Создать префикс — право manage_suggestions"""
    if not _can_manage_suggestions(staff, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    if not name.strip():
        raise HTTPException(400, "Название обязательно")
    prefixes = _get_prefixes_list(session)
    new_id = max([p.get("id", 0) for p in prefixes], default=0) + 1
    prefixes.append({"id": new_id, "name": name.strip(), "color": color, "bg_color": bg_color})
    setting = session.get(SystemSetting, "suggestion_prefixes")
    if not setting:
        setting = SystemSetting(key="suggestion_prefixes", value=json.dumps(prefixes))
        session.add(setting)
    else:
        setting.value = json.dumps(prefixes)
    session.commit()
    return {"ok": True, "id": new_id}

@app.delete("/api/admin/suggestion-prefixes/{prefix_id}")
def delete_suggestion_prefix(
    prefix_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Удалить префикс + снять его со всех тем"""
    if not _can_manage_suggestions(staff, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    prefixes = [p for p in _get_prefixes_list(session) if p.get("id") != prefix_id]
    setting = session.get(SystemSetting, "suggestion_prefixes")
    if setting:
        setting.value = json.dumps(prefixes)
    # Обнуляем префикс у тем
    session.exec(
        update(SuggestionThread)
        .where(SuggestionThread.prefix_id == prefix_id)
        .values(prefix_id=None)
    )
    session.commit()
    return {"ok": True}

# ---------- ТЕМЫ ----------

@app.get("/api/suggestions/threads/{category_id}")
def get_category_threads(
    category_id: int,
    cursor: Optional[int] = None,
    limit: int = 20,
    user: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    """Список тем раздела со статистикой, префиксами и последним сообщением"""
    query = (
        select(SuggestionThread)
        .where(SuggestionThread.category_id == category_id)
        .order_by(SuggestionThread.is_pinned.desc(), SuggestionThread.created_at.desc())
    )
    if cursor:
        query = query.where(SuggestionThread.id < cursor)
    threads = session.exec(query.limit(limit)).all()
    if not threads:
        return {"threads": [], "has_more": False, "next_cursor": None}

    prefixes = {p["id"]: p for p in _get_prefixes_list(session)}
    thread_ids = [t.id for t in threads]

    comments_counts = dict(session.exec(
        select(SuggestionThreadComment.thread_id, func.count(SuggestionThreadComment.id))
        .where(SuggestionThreadComment.thread_id.in_(thread_ids))
        .group_by(SuggestionThreadComment.thread_id)
    ).all())

    # Последние комментарии (по одному на тему) одним запросом
    last_comments = {}
    lc_author_ids = set()
    rows = session.exec(
        select(SuggestionThreadComment)
        .where(SuggestionThreadComment.thread_id.in_(thread_ids))
        .order_by(SuggestionThreadComment.created_at.desc())
    ).all()
    for r in rows:
        if r.thread_id not in last_comments:
            last_comments[r.thread_id] = r
            lc_author_ids.add(r.author_id)
    lc_authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(list(lc_author_ids) or [0]))).all()}

    out = []
    for t in threads:
        lc = last_comments.get(t.id)
        last_data = None
        if lc:
            a = lc_authors.get(lc.author_id)
            last_data = {
                "author": user_out(a, session) if a else None,
                "created_at": lc.created_at.isoformat(),
            }
        out.append({
            "id": t.id,
            "category_id": t.category_id,
            "title": t.title,
            "content": t.content,
            "is_pinned": t.is_pinned,
            "is_closed": t.is_closed,
            "prefix": prefixes.get(t.prefix_id),
            "status": t.status,
            "views_count": t.views_count,
            "comments_count": comments_counts.get(t.id, 0),
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "author": user_out(session.get(User, t.author_id), session),
            "last_comment": last_data,
        })
    return {
        "threads": out,
        "has_more": len(threads) == limit,
        "next_cursor": threads[-1].id if threads else None,
    }

@app.post("/api/suggestions/threads")
def create_suggestion_thread(
    category_id: int = Form(...),
    title: str = Form(...),
    content: str = Form(...),
    prefix_id: Optional[int] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать тему — может любой пользователь, если раздел не закрыт"""
    cat = session.get(SuggestionCategory, category_id)
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    if cat.is_archived:
        raise HTTPException(403, "Раздел закрыт — создание тем недоступно")
    if len(title.strip()) < 3 or len(content.strip()) < 10:
        raise HTTPException(400, "Слишком короткий заголовок или описание")
    # Префикс могут ставить только менеджеры
    final_prefix = None
    if prefix_id and _can_manage_suggestions(user, session):
        if any(p["id"] == prefix_id for p in _get_prefixes_list(session)):
            final_prefix = prefix_id
    thread = SuggestionThread(
        category_id=category_id, author_id=user.id,
        title=title.strip(), content=content.strip(),
        prefix_id=final_prefix,
    )
    session.add(thread)
    session.commit()
    session.refresh(thread)
    return {"ok": True, "id": thread.id}

@app.get("/api/suggestions/thread/{thread_id}")
def get_thread_detail(
    thread_id: int,
    cursor: Optional[int] = None,
    limit: int = 50,
    user: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    thread.views_count += 1
    session.add(thread)
    session.commit()
    prefixes = {p["id"]: p for p in _get_prefixes_list(session)}
    query = (
        select(SuggestionThreadComment)
        .where(SuggestionThreadComment.thread_id == thread_id)
        .order_by(SuggestionThreadComment.created_at.asc())
    )
    if cursor:
        query = query.where(SuggestionThreadComment.id > cursor)
    comments = session.exec(query.limit(limit)).all()
    return {
        "thread": {
            "id": thread.id,
            "category_id": thread.category_id,
            "title": thread.title,
            "content": thread.content,
            "is_pinned": thread.is_pinned,
            "is_closed": thread.is_closed,
            "prefix": prefixes.get(thread.prefix_id),
            "status": thread.status,
            "views_count": thread.views_count,
            "created_at": thread.created_at.isoformat(),
            "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
            "author": user_out(session.get(User, thread.author_id), session),
        },
        "comments": [{
            "id": c.id,
            "content": c.content,
            "created_at": c.created_at.isoformat(),
            "author": user_out(session.get(User, c.author_id), session),
        } for c in comments],
        "has_more": len(comments) == limit,
        "next_cursor": comments[-1].id if comments else None,
    }

@app.post("/api/suggestions/thread/{thread_id}/comments")
def add_thread_comment(
    thread_id: int,
    content: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    # 🆕 Закрытая тема: писать могут только менеджеры
    if thread.is_closed and not _can_manage_suggestions(user, session):
        raise HTTPException(400, "Тема закрыта — комментарии отключены")
    if len(content.strip()) < 2:
        raise HTTPException(400, "Комментарий слишком короткий")
    comment = SuggestionThreadComment(thread_id=thread_id, author_id=user.id, content=content.strip())
    session.add(comment)
    thread.updated_at = datetime.now(timezone.utc)
    session.add(thread)
    session.commit()
    session.refresh(comment)
    return {"ok": True, "id": comment.id}

@app.delete("/api/suggestions/comments/{comment_id}")
def delete_thread_comment(
    comment_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удаление комментария: автор ИЛИ право manage_suggestions"""
    c = session.get(SuggestionThreadComment, comment_id)
    if not c:
        raise HTTPException(404, "Комментарий не найден")
    if c.author_id != user.id and not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет прав на удаление")
    session.delete(c)
    session.commit()
    return {"ok": True}

@app.patch("/api/suggestions/thread/{thread_id}")
def edit_suggestion_thread(
    thread_id: int,
    title: Optional[str] = Form(None),
    content: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Редактирование темы: автор ИЛИ право manage_suggestions"""
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    if thread.author_id != user.id and not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет прав на редактирование")
    if title is not None:
        if len(title.strip()) < 3:
            raise HTTPException(400, "Слишком короткий заголовок")
        thread.title = title.strip()
    if content is not None:
        if len(content.strip()) < 10:
            raise HTTPException(400, "Слишком короткий текст")
        thread.content = content.strip()
    thread.updated_at = datetime.now(timezone.utc)
    session.add(thread)
    session.commit()
    return {"ok": True}

@app.patch("/api/suggestions/thread/{thread_id}/status")
def update_thread_status(
    thread_id: int,
    status: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    valid = ["pending", "approved", "implemented", "rejected", "archived"]
    if status not in valid:
        raise HTTPException(400, "Неверный статус")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    thread.status = status
    session.add(thread)
    session.commit()
    return {"ok": True}

@app.patch("/api/suggestions/thread/{thread_id}/pin")
def toggle_thread_pin(
    thread_id: int,
    is_pinned: bool = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    thread.is_pinned = is_pinned
    session.add(thread)
    session.commit()
    return {"ok": True}

@app.patch("/api/suggestions/thread/{thread_id}/close")
def toggle_thread_close(
    thread_id: int,
    closed: bool = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """🆕 Закрыть/открыть тему (никто не сможет писать)"""
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    thread.is_closed = closed
    session.add(thread)
    session.commit()
    return {"ok": True}

@app.patch("/api/suggestions/thread/{thread_id}/prefix")
def assign_thread_prefix(
    thread_id: int,
    prefix_id: int = Form(0),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """🆕 Выдать/снять префикс темы"""
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    if prefix_id:
        if not any(p["id"] == prefix_id for p in _get_prefixes_list(session)):
            raise HTTPException(404, "Префикс не найден")
    thread.prefix_id = prefix_id or None
    session.add(thread)
    session.commit()
    return {"ok": True}

@app.patch("/api/admin/suggestions/{thread_id}/move")
def move_suggestion_thread(
    thread_id: int,
    category_id: int = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Перенос темы между разделами"""
    if not _can_manage_suggestions(staff, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    if not session.get(SuggestionCategory, category_id):
        raise HTTPException(404, "Категория не найдена")
    thread.category_id = category_id
    session.add(thread)
    session.commit()
    return {"ok": True}

@app.delete("/api/admin/suggestions/{thread_id}")
def admin_delete_thread(
    thread_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Удаление темы (комментарии удалятся каскадно)"""
    if not _can_manage_suggestions(staff, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    session.delete(thread)
    session.commit()
    return {"ok": True}

# ============================================================
# 📊 СТАТ-ПАНЕЛЬ: ОБЗОР + ПАРАМЕТРИЧЕСКИЙ СПИСОК ЮЗЕРОВ
# ============================================================

def _require_stats_access(staff: User, session: Session):
    """Доступ: manage_team_stats ИЛИ manage_users (Founder автоматически)"""
    if not (has_permission(staff, "manage_team_stats", session) or has_permission(staff, "manage_users", session)):
        raise HTTPException(403, "Нет права: manage_team_stats")

def _compute_kpi(posts: int, messages: int, likes_given: int, likes_received: int, visits: int) -> int:
    """Оценка активности 0–100"""
    raw = posts * 2 + messages * 0.6 + (likes_given + likes_received) * 0.4 + visits * 0.3
    return min(100, int(round(raw ** 0.6)))

@app.get("/api/admin/stats/overview")
def stats_overview(staff: User = Depends(require_staff), session: Session = Depends(get_session)):
    """Карточки обзора: totals, MAU/DAU, регистрации, серии за 14 дней"""
    _require_stats_access(staff, session)
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_start = today_start - timedelta(days=1)
    since = today_start - timedelta(days=13)

    def day_series(col, since_dt):
        rows = session.exec(
            select(func.date_trunc("day", col), func.count())
            .where(col >= since_dt)
            .group_by(func.date_trunc("day", col))
        ).all()
        by_day = {d.date(): c for d, c in rows if d}
        return [
            {"day": (since_dt + timedelta(days=i)).date().strftime("%d.%m"),
             "count": by_day.get((since_dt + timedelta(days=i)).date(), 0)}
            for i in range(14)
        ]

    return {
        "total_users": session.exec(select(func.count()).select_from(User)).one(),
        "total_posts": session.exec(select(func.count()).select_from(Post)).one(),
        "total_messages": session.exec(select(func.count()).select_from(Message)).one(),
        "total_likes": session.exec(select(func.count()).select_from(Like)).one(),
        "dau": session.exec(select(func.count()).select_from(User).where(User.last_seen >= now - timedelta(days=1))).one(),
        "mau": session.exec(select(func.count()).select_from(User).where(User.last_seen >= now - timedelta(days=30))).one(),
        "reg_today": session.exec(select(func.count()).select_from(User).where(User.created_at >= today_start)).one(),
        "reg_yesterday": session.exec(select(func.count()).select_from(User).where(User.created_at >= yesterday_start, User.created_at < today_start)).one(),
        "reg_series": day_series(User.created_at, since),
        "post_series": day_series(Post.created_at, since),
        "online": manager.total_connections,
    }

@app.get("/api/admin/stats/users")
def stats_users_list(staff: User = Depends(require_staff), session: Session = Depends(get_session)):
    """Все юзеры с метриками: посты, сообщения, лайки, визиты, KPI"""
    _require_stats_access(staff, session)
    users = session.exec(select(User).order_by(User.created_at.desc())).all()
    if not users:
        return []
    ids = [u.id for u in users]
    posts_counts = dict(session.exec(select(Post.author_id, func.count(Post.id)).where(Post.author_id.in_(ids)).group_by(Post.author_id)).all())
    msgs_counts = dict(session.exec(select(Message.sender_id, func.count(Message.id)).where(Message.sender_id.in_(ids)).group_by(Message.sender_id)).all())
    likes_given = dict(session.exec(select(Like.user_id, func.count(Like.id)).where(Like.user_id.in_(ids)).group_by(Like.user_id)).all())
    likes_received = dict(session.exec(
        select(Post.author_id, func.count(Like.id))
        .join(Like, Like.post_id == Post.id)
        .where(Post.author_id.in_(ids))
        .group_by(Post.author_id)
    ).all())
    visits = dict(session.exec(
        select(IPLog.user_id, func.count(IPLog.id))
        .where(IPLog.user_id.in_(ids), IPLog.action.in_(["login", "login_2fa"]))
        .group_by(IPLog.user_id)
    ).all())

    _pre = batch_get_users(users, session)
    result = []
    for u in users:
        p = posts_counts.get(u.id, 0)
        m = msgs_counts.get(u.id, 0)
        lg = likes_given.get(u.id, 0)
        lr = likes_received.get(u.id, 0)
        v = visits.get(u.id, 0)
        result.append({
            **user_out(u, session, _pre.get(u.id)),
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "posts_count": p,
            "messages_count": m,
            "likes_given": lg,
            "likes_received": lr,
            "visits_count": v,
            "kpi": _compute_kpi(p, m, lg, lr, v),
        })
    return result

# ============================================================
# 🏷️ КАСТОМНЫЕ ПЛАШКИ (BADGES 2.0)
# ============================================================

def _require_badge_admin(user: User, session: Session = None) -> int:
    """Проверка прав на управление плашками (Level >= 9)"""
    level = get_user_level(user, session) if session else getattr(user, "level", 0) or 0
    if level < 9:
        raise HTTPException(403, "Доступ запрещен: требуется уровень 9+")
    return level

def _badge_out(badge: CustomBadge) -> dict:
    """Сериализация плашки для API (соответствует полям новой модели)"""
    return {
        "id": badge.id,
        "name": badge.name,
        "description": badge.description,
        "icon_url": badge.icon_url,
        "text_content": badge.text_content,
        "text_color": badge.text_color or "#ffffff", 
        "bg_type": badge.bg_type,
        "bg_color": badge.bg_color,
        "bg_gradient": badge.bg_gradient,
        "bg_gradient_type": badge.bg_gradient_type,
        "bg_gradient_angle": badge.bg_gradient_angle,
        "bg_image_url": badge.bg_image_url,
        "bg_image_mode": badge.bg_image_mode,
        "border_color": badge.border_color,
        "border_width": badge.border_width,
        "border_style": badge.border_style,
        "border_glow": badge.border_glow,
        "border_glow_intensity": badge.border_glow_intensity,
        "animation_flags": badge.animation_flags,
        "animation_speed": badge.animation_speed,
        "shadow_enabled": badge.shadow_enabled,
        "shadow_blur": badge.shadow_blur,
        "shadow_offset_x": badge.shadow_offset_x,
        "shadow_offset_y": badge.shadow_offset_y,
        "shadow_color": badge.shadow_color,
        "inner_glow_enabled": badge.inner_glow_enabled,
        "inner_glow_intensity": badge.inner_glow_intensity,
        "specular_enabled": badge.specular_enabled,
        "metallic_enabled": badge.metallic_enabled,
        "priority": badge.priority,
        "is_active": badge.is_active,
        "created_by": badge.created_by,
        "created_at": badge.created_at.isoformat() if badge.created_at else None,
    }

def _assignment_out(assignment: CustomBadgeAssignment, session: Session) -> dict:
    """Сериализация назначения плашки"""
    badge_data = None
    if assignment.badge_id:
        badge = session.get(CustomBadge, assignment.badge_id)
        if badge:
            badge_data = _badge_out(badge)
    
    user = session.get(User, assignment.user_id)
    issuer = session.get(User, assignment.granted_by)

    return {
        "id": assignment.id,
        "user_id": assignment.user_id,
        "badge_id": assignment.badge_id,
        "badge": badge_data,
        "granted_by": assignment.granted_by,
        "granted_at": assignment.granted_at.isoformat() if assignment.granted_at else None,
        "expires_at": assignment.expires_at.isoformat() if assignment.expires_at else None,
        "is_active": assignment.is_active,
        "custom_message": assignment.custom_message,
        "override_priority": assignment.override_priority,
        "is_expired": assignment.is_expired,
        "user_avatar": user.avatar_url if user else None,
        "user_display_name": user.display_name if user else None,
        "user_username": user.username if user else None,
        "issuer_name": issuer.display_name if issuer else None,
    }

# --- CRUD для Плашек (Работает с JSON) ---

@app.get("/api/custom-badges")
def list_custom_badges(
    staff: User = Depends(require_staff), 
    session: Session = Depends(get_session)
):
    """Список всех кастомных плашек"""
    _require_badge_admin(staff, session)
    badges = session.exec(select(CustomBadge).order_by(CustomBadge.created_at.desc())).all()
    return [_badge_out(b) for b in badges]

@app.post("/api/custom-badges")
def create_custom_badge(
    request: Request,  # <-- ДОБАВЛЕНО: для получения IP
    badge_data: CustomBadge,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Создание новой кастомной плашки (принимает JSON)"""
    _require_badge_admin(staff, session)

    new_badge = CustomBadge(
        name=badge_data.name,
        description=badge_data.description,
        icon_url=badge_data.icon_url,
        text_content=badge_data.text_content,
        text_color=badge_data.text_color or "#ffffff",  # 🆕 ДОБАВЛЕНО
        bg_type=badge_data.bg_type or "solid",
        bg_color=badge_data.bg_color,
        bg_gradient=badge_data.bg_gradient,
        bg_gradient_type=badge_data.bg_gradient_type,
        bg_gradient_angle=badge_data.bg_gradient_angle,
        bg_image_url=badge_data.bg_image_url,
        bg_image_mode=badge_data.bg_image_mode,
        border_color=badge_data.border_color,
        border_width=badge_data.border_width,
        border_style=badge_data.border_style,
        border_glow=badge_data.border_glow,
        border_glow_intensity=badge_data.border_glow_intensity,
        animation_flags=badge_data.animation_flags,
        animation_speed=badge_data.animation_speed,
        shadow_enabled=badge_data.shadow_enabled,
        shadow_blur=badge_data.shadow_blur,
        shadow_offset_x=badge_data.shadow_offset_x,
        shadow_offset_y=badge_data.shadow_offset_y,
        shadow_color=badge_data.shadow_color,
        inner_glow_enabled=badge_data.inner_glow_enabled,
        inner_glow_intensity=badge_data.inner_glow_intensity,
        specular_enabled=badge_data.specular_enabled,
        metallic_enabled=badge_data.metallic_enabled,
        priority=badge_data.priority or 0,
        is_active=badge_data.is_active,
        created_by=staff.id,
    )
    
    session.add(new_badge)
    
    # ✅ ИСПРАВЛЕНО: передаем реальный request в get_client_ip
    log_entry = ActionLog(
        actor_id=staff.id,
        action="badge_create",
        target_type="CustomBadge",
        target_id=new_badge.id,
        details=f'Created custom badge "{new_badge.name}"',
        ip_address=get_client_ip(request),
    )
    session.add(log_entry)
    session.commit()
    session.refresh(new_badge)
    
    return _badge_out(new_badge)

@app.put("/api/custom-badges/{badge_id}")
def update_custom_badge(
    request: Request,  # <-- ДОБАВЛЕНО: для получения IP
    badge_id: int,
    badge_data: CustomBadge,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Обновление плашки (принимает JSON)"""
    _require_badge_admin(staff, session)
    badge = session.get(CustomBadge, badge_id)
    if not badge:
        raise HTTPException(404, "Плашка не найдена")

    update_fields = [
        "name", "description", "icon_url", "text_content", "text_color",
        "bg_type", "bg_color", "bg_gradient", "bg_gradient_type", "bg_gradient_angle",
        "bg_image_url", "bg_image_mode",
        "border_color", "border_width", "border_style", "border_glow", "border_glow_intensity",
        "animation_flags", "animation_speed",
        "shadow_enabled", "shadow_blur", "shadow_offset_x", "shadow_offset_y", "shadow_color",
        "inner_glow_enabled", "inner_glow_intensity", "specular_enabled", "metallic_enabled",
        "priority", "is_active"
    ]
    
    for field in update_fields:
        val = getattr(badge_data, field)
        if val is not None:
            setattr(badge, field, val)

    session.add(badge)
    
    # ✅ ИСПРАВЛЕНО: передаем реальный request в get_client_ip
    log_entry = ActionLog(
        actor_id=staff.id,
        action="badge_update",
        target_type="CustomBadge",
        target_id=badge.id,
        details=f"Updated custom badge '{badge.name}'",
        ip_address=get_client_ip(request),
    )
    session.add(log_entry)
    session.commit()
    session.refresh(badge)

    return _badge_out(badge)

@app.delete("/api/custom-badges/{badge_id}")
def delete_custom_badge(
    request: Request,  # <-- ДОБАВЛЕНО: для получения IP
    badge_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Удаление плашки"""
    lvl = _require_badge_admin(staff, session)
    if lvl < 10: 
         raise HTTPException(403, "Удалять плашки может только уровень 10+")

    badge = session.get(CustomBadge, badge_id)
    if not badge:
        raise HTTPException(404, "Плашка не найдена")

    # 1. Сначала снимаем (деактивируем) плашку у всех, кому она выдана —
    #    она мгновенно исчезает из профилей
    session.exec(
        update(CustomBadgeAssignment)
        .where(CustomBadgeAssignment.badge_id == badge_id)
        .values(is_active=False)
    )
    session.commit()

    # 2. Удаляем все выдачи одним массовым запросом, чтобы не нарушить FK
    session.exec(
        delete(CustomBadgeAssignment).where(CustomBadgeAssignment.badge_id == badge_id)
    )
    session.commit()

    # 3. Удаляем саму плашку
    session.delete(badge)
    
    # ✅ ИСПРАВЛЕНО: передаем реальный request в get_client_ip
    log_entry = ActionLog(
        actor_id=staff.id,
        action="badge_delete",
        target_type="CustomBadge",
        target_id=badge_id,
        details=f"Deleted custom badge '{badge.name}'",
        ip_address=get_client_ip(request),
    )
    session.add(log_entry)
    session.commit()

    return {"success": True}

# --- Загрузка картинок для плашек (Base64) ---

@app.post("/api/badges/{badge_id}/upload-icon")
def upload_badge_icon(
    badge_id: int,
    icon_base64: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Загрузка иконки плашки через base64"""
    _require_badge_admin(staff, session)
    badge = session.get(CustomBadge, badge_id)
    if not badge:
        raise HTTPException(404, "Плашка не найдена")

    try:
        from cloudinary_config import upload_base64_image
        url = upload_base64_image(icon_base64, folder="custom_badges/icons", public_id=f"badge_icon_{badge_id}")
        badge.icon_url = url
        session.add(badge)
        session.commit()
        return {"icon_url": url}
    except Exception as e:
        raise HTTPException(500, f"Ошибка загрузки: {str(e)}")

@app.post("/api/badges/{badge_id}/upload-bg-image")
def upload_badge_bg_image(
    badge_id: int,
    bg_image_base64: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Загрузка фона плашки через base64"""
    _require_badge_admin(staff, session)
    badge = session.get(CustomBadge, badge_id)
    if not badge:
        raise HTTPException(404, "Плашка не найдена")

    try:
        from cloudinary_config import upload_base64_image
        url = upload_base64_image(bg_image_base64, folder="custom_badges/bgs", public_id=f"badge_bg_{badge_id}")
        badge.bg_image_url = url
        session.add(badge)
        session.commit()
        return {"bg_image_url": url}
    except Exception as e:
        raise HTTPException(500, f"Ошибка загрузки: {str(e)}")

# --- Назначения (Assignments) ---

@app.get("/api/custom-badge-assignments")
def list_assignments(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
    user_id: Optional[int] = None,
    active_only: bool = True,
):
    """Список всех назначений плашек"""
    _require_badge_admin(staff, session)
    
    query = select(CustomBadgeAssignment).order_by(CustomBadgeAssignment.granted_at.desc())
    if user_id:
        query = query.where(CustomBadgeAssignment.user_id == user_id)
    if active_only:
        query = query.where(CustomBadgeAssignment.is_active == True)
        
    assignments = session.exec(query).all()
    return [_assignment_out(a, session) for a in assignments]

@app.post("/api/custom-badge-assignments")
def assign_custom_badge(
    request: Request,  # <-- ДОБАВЛЕНО
    user_id: int = Form(...),
    badge_id: int = Form(...),
    expires_at: Optional[str] = Form(None),
    priority: int = Form(1),
    notify_user: bool = Form(False),
    custom_message: Optional[str] = Form(None),
    override_priority: bool = Form(True),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Выдача плашки пользователю"""
    lvl = _require_badge_admin(staff, session)
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "Пользователь не найден")
        
    badge = session.get(CustomBadge, badge_id)
    if not badge:
        raise HTTPException(404, "Плашка не найдена")

    if staff.id != target.id:
            staff_level = get_user_level(staff, session)
            target_level = get_user_level(target, session)
            
            if staff_level == 9 and target_level > 9:
                raise HTTPException(403, "Уровень 9 не может выдавать плашки пользователям уровня 10+")
            if staff_level == 10 and target_level > 10:
                raise HTTPException(403, "Уровень 10 не может выдавать плашки пользователям уровня 11 (System)")

    now = datetime.now(timezone.utc)
    expiry: Optional[datetime] = None
    if expires_at:
        try:
            expiry = datetime.fromisoformat(expires_at).replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    existing = session.exec(
        select(CustomBadgeAssignment).where(
            CustomBadgeAssignment.user_id == user_id,
            CustomBadgeAssignment.badge_id == badge_id,
            CustomBadgeAssignment.is_active == True
        )
    ).all()
    for old in existing:
        old.is_active = False
        session.add(old)

    assignment = CustomBadgeAssignment(
        user_id=user_id,
        badge_id=badge_id,
        granted_by=staff.id,
        granted_at=now,
        expires_at=expiry,
        is_active=True,
        custom_message=custom_message,
        override_priority=override_priority,
    )
    session.add(assignment)
    
    if notify_user:
        session.add(Notification(
            user_id=user_id,
            actor_id=staff.id,
            type="badge_granted",
            message=custom_message or f"Вам выдана плашка «{badge.name}»",
        ))

    session.commit()
    session.refresh(assignment)
    
    # ✅ ИСПРАВЛЕНО: передаем request
    log_entry = ActionLog(
        actor_id=staff.id,
        action="badge_assign",
        target_type="CustomBadgeAssignment",
        target_id=assignment.id,
        details=f"Granted badge '{badge.name}' to user {user_id}",
        ip_address=get_client_ip(request),
    )
    session.add(log_entry)
    session.commit()
    
    return {"success": True, "assignment": _assignment_out(assignment, session)}

@app.post("/api/custom-badge-assignments/{assign_id}/revoke")
def revoke_assignment(
    request: Request,  # <-- ДОБАВЛЕНО
    assign_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session)
):
    """Отозвать плашку"""
    _require_badge_admin(staff, session)
    assignment = session.get(CustomBadgeAssignment, assign_id)
    if not assignment:
        raise HTTPException(404, "Назначение не найдено")
        
    assignment.is_active = False
    session.add(assignment)
    session.commit()
    
    # ✅ ИСПРАВЛЕНО: передаем request
    log_entry = ActionLog(
        actor_id=staff.id,
        action="badge_revoke",
        target_type="CustomBadgeAssignment",
        target_id=assign_id,
        details=f"Revoked badge assignment {assign_id}",
        ip_address=get_client_ip(request),
    )
    session.add(log_entry)
    session.commit()
    
    return {"success": True}

@app.post("/api/custom-badge-assignments/{assign_id}/extend")
def extend_assignment(
    request: Request,  # <-- ДОБАВЛЕНО
    assign_id: int,
    duration_type: str = Form(...),
    duration_days: Optional[int] = Form(None),
    expires_at: Optional[str] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session)
):
    """Продлить срок действия"""
    _require_badge_admin(staff, session)
    assignment = session.get(CustomBadgeAssignment, assign_id)
    if not assignment:
        raise HTTPException(404, "Назначение не найдено")

    now = datetime.now(timezone.utc)
    base = assignment.expires_at if (assignment.expires_at and assignment.expires_at > now) else now

    if duration_type == "permanent":
        assignment.expires_at = None
    elif duration_type == "days" and duration_days:
        assignment.expires_at = base + timedelta(days=duration_days)
    elif duration_type == "date" and expires_at:
        try:
            assignment.expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        except Exception:
            raise HTTPException(400, "Invalid date format")
            
    assignment.is_active = True
    session.add(assignment)
    session.commit()
    
    return {"success": True, "assignment": _assignment_out(assignment, session)}
# ============================================================
# PRISME CHAT — регистрация роутера (модуль prisma.py)
# ============================================================
from prisma import router as prisma_router

app.include_router(prisma_router, prefix="/api")

# ============================================================
# 💳 ПЛАТЁЖНЫЙ СЛОЙ — регистрация роутера (модуль payments.py)
# ============================================================
from payments import router as payments_router

app.include_router(payments_router, prefix="/api")

# ============================================================
# 🌐 РЕКОМЕНДАЦИИ — визуальная паутина похожих пользователей
# ============================================================
from recommendations import calculate_overall_similarity


@app.get("/api/users/{user_id}/recommendations")
async def get_user_recommendations(
    user_id: int,
    request: Request,
    limit: int = 20,
    min_similarity: float = 30.0,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Список похожих пользователей + детальные метрики схожести.
    Кешируется в Redis (`redis_client`) на 24 часа.
    """
    anchor = session.get(User, user_id)
    if not anchor or getattr(anchor, "is_banned", False):
        raise HTTPException(404, "User not found")

    cache_key = f"recommendations:{user_id}:{limit}:{min_similarity}"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # кандидаты: все, кого видит текущий пользователь (или все активные)
    exclude = {user_id}
    if current_user:
        exclude.add(current_user.id)
    candidates = session.exec(
        select(User).where(User.id.not_in(list(exclude))).limit(200)
    ).all()

    results = []
    for cand in candidates:
        if getattr(cand, "is_banned", False):
            continue
        data = calculate_overall_similarity(session, anchor, cand, redis_client)
        if data["similarity_score"] >= min_similarity:
            results.append({
                "user": {
                    "id": cand.id,
                    "username": cand.username,
                    "display_name": cand.display_name,
                    "avatar_url": cand.avatar_url,
                    "bio": (cand.bio or "")[:100],
                    "badge": getattr(cand, "selected_badge_id", None),
                    "custom_badge_url": cand.custom_badge_url,
                    "is_verified": getattr(cand, "is_admin", False)
                    or getattr(cand, "is_moderator", False),
                },
                "similarity": data,
            })

    results.sort(key=lambda r: r["similarity"]["similarity_score"], reverse=True)
    payload = {
        "center_user": {
            "id": anchor.id,
            "username": anchor.username,
            "display_name": anchor.display_name,
            "avatar_url": anchor.avatar_url,
            "bio": anchor.bio,
        },
        "recommendations": results[:limit],
        "total": len(results),
    }
    redis_client.setex(cache_key, 86400, json.dumps(payload, default=str))
    return payload


@app.get("/api/recommendations/centrality")
async def get_recommendations_centrality(
    request: Request,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Локальная паутина вокруг текущего пользователя.
    Возвращает центрального пользователя + до 12 самых близких.
    """
    anchor = current_user
    if not anchor:
        token = request.headers.get("authorization", "").replace("Bearer ", "")
        if not token:
            raise HTTPException(401, "No token")
        try:
            payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
            anchor = session.get(User, int(payload["sub"]))
        except Exception:
            raise HTTPException(401, "Invalid token")
    if not anchor or getattr(anchor, "is_banned", False):
        raise HTTPException(404, "User not found")

    cache_key = f"recommendations:centrality:{anchor.id}"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # берём 60 кандидатов, считаем схожесть, топ-12
    candidates = session.exec(select(User).where(User.id != anchor.id).limit(60)).all()
    scored = []
    for cand in candidates:
        if getattr(cand, "is_banned", False):
            continue
        data = calculate_overall_similarity(session, anchor, cand, redis_client)
        if data["similarity_score"] >= 25.0:
            scored.append({
                "user": {
                    "id": cand.id,
                    "username": cand.username,
                    "display_name": cand.display_name,
                    "avatar_url": cand.avatar_url,
                    "bio": (cand.bio or "")[:100],
                    "is_verified": getattr(cand, "is_admin", False)
                    or getattr(cand, "is_moderator", False),
                },
                "similarity": data,
            })
    scored.sort(key=lambda r: r["similarity"]["similarity_score"], reverse=True)
    payload = {
        "center_user": {
            "id": anchor.id,
            "username": anchor.username,
            "display_name": anchor.display_name,
            "avatar_url": anchor.avatar_url,
            "bio": anchor.bio,
        },
        "recommendations": scored[:12],
        "total": len(scored),
    }
    redis_client.setex(cache_key, 3600, json.dumps(payload, default=str))  # 1 час
    return payload

