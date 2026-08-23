# ============================================================
# app/deps.py - SHARED dependencies & helpers for all routers
# Generated from original main.py (verbatim chunk split).
# ============================================================

from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile, File, Form, Request, WebSocket, WebSocketDisconnect
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
import bcrypt
import os
import uuid
import re
import json
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
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse
from cloudinary_config import UPLOAD_FOLDER
from datetime import datetime, timedelta, timezone
from database import init_db, get_session, engine
from models import (
    User, Post, Like, Follow, Notification, Tag, PostTag, Role,
    Chat, ChatMember, Message, Report, UserKey, ChatSessionKey,
    IPLog, IPBlock, ActionLog, Bookmark, SiteRules, PostView, Update, UpdateRead,
    PushSubscription, StickerPack, Sticker, MessageReaction, Theme, SystemSetting,
    RoleCategory, Warning, LastReadPost, SupportTicket, SupportMessage, Badge,
    SuggestionCategory, SuggestionThread, SuggestionComment, TeamStatistic, RoleHistory,
    Suggestion  # 🆕 ДОБАВЬ ЭТУ СТРОКУ
)
import logging
from fastapi.responses import JSONResponse
from performance import PerfMiddleware, get_perf_summary
import sql_profiler
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

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

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

os.makedirs("uploads", exist_ok=True)
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp"}

SECRET = os.getenv("SECRET_KEY", "nebula-super-secret-key-2026-minimum-32-chars")
ALGORITHM = "HS256"


# ============================================================
# 🔐 АВТОРИЗАЦИЯ
# ============================================================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: int, token_version: int = 0) -> str:
    payload = {
        "sub": str(user_id),
        "ver": token_version,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)

from fastapi import BackgroundTasks  # ← добавь в импорты

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
    if payload.get("ver", 0) != user.token_version:
        raise HTTPException(401, "Session revoked")
    if user.is_banned:
        raise HTTPException(403, "Account banned")

    # 🚀 НЕ БЛОКИРУЕМ ОТВЕТ — обновление в фоне
    now = datetime.now(timezone.utc)
    if not user.last_seen or (now - user.last_seen).total_seconds() > 180:
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
]

MODERATOR_PERMISSIONS = ALL_PERMISSIONS.copy()


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
        return 8
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


def user_out(user: User, session: Session = None) -> dict:
    """Сериализует пользователя в dict (использует кэш ролей)"""
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

    return {
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
        "custom_badge_url": user.custom_badge_url,  # 🆕 ДОБАВЬ ЭТУ СТРОКУ

    }


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



# ============================================================
# 🌳 ЭХО ПОСТА (ДЕРЕВО РЕПОСТОВ И ЦИТАТ)
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
# ⚠️ ПРЕДУПРЕЖДЕНИЯ (ПРАВО warn_users)
# ============================================================
# 🎛️ АДМИНКА: УПРАВЛЕНИЕ СТИКЕР-ПАКАМИ (НОВАЯ МОДЕЛЬ)
# ============================================================
# 💬 АДМИНКА: МОДЕРАЦИЯ ЧАТОВ (право manage_groups)
# ============================================================
# 🗂️ КАТЕГОРИИ РОЛЕЙ (ГРУППЫ/ОТДЕЛЫ)
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

class CreateGroupIn(BaseModel):
    name: str
    user_ids: list[int]  # ID пользователей, которых добавляем (кроме себя)


class CreatePrismChatIn(BaseModel):
    other_user_id: int
    shard1_encrypted: str  
    shard2_genesis: str    
    avatar_url: str   


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



class PushSubscribeIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str

# ============================================================
# 📌 ЗАКРЕПЛЁННЫЕ СООБЩЕНИЯ (ЛЮБОЙ УЧАСТНИК МОЖЕТ)
# ============================================================
# 📌 ЗАКРЕПЛЕНИЕ ЧАТОВ (ДО 5 ШТУК НА ПОЛЬЗОВАТЕЛЯ)
# ============================================================
# 🖼️ АВАТАРКА ГРУППЫ
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


# ---------- БАГ-ТРЕКЕР ----------

from models import BugReport

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
# 🎧 АДМИНКА: СПИСОК ЗАЯВОК + ЗАКРЫТИЕ
# ============================================================
# 🎧 ПОДДЕРЖКА: МНОЖЕСТВЕННЫЕ ЗАЯВКИ + ФОТО
# ============================================================
# 🏅 ЗНАЧКИ (BADGES)
# ============================================================
from models import Badge  # убедись, что Badge импортирован в main.py

# ============================================================
# 📊 ПАНЕЛЬ КОМАНДЫ: СТАТИСТИКА + ПРЕДЛОЖЕНИЯ
# ============================================================
# 💡 ПРЕДЛОЖЕНИЯ (МИНИ-ФОРУМ)
# ============================================================
STATUS_BADGES = {"pending", "approved", "implemented", "rejected", "archived"}

# ============================================================
# 💡 ФОРУМ ПРЕДЛОЖЕНИЙ: КАТЕГОРИИ (100% ЗАЩИТА ОТ 422)
# ============================================================
# 📊 СТАТИСТИКА КОМАНДЫ (ПОЛНАЯ)
