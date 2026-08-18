# Всё что не является роутом (функции, кэши, утилиты)
# ПРОВЕРЬ ИМПОРТЫ ВРУЧНУЮ!

from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile, File, Form, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import Session, select, func, col
from sqlalchemy import text, update, delete
from typing import Optional, List
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete
from fastapi import BackgroundTasks 



import jwt
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
    RoleCategory, Warning, LastReadPost, SupportTicket, SupportMessage  # ← ОБА
)
import logging
from fastapi.responses import JSONResponse
from performance import PerfMiddleware, get_perf_summary
import sql_profiler
import time
import asyncio
from fastapi import Response
from imageio_ffmpeg import get_ffmpeg_exe


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time-Ms", "X-Request-Id"],
)

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

logging.basicConfig(
    level=logging.DEBUG,  # 🆕 Было INFO
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

# 🆕 Логируем все необработанные исключения
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"❌ Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )

app.add_middleware(PerfMiddleware)



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


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Слишком много запросов. Подождите немного."},
    )


os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

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


def get_user_permissions(user: User, session: Session) -> list:
    """Получает разрешения пользователя (использует кэш ролей)"""
    if user.is_admin or user.is_system:
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
    if target.is_system and actor.is_admin:
        return 
        
    actor_lvl = get_user_level(actor, session)
    target_lvl = get_user_level(target, session)
    if target_lvl >= actor_lvl:
        raise HTTPException(
            status_code=403,
            detail=f"🛡️ Иммунитет: уровень цели ({target_lvl}) ≥ вашего ({actor_lvl}). Вы не можете {action}.",
        )


def protect_system_account(target: User, actor: User = None, action: str = "этого"):
    """Защищает System аккаунт, но позволяет Admin (Founder) управлять им"""
    if target.is_system:
        # Если действие выполняет Админ — разрешаем
        if actor and actor.is_admin:
            return  
        raise HTTPException(
            status_code=403,
            detail=f"🛡️ Системный аккаунт нельзя {action}.",
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
    if target.is_admin or target.is_moderator or target.is_system:
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
        "is_system": user.is_system,
        "role": role_data,
        "permissions": permissions,
        "level": get_user_level(user, session) if session else 1,
        "bio": user.bio,
        "last_seen": user.last_seen.isoformat() if user.last_seen else None,
        "cover_url": user.cover_url,
        "two_fa_enabled": user.totp_enabled,  # 🆕
        "email_linked": bool(user.email),      # 🆕
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
# ============================================================


























# ============================================================
# ⚠️ ПРЕДУПРЕЖДЕНИЯ (ПРАВО warn_users)
# ============================================================







# ============================================================
# 🎛️ АДМИНКА: УПРАВЛЕНИЕ СТИКЕР-ПАКАМИ (НОВАЯ МОДЕЛЬ)
# ============================================================








# ============================================================
# 💬 АДМИНКА: МОДЕРАЦИЯ ЧАТОВ (право manage_groups)
# ============================================================


# ============================================================
# 🗂️ КАТЕГОРИИ РОЛЕЙ (ГРУППЫ/ОТДЕЛЫ)
# ============================================================
















@app.on_event("startup")
def startup():
    init_db()

    # ===== ОСНОВНОЙ БЛОК МИГРАЦИЙ =====
    with engine.connect() as conn:
        try:


            conn.execute(text('ALTER TABLE notification ADD COLUMN IF NOT EXISTS message_id INTEGER REFERENCES message(id) ON DELETE SET NULL;'))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS support_message (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER NOT NULL REFERENCES supportticket(id) ON DELETE CASCADE,
                sender_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                text TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_support_message_ticket ON support_message(ticket_id, created_at);
            """))

            # ===== 🔐 2FA И EMAIL =====
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_secret VARCHAR;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS email VARCHAR(255);'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;'))
            conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_email ON "user"(email) WHERE email IS NOT NULL;'))

            # 🆕 E2EE: is_pending для ключей
            conn.execute(text('ALTER TABLE userkey ADD COLUMN IF NOT EXISTS is_pending BOOLEAN DEFAULT TRUE;'))
            conn.execute(text("UPDATE userkey SET is_pending = FALSE WHERE public_key NOT LIKE 'pending_%';"))

            # ===== 😂 СТИКЕРЫ И РЕАКЦИИ =====
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS sticker_pack (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(60) NOT NULL,
                    min_level INTEGER DEFAULT 1,
                    is_active BOOLEAN DEFAULT TRUE,
                    is_builtin BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS sticker (
                    id SERIAL PRIMARY KEY,
                    pack_id INTEGER NOT NULL REFERENCES sticker_pack(id) ON DELETE CASCADE,
                    type VARCHAR(10) NOT NULL,
                    content VARCHAR(500) NOT NULL,
                    "order" INTEGER DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_sticker_pack ON sticker(pack_id, "order");'))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS message_reaction (
                    id SERIAL PRIMARY KEY,
                    message_id INTEGER NOT NULL REFERENCES message(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                    sticker_id INTEGER REFERENCES sticker(id) ON DELETE CASCADE,
                    emoji VARCHAR(16),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text('ALTER TABLE message_reaction ADD COLUMN IF NOT EXISTS sticker_id INTEGER;'))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_reaction_unique ON message_reaction(message_id, user_id, COALESCE(sticker_id, 0), COALESCE(emoji, ''));"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_reaction_message ON message_reaction(message_id);"))

            # ===== 📖 ПОСЛЕДНИЙ ЧИТАЕМЫЙ ПОСТ =====
            conn.execute(text('DROP TABLE IF EXISTS readprogress;'))
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS lastreadpost (
                user_id INTEGER PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
                post_id INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
                saved_at TIMESTAMPTZ DEFAULT NOW()
            );
            """))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_lastreadpost_user ON lastreadpost(user_id);'))

            # ===== ЧАТЫ И СООБЩЕНИЯ =====
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

            # ===== ПОЛЬЗОВАТЕЛИ =====
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS cover_url VARCHAR;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS bio VARCHAR(500);'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS live_text_enabled BOOLEAN DEFAULT TRUE;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS live_text_broadcast BOOLEAN DEFAULT TRUE;'))

            # ===== ⚠️ ПРЕДУПРЕЖДЕНИЯ =====
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS warning (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
                issuer_id INTEGER NOT NULL REFERENCES "user"(id),
                reason VARCHAR(500) NOT NULL,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                expires_at TIMESTAMPTZ
            );
            """))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_warning_user ON warning(user_id, active);'))

            # ===== ПОСТЫ И РОЛИ =====
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

            # ===== 🗂️ КАТЕГОРИИ РОЛЕЙ =====
            conn.execute(text("""
            CREATE TABLE IF NOT EXISTS rolecategory (
                id SERIAL PRIMARY KEY,
                name VARCHAR(60) NOT NULL,
                color VARCHAR(20) DEFAULT '#8b5cf6',
                description VARCHAR(200),
                "order" INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            """))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES rolecategory(id) ON DELETE SET NULL;'))

            # ===== ДОПОЛНИТЕЛЬНЫЕ ТАБЛИЦЫ =====
            conn.execute(text('''CREATE TABLE IF NOT EXISTS pushsubscription (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
                endpoint VARCHAR UNIQUE NOT NULL,
                p256dh VARCHAR NOT NULL,
                auth VARCHAR NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );'''))
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
            # 🆕 ПОДДЕРЖКА: медиафайлы в сообщениях
            conn.execute(text('ALTER TABLE supportmessage ADD COLUMN IF NOT EXISTS media_url VARCHAR;'))
            conn.execute(text('ALTER TABLE supportmessage ADD COLUMN IF NOT EXISTS media_type VARCHAR;'))
                        # ===== 🎧 ПОДДЕРЖКА: разрешаем NULL в text =====
            conn.execute(text('ALTER TABLE supportmessage ALTER COLUMN text DROP NOT NULL;'))
            # ===== 🎨 ТЕМЫ =====
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS theme (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(80) NOT NULL,
                    type VARCHAR(20) NOT NULL,
                    colors TEXT DEFAULT '[]',
                    speed FLOAT DEFAULT 24.0,
                    intensity FLOAT DEFAULT 0.22,
                    blur INTEGER DEFAULT 80,
                    is_default BOOLEAN DEFAULT FALSE,
                    min_level INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_by INTEGER REFERENCES "user"(id),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_theme_active ON theme(is_active, min_level);"))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS system_setting (
                    key VARCHAR(50) PRIMARY KEY,
                    value TEXT DEFAULT '',
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
            """))
            conn.execute(text("""
                INSERT INTO system_setting (key, value) VALUES ('themes_enabled', 'false')
                ON CONFLICT (key) DO NOTHING;
            """))

            # ===== КАСКАДНОЕ УДАЛЕНИЕ =====
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
            conn.execute(text('ALTER TABLE updateread ADD CONSTRAINT updateread_update_id_fkey FOREIGN KEY (update_id) REFERENCES update(id) ON DELETE CASCADE;'))

            # ===== 🚀 ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ =====
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_author_created ON post(author_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_message_chat_id_desc ON message(chat_id, id DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_posttag_tag ON posttag(tag_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_notification_user_created ON notification(user_id, created_at DESC);'))
            conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username_lower ON "user" (LOWER(username));'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_user_display_name_lower ON "user" (LOWER(display_name));'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_bookmark_user_created ON bookmark(user_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_like_user_created ON "like"(user_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_follow_follower_followee ON follow(follower_id, followee_id);'))

            # Финальный коммит
            conn.commit()
            print("✅ Все миграции, таблицы и индексы успешно применены")

        except Exception as e:
            conn.rollback()
            print(f"⚠️ STARTUP MIGRATION ERROR: {e}")

    # ===== 🔧 ОТДЕЛЬНЫЙ БЛОК: добавление updated_at к supportticket =====
    with engine.connect() as conn:
        try:
            conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_name='supportticket' AND column_name='updated_at'
                ) THEN
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

    # ===== 🔄 СБРОС SEQUENCE И LOWERCASE USERNAMES =====
    with engine.connect() as conn:
        try:
            conn.execute(text('UPDATE "user" SET username = LOWER(username) WHERE username != LOWER(username);'))
            conn.execute(text("""
                SELECT setval(pg_get_serial_sequence('"user"', 'id'), COALESCE((SELECT MAX(id) FROM "user"), 0) + 1, false);
            """))
            conn.commit()
            print("✅ User ID sequence reset & usernames lowercased")
        except Exception as e:
            print(f"⚠️ STARTUP SEQUENCE ERROR: {e}")



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

# ---------- 2FA: НАСТРОЙКА ----------











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
# 🎧 АДМИНКА: СПИСОК ЗАЯВОК + ЗАКРЫТИЕ
# ============================================================


# ============================================================
# 🎧 ПОДДЕРЖКА: МНОЖЕСТВЕННЫЕ ЗАЯВКИ + ФОТО
# ============================================================


def get_reply_preview(session: Session, reply_to_id: int):
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
            "video_note": " Видеокружок",
            "gif": "🎞️ GIF",
        }
        preview_text = media_labels.get(original.media_type, " Вложение")
    return {
        "id": original.id,
        "sender_name": sender.display_name if sender else "Unknown",
        "sender_id": original.sender_id,
        "text": preview_text[:120],
        "media_type": original.media_type,
    }
