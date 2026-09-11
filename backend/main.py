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
    Chat, ChatMember, Message, Report, UserKey, ChatSessionKey, ChatInvite,
    IPLog, IPBlock, ActionLog, Bookmark, SiteRules, PostView, Update, UpdateRead,
    PushSubscription, StickerPack, Sticker, StickerPackAdd, MessageReaction, PostReaction, Theme, SystemSetting,
    RoleCategory, Warning, LastReadPost, SupportTicket, SupportMessage, Badge,
    Billet, BilletTemplate, BilletAssignment, SystemBadge,
    SuggestionCategory, SuggestionThread, SuggestionThreadComment, RoleHistory, NickHistory, Suggestion, SuggestionComment, ChatDraft, PremiumUsername, PaymentPurchase, PaymentRole,
    UserPrefix, UserPrefixAssign,
    UserChatFolder, ChatFolderAssign,
    Channel, ChannelSubscriber,
    AdminBackup
)
import logging
from fastapi.responses import JSONResponse
from performance import PerfMiddleware, get_perf_summary
import time
import asyncio
from fastapi import Response

# 🛡 Sentry включаем ТОЛЬКО при наличии SENTRY_DSN (в dev/локально не грузим
# тяжёлое дерево sentry_sdk + его интеграции gevent/eventlet/rq → быстрее старт).
if os.getenv("SENTRY_DSN"):
    import sentry_sdk
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN"),
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
_POPULAR_TAGS_TTL = 30  # 30 секунд — чтобы правки тегов отражались быстро

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


# ============================================================
# 🛡️ РЕЗЕРВНАЯ БД ДЕЙСТВИЙ АДМИНОВ (снимки для отката)
# ============================================================
def backup_action(
    session: Session,
    actor_id: int,
    action: str,
    target_type: str,
    target_id: Optional[int],
    payload: dict,
):
    """Сохраняет снимок деструктивного действия администратора в резервную БД."""
    backup = AdminBackup(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        payload=json.dumps(payload, default=str, ensure_ascii=False),
    )
    session.add(backup)
    return backup


def snapshot_post_tree(session: Session, post_id: int) -> dict:
    """Снимок поста и всей ветки ответов (BFS, как в cascade_delete_post) для отката."""
    ids_to_snap = {post_id}
    queue = [post_id]
    while queue:
        current_id = queue.pop(0)
        children = session.exec(
            select(Post.id).where(Post.reply_to_id == current_id)
        ).all()
        for child_id in children:
            if child_id not in ids_to_snap:
                ids_to_snap.add(child_id)
                queue.append(child_id)
    posts = session.exec(select(Post).where(Post.id.in_(list(ids_to_snap)))).all()
    return {
        "posts": [
            {
                "id": p.id,
                "author_id": p.author_id,
                "text": p.text,
                "media_url": p.media_url,
                "media_type": p.media_type,
                "reply_to_id": p.reply_to_id,
                "repost_of_id": p.repost_of_id,
                "echo_parent_id": p.echo_parent_id,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "views_count": p.views_count,
            }
            for p in posts
        ]
    }


def restore_backup(backup: AdminBackup, session: Session, restored_by: int) -> dict:
    """Откат одного действия из резервной БД. Возвращает статус."""
    if backup.restored:
        return {"status": "already_restored"}
    payload = json.loads(backup.payload or "{}")

    if backup.action == "delete_post":
        # Восстанавливаем посты ветки (пропуская уже существующие id)
        restored_count = 0
        for p in payload.get("posts", []):
            if session.get(Post, p["id"]) is not None:
                continue
            created = p.get("created_at")
            session.add(Post(
                id=p["id"],
                author_id=p["author_id"],
                text=p.get("text") or "",
                media_url=p.get("media_url"),
                media_type=p.get("media_type"),
                reply_to_id=p.get("reply_to_id"),
                repost_of_id=p.get("repost_of_id"),
                echo_parent_id=p.get("echo_parent_id"),
                created_at=datetime.fromisoformat(created) if created else utcnow(),
                views_count=p.get("views_count", 0),
            ))
            restored_count += 1
        backup.restored = True
        backup.restored_at = utcnow()
        backup.restored_by = restored_by
        session.add(backup)
        log_action(session, restored_by, "restore_post_backup",
                   target_type="post", target_id=backup.target_id,
                   details={"backup_id": backup.id, "restored_posts": restored_count})
        return {"status": "ok", "restored_posts": restored_count}

    elif backup.action == "ban_user":
        # Возвращаем предыдущее состояние бана
        user_id = payload.get("user_id")
        previous = payload.get("previous_is_banned", False)
        target = session.get(User, user_id) if user_id else None
        if target:
            target.is_banned = bool(previous)
            session.add(target)
        backup.restored = True
        backup.restored_at = utcnow()
        backup.restored_by = restored_by
        session.add(backup)
        log_action(session, restored_by, "restore_ban_backup",
                   target_type="user", target_id=user_id,
                   details={"backup_id": backup.id, "previous_is_banned": previous})
        return {"status": "ok", "user_id": user_id, "is_banned": bool(previous)}

    return {"status": "unknown_action", "action": backup.action}


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
        user_id = _jwt_sub(payload)
        if not user_id: return None
        return session.get(User, user_id)
    except:
        return None

# ============================================================
# 🚀 СОЗДАЁМ ПРИЛОЖЕНИЕ
# ============================================================

# 🛡 ЛОГИРОВАНИЕ: обязательная настройка корневого логгера.
# Без basicConfig INFO-сообщения perf-логгера молча дропались (в корневом
# логгере default=WARNING, а real handler'а нет → печаталось только WARNING+
# через lastResort). Формат: время · уровень · [request_id] · сообщение.
import logging as _logging
_logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
_logging.captureWarnings(True)


def _jwt_sub(payload) -> Optional[int]:
    """Безопасно достаёт user id из JWT-пейлоада. Нечисловой/отсутствующий sub → None
    (раньше int(...) кидал ValueError вне try и ронял запрос в 500 вместо 401)."""
    raw = payload.get("sub") if isinstance(payload, dict) else None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


app = FastAPI(title="Nebula API")
app.include_router(lp_router, prefix="/api")

# 🛡 Схема создаётся ДО приёма запросов: у свежих БД (новый дев/прод) таблиц ещё
# нет, и startup-хук срабатывает уже ПОСЛЕ того, как воркеры uvicorn начинают
# обслуживать запросы → "relation "user" does not exist". init_db() с create_all
# идемпотентен (checkfirst), поэтому вызов здесь безопасен и покрывает и Alembic,
# и голый create_all, и уже существующую схему.
try:
    init_db()
except Exception as _e:
    print(f"⚠️ init_db (create_all) при импорте не удался: {_e}")

@app.on_event("startup")
def print_routes():
    # ⏰ Воркер отложенных постов каналов (импортируется ниже по файлу)
    start_channels_scheduler()
    # ⏰ Воркер рабочих чатов (CRM) + авто-создание чатов отделов
    try:
        start_work_bot_scheduler_hook()
    except Exception as _e:
        print("work scheduler hook:", _e)
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






def _maybe_autounban(user: User, session: Session) -> bool:
    """🛡️ Автоматический разбан по истечении срока. True — бан снят прямо сейчас."""
    if not user.is_banned:
        return False
    until = getattr(user, "ban_until", None)
    if not until:
        return False  # постоянный бан — срок не истекает
    if until.tzinfo is None:
        until = until.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) >= until:
        user.is_banned = False
        user.ban_until = None
        user.ban_reason = None
        session.add(user)
        session.commit()
        log_action(session, user.id, "auto_unban", target_type="user", target_id=user.id,
                   details={"username": user.username})
        return True
    return False


def _ban_detail(user: User) -> dict:
    """🛡️ 403-детали бана для фронтенда: причина + срок (до какого числа)."""
    return {
        "message": "Account banned",
        "reason": getattr(user, "ban_reason", None),
        "until": user.ban_until.isoformat() if getattr(user, "ban_until", None) else None,
    }


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
        user_id = _jwt_sub(payload)
        if user_id is None:
            raise HTTPException(401, "Invalid token")
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(401, "User not found")
    user_token_version = getattr(user, 'token_version', 0) or 0
    if payload.get("ver", 0) != user_token_version:
        raise HTTPException(401, "Session revoked")
    if user.is_banned:
        # 🛡️ Авто-разбан: срок истёк → снимаем и пропускаем
        if not _maybe_autounban(user, session):
            raise HTTPException(403, _ban_detail(user))

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

    user_id = _jwt_sub(payload)
    if user_id is None:
        return None
    user = session.get(User, user_id)
    if not user or user.is_banned:
        if user and user.is_banned and _maybe_autounban(user, session):
            return user
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
    "manage_usernames",          # 🆕 Управление премиум-юзернеймами (@)
    "access_owner_panel",        # 🆕 Доступ к панели владельца/фаундера
    "manage_backups",            # 🆕 Резервная БД: просмотр/откат действий админов, бан админа
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
    "manage_usernames":     ("Управление премиум-юзернеймами (@)", "system"),
    "access_owner_panel":   ("Доступ к панели владельца/фаундера", "system"),
    "manage_backups":       ("Резерв действий админов: просмотр, откат, бан админа", "system"),
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


def user_prefix_out(session: Session, user_id: int) -> Optional[dict]:
    """🏷️ Префикс пользователя (многоугольная иконка-плашка) — для user_out."""
    assign = session.exec(
        select(UserPrefixAssign).where(UserPrefixAssign.user_id == user_id)
    ).first()
    if not assign:
        return None
    p = session.get(UserPrefix, assign.prefix_id)
    if not p:
        return None
    return {
        "id": p.id,
        "icon": p.icon,
        "color": p.color,
        "bg_color": p.bg_color,
    }


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
        "ban_reason": getattr(user, "ban_reason", None),
        "ban_until": getattr(user, "ban_until", None).isoformat() if getattr(user, "ban_until", None) else None,
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
        "billet_url": user.billet_url,  # 🆕
        "is_private": getattr(user, "is_private", False),  # 🛡 приватный аккаунт
        "is_bot": user.is_bot,  # 🤖 аккаунт-бот (BOT Company)

    }
   
    #  Системная плашка (уровни 9-11) + активная кастомная плашка + префикс юзера
    if session:
        if preloaded is not None:
            result["active_billet_assignment"] = preloaded[0]
            result["system_badge"] = preloaded[1]
            if len(preloaded) > 2:
                result["prefix"] = preloaded[2]
        else:
            result["active_billet_assignment"] = get_active_billet_for(user.id, session)
            result["system_badge"] = get_system_badge_for(get_user_level(user, session), session)
            result["prefix"] = user_prefix_out(session, user.id)

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
        select(BilletAssignment).where(
            BilletAssignment.user_id.in_(user_ids),
            BilletAssignment.is_active == True,  # noqa: E712
        ).order_by(BilletAssignment.override_priority.desc(), BilletAssignment.id.desc())
    ).all()

    billet_ids = {a.billet_id for a in assigns if a.billet_id}
    billets = (
        {b.id: b for b in session.exec(select(Billet).where(Billet.id.in_(billet_ids))).all()}
        if billet_ids else {}
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
        billet = billets.get(a.billet_id)
        if billet and billet.is_active:
            assign_map[a.user_id].append(a)

    # 3. Системные плашки одним запросом
    levels = {get_user_level(u, session) for u in users} & {9, 10, 11}
    sys_map = {}
    if levels:
        for b in session.exec(select(SystemBadge).where(SystemBadge.level.in_(levels))).all():
            if b.is_active:
                sys_map[b.level] = _system_badge_out(b)

    def _assignment_out_batch(a: BilletAssignment) -> dict:
        billet = billets.get(a.billet_id)
        user = users_by_id.get(a.user_id)
        issuer = issuers.get(a.granted_by)
        return {
            "id": a.id,
            "user_id": a.user_id,
            "billet_id": a.billet_id,
            "billet": _billet_out(billet) if billet else None,
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

    # 4. 🏷️ Префиксы пользователей одним запросом (batch)
    prefix_assigns = session.exec(
        select(UserPrefixAssign).where(UserPrefixAssign.user_id.in_(user_ids))
    ).all()
    prefix_ids = {a.prefix_id for a in prefix_assigns}
    prefixes = (
        {p.id: p for p in session.exec(select(UserPrefix).where(UserPrefix.id.in_(prefix_ids))).all()}
        if prefix_ids else {}
    )
    prefix_map = {a.user_id: prefixes[a.prefix_id] for a in prefix_assigns if a.prefix_id in prefixes}
    for u in users:
        p = prefix_map.get(u.id)
        preloaded[u.id] = preloaded[u.id] + (
            {"id": p.id, "icon": p.icon, "color": p.color, "bg_color": p.bg_color} if p else None,
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




# PWA: версия приложения/SW — клиент опрашивает перед принудительным update(),
# чтобы не дёргать сеть вхолостую и показывать актуальный баннер обновления.

    














































# ============================================================
# 🌳 ЭХО ПОСТА (ДЕРЕВО РЕПОСТОВ И ЦИТАТ)
# ============================================================






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





# ---------- ЗАКЛАДКИ ----------







































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











# ============================================================
# 🛡️ РЕЗЕРВНАЯ БД: список / откат / бан админа с автооткатом
# ============================================================
def _require_backup_manager(admin: User, session: Session):
    """Доступ к резервной БД: Founder (is_admin) или право manage_backups.
    Право выдаётся через окно ролей (/'manage_backups' в списке прав)."""
    if not admin.is_admin and not has_permission(admin, "manage_backups", session):
        raise HTTPException(403, "Нет права: manage_backups")










# ============================================================
# ⚠️ ПРЕДУПРЕЖДЕНИЯ (ПРАВО warn_users)
# ============================================================














# ============================================================
# 🎛️ АДМИНКА: УПРАВЛЕНИЕ СТИКЕР-ПАКАМИ (НОВАЯ МОДЕЛЬ)
# ============================================================














# ============================================================
# 💬 АДМИНКА: МОДЕРАЦИЯ ЧАТОВ (право manage_groups)
# ============================================================
# ---------- АДМИНКА: настройка реакций на посты ----------





def _active_chat_report_for_chat(session: Session, chat_id: int):
    """Активная (pending) жалоба, дающая доступ к чату. None — доступа нет."""
    return session.exec(
        select(Report).where(
            Report.status == "pending",
            Report.target_type.in_(["chat", "dm_user", "chat_message"]),
        ).order_by(Report.created_at.desc())
    ).all() and next((
        r for r in session.exec(
            select(Report).where(
                Report.status == "pending",
                Report.target_type.in_(["chat", "dm_user", "chat_message"]),
            ).order_by(Report.created_at.desc())
        ).all()
        if _report_chat_id(session, r) == chat_id
    ), None)


def _report_chat_id(session: Session, r: Report):
    """chat_id цели жалобы (None, если цель удалена)"""
    if r.target_type == "chat":
        return r.target_id
    if r.target_type == "chat_message":
        msg = session.get(Message, r.target_id)
        return msg.chat_id if msg else None
    if r.target_type == "dm_user":
        # Личный диалог жалобщика и цели
        member_rows = session.exec(
            select(ChatMember).where(ChatMember.user_id.in_([r.reporter_id, r.target_id]))
        ).all()
        chat_members: dict = {}
        for m in member_rows:
            chat_members.setdefault(m.chat_id, set()).add(m.user_id)
        for cid, us in chat_members.items():
            if us == {r.reporter_id, r.target_id}:
                ch = session.get(Chat, cid)
                if ch and not ch.is_group:
                    return cid
    return None






# ---------- Модерация чатов: блокировка чата, участники ----------



def _chat_moderation_guard(staff: User, chat_id: int, session: Session, require_report: bool = True):
    """Общие проверки: право manage_groups, чат существует, не секретный.
    🔒 require_report: модерация разрешена только при активной жалобе (приватность)."""
    if not has_permission(staff, "manage_groups", session):
        raise HTTPException(403, "Нет права: manage_groups")
    chat = session.get(Chat, chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")
    if chat.is_secret:
        raise HTTPException(403, "Секретные чаты недоступны для модерации")
    if require_report and not _active_chat_report_for_chat(session, chat_id):
        raise HTTPException(403, "🔒 Приватность: модерация открывается только при активной жалобе")
    return chat













# ============================================================
# 🏢 КОМАНДЫ (ОТДЕЛЫ) — АВТОМАТИЗАЦИЯ РАБОЧИХ ЧАТОВ
# ============================================================

# 🏢 Авто-иерархия внутри рабочего чата отдела по уровню юзера:
# 7 (Глава Админа) -> head | 6 (Глава Отдела) -> head | 5 (Зам) -> deputy
# 4 (Средний) -> senior | 3 (Новичок) -> junior
# ============================================================
# 🗂️ КАТЕГОРИИ РОЛЕЙ (ГРУППЫ/ОТДЕЛЫ)
# ============================================================


class PanelTabsIn(BaseModel):
    tabs: list[str] = []









# ---------- техническая панель ----------














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
        if getattr(chat, "is_secret", False):
            enc_label = "🔒 Секретное сообщение"
            last_message_data = {"text": enc_label, "is_encrypted": True,
                                   "sender_id": last_msg.sender_id,
                                   "created_at": last_msg.created_at.isoformat()}
        else:
            if last_msg.text:
                # 📞 Сообщение-уведомление о звонке — человекочитаемое превью вместо JSON;
                # обычные — без Markdown-разметки.

                preview = (_call_log_push(last_msg.text) if last_msg.text.startswith('{"nebula_call_log"') else _strip_markdown(last_msg.text))[:50]
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

    # 🔕 Мьют уведомлений текущего пользователя в этом чате (активен ли сейчас)
    _my_member = members_map.get(user_id)
    _mu = getattr(_my_member, "muted_until", None) if _my_member else None
    if _mu and _mu.tzinfo is None:
        _mu = _mu.replace(tzinfo=timezone.utc)
    _is_muted = bool(_mu and _mu > datetime.now(timezone.utc))

    if chat.is_group or chat.is_prism:
        return {
            "id": chat.id,
            "is_group": True,
            "is_secret": False,  # группы без E2EE
            "is_prism": bool(chat.is_prism),
            "created_at": chat.created_at.isoformat(),
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
            "muted": _is_muted,
            "unread_count": unread,
            "pinned": chat.pinned_by == user_id,  # 🆕
            "pinned_at": chat.pinned_at.isoformat() if chat.pinned_at else None,
            "archived": bool(_my_member and getattr(_my_member, "archived_at", None)),
            "can_add_members": getattr(chat, "can_add_members", "admins"),
            "invite_token": getattr(chat, "invite_token", None),
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
                "created_at": chat.created_at.isoformat(),
                "other": user_out(other, session) if other else None,
                "last_message": last_message_data,
                "muted": _is_muted,
                "unread_count": unread,
                "pinned": chat.pinned_by == user_id,
                "pinned_at": chat.pinned_at.isoformat() if chat.pinned_at else None,
                "archived": bool(members_map.get(user_id) and getattr(members_map.get(user_id), "archived_at", None)),
            }
        
        other = users_map.get(other_member.user_id) if other_member else None
        return {
            "id": chat.id,
            "is_group": False,
            "is_secret": chat.is_secret,
            "created_at": chat.created_at.isoformat(),
            "other": user_out(other, session) if other else None,
            "last_message": last_message_data,
            "muted": _is_muted,
            "unread_count": unread,
            "pinned": chat.pinned_by == user_id,
            "pinned_at": chat.pinned_at.isoformat() if chat.pinned_at else None,
            "archived": bool(members_map.get(user_id) and getattr(members_map.get(user_id), "archived_at", None)),
        }



# ============================================================
# 🗂️ ПАПКИ ЧАТОВ (системная РАБОТА + кастомные папки юзера)
# ============================================================

def _activity_ts_for_chat(data: dict) -> float:
    lm = data.get("last_message")
    if lm and lm.get("created_at"):
        return datetime.fromisoformat(lm["created_at"]).timestamp()
    ca = data.get("created_at")
    return datetime.fromisoformat(ca).timestamp() if ca else 0


def _serialize_chats_for_folders(chats: list, user_id: int, session: Session) -> dict:
    out = {}
    for c in chats:
        data = serialize_chat_for_user(c, user_id, session)
        out[c.id] = data
    return out




class FolderCreateIn(BaseModel):
    name: str
    icon: str = "📁"
    color: str = "#8b5cf6"
    # 🆕 Чаты, которые сразу кладём в папку при создании
    chat_ids: list[int] = []








class FolderChatIn(BaseModel):
    chat_id: int






# ============================================================
# ============================================================
# 🔗 СЕКЦИЯ ЗАЯВОК УДАЛЕНА ВМЕСТЕ С РАБОЧИМИ ЧАТАМИ
# ============================================================



class CreateGroupIn(BaseModel):
    name: str
    user_ids: list[int]  # ID пользователей, которых добавляем (кроме себя)
    # 🆕 Роли участников при создании: {"<user_id>": "admin" | "member"}
    member_roles: dict[str, str] = {}

   










class MemberRoleIn(BaseModel):
    role: str  # "admin" | "member"






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

    # Приглашения
    session.exec(delete(ChatInvite).where(ChatInvite.chat_id == chat_id))

    # 6. Удаляем участников чата
    session.exec(delete(ChatMember).where(ChatMember.chat_id == chat_id))
    
    # 7. Удаляем сам чат
    session.exec(delete(Chat).where(Chat.id == chat_id))
    
    session.commit()




@app.on_event("startup")
def startup():
    """🚀 Быстрый старт: СРАЗУ отдаём управление uvicorn'у (порт биндится).

    Тяжёлое самолечение схемы (create_all, секвенции, ALTER'ы) выполняется
    в фоновом daemon-потоке: на большой схеме это десятки транзакций, и если
    делать это синхронно в startup, приложение виснет на «Waiting for
    application startup» — uvicorn не открывает порт → Render: «No open
    ports detected». Фон не влияет на работу: запросы ждут готовой БД,
    а create_all при импорте main.py уже создал схему.
    """
    import threading
    threading.Thread(target=_startup_selfheal, name="db-selfheal", daemon=True).start()


def _startup_selfheal():
    """Проверка соединения + само-лечение схемы (идемпотентно, в фоне)."""
    from sqlalchemy import text as _t, inspect as _inspect
    from sqlmodel import SQLModel as _SQLModel
    import models as _models  # noqa: F401 — регистрация всех таблиц
    try:
        with engine.begin() as conn:
            conn.execute(_t("SELECT 1"))
        # 🛡️ Идемпотентное создание отсутствующих таблиц (checkfirst)
        try:
            with engine.begin() as conn:
                _SQLModel.metadata.create_all(conn)
        except Exception as e:
            print(f"⚠️ create_all (self-heal) не удался: {e}")
        # 🛡️ Синхронизация PostgreSQL-секвенций с MAX(id)
        # (иначе после сида/восстановления бэкапа INSERT падает с
        # duplicate key value violates unique constraint "<table>_pkey")
        try:
            from database import _fix_postgres_sequences
            _fix_postgres_sequences()
        except Exception as e:
            print(f"⚠️ Самолечение секвенций не удалось: {e}")
        # 🛡️ Добавление отсутствующих колонок (модели → БД)
        try:
            with engine.begin() as conn:
                insp = _inspect(conn)
            for table in _SQLModel.metadata.tables.values():
                with engine.begin() as conn:
                    insp = _inspect(conn)
                    if not insp.has_table(table.name):
                        continue
                    existing = {c["name"] for c in insp.get_columns(table.name)}
                    for col in table.columns:
                        if col.name in existing:
                            continue
                        try:
                            col_type = col.type.compile(conn.dialect)
                        except Exception:
                            col_type = "VARCHAR"
                        default = ""
                        if col.default is not None and isinstance(col.default.arg, (str, int, float, bool)):
                            default = f" DEFAULT '{col.default.arg}'" if isinstance(col.default.arg, str) else f" DEFAULT {col.default.arg}"
                        try:
                            # ⚠️ Имя таблицы В КАВЫЧКАХ: "user" — зарезервированное
                            # слово в Postgres, без кавычек ALTER падает с syntax
                            # error и колонка молча не добавляется (→ 500 на всех
                            # запросах, т.к. модель требует колонку).
                            conn.execute(_t(f'ALTER TABLE "{table.name}" ADD COLUMN {col.name} {col_type}{default}'))
                            print(f"🛠️ Self-heal: добавлена колонка {table.name}.{col.name}")
                        except Exception:
                            conn.rollback()  # сброс аборта, чтобы остальные колонки добавились
                            pass  # параллельный деплой / другая БД
        except Exception as e:
            print(f"⚠️ Self-heal колонок не удался: {e}")
        # 🛡️ Критичные колонки (страховка): если общий self-heal споткнулся,
        #    эти ALTER'ы выполняются отдельно — иначе модель с новой колонкой
        #    ломает ВСЕ запросы к таблице (500 на каждом эндпоинте).
        for _stmt in (
            'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE',
        ):
            try:
                with engine.begin() as conn:
                    conn.execute(_t(_stmt))
            except Exception:
                pass  # sqlite (нет IF NOT EXISTS) или колонка уже есть
        # 🤖 Системная диспетчеризация: бота-аккаунта нет, заявки просто маршрутизируются
        print("✅ База данных доступна")
    except Exception as e:
        print(f"❌ Нет соединения с БД: {e}")



# ============================================================
# 📖 ПОСЛЕДНИЙ ЧИТАЕМЫЙ ПОСТ (вместо прогресса скролла)
# ============================================================

class MarkReadingIn(BaseModel):
    post_id: int







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
























# ============================================================
# 🔐 2FA (TOTP) + EMAIL
# ============================================================

# ---------- 2FA: НАСТРОЙКА ----------











# ---------- 2FA: ПРОВЕРКА ПРИ ЛОГИНЕ ----------








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
















# ============================================================
# 📞 РЕЛЕЙНЫЕ ЗВОНКИ БЕЗ WebRTC (через WebSocket/сервер)
# Аудио/видео едет как обычный TCP-трафик сайта — не нужен ни UDP,
# ни STUN/TURN. Работает везде, где открывается сам сайт.
# Двусторонний: каждый участник шлёт и принимает чанки.
# ============================================================
import asyncio as _asyncio

_relay_calls: dict = {}        # call_id -> {a, b, a_name, a_avatar, b_name, b_avatar, status, type}
_relay_ws: dict = {}           # call_id -> {user_id: websocket}  (live потоки)
_relay_calls_lock = _asyncio.Lock()


class RelayCallIn(BaseModel):
    target_user_id: int
    call_type: str = "audio"   # audio | video


class RelayCallAction(BaseModel):
    call_id: str
    action: str = "accept"      # accept | reject | end







FOREVER_MUTE = datetime(9999, 1, 1, tzinfo=timezone.utc)

def _member_muted(chat_id: int, user_id: int, session: Session) -> bool:
    """True, если юзер выключил уведомления этого чата (и мьют ещё активен)."""
    try:
        m = session.exec(
            select(ChatMember).where(
                ChatMember.chat_id == chat_id,
                ChatMember.user_id == user_id,
            )
        ).first()
    except Exception:
        return False
    mu = getattr(m, "muted_until", None)
    if not mu:
        return False
    if mu.tzinfo is None:
        mu = mu.replace(tzinfo=timezone.utc)
    return mu > datetime.now(timezone.utc)


def _privacy_allows(target: "User", actor_id: int, kind: str, session: Session) -> bool:
    """🛡 Проверка приватности: может ли actor писать (kind='messages')
    или звонить (kind='calls') пользователю target."""
    setting = getattr(target, f"allow_{kind}", "everyone") or "everyone"
    if setting == "everyone":
        return True
    if setting == "nobody":
        return False
    if setting == "followers":
        # actor должен быть подписчиком target
        return session.exec(
            select(Follow).where(
                Follow.follower_id == actor_id,
                Follow.followee_id == target.id,
            )
        ).first() is not None
    if setting == "following":
        # только люди, на которых подписан сам target (target.followee == actor)
        return session.exec(
            select(Follow).where(
                Follow.follower_id == target.id,
                Follow.followee_id == actor_id,
            )
        ).first() is not None
    return True


def _viewer_follows(viewer_id: int, target_id: int, session: Session) -> bool:
    """viewer подписан на target?"""
    return session.exec(
        select(Follow).where(
            Follow.follower_id == viewer_id,
            Follow.followee_id == target_id,
        )
    ).first() is not None


def _can_view_profile(viewer: Optional["User"], target: "User", session: Session) -> bool:
    """🛡 Доступ к профилю приватного аккаунта.
    Открыт: самому владельцу, его подписчикам, а также staff с правом
    «Доступ к панели управления» (manage_users) — право даёт доступ ко ВСЕМ
    приватным аккаунтам, не привязываясь к уровню роли."""
    if not getattr(target, "is_private", False):
        return True
    if viewer is None:
        return False
    if viewer.id == target.id:
        return True
    if viewer.is_admin or viewer.is_moderator:
        return True
    if has_permission(viewer, "manage_users", session):
        return True
    return _viewer_follows(viewer.id, target.id, session)


def _profile_locked_response(target: "User") -> dict:
    """Минимальный ответ для приватного профиля, к которому нет доступа."""
    return {
        "locked": True,
        "is_private": True,
        "id": target.id,
        "username": target.username,
        "display_name": target.display_name,
        "avatar_url": target.avatar_url,
        "bio": None,
        "cover_url": None,
        "followers_count": 0,
        "following_count": 0,
        "posts_count": 0,
    }


class PrivacyIn(BaseModel):
    # 🛡 Аудитория профиля
    is_private: Optional[bool] = None                  # приватный аккаунт
    # 🛡 Читаемость и связь ("everyone" | "followers" | "following" | "nobody" /
    #   для комментариев также "mentioned")
    allow_messages: Optional[str] = None
    allow_calls: Optional[str] = None
    allow_comments: Optional[str] = None
    # 🛡 Видимость данных
    hide_following: Optional[bool] = None
    hide_followers: Optional[bool] = None


_PROFILE_PRIVACY_STRINGS = {
    "allow_messages": {"everyone", "followers", "following", "nobody"},
    "allow_calls": {"everyone", "followers", "following", "nobody"},
    "allow_comments": {"everyone", "followers", "following", "mentioned"},
}
_PROFILE_PRIVACY_BOOLS = ("is_private", "hide_following", "hide_followers")






class ChatMuteIn(BaseModel):
    minutes: Optional[int] = None   # сколько минут мьютить (1ч=60, 8ч=480, 24ч=1440)
    forever: bool = False           # навсегда






# ============================================================
# 📱 PUSH-ПРЕВЬЮ: человекочитаемые пуши вместо сырого Markdown/JSON
# ============================================================
import re as _re

def _strip_markdown(text: str) -> str:
    """Убирает Markdown-разметку (жирный, спойлер, код, ссылки, заголовки)... -> plain text для пуша/превью."""
    if not text:
        return ""
    s = text
    s = _re.sub(r"\|\|(.+?)\|\|", r"\1", s)      # спойлер ||скрытый|| -> скрытый
    s = _re.sub(r"`+([^`]+)`+", r"\1", s)          # инлайн-код `код` -> код
    s = _re.sub(r"```.*?```", " [код] ", s, flags=_re.S)  # блок кода -> [код]
    s = _re.sub(r"!\[([^\]]*)\]\([^)]+\)", " 📷 ", s) # изображение ![alt](url) -> 📷
    s = _re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)  # ссылка [текст](url) -> текст
    s = _re.sub(r"^\s{0,3}#{1,6}\s*", "", s, flags=_re.M) # заголовки #...
    s = _re.sub(r"\*\*(.+?)\*\*", r"\1", s)       # **жирный** -> жирный
    s = _re.sub(r"__(.+?)__", r"\1", s)            # __жирный__ -> жирный
    s = _re.sub(r"(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)", r"\1", s)  # *курсив* -> курсив
    s = _re.sub(r"~~(.+?)~~", r"\1", s)            # ~~зачёркнутый~~ -> зачёркнутый
    s = _re.sub(r"^\s*[-*+]\s+", "", s, flags=_re.M)  # маркер-список -> убираем булиты
    s = _re.sub(r"[>|]\s*", "", s, flags=_re.M)  # цитаты >и мобильные таблицы | ...
    s = _re.sub(r"\s+", " ", s)                        # множ. пробелы
    for _sym in ("*", "_", "`"):
        s = s.replace("\\" + _sym, _sym)
    return s.strip()

def _call_log_push(text: str) -> str:
    """Превью звонка для пуша: из JSON-маркера в человекочитаемую строку."""
    try:
        cl = json.loads(text)
        ct = "Видеозвонок" if cl.get("call_type") == "video" else "Аудиозвонок"
        outcome = cl.get("outcome")
        if outcome == "missed":
            return f"📞 {ct}: пропущенный"
        if outcome == "declined":
            return f"📞 {ct}: отклонённый"
        d = int(cl.get("duration") or 0)
        if d > 0:
            return f"📞 {ct}: {d // 60}:{d % 60:02d}"
        return f"📞 {ct}"
    except Exception:
        return "📞 Звонок"

def _push_body(text: str, media_type: str|None = None) -> str:
    """Итоговый body пуша для нового сообщения: обычные — plain text без Markdown, звонок — человекочитаемое превью."""
    if text and text.startswith('{"nebula_call_log"'):
        return _call_log_push(text)
    if text:
        return _strip_markdown(text)[:100]
    if media_type in ("image", "gif"):
        return "📷 Фото"
    if media_type == "video":
        return "🎬 Видео"
    if media_type == "audio":
        return "🎙️ Голосовое"
    return "📎 Вложение"
class PushSubscribeIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str








# ============================================================
# 📌 ЗАКРЕПЛЁННЫЕ СООБЩЕНИЯ (ЛЮБОЙ УЧАСТНИК МОЖЕТ)
# ============================================================



# ============================================================
# 📌 ЗАКРЕПЛЕНИЕ ЧАТОВ (ДО 5 ШТУК НА ПОЛЬЗОВАТЕЛЯ)
# ============================================================








# ============================================================
# 🖼️ АВАТАРКА ГРУППЫ
# ============================================================









# ============================================================
# 🗄️ АРХИВ ЧАТОВ/КАНАЛОВ (серверная синхронизация между устройствами)
# ============================================================

class ArchiveSyncIn(BaseModel):
    archive_chats: list[int] = []
    unarchive_chats: list[int] = []
    archive_channels: list[int] = []
    unarchive_channels: list[int] = []
























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



class RulesUpdate(BaseModel):
    content: str



# ---------- жалобы ----------









# ---------- IP И ЛОГИ ----------












# ---------- БАГ-ТРЕКЕР ----------

from models import BugReport









# ---------- ЭНДПОИНТЫ ПО USERNAME ----------











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


# ============================================================
# 📞 ICE-SERVERS: выдаём клиенту конфиг TURN для RTCPeerConnection.
# Секреты живут ТОЛЬКО здесь (Render env): METERED_USERNAME / METERED_PASSWORD /
# METERED_API_KEY (+ опционально METERED_DOMAIN, METERED_TURN_HOST).
# Фронтенд забирает их через GET /api/ice-servers — ключи НЕ попадают в его бандл.
# ============================================================

_ice_servers_cache: dict = {"servers": None, "expires": 0.0}









# ============================================================
# 🎧 АДМИНКА: СПИСОК ЗАЯВОК + ЗАКРЫТИЕ
# ============================================================







# ============================================================
# 🎧 ПОДДЕРЖКА: МНОЖЕСТВЕННЫЕ ЗАЯВКИ + ФОТО
# ============================================================









def _serialize_invite(inv: ChatInvite) -> dict:
    return {
        "id": inv.id, "token": inv.token, "name": inv.name,
        "is_active": inv.is_active,
        "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "invite_link": f"/invite/{inv.token}",
    }


def _invite_valid(inv: ChatInvite) -> bool:
    if not inv.is_active:
        return False
    if inv.expires_at:
        exp = inv.expires_at if inv.expires_at.tzinfo is None else inv.expires_at.replace(tzinfo=None)
        if exp < datetime.utcnow():
            return False
    return True




class InviteIn(BaseModel):
    name: Optional[str] = None
    expires_in_hours: Optional[int] = None  # временная ссылка















class ChatPrivacyIn(BaseModel):
    can_add_members: Optional[str] = None
    avatar_url: Optional[str] = None
    name: Optional[str] = None


# ============================================================
# 🏅 ЗНАЧКИ (BADGES)
# ============================================================
from models import Badge  # убедись, что Badge импортирован в main.py













# ============================================================
# 🏷️ КАСТОМНЫЕ ПЛАШКИ (BADGES 2.0)
# ============================================================

def get_billet_out(b: Billet) -> dict:
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


async def _upload_billet_file(file: Optional[UploadFile], folder: str = "billets") -> Optional[str]:
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
    """Проверка кому можно дать плашку.

    Согласуется с assign_billet: Founder (>=10) и System (@trelod)
    могут выдать кому угодно (включая @trelod); уровень 9 — только до своего.
    """
    target_lvl = get_user_level(target, session)
    if lvl == 9 and target_lvl >= 9:
        raise HTTPException(403, "С 9 уровня можно выдавать плашки только до 8 уровня")
    return target_lvl




# ---------- АКТИВНАЯ ПЛАШКА (для AvatarFrame) ----------

def get_active_billet_for(user_id: int, session: Session) -> Optional[dict]:
    """Возвращает активную (не истёкшую, не отменённую) плашку пользователя."""
    now = datetime.now(timezone.utc)
    assigns = session.exec(
        select(BilletAssignment).where(
            BilletAssignment.user_id == user_id,
            BilletAssignment.is_active == True,  # noqa: E712
                ).order_by(BilletAssignment.override_priority.desc(), BilletAssignment.id.desc())
    ).all()
    for a in assigns:
        if a.expires_at and a.expires_at < now:
            continue
        billet = session.get(Billet, a.billet_id) if a.billet_id else None
        if billet and billet.is_active:
            # 🆕 Отдаём в формате assignment (billet, is_active, override_priority...),
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








# ============================================================
# 📊 СТАТИСТИКА КОМАНДЫ
# ============================================================

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




# ---------- ПРЕФИКСЫ ----------




# ---------- ТЕМЫ ----------













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



# ============================================================
# 🏷️ КАСТОМНЫЕ ПЛАШКИ (BADGES 2.0)
# ============================================================

def _require_badge_admin(user: User, session: Session = None) -> int:
    """Проверка прав на управление плашками (Level >= 9)"""
    level = get_user_level(user, session) if session else getattr(user, "level", 0) or 0
    if level < 9:
        raise HTTPException(403, "Доступ запрещен: требуется уровень 9+")
    return level

def _billet_out(badge: Billet) -> dict:
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

def _assignment_out(assignment: BilletAssignment, session: Session) -> dict:
    """Сериализация назначения плашки"""
    billet_data = None
    if assignment.billet_id:
        billet = session.get(Billet, assignment.billet_id)
        if billet:
            billet_data = _billet_out(billet)
    
    user = session.get(User, assignment.user_id)
    issuer = session.get(User, assignment.granted_by)

    return {
        "id": assignment.id,
        "user_id": assignment.user_id,
        "billet_id": assignment.billet_id,
        "billet": billet_data,
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





# --- Загрузка картинок для плашек (Base64) ---



# --- Назначения (Assignments) ---




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
# 📢 КАНАЛЫ — регистрация роутера (модуль channels.py).
#    Изолированная система: свои таблицы, свои WS-события channel_*.
# ============================================================
from channels import router as channels_router, start_channels_scheduler

app.include_router(channels_router, prefix="/api")

# ============================================================
# 🌐 РЕКОМЕНДАЦИИ — визуальная паутина похожих пользователей
# ============================================================
from recommendations import calculate_overall_similarity






# ============================================================
# 👑 ПРЕМИУМ-ЮЗЕРНЕЙМЫ (@) — ПРОДАЖА НИКОВ
# ============================================================

# --- Схемы ---
class PremiumUsernameCreate(BaseModel):
    username: str
    price: Optional[int] = None
    currency: str = "USD"
    category: Optional[str] = None
    is_reserved: bool = False
    reserved_for: Optional[int] = None
    reserved_until: Optional[datetime] = None


class PremiumUsernameUpdate(BaseModel):
    price: Optional[int] = None
    category: Optional[str] = None
    is_available: Optional[bool] = None
    is_reserved: Optional[bool] = None
    reserved_for: Optional[int] = None
    reserved_until: Optional[datetime] = None


def _serialize_premium(item: PremiumUsername) -> dict:
    """Сериализация премиум-юзернейма для API."""
    return {
        "id": item.id,
        "username": item.username,
        "price": item.price,
        "currency": item.currency,
        "category": item.category,
        "is_available": item.is_available,
        "is_reserved": item.is_reserved,
        "reserved_for": item.reserved_for,
        "reserved_until": item.reserved_until.isoformat() if item.reserved_until else None,
        "is_active": item.is_active,
        "views_count": item.views_count,
        "purchased_by": item.purchased_by,
        "purchased_at": item.purchased_at.isoformat() if item.purchased_at else None,
        "purchase_price": item.purchase_price,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


# --- 💡 Статус магазина (глобальный переключатель) ---
SHOP_ENABLED_KEY = "premium_shop_enabled"


def _get_shop_enabled(session: Session) -> bool:
    setting = session.get(SystemSetting, SHOP_ENABLED_KEY)
    return setting is not None and setting.value.lower() in ("1", "true", "yes", "on")


def _shop_setting_exists(session: Session) -> bool:
    """True, если переключатель магазина хоть раз явно меняли админом."""
    return session.get(SystemSetting, SHOP_ENABLED_KEY) is not None


def _shop_effectively_enabled(session: Session) -> bool:
    """Явная настройка имеет приоритет; если её ни разу не меняли —
    магазин считается открытым при наличии активных лотов."""
    if _shop_setting_exists(session):
        return _get_shop_enabled(session)
    any_active = session.exec(
        select(PremiumUsername).where(PremiumUsername.is_active == True).limit(1)  # noqa: E712
    ).first()
    return any_active is not None




def _parse_enabled(request: Request) -> bool:
    """Параметр `enabled` из query (?enabled=false) или из form-data."""
    qv = request.query_params.get("enabled")
    if qv is not None:
        return qv.lower() in ("1", "true", "yes", "on")
    return True




# --- 🔧 Админские эндпоинты ---









# --- 🌍 Публичные эндпоинты ---





# ============================================================
# 👑 ПАНЕЛЬ ВЛАДЕЛЬЦА / ФАУНДЕРА
# ============================================================



# ============================================================
# 💾 СНИМКИ БАЗЫ ДАННЫХ — файловые бэкапы (панель владельца)
# Создание / список / скачивание / восстановление / удаление.
# Доступ: Founder (is_admin) или права manage_backups / access_owner_panel.
# ============================================================
BACKUP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backups")
BACKUP_NAME_RE = re.compile(r"^backup_\d{4}_\d{2}_\d{2}_\d{2}_\d{2}\.(?:sqlite|sql|dump)$")


def _is_sqlite_url() -> bool:
    return engine.url.get_backend_name() in ("sqlite", "pysqlite")


def _db_file_for_sqlite() -> Optional[str]:
    """Абсолютный путь к SQLite-файлу, на который указывает engine.url."""
    from pathlib import Path
    db = engine.url.database
    if not db:
        return None
    p = Path(db)
    if not p.is_absolute():
        p = Path(os.getcwd()) / p
    return str(p.resolve())


def _require_owner_backup(admin: User, session: Session):
    """Доступ к файловым бэкапам БД: Founder или права manage_backups/access_owner_panel."""
    if admin.is_admin:
        return
    perms = get_user_permissions(admin, session)
    if "manage_backups" not in perms and "access_owner_panel" not in perms:
        raise HTTPException(403, "Нет права: manage_backups / access_owner_panel")


def _backup_abs(name: str) -> Optional[str]:
    """Проверяет имя и возвращает абс. путь, защищая от path traversal."""
    if not BACKUP_NAME_RE.match(name):
        return None
    return os.path.join(BACKUP_DIR, name)


def _human_size(n: int) -> str:
    n = float(n)
    for unit in ("Б", "КБ", "МБ", "ГБ"):
        if n < 1024 or unit == "ГБ":
            return f"{n:.0f} {unit}" if unit == "Б" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} ГБ"
def create_db_backup(session: Session, actor: User) -> dict:
    """Создаёт файловый снимок базы.
    SQLite — онлайн-копия через sqlite3.backup (без остановки сервиса);
    PostgreSQL — дамп через pg_dump."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y_%m_%d_%H_%M")

    if _is_sqlite_url():
        import sqlite3
        db = _db_file_for_sqlite()
        if not db or not os.path.exists(db):
            raise HTTPException(400, "SQLite-файл не найден на диске")
        dest = os.path.join(BACKUP_DIR, f"backup_{ts}.sqlite")
        src = sqlite3.connect(db)
        try:
            dst = sqlite3.connect(dest)
            try:
                src.backup(dst)  # согласованная онлайн-копия
            finally:
                dst.close()
        finally:
            src.close()
        log_action(session, actor.id, "create_db_backup", target_type="system",
                   details={"filename": os.path.basename(dest), "size": os.path.getsize(dest)})
        session.commit()
        return {"ok": True, "filename": os.path.basename(dest), "size": os.path.getsize(dest)}

    # PostgreSQL
    dest = os.path.join(BACKUP_DIR, f"backup_{ts}.sql")
    passw = engine.url.password or ""
    env = dict(os.environ)
    if passw:
        env.setdefault("PGPASSWORD", passw)
    host = engine.url.host or "localhost"
    port = str(engine.url.port or 5432)
    user = (engine.url.username or "").strip()
    dbname = (engine.url.database or "postgres").strip()
    cmd = ["pg_dump", f"--host={host}", f"--port={port}", f"--username={user}",
           "--no-owner", "--format=plain", f"--file={dest}", dbname]
    try:
        subprocess.run(cmd, env=env, check=True, capture_output=True, timeout=900)
    except FileNotFoundError:
        raise HTTPException(500, "pg_dump не найден в PATH — установите клиент PostgreSQL")
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"pg_dump не удался: {e.stderr.decode('utf-8', 'replace')[-400:]}")
    log_action(session, actor.id, "create_db_backup", target_type="system",
               details={"filename": os.path.basename(dest), "size": os.path.getsize(dest)})
    session.commit()
    return {"ok": True, "filename": os.path.basename(dest), "size": os.path.getsize(dest)}


def list_db_backups() -> list:
    """Список файловых снимков (имя, размер, дата) — от новых к старым."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    out = []
    for fn in sorted(os.listdir(BACKUP_DIR), reverse=True):
        if not BACKUP_NAME_RE.match(fn):
            continue
        fp = os.path.join(BACKUP_DIR, fn)
        try:
            st = os.stat(fp)
        except OSError:
            continue
        if not os.path.isfile(fp):
            continue
        out.append({
            "filename": fn,
            "size": st.st_size,
            "size_human": _human_size(st.st_size),
            "created_at": datetime.fromtimestamp(st.st_mtime).strftime("%d.%m.%Y %H:%M"),
            "stamp": datetime.fromtimestamp(st.st_mtime).isoformat(),
        })
    out.sort(key=lambda x: x["stamp"], reverse=True)
    return out


def restore_db_backup(session: Session, actor: User, name: str) -> dict:
    """Восстанавливает БД из снимка. Перед заменой снимает страховочную копию."""
    fp = _backup_abs(name)
    if not fp or not os.path.exists(fp):
        raise HTTPException(404, "Бэкап не найден")

    # Страховка: снимок текущего состояния перед перезаписью
    os.makedirs(BACKUP_DIR, exist_ok=True)
    pre_name = f"pre_restore_{datetime.now().strftime('%Y_%m_%d_%H_%M_%S')}.sqlite"
    pre_path = os.path.join(BACKUP_DIR, pre_name)

    if _is_sqlite_url():
        import sqlite3
        db = _db_file_for_sqlite()
        if not db or not os.path.exists(db):
            raise HTTPException(400, "SQLite-файл не найден")
        # 1) страховочная копия текущей базы
        cur = sqlite3.connect(db)
        try:
            pd = sqlite3.connect(pre_path)
            try:
                cur.backup(pd)
            finally:
                pd.close()
        finally:
            cur.close()
        # 2) подменяем файл и сбрасываем пул соединений (новые откроются из нового файла)
        import shutil
        engine.dispose()
        shutil.copyfile(fp, db)
        init_db()
        log_action(session, actor.id, "restore_db_backup", target_type="system",
                   details={"filename": name, "pre_snapshot": pre_name})
        session.commit()
        return {"ok": True, "pre_snapshot": pre_name, "message": "База восстановлена из снимка"}

    # PostgreSQL — применяем дамп через psql
    passw = engine.url.password or ""
    env = dict(os.environ)
    if passw:
        env.setdefault("PGPASSWORD", passw)
    host = engine.url.host or "localhost"
    port = str(engine.url.port or 5432)
    user = (engine.url.username or "").strip()
    dbname = (engine.url.database or "postgres").strip()
    cmd = ["psql", f"--host={host}", f"--port={port}", f"--username={user}",
           "--dbname", dbname, "--single-transaction", "--file", fp]
    try:
        subprocess.run(cmd, env=env, check=True, capture_output=True, timeout=1800)
    except FileNotFoundError:
        raise HTTPException(500, "psql не найден в PATH — установите клиент PostgreSQL")
    except subprocess.CalledProcessError as e:
        raise HTTPException(500, f"psql не удался: {e.stderr.decode('utf-8', 'replace')[-400:]}")
    log_action(session, actor.id, "restore_db_backup", target_type="system",
               details={"filename": name})
    session.commit()
    return {"ok": True, "message": "База восстановлена из снимка"}












# ============================================================
# 📎 Универсальная загрузка медиа для постов чатов (Telegram-like feed)
# ============================================================


# ============================================================
# 🏷️ ПРЕФИКСЫ ПОЛЬЗОВАТЕЛЕЙ (многоугольная иконка-плашка)
# CRUD в adminnew → Префиксы → Пользователи, выдача в UsersSection.
# ============================================================

def _prefix_admin_guard(staff: User, session: Session):
    """Доступ: manage_users или админ."""
    if not (staff.is_admin or has_permission(staff, "manage_users", session)):
        raise HTTPException(403, "Нет права: manage_users")
















# ============================================================
# 🏢 РАБОЧИЕ ЧАТЫ (CRM) — регистрация роутера + воркер.
#    Изолированная система: свои таблицы, свои WS-события work_*.
# ============================================================
from work_chats import router as work_chats_router, start_work_bot_scheduler

app.include_router(work_chats_router, prefix="/api")


def start_work_bot_scheduler_hook():
    """Запуск воркера рабочих чатов (вызывается на старте).

    🚀 Тяжёлая ensure-часть (init_db + создание чатов отделов + синк
    участников + системные боты) выполняется в ФОНОВОМ daemon-потоке:
    синхронный прогон в startup-хуке блокировал «Waiting for application
    startup» на медленном Postgres (uvicorn не биндит порт → Render:
    «No open ports detected»). Сам шедулер (asyncio.create_task) — мгновенный.
    """
    def _ensure():
        try:
            from database import init_db, Session as _S
            import work_chats
            init_db()
            with _S() as s:
                try:
                    work_chats.ensure_work_chats_for_categories(s)
                    work_chats.ensure_worker_bots_for_all(s)
                    # 🔄 ПОЛНАЯ АВТОСИНХРОНИЗАЦИЯ: все юзеры с ролями — в чаты
                    # своих категорий (добавление/переезд/удаление)
                    n = work_chats.sync_all_memberships(s)
                    print("work memberships synced:", n)
                except Exception as _e:
                    print("work_chats ensure:", _e)
                # 🤖 Bot_creator — отец ботов (системный)
                try:
                    from bots import ensure_bot_creator
                    ensure_bot_creator(s)
                except Exception as _e:
                    print("bot_creator ensure:", _e)
                # 🎨 StickerBot — системный стикер-бот (создание пользовательских паков)
                try:
                    from sticker_bot import ensure_stickerbot
                    ensure_stickerbot(s)
                except Exception as _e:
                    print("stickerbot ensure:", _e)
        except Exception as e:
            print("work_chats init:", e)

    import threading
    threading.Thread(target=_ensure, name="work-chats-ensure", daemon=True).start()
    return start_work_bot_scheduler()


# ============================================================
# 🤖 BOT COMPANY — регистрация роутера бот-платформы.
#    Единый реестр для рабочих и пользовательских ботов.
# ============================================================
def _bot_has_owner(session, user_id: int) -> bool:
    """Аккаунт-бот принадлежит пользовательскому боту (BOT Company)."""
    from models import Bot as _Bot
    b = session.exec(select(_Bot).where(_Bot.user_id == user_id)).first()
    return bool(b and b.owner_id)


from bots import router as bots_router

app.include_router(bots_router, prefix="/api")

# 🤖 Bot API (публичный): /bot{TOKEN}/{method} + owner-эндпоинты /api/admin/bots/{id}/...
from bot_api import router as bot_api_router

app.include_router(bot_api_router)

# ============================================================
# 📊 /api/admin/team-statistics — данные вкладки «Команда» в /stat.
#    groups = RoleCategory → members = юзеры с is_staff-ролью категории.
#    ?user_id= — детальная статистика сотрудника (действия + история ролей).
# ============================================================



# ============================================================
# 🎨 STICKER BOT — регистрация роутера (пользовательские паки)
# ============================================================
from sticker_bot import router as sticker_router, ensure_stickerbot, ensure_stickerbot_chat

app.include_router(sticker_router, prefix="/api")


# ============================================================
# 🚀 ТОЧКА ВХОДА / ЗАПУСК
# ============================================================
# Поддержка Render и любого PaaS: слушаем порт из env `PORT`
# (Render инжектит `$PORT` — напр. 10000; дефолт 8000).
# Start-команда: `python main.py` → слушает 0.0.0.0:$PORT.
# ============================================================
# 🔌 ПОДКЛЮЧЕНИЕ МАРШРУТИЗАТОРОВ (routers/*.py)
# ============================================================
from routers.admin import router as r_admin
from routers.archive import router as r_archive
from routers.auth import router as r_auth
from routers.badges import router as r_badges
from routers.billets import router as r_billets
from routers.calls import router as r_calls
from routers.chats import router as r_chats
from routers.keys import router as r_keys
from routers.media import router as r_media
from routers.misc import router as r_misc
from routers.notifications import router as r_notifications
from routers.owner import router as r_owner
from routers.permissions import router as r_permissions
from routers.posts import router as r_posts
from routers.premium import router as r_premium
from routers.prism import router as r_prism
from routers.recommendations import router as r_recommendations
from routers.reports import router as r_reports
from routers.search import router as r_search
from routers.stickers import router as r_stickers
from routers.suggestions import router as r_suggestions
from routers.support import router as r_support
from routers.themes import router as r_themes
from routers.updates import router as r_updates
from routers.userprefixes import router as r_userprefixes
from routers.users import router as r_users

app.include_router(r_admin)
app.include_router(r_archive)
app.include_router(r_auth)
app.include_router(r_badges)
app.include_router(r_billets)
app.include_router(r_calls)
app.include_router(r_chats)
app.include_router(r_keys)
app.include_router(r_media)
app.include_router(r_misc)
app.include_router(r_notifications)
app.include_router(r_owner)
app.include_router(r_permissions)
app.include_router(r_posts)
app.include_router(r_premium)
app.include_router(r_prism)
app.include_router(r_recommendations)
app.include_router(r_reports)
app.include_router(r_search)
app.include_router(r_stickers)
app.include_router(r_suggestions)
app.include_router(r_support)
app.include_router(r_themes)
app.include_router(r_updates)
app.include_router(r_userprefixes)
app.include_router(r_users)


if __name__ == "__main__":
    import uvicorn

    _port = int(os.getenv("PORT", "8000"))
    print(f"🚀 Запуск backend на 0.0.0.0:{_port} (PORT={_port})")
    uvicorn.run(app, host="0.0.0.0", port=_port, log_level="info")

