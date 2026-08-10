from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile, File, Form, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import Session, select, func, col
from sqlalchemy import text, update, delete
from typing import Optional
from fastapi.concurrency import run_in_threadpool


import jwt
import bcrypt
import os
import uuid
import re
import json
import cloudinary
import cloudinary.uploader
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
    IPLog, IPBlock, ActionLog, Bookmark, SiteRules, PostView, Update, UpdateRead 
)
import logging
from fastapi.responses import JSONResponse
from performance import PerfMiddleware, get_perf_summary
import sql_profiler
import time


# ============================================================
# 🚀 ГЛОБАЛЬНЫЕ КЭШИ (ускоряют работу в разы)
# ============================================================

_ip_block_cache = {}          # ip -> (timestamp, IPBlock|None)
_IP_BLOCK_CACHE_TTL = 300    # 5 минут

_role_cache = {}              # role_id -> (timestamp, Role|None)
_ROLE_CACHE_TTL = 600         # 10 минут

_popular_tags_cache = {}
_POPULAR_TAGS_TTL = 300  # 5 минут


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


# ============================================================
# 🚀 СОЗДАЁМ ПРИЛОЖЕНИЕ
# ============================================================

app = FastAPI(title="Nebula API")


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
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app.add_middleware(PerfMiddleware)


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


def get_current_user(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
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

    # Обновляем last_seen не чаще раза в 3 минуты (было 60 сек — спамили БД)
    now = datetime.now(timezone.utc)
    if not user.last_seen or (now - user.last_seen).total_seconds() > 180:
        user.last_seen = now
        session.add(user)
        session.commit()
        session.refresh(user)

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

def cascade_delete_post(post_id: int, session: Session):
    """
    Удаляет пост и всё дерево ответов.
    Было: куча запросов в циклах.
    Стало: 5-6 массовых запросов.
    """
    # 1. Собираем все ID в дереве (BFS/рекурсия)
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

    # 2. Собираем media_url ДО удаления постов
    posts_with_media = session.exec(
        select(Post).where(Post.id.in_(id_list))
    ).all()

    # 3. Массовое удаление лайков одним запросом
    for like in session.exec(select(Like).where(Like.post_id.in_(id_list))).all():
        session.delete(like)

    # 4. Массовое удаление тегов
    for pt in session.exec(select(PostTag).where(PostTag.post_id.in_(id_list))).all():
        session.delete(pt)

   # 5. Массовое удаление уведомлений
    for notif in session.exec(select(Notification).where(Notification.post_id.in_(id_list))).all():
        session.delete(notif)
        # 5.5. 🆕 Массовое удаление закладок — иначе внешний ключ не даст удалить пост
        for bm in session.exec(select(Bookmark).where(Bookmark.post_id.in_(id_list))).all():
            session.delete(bm)
            
        # 👇 ДОБАВЬ ВОТ ЭТОТ БЛОК (5.6) 👇
        # 5.6. 🆕 Массовое удаление просмотров — иначе внешний ключ не даст удалить пост
        for pv in session.exec(select(PostView).where(PostView.post_id.in_(id_list))).all():
            session.delete(pv)
        # 👆 КОНЕЦ ДОБАВЛЕНИЯ 👆


    # 6. Удаляем медиа
    for post in posts_with_media:
        if post.media_url:
            if "cloudinary.com" in post.media_url:
                try:
                    public_id = extract_cloudinary_public_id(post.media_url)
                    if public_id:
                        cloudinary.uploader.destroy(public_id, resource_type="auto")
                except Exception:
                    pass
            else:
                file_path = os.path.join("uploads", post.media_url.split("/")[-1])
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception:
                        pass

    # 7. Удаляем корневой пост — БД каскадно удалит все ответы
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


def get_user_level(user: User, session: Session) -> int:
    """
    Определяет уровень пользователя.
    Admin = 10, Developer = 9, Role.level = кастомный, Default = 1
    """
    if user.is_system:
        return 11
    if user.is_admin:
        return 10
    if user.is_moderator:
        return 9
    if user.role_id:
        role = get_role_cached(session, user.role_id)  # ← БЫЛО session.get
        if role and role.level:
            return role.level
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
    actor_lvl = get_user_level(actor, session)
    target_lvl = get_user_level(target, session)
    if target_lvl >= actor_lvl:
        raise HTTPException(
            status_code=403,
            detail=f"🛡️ Иммунитет: уровень цели ({target_lvl}) ≥ вашего ({actor_lvl}). Вы не можете {action}.",
        )


def protect_system_account(target: User, action: str = "этого"):
    """Защищает System аккаунт от любых санкций"""
    if target.is_system:
        raise HTTPException(
            status_code=403,
            detail=f"🛡️ Системный аккаунт нельзя {action}.",
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
            return {"name": role.name, "color": role.color}
    return None


def extract_tags(text: str) -> list:
    return list({t.lower() for t in re.findall(r"#(\w+)", text)})


def extract_mentions(text: str) -> list:
    return list({m.lower() for m in re.findall(r"@(\w+)", text)})





class RegisterIn(BaseModel):
    username: str
    display_name: str
    password: str


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



@app.get("/health")
def health_check():
    return {"status": "ok", "service": "nebula-api"}

@app.post("/api/register")
@limiter.limit("5/minute")
def register(request: Request, data: RegisterIn, session: Session = Depends(get_session)):
    if session.exec(select(User).where(User.username == data.username)).first():
        raise HTTPException(400, "Username already taken")
    user = User(
        username=data.username,
        display_name=data.display_name,
        password_hash=hash_password(data.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
        # Логируем IP регистрации
    ip = get_client_ip(request)
    session.add(IPLog(user_id=user.id, ip_address=ip, user_agent=request.headers.get("user-agent"), action="register"))
    session.commit()
    return {"token": create_token(user.id, user.token_version), "user": user_out(user, session)}


@app.post("/api/login")
@limiter.limit("5/minute")
def login(request: Request, data: LoginIn, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == data.username)).first()
    if not user or not check_password(data.password, user.password_hash):
        raise HTTPException(401, "Wrong username or password")
    if user.is_banned:
        raise HTTPException(403, "Account banned")
        # Логируем IP входа
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent")

    last_log = session.exec(
        select(IPLog)
        .where(IPLog.user_id == user.id)
        .order_by(IPLog.created_at.desc())
        .limit(1)
    ).first()

    # Вход с нового IP или устройства — предупреждаем пользователя
    if last_log and (last_log.ip_address != ip or last_log.user_agent != ua):
        session.add(Notification(
            user_id=user.id,
            actor_id=user.id,
            type="login_alert",
        ))
    session.add(IPLog(user_id=user.id, ip_address=ip, user_agent=request.headers.get("user-agent"), action="login"))
    log_action(session, user.id, "login", ip_address=ip)
    session.commit()
    return {"token": create_token(user.id, user.token_version), "user": user_out(user, session)}

@app.post("/api/me/logout-all")
def logout_all(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user.token_version += 1  # все старые токены становятся невалидными
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
    user.display_name = data.display_name
    if data.bio is not None:
        user.bio = data.bio.strip()[:500] if data.bio.strip() else None
    session.add(user)
    session.commit()
    session.refresh(user)
    return user_out(user, session)


@app.post("/api/me/password")
def change_password(
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
    
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, f"Файл слишком большой (максимум 10 МБ)")
    
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

    return [
        {**user_out(user_obj, session), "followers_count": count}
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

    # Поиск пользователей
    users = session.exec(
        select(User)
        .where(
            (func.lower(User.username).like(pattern))
            | (func.lower(User.display_name).like(pattern))
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

    if not posts:
        return {
            "users": [user_out(u, session) for u in users],
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
            "replies_count": replies_counts.get(p.id, 0),
        })

    return {
        "users": [user_out(u, session) for u in users],
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
        return {"following": False}
    follow = Follow(follower_id=user.id, followee_id=target.id)
    session.add(follow)
    notif = Notification(user_id=target.id, actor_id=user.id, type="follow")
    session.add(notif)
    session.commit()
    return {"following": True}


@app.get("/api/users/{identifier}/is-following")
def is_following(
    identifier: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    target = resolve_user(identifier, session)
    existing = session.exec(
        select(Follow).where(Follow.follower_id == user.id, Follow.followee_id == target.id)
    ).first()
    return {"following": existing is not None}


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
            query = query.where(Post.created_at < last_post.created_at)

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
            "liked_by_me": False,
            "replies_count": replies_counts.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
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
    
    return [user_out(u, session) for u in users]


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
    
    return [user_out(u, session) for u in users]


@app.get("/api/search")
@limiter.limit("20/minute")
def search(request: Request, q: str, session: Session = Depends(get_session)):
    if not q.strip():
        return {"users": [], "posts": []}

    pattern = f"%{q}%"

    users = session.exec(
        select(User).where(
            (User.username.like(pattern)) | (User.display_name.like(pattern))
        ).limit(10)
    ).all()

    posts = session.exec(
        select(Post).where(
            Post.text.like(pattern),
            Post.reply_to_id == None,
        ).order_by(Post.created_at.desc()).limit(20)
    ).all()

    if not posts:
        return {"users": [user_out(u, session) for u in users], "posts": []}

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
            "replies_count": replies_counts.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
        })

    return {"users": [user_out(u, session) for u in users], "posts": result_posts}

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
            query = query.where(Post.created_at < last_post.created_at)

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

    liked_ids = set(session.exec(
        select(Like.post_id).where(Like.user_id == user.id, Like.post_id.in_(post_ids))
    ).all())

    bookmarked_ids = set(session.exec(
        select(Bookmark.post_id).where(Bookmark.user_id == user.id, Bookmark.post_id.in_(post_ids))
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
            "liked_by_me": p.id in liked_ids,
            "bookmarked": p.id in bookmarked_ids,
            "replies_count": replies_counts.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
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
            "replies_count": 0,
            "views_count": p.views_count or 0,
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
            "replies_count": replies_counts.get(p.id, 0),
            "reply_to_id": p.reply_to_id,
            "parent": parent_info,
            "created_at": p.created_at.isoformat(),
        })

    return result


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
    
    if existing:
        session.delete(existing)
        session.commit()
        cnt = session.exec(
            select(func.count()).select_from(Like).where(Like.post_id == post_id)
        ).one()
        await manager.broadcast_to_followers(user.id, "post_liked", {"post_id": post_id, "likes_count": cnt}, session)
        return {"liked": False}
    
    like = Like(user_id=user.id, post_id=post_id)
    session.add(like)
    log_action(session, user.id, "like_post", target_type="post", target_id=post_id)
    
    post = session.get(Post, post_id)
    if post and post.author_id != user.id:
        notif = Notification(user_id=post.author_id, actor_id=user.id, type="like", post_id=post_id)
        session.add(notif)
    
    session.commit()
    cnt = session.exec(
        select(func.count()).select_from(Like).where(Like.post_id == post_id)
    ).one()
    await manager.broadcast_to_followers(user.id, "post_liked", {"post_id": post_id, "likes_count": cnt}, session)
    return {"liked": True}


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

    return {
        "chats_unread": chats_unread,
        "notifications_unread": notifications_unread,
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

    replies_map = dict(session.exec(
        select(Post.reply_to_id, func.count()).where(Post.reply_to_id.in_(post_ids)).group_by(Post.reply_to_id)
    ).all())

    # 4. Какие из них лайкнуты текущим пользователем
    liked_ids = set(session.exec(
        select(Like.post_id).where(Like.user_id == user.id, Like.post_id.in_(post_ids))
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
            "bookmarked": True,
            "replies_count": replies_map.get(post.id, 0),
            # ✅ ИСПРАВЛЕНО: заменили 'p' на 'post'
            "views_count": post.views_count or 0,
            # ✅ ИСПРАВЛЕНО: заменили 'p' на 'post' и добавили безопасный .isoformat() для времени
            "created_at": post.created_at.isoformat() if post.created_at else None,
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
    
    # 🆕 Каскадное удаление
    cascade_delete_post(post_id, session)
    log_action(
        session, user.id, "delete_post",
        target_type="post", target_id=post_id,
        details={"text": post.text[:100] if post.text else None},
        ip_address=get_client_ip(request),
    )
    session.commit()
    await manager.broadcast_all("post_deleted", {"post_id": post_id})
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
            query = query.where(Post.created_at < last_post.created_at)
    posts = session.exec(query.limit(limit)).all()

    if not posts:
        return {"posts": [], "has_more": False, "next_cursor": None}

    ids = [p.id for p in posts]

    # 🚀 5 запросов к БД вместо 60: авторы, лайки, ответы — всё оптом
    authors = session.exec(select(User).where(User.id.in_({p.author_id for p in posts}))).all()
    authors_map = {u.id: u for u in authors}

    likes_map = dict(session.exec(
        select(Like.post_id, func.count()).where(Like.post_id.in_(ids)).group_by(Like.post_id)
    ).all())

    replies_map = dict(session.exec(
        select(Post.reply_to_id, func.count()).where(Post.reply_to_id.in_(ids)).group_by(Post.reply_to_id)
    ).all())

    liked_ids = set()
    bookmarked_ids = set()
    if viewer:
        liked_ids = set(session.exec(
            select(Like.post_id).where(Like.user_id == viewer.id, Like.post_id.in_(ids))
        ).all())
        bookmarked_ids = set(session.exec(
            select(Bookmark.post_id).where(Bookmark.user_id == viewer.id, Bookmark.post_id.in_(ids))
        ).all())

    result = []
    for p in posts:
        author = authors_map.get(p.author_id)
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
            "liked_by_me": p.id in liked_ids,
            "bookmarked": p.id in bookmarked_ids,
            "replies_count": replies_map.get(p.id, 0),
            "created_at": p.created_at.isoformat(),
            "views_count": p.views_count or 0,
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
    text: str = Form(...),
    reply_to: Optional[int] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    media_url = None
    if file and file.filename:
        content = await file.read()
        if len(content) > 20 * 1024 * 1024:
            raise HTTPException(400, "File too large (max 20MB)")

        try:
            # Оборачиваем синхронный вызов в threadpool
            result = await run_in_threadpool(
                lambda: cloudinary.uploader.upload(
                    content,
                    folder=UPLOAD_FOLDER,
                    resource_type="auto",
                )
            )
            media_url = result.get("secure_url")
        except Exception as e:
            raise HTTPException(400, f"Upload failed: {str(e)}")
        
    post = Post(author_id=user.id, text=text, media_url=media_url, reply_to_id=reply_to)
    session.add(post)
    session.commit()
    session.refresh(post)

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
                user_id=mentioned.id,
                actor_id=user.id,
                type="mention",
                post_id=post.id,
            ))

    if reply_to:
        parent = session.get(Post, reply_to)
        if parent and parent.author_id != user.id:
            session.add(Notification(
                user_id=parent.author_id,
                actor_id=user.id,
                type="reply",
            ))

    log_action(
        session, user.id, "create_post",
        target_type="post", target_id=post.id,
        details={"text": post.text[:100] if post.text else None},
        ip_address=get_client_ip(request),
    )

    session.commit()



    # ⚡ Новый пост мгновенно у всех в ленте
    if not reply_to:
        await manager.broadcast_all("new_post", {
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
            "created_at": post.created_at.isoformat(),  # ← ДОБАВИТЬ
            "views_count": 0,
        })

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
        "created_at": post.created_at.isoformat(),  # ← ДОБАВИТЬ
        "views_count": 0,
    }


@app.get("/api/permissions")
def list_permissions():
    return [
        {"id": "delete_posts", "label": "Удалять посты"},
        {"id": "ban_users", "label": "Банить пользователей"},
        {"id": "remove_avatars", "label": "Удалять аватарки"},
        {"id": "assign_moderator", "label": "Назначать модераторов"},
        {"id": "manage_roles", "label": "Управлять ролями"},
        {"id": "manage_users", "label": "Доступ к панели управления"},
        {"id": "manage_reports", "label": "Управлять жалобами"},
        {"id": "tech_access", "label": "Доступ к технической панели"},
        {"id": "delete_users", "label": "Удалять аккаунты"},
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
            "replies_count": replies_map.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
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
            "position": r.position or 0,
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
    permissions: str = Form("[]"),
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
        position=position, permissions=permissions,
    )
    session.add(role)
    session.commit()
    session.refresh(role)
    invalidate_role_cache()
    return {
        "id": role.id, "name": role.name, "color": role.color, "level": role.level,
        "description": role.description, "is_staff": role.is_staff,
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
    permissions: Optional[str] = Form(None),
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
    if permissions:
        role.permissions = permissions

    session.add(role)
    session.commit()
    session.refresh(role)
    invalidate_role_cache()
    return {
        "id": role.id, "name": role.name, "color": role.color, "level": role.level,
        "description": role.description, "is_staff": role.is_staff,
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



@app.post("/api/users/{user_id}/role")
def assign_role(
    user_id: int,
    role_id: Optional[int] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    protect_system_account(target, "менять роль")
    
    # 🛡️ Нельзя трогать пользователя с уровнем >= своего
    if target.id != staff.id:
        check_hierarchy_or_403(staff, target, session, action="изменить роль этого пользователя")
    
    # Если назначается роль — проверяем её уровень
    if role_id:
        role = session.get(Role, role_id)
        if not role:
            raise HTTPException(404, "Role not found")
        max_lvl = max_level_for(staff, session)
        if role.level > max_lvl:
            raise HTTPException(
                status_code=403,
                detail=f"Нельзя назначить роль с уровнем {role.level} (ваш максимум: {max_lvl})"
            )
    
    target.role_id = role_id
    session.add(target)
    session.commit()
    return {"ok": True}


@app.get("/api/admin/users")
def admin_list_users(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
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

    result = []
    for u in users:
        data = user_out(u, session)
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
    protect_system_account(target, "банить")
    
    # Нельзя банить себя
    if target.id == admin.id:
        raise HTTPException(400, "Нельзя забанить самого себя")
        # 🛡️ Только Founder может трогать Founder
    if target.is_admin and not admin.is_admin:
        raise HTTPException(403, "Только Founder может применять санкции к Founder")
    
    # 🛡️ ПРОВЕРКА ИЕРАРХИИ
    check_hierarchy_or_403(admin, target, session, action="забанить этого пользователя")
    
    target.is_banned = not target.is_banned
    session.add(target)
    session.commit()
    log_action(session, admin.id, "ban_user" if target.is_banned else "unban_user",
               target_type="user", target_id=target.id,
               details={"username": target.username})
    session.commit()
    return {"is_banned": target.is_banned}


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
    
    protect_system_account(target, "удалять аватар")
    
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
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
):
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    protect_system_account(target, "менять статус")
    
    # 🛡️ Только админ может трогать других админов
    if target.is_admin and target.id != admin.id:
        raise HTTPException(403, "Cannot change another admin's status")
    
    target.is_moderator = not target.is_moderator
    session.add(target)
    session.commit()
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
    
    # 🆕 Каскадное удаление поста со всеми вложенными ответами
    cascade_delete_post(post_id, session)
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
def admin_delete_all_user_posts(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "delete_posts", session):
        raise HTTPException(403, "No permission: delete_posts")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.is_admin:
        raise HTTPException(403, "Cannot delete admin posts")
    
    # Находим все посты пользователя (ТОЛЬКО корни, не ответы)
    user_posts = session.exec(
        select(Post).where(Post.author_id == user_id, Post.reply_to_id == None)
    ).all()
    
    total_deleted = 0
    for post in user_posts:
        # 🆕 Каскадное удаление каждого поста с его деревом ответов
        total_deleted += cascade_delete_post(post.id, session)
    
    # Также удаляем ответы пользователя на чужие посты
    user_replies = session.exec(
        select(Post).where(Post.author_id == user_id, Post.reply_to_id != None)
    ).all()
    for reply in user_replies:
        # Удаляем только сам ответ (не трогая родительский пост)
        for like in session.exec(select(Like).where(Like.post_id == reply.id)).all():
            session.delete(like)
        for pt in session.exec(select(PostTag).where(PostTag.post_id == reply.id)).all():
            session.delete(pt)
        for notif in session.exec(select(Notification).where(Notification.post_id == reply.id)).all():
            session.delete(notif)
        for pv in session.exec(select(PostView).where(PostView.post_id == reply.id)).all():
            session.delete(pv)
        if reply.media_url and "cloudinary.com" in reply.media_url:
            try:
                public_id = extract_cloudinary_public_id(reply.media_url)
                if public_id:
                    cloudinary.uploader.destroy(public_id, resource_type="auto")
            except Exception:
                pass
        elif reply.media_url:
            file_path = os.path.join("uploads", reply.media_url.split("/")[-1])
            if os.path.exists(file_path):
                os.remove(file_path)
        session.delete(reply)
        total_deleted += 1
    
    log_action(
        session, staff.id, "delete_user_posts",
        target_type="user", target_id=user_id,
        details={"deleted_count": total_deleted},
    )
    session.commit()
    return {"ok": True, "deleted_count": total_deleted}

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
    top_followers = [
        {**user_out(u, session), "followers_count": count}
        for u, count in session.exec(top_followers_query).all()
    ]
    
    # Топ по постам — ОДИН запрос с JOIN
    top_posts_query = (
        select(User, func.count(Post.id).label("posts_count"))
        .outerjoin(Post, Post.author_id == User.id)
        .group_by(User.id)
        .order_by(func.count(Post.id).desc())
        .limit(5)
    )
    top_posts = [
        {**user_out(u, session), "posts_count": count}
        for u, count in session.exec(top_posts_query).all()
    ]
    
    # Последние регистрации
    recent_users = session.exec(
        select(User).order_by(User.created_at.desc()).limit(10)
    ).all()
    
    return {
        "total_users": total_users,
        "total_posts": total_posts,
        "total_likes": total_likes,
        "total_chats": total_chats,
        "top_followers": top_followers,
        "top_posts": top_posts,
        "recent_registrations": [
            {**user_out(u, session), "created_at": u.created_at.isoformat()}
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
    protect_system_account(target, "редактировать") 
    
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
        target.username = username
    
    # Смена display_name
    if display_name:
        if len(display_name.strip()) < 1 or len(display_name.strip()) > 50:
            raise HTTPException(400, "Display name: 1-50 символов")
        target.display_name = display_name.strip()
    
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
    protect_system_account(target, "менять аватар") 
    if target.is_admin:
        raise HTTPException(403, "Cannot edit admin account")
    
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        raise HTTPException(400, "Invalid image type")
    
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
    
    # 1. Массовый запрос чатов
    chats = session.exec(select(Chat).where(Chat.id.in_(chat_ids))).all()
    chats_map = {c.id: c for c in chats}
    
    # 2. Массовый запрос всех участников этих чатов
    all_members = session.exec(
        select(ChatMember).where(ChatMember.chat_id.in_(chat_ids))
    ).all()
    
    # Группируем по chat_id
    members_by_chat = {}
    other_member_ids = set()
    for m in all_members:
        if m.chat_id not in members_by_chat:
            members_by_chat[m.chat_id] = []
        members_by_chat[m.chat_id].append(m)
        if m.user_id != user.id:
            other_member_ids.add(m.user_id)
    
    # 3. Массовый запрос всех собеседников
    other_users = session.exec(
        select(User).where(User.id.in_(other_member_ids))
    ).all()
    users_map = {u.id: u for u in other_users}
    
    # 4. Массовый запрос последних сообщений
    from sqlalchemy.orm import aliased
    LatestMessage = aliased(Message)
    last_msgs_query = (
        select(Message)
        .where(Message.chat_id.in_(chat_ids))
        .order_by(Message.chat_id, Message.created_at.desc())
    )
    all_msgs = session.exec(last_msgs_query).all()
    
    # Берём только первое сообщение для каждого чата
    last_msgs_map = {}
    for msg in all_msgs:
        if msg.chat_id not in last_msgs_map:
            last_msgs_map[msg.chat_id] = msg
    
    # 5. Массовый запрос непрочитанных
    unread_counts = dict(session.exec(
        select(Message.chat_id, func.count(Message.id))
        .where(
            Message.chat_id.in_(chat_ids),
            Message.sender_id != user.id,
            Message.read == False
        )
        .group_by(Message.chat_id)
    ).all())
    
    result = []
    for chat_id in chat_ids:
        chat = chats_map.get(chat_id)
        if not chat:
            continue
        
        # Находим собеседника
        chat_members = members_by_chat.get(chat_id, [])
        other_member = next((m for m in chat_members if m.user_id != user.id), None)
        if not other_member:
            continue
        
        other = users_map.get(other_member.user_id)
        if not other:
            continue
        
        # Поиск по имени
        if q.strip():
            q_lower = q.lower()
            if (q_lower not in other.display_name.lower() and 
                q_lower not in other.username.lower()):
                continue
        
        last_msg = last_msgs_map.get(chat_id)
        unread = unread_counts.get(chat_id, 0)
        
        last_message_data = None
        if last_msg:
            if chat.is_secret:
                last_message_data = {
                    "text": "🔒 Секретное сообщение",
                    "is_encrypted": True,
                    "sender_id": last_msg.sender_id,
                    "created_at": last_msg.created_at.isoformat(),
                }
            else:
                if last_msg.text:
                    preview = last_msg.text[:50]
                elif last_msg.media_type == "image":
                    preview = "📷 Фото"
                elif last_msg.media_type == "gif":
                    preview = "🎭 GIF"
                elif last_msg.media_type == "video":
                    preview = "🎬 Видео"
                else:
                    preview = "Сообщение"
                last_message_data = {
                    "text": preview,
                    "is_encrypted": False,
                    "sender_id": last_msg.sender_id,
                    "created_at": last_msg.created_at.isoformat(),
                }
        
        result.append({
            "id": chat_id,
            "is_secret": chat.is_secret,
            "other": user_out(other, session),
            "last_message": last_message_data,
            "unread_count": unread,
        })
    
    result.sort(key=lambda x: (
        0 if x["unread_count"] > 0 else 1,
        -(datetime.fromisoformat(x["last_message"]["created_at"]).timestamp()) if x["last_message"] else 0,
    ))
    return result


@app.on_event("startup")
def startup():
    init_db()
    # Автоматическое добавление недостающих колонок
    with engine.connect() as conn:
        try:
            # 🚀 ИНДЕКСЫ ДЛЯ УСКОРЕНИЯ ЗАПРОСОВ
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_author ON post(author_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_reply ON post(reply_to_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_post_created ON post(created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_like_post ON "like"(post_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_follow_follower ON follow(follower_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_follow_followee ON follow(followee_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_postview_post ON postview(post_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_postview_viewer ON postview(viewer_hash);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, read);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_chatmember_user ON chatmember(user_id);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_message_chat ON message(chat_id, created_at);'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS cover_url VARCHAR;'))
            conn.execute(text('ALTER TABLE post ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;'))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;'))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS description VARCHAR;'))
            conn.execute(text('ALTER TABLE role ADD COLUMN IF NOT EXISTS is_staff BOOLEAN DEFAULT FALSE;'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS siterules (id SERIAL PRIMARY KEY, content TEXT NOT NULL DEFAULT \'{}\', updated_by INTEGER REFERENCES "user"(id), updated_at TIMESTAMPTZ DEFAULT NOW());'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_secret VARCHAR;'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;'))
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS is_secret BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS ciphertext TEXT;"))
            conn.execute(text('CREATE TABLE IF NOT EXISTS iplog (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES "user"(id), ip_address VARCHAR NOT NULL, user_agent VARCHAR, action VARCHAR, created_at TIMESTAMPTZ);'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS ipblock (id SERIAL PRIMARY KEY, ip_address VARCHAR UNIQUE NOT NULL, reason VARCHAR, blocked_by INTEGER REFERENCES "user"(id), created_at TIMESTAMPTZ, expires_at TIMESTAMPTZ);'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS actionlog (id SERIAL PRIMARY KEY, actor_id INTEGER REFERENCES "user"(id), action VARCHAR NOT NULL, target_type VARCHAR, target_id INTEGER, details VARCHAR, ip_address VARCHAR, created_at TIMESTAMPTZ);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_iplog_user ON iplog(user_id, created_at DESC);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_ipblock_ip ON ipblock(ip_address);'))
            conn.execute(text('CREATE INDEX IF NOT EXISTS idx_actionlog_created ON actionlog(created_at DESC);'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS bio VARCHAR(500);'))
            conn.execute(text('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;'))
            conn.execute(text('CREATE TABLE IF NOT EXISTS bookmark (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES "user"(id), post_id INTEGER REFERENCES post(id) ON DELETE CASCADE, created_at TIMESTAMPTZ, UNIQUE(user_id, post_id));'))

            conn.execute(text('CREATE TABLE IF NOT EXISTS updateread (user_id INTEGER REFERENCES "user"(id), update_id INTEGER REFERENCES "update"(id), read_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (user_id, update_id));'))

            # ===== КАСКАДНОЕ УДАЛЕНИЕ ДЛЯ POST =====
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

            conn.commit()
            print("✅ Post CASCADE constraints applied")
        except Exception as e:
            print(f"⚠️ STARTUP MIGRATION ERROR: {e}")
    
    # Системный аккаунт
    with Session(engine) as session:
        SYSTEM = session.exec(select(User).where(User.username == "System")).first()
        if not SYSTEM:
            session.add(User(
                username="System",
                display_name="SYSTEM",
                password_hash=hash_password("System"),
                is_system=True,
                is_admin=True, 
            ))
            session.commit()

@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not staff.is_admin:
        if not has_permission(staff, "tech_access", session) or not has_permission(staff, "delete_users", session):
            raise HTTPException(403, "No permission: delete_users")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    
    protect_system_account(target, "удалять")
    
    if target.id == staff.id:
        raise HTTPException(400, "Cannot delete your own account")
    
    if target.is_admin and not staff.is_admin:
        raise HTTPException(403, "Только Founder может удалить Founder")
    
    if target.is_moderator and staff.is_moderator and not staff.is_admin:
        raise HTTPException(403, "Developer не может удалить другого Developer")

    # Массовые удаления
    # 1. ActionLog
    for log in session.exec(select(ActionLog).where(ActionLog.actor_id == user_id)).all():
        session.delete(log)

    # 2. IPLog
    for ip_log in session.exec(select(IPLog).where(IPLog.user_id == user_id)).all():
        session.delete(ip_log)

    # 3. Bookmarks
    for bookmark in session.exec(select(Bookmark).where(Bookmark.user_id == user_id)).all():
        session.delete(bookmark)

    # 4. UserKey
    for key in session.exec(select(UserKey).where(UserKey.user_id == user_id)).all():
        session.delete(key)

    # 5. BugReport
    for bug in session.exec(select(BugReport).where(BugReport.reporter_id == user_id)).all():
        session.delete(bug)

    # 6. Посты с зависимостями
    posts = session.exec(select(Post).where(Post.author_id == user_id)).all()
    post_ids = [p.id for p in posts]
    
    if post_ids:
        # Массовое удаление лайков
        for like in session.exec(select(Like).where(Like.post_id.in_(post_ids))).all():
            session.delete(like)
        
        # Массовое удаление тегов
        for pt in session.exec(select(PostTag).where(PostTag.post_id.in_(post_ids))).all():
            session.delete(pt)
        
        # Массовое удаление уведомлений
        for notif in session.exec(select(Notification).where(Notification.post_id.in_(post_ids))).all():
            session.delete(notif)
            
        # 🆕 ДОБАВИТЬ ЭТО: Массовое удаление просмотров
        for pv in session.exec(select(PostView).where(PostView.post_id.in_(post_ids))).all():
            session.delete(pv)
            
        
        # Удаляем медиа и сами посты
        for post in posts:
            if post.media_url and "cloudinary.com" in post.media_url:
                try:
                    public_id = extract_cloudinary_public_id(post.media_url)
                    if public_id:
                        cloudinary.uploader.destroy(public_id, resource_type="auto")
                except Exception:
                    pass
            elif post.media_url:
                file_path = os.path.join("uploads", post.media_url.split("/")[-1])
                if os.path.exists(file_path):
                    os.remove(file_path)
            session.delete(post)

    # 7. Лайки пользователя
    for like in session.exec(select(Like).where(Like.user_id == user_id)).all():
        session.delete(like)

    # 8. Подписки
    for follow in session.exec(
        select(Follow).where((Follow.follower_id == user_id) | (Follow.followee_id == user_id))
    ).all():
        session.delete(follow)

    # 9. Уведомления
    for notif in session.exec(
        select(Notification).where((Notification.user_id == user_id) | (Notification.actor_id == user_id))
    ).all():
        session.delete(notif)

    # 10. Чаты
    memberships = session.exec(
        select(ChatMember).where(ChatMember.user_id == user_id)
    ).all()
    
    for membership in memberships:
        chat_id = membership.chat_id
        
        # Массовое удаление сообщений
        for msg in session.exec(select(Message).where(Message.chat_id == chat_id)).all():
            session.delete(msg)
        
        # Массовое удаление сессионных ключей
        for sk in session.exec(select(ChatSessionKey).where(ChatSessionKey.chat_id == chat_id)).all():
            session.delete(sk)
        
        # Массовое удаление участников
        for other_member in session.exec(
            select(ChatMember).where(ChatMember.chat_id == chat_id)
        ).all():
            session.delete(other_member)
        
        chat = session.get(Chat, chat_id)
        if chat:
            session.delete(chat)

    # 11. Жалобы
    for report in session.exec(select(Report).where(Report.reporter_id == user_id)).all():
        session.delete(report)
    
    for report in session.exec(
        select(Report).where(Report.target_type == "user", Report.target_id == user_id)
    ).all():
        session.delete(report)

    # 12. Снимаем роль
    target.role_id = None
    session.add(target)

    # 13. Удаляем аватарку и обложку
    if target.avatar_url and "cloudinary.com" in target.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(target.avatar_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
            
    # 🆕 ДОБАВЛЕНО: Удаляем обложку профиля
    if target.cover_url and "cloudinary.com" in target.cover_url:
        try:
            public_id = extract_cloudinary_public_id(target.cover_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
            
    session.delete(target)
    
    log_action(session, staff.id, "delete_user",
        target_type="user", target_id=target.id,
        details={"username": target.username, "deleted_posts": len(posts)})
    session.commit()
    
    return {
        "ok": True,
        "deleted_username": target.username,
        "deleted_posts": len(posts),
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
    my_chats = session.exec(
        select(ChatMember.chat_id).where(ChatMember.user_id == user.id)
    ).all()
    for chat_id in my_chats:
        chat = session.get(Chat, chat_id)
        # 🆕 Пропускаем секретные чаты — "Написать" открывает только обычный
        if chat and chat.is_secret:
            continue
        other_in_chat = session.exec(
            select(ChatMember).where(
                ChatMember.chat_id == chat_id,
                ChatMember.user_id == other_user_id,
            )
        ).first()
        if other_in_chat:
            return {"chat_id": chat_id}
    chat = Chat()
    session.add(chat)
    session.commit()
    session.refresh(chat)
    session.add(ChatMember(chat_id=chat.id, user_id=user.id))
    session.add(ChatMember(chat_id=chat.id, user_id=other_user_id))
    session.commit()
    return {"chat_id": chat.id}



# ---------- E2EE: КЛЮЧИ ----------

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
def register_public_key(
    public_key: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    import hashlib
    fingerprint = hashlib.sha256(public_key.encode()).hexdigest()[:16]
    
    existing = session.exec(select(UserKey).where(UserKey.user_id == user.id)).first()
    if existing:
        existing.public_key = public_key
        existing.fingerprint = fingerprint
        session.add(existing)
    else:
        key = UserKey(user_id=user.id, public_key=public_key, fingerprint=fingerprint)
        session.add(key)
    session.commit()
    return {"ok": True, "fingerprint": fingerprint}


@app.get("/api/users/{user_id}/public-key")
def get_user_public_key(user_id: int, session: Session = Depends(get_session)):
    key = session.exec(select(UserKey).where(UserKey.user_id == user_id)).first()
    if not key:
        raise HTTPException(404, "У пользователя нет ключа")
    return {"public_key": key.public_key, "fingerprint": key.fingerprint}


# ---------- E2EE: SESSION KEYS ----------

@app.post("/api/chats/{chat_id}/session-key")
def store_session_key(
    chat_id: int,
    recipient_id: int = Form(...),
    encrypted_session_key: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Проверяем, что оба в чате
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


# ---------- E2EE: СОЗДАНИЕ СЕКРЕТНОГО ЧАТА ----------

@app.post("/api/chats/secret")
async def create_secret_chat(
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создаёт секретный чат. Принимает other_user_id из query, form или JSON."""
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

    my_key = session.exec(select(UserKey).where(UserKey.user_id == user.id)).first()
    other_key = session.exec(select(UserKey).where(UserKey.user_id == other_user_id)).first()
    if not my_key or not other_key:
        raise HTTPException(400, "У одного из пользователей нет ключа")

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
    session.commit()

    return {"chat_id": chat.id, "already_existed": False}




@app.post("/api/chats/{chat_id}/messages")
@limiter.limit("30/minute")
async def send_message_v2(
    request: Request,
    chat_id: int,
    text: str = Form(""),
    ciphertext: str = Form(""),  # для секретных чатов
    file: Optional[UploadFile] = File(None),
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
    
    media_url = None
    media_type = None
    
    # Медиа пока не шифруем (отдельная большая задача)
    if file and file.filename:
        ext = os.path.splitext(file.filename or "")[1].lower()
        content = await file.read()
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
            if resource_type == "video":
                media_type = "video"
            elif ext == ".gif":
                media_type = "gif"
            else:
                media_type = "image"
        except Exception as e:
            raise HTTPException(400, f"Upload failed: {str(e)}")
    
    # Для секретных чатов: text должен быть пустым, ciphertext — заполнен
    if chat.is_secret:
        if not ciphertext.strip() and not media_url:
            raise HTTPException(400, "Пустое сообщение")
        if text.strip():
            raise HTTPException(400, "В секретных чатах нельзя отправлять plain text")
    else:
        if not text.strip() and not media_url:
            raise HTTPException(400, "Пустое сообщение")
    
    msg = Message(
        chat_id=chat_id,
        sender_id=user.id,
        text=text.strip() if text else None,
        ciphertext=ciphertext.strip() if ciphertext else None,
        media_url=media_url,
        media_type=media_type,
    )
    session.add(msg)
    
    # Уведомление
    other = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id != user.id)
    ).first()
    if other:
        notif = Notification(user_id=other.user_id, actor_id=user.id, type="message")
        session.add(notif)
    
    session.commit()
    session.refresh(msg)

        # 🆕 Рассылаем новое сообщение через WebSocket
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
            "created_at": msg.created_at.isoformat(),
        },
        session,
    )
    
    
    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "text": msg.text,
        "ciphertext": msg.ciphertext,
        "media_url": msg.media_url,
        "media_type": msg.media_type,
        "read": msg.read,
        "created_at": msg.created_at.isoformat(),
    }


@app.get("/api/chats/{chat_id}/messages")
def get_messages_v2(
    chat_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    member = session.exec(
        select(ChatMember).where(ChatMember.chat_id == chat_id, ChatMember.user_id == user.id)
    ).first()
    if not member:
        raise HTTPException(403, "Не участник чата")

    messages = session.exec(
        select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at)
    ).all()

    if not messages:
        return []

    # Массовый запрос всех авторов
    sender_ids = list({msg.sender_id for msg in messages})
    senders = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(sender_ids))
        ).all()
    }

    result = []
    for msg in messages:
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
            "read": msg.read,
            "edited": msg.edited,
            "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
            "created_at": msg.created_at.isoformat(),
        })
    return result

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
    if msg.sender_id != user.id and not user.is_admin:
        raise HTTPException(403, "You can only delete your own messages")
    
    session.delete(msg)
    session.commit()
    
    return {"ok": True}


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
def mark_chat_read(
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

    # ОДИН массовый UPDATE вместо N загрузок + N коммитов
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
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Not a member of this chat")
    
    other_member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == chat_id,
            ChatMember.user_id != user.id,
        )
    ).first()
    if not other_member:
        raise HTTPException(404, "Other member not found")
    
    other = session.get(User, other_member.user_id)
    return user_out(other, session)


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

        member_data = {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "avatar_url": u.avatar_url,
            "is_admin": u.is_admin,
            "is_moderator": u.is_moderator,
            "is_system": u.is_system,
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
            "reporter": user_out(reporter, session) if reporter else None,
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
def resolve_report(
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



    # Выполняем действие
    if action == "delete_post" and report.target_type == "post":
        if not has_permission(staff, "delete_posts", session):
            raise HTTPException(403, "No permission: delete_posts")
        
        post = session.get(Post, report.target_id)
        if post:
            # ✅ ЗАМЕНИЛИ 15 строк ручного удаления на одну надежную функцию:
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
            if target and not target.is_admin:
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
    
    result = []
    for bug in bugs:
        reporter = session.get(User, bug.reporter_id)
        resolver = session.get(User, bug.resolved_by) if bug.resolved_by else None
        
        result.append({
            "id": bug.id,
            "reporter": user_out(reporter, session) if reporter else None,
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
    return get_user_posts(str(user.id), cursor, limit, session)


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
def create_update(
    request: Request,
    title: str = Form(...),
    content: str = Form(...),
    importance: str = Form("minor"),
    user: User = Depends(require_founder),
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
    return {"ok": True, "id": update.id}


@app.delete("/api/updates/{update_id}")
def delete_update(
    update_id: int,
    user: User = Depends(require_founder),
    session: Session = Depends(get_session),
):
    update = session.get(Update, update_id)
    if not update:
        raise HTTPException(404, "Update not found")
    
    # 🆕 Сначала удаляем записи о прочтении этого обновления, чтобы избежать ошибки внешнего ключа
    session.exec(delete(UpdateRead).where(UpdateRead.update_id == update_id))
    
    # Теперь смело удаляем само обновление
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


@app.post("/api/posts/{post_id}/view")
def track_view(request: Request, post_id: int, session: Session = Depends(get_session)):
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    
    token = request.headers.get("Authorization", "")
    if token.startswith("Bearer "):
        try:
            payload = jwt.decode(token.split(" ", 1)[1], SECRET, algorithms=[ALGORITHM])
            viewer_hash = f"u{payload['sub']}"
        except Exception:
            viewer_hash = f"ip:{get_client_ip(request)}"
    else:
        viewer_hash = f"ip:{get_client_ip(request)}"
    
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
    
    return {"views": post.views_count}

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