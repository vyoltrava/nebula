from fastapi import FastAPI, Depends, Header, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import Session, select, func
from sqlalchemy import text
from typing import Optional
import jwt
import bcrypt
import os
import uuid
import re
import json
import cloudinary
import cloudinary.uploader
import cloudinary.api

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.responses import JSONResponse
from cloudinary_config import UPLOAD_FOLDER
from datetime import datetime, timedelta, timezone
from database import init_db, get_session, engine
from models import User, Post, Like, Follow, Notification, Tag, PostTag, Role, Chat, ChatMember, Message, Report
from models import UserKey, ChatSessionKey  # добавить UserKey и ChatSessionKey

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
    expose_headers=["*"],
)

# Rate limiter — ВТОРОЙ
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

# Кастомный обработчик ошибок 429
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


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(user_id: int) -> str:
    payload = {"sub": str(user_id), "exp": datetime.now(timezone.utc) + timedelta(days=7)}
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
    if user.is_banned:
        raise HTTPException(403, "Account banned")
    return user


def cascade_delete_post(post_id: int, session: Session):
    """
    Удаляет пост. Благодаря ON DELETE CASCADE в БД все ответы удалятся автоматически.
    Здесь только зачищаем лайки, теги, уведомления и медиа.
    """
    # Собираем все ID в дереве (для зачистки зависимостей)
    ids_to_clean = {post_id}
    changed = True
    while changed:
        changed = False
        children = session.exec(
            select(Post).where(Post.reply_to_id.in_(list(ids_to_clean)))
        ).all()
        for child in children:
            if child.id not in ids_to_clean:
                ids_to_clean.add(child.id)
                changed = True
    
    # 1. Зачищаем лайки
    for pid in ids_to_clean:
        for like in session.exec(select(Like).where(Like.post_id == pid)).all():
            session.delete(like)
    
    # 2. Зачищаем теги
    for pid in ids_to_clean:
        for pt in session.exec(select(PostTag).where(PostTag.post_id == pid)).all():
            session.delete(pt)
    
    # 3. Зачищаем уведомления
    for pid in ids_to_clean:
        for notif in session.exec(select(Notification).where(Notification.post_id == pid)).all():
            session.delete(notif)
    
    # 4. Удаляем медиа из Cloudinary
    for pid in ids_to_clean:
        post = session.get(Post, pid)
        if post and post.media_url:
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
                    os.remove(file_path)
    
    # 5. Удаляем ТОЛЬКО корневой пост — БД сама удалит все ответы каскадно
    root_post = session.get(Post, post_id)
    if root_post:
        session.delete(root_post)
    
    return len(ids_to_clean)


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


ALL_PERMISSIONS = [
    "delete_posts",
    "ban_users",
    "remove_avatars",
    "assign_moderator",
    "manage_roles",
    "manage_users",
    "manage_reports",
    "tech_access",
    "delete_users",  # ← новое право для удаления аккаунтов
]
# 🆕 Системный Moderator (Developer) имеет все права, как Founder
# Защита иерархии через levels не даст трогать Founder и других Moderator
MODERATOR_PERMISSIONS = ALL_PERMISSIONS.copy()


def get_user_permissions(user: User, session: Session) -> list:
    if user.is_admin:
        return ALL_PERMISSIONS.copy()
    permissions = []
    if user.is_moderator:
        permissions.extend(MODERATOR_PERMISSIONS)
    if user.role_id:
        role = session.get(Role, user.role_id)
        if role:
            role_perms = json.loads(role.permissions)
            for p in role_perms:
                if p not in permissions:
                    permissions.append(p)
    return permissions


def has_permission(user: User, permission: str, session: Session) -> bool:
    if user.is_admin:
        return True
    return permission in get_user_permissions(user, session)



# ============================================================
# 🛡️ СИСТЕМА ИЕРАРХИИ (LEVELS)
# ============================================================

def get_user_level(user: User, session: Session) -> int:
    """
    Определяет уровень пользователя.
    Admin = 10, Developer = 9, Role.level = кастомный, Default = 1
    """
    if user.is_system:    # ← System выше всех
        return 11
    if user.is_admin:
        return 10
    if user.is_moderator:
        return 9
    if user.role_id:
        role = session.get(Role, user.role_id)
        if role and role.level:
            return role.level
    return 1


def can_moderate(actor: User, target: User, session: Session) -> bool:
    """Может ли actor применять санкции к target (уровень actor > уровня target)"""
    return get_user_level(actor, session) > get_user_level(target, session)


def max_level_for(actor: User, session: Session) -> int:
    """Максимальный уровень роли, которую может создавать/редактировать пользователь"""
    if actor.is_admin:
        return 8  # Admin может создавать роли до 8 уровня (9=Mod, 10=Admin — системные)
    actor_lvl = get_user_level(actor, session)
    return actor_lvl - 1


def check_hierarchy_or_403(actor: User, target: User, session: Session, action: str = "этого"):
    """Проверяет иерархию и выбрасывает 403, если нельзя"""
    actor_lvl = get_user_level(actor, session)
    target_lvl = get_user_level(target, session)
    if target_lvl >= actor_lvl:
        raise HTTPException(
            status_code=403,
            detail=f"🛡️ Иммунитет: уровень цели ({target_lvl}) ≥ вашего ({actor_lvl}). Вы не можете {action}."
        )

def protect_system_account(target: User, action: str = "этого"):
    """Защищает System аккаунт от любых санкций"""
    if target.is_system:
        raise HTTPException(
            status_code=403,
            detail=f"🛡️ Системный аккаунт нельзя {action}."
        )


def user_out(user: User, session: Session = None) -> dict:
    role_data = None
    permissions = []
    if session:
        permissions = get_user_permissions(user, session)
        if user.role_id:
            role = session.get(Role, user.role_id)
            if role:
                role_data = {
                    "id": role.id,
                    "name": role.name,
                    "color": role.color,
                    "level": role.level,  # 🆕
                    "permissions": json.loads(role.permissions),
                }
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
        "level": get_user_level(user, session) if session else 1,  # 🆕
    }


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
    if user.role_id:
        role = session.get(Role, user.role_id)
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


class UpdateUserIn(BaseModel):
    display_name: str


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str


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
    return {"token": create_token(user.id), "user": user_out(user, session)}


@app.post("/api/login")
@limiter.limit("5/minute")
def login(request: Request, data: LoginIn, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == data.username)).first()
    if not user or not check_password(data.password, user.password_hash):
        raise HTTPException(401, "Wrong username or password")
    if user.is_banned:
        raise HTTPException(403, "Account banned")
    return {"token": create_token(user.id), "user": user_out(user, session)}


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
        result = cloudinary.uploader.upload(
            content,
            folder=UPLOAD_FOLDER,
            resource_type="image",
            transformation=[{"width": 400, "height": 400, "crop": "fill"}],
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

@app.get("/api/users/recommended")
def recommended_users(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    follows = session.exec(select(Follow).where(Follow.follower_id == user.id)).all()
    followed_ids = {f.followee_id for f in follows}
    users = session.exec(select(User).where(User.is_banned == False)).all()
    result = []
    for u in users:
        if u.id == user.id or u.id in followed_ids:
            continue
        followers = session.exec(
            select(func.count()).select_from(Follow).where(Follow.followee_id == u.id)
        ).one()
        result.append({**user_out(u, session), "followers_count": followers})
    result.sort(key=lambda x: x["followers_count"], reverse=True)
    return result[:5]

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
    
    # Формируем результат для постов
    result_posts = []
    for p in posts:
        author = session.get(User, p.author_id)
        likes_count = session.exec(
            select(func.count()).select_from(Like).where(Like.post_id == p.id)
        ).one()
        replies_count = session.exec(
            select(func.count()).select_from(Post).where(Post.reply_to_id == p.id)
        ).one()
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
            "likes_count": likes_count,
            "liked_by_me": False,
            "replies_count": replies_count,
        })
    
    # Возвращаем объект с двумя ключами (как ожидает фронтенд)
    return {
        "users": [user_out(u, session) for u in users],
        "posts": result_posts
    }


@app.post("/api/users/{user_id}/follow")
@limiter.limit("20/minute")
def toggle_follow(
    request: Request,
    user_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if user_id == user.id:
        raise HTTPException(400, "Cannot follow yourself")
    existing = session.exec(
        select(Follow).where(Follow.follower_id == user.id, Follow.followee_id == user_id)
    ).first()
    if existing:
        session.delete(existing)
        session.commit()
        return {"following": False}
    follow = Follow(follower_id=user.id, followee_id=user_id)
    session.add(follow)
    notif = Notification(user_id=user_id, actor_id=user.id, type="follow")
    session.add(notif)
    session.commit()
    return {"following": True}


@app.get("/api/users/{user_id}/is-following")
def is_following(
    user_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(Follow).where(Follow.follower_id == user.id, Follow.followee_id == user_id)
    ).first()
    return {"following": existing is not None}


@app.get("/api/users/{user_id}")
def get_user_profile(user_id: int, session: Session = Depends(get_session)):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    followers_count = session.exec(
        select(func.count()).select_from(Follow).where(Follow.followee_id == user_id)
    ).one()
    following_count = session.exec(
        select(func.count()).select_from(Follow).where(Follow.follower_id == user_id)
    ).one()
    posts_count = session.exec(
        select(func.count()).select_from(Post)
        .where(Post.author_id == user_id, Post.reply_to_id == None)
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


@app.get("/api/users/{user_id}/posts")
def get_user_posts(
    user_id: int,
    cursor: Optional[int] = None,
    limit: int = 20,
    session: Session = Depends(get_session),
):
    query = (
        select(Post)
        .where(Post.author_id == user_id, Post.reply_to_id == None)
        .order_by(Post.created_at.desc())
    )
    
    if cursor:
        last_post = session.get(Post, cursor)
        if last_post:
            query = query.where(Post.created_at < last_post.created_at)
    
    posts = session.exec(query.limit(limit)).all()
    
    result = []
    for p in posts:
        author = session.get(User, p.author_id)
        likes_count = session.exec(
            select(func.count()).select_from(Like).where(Like.post_id == p.id)
        ).one()
        replies_count = session.exec(
            select(func.count()).select_from(Post).where(Post.reply_to_id == p.id)
        ).one()
        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name,
            "handle": f"@{author.username}",
            "author_avatar": author.avatar_url,
            "author_is_admin": author.is_admin,
            "author_is_moderator": author.is_moderator,
            "author_is_banned": author.is_banned,
            "author_role": get_author_role(author, session),
            "text": p.text,
            "media_url": p.media_url,
            "likes_count": likes_count,
            "liked_by_me": False,
            "replies_count": replies_count,
        })
    
    has_more = len(posts) == limit
    
    return {
        "posts": result,
        "has_more": has_more,
        "next_cursor": posts[-1].id if posts else None,
    }


@app.get("/api/users/{user_id}/followers")
def get_followers(user_id: int, session: Session = Depends(get_session)):
    follows = session.exec(
        select(Follow).where(Follow.followee_id == user_id)
    ).all()
    result = []
    for f in follows:
        user = session.get(User, f.follower_id)
        if user:
            result.append(user_out(user, session))
    return result


@app.get("/api/users/{user_id}/following")
def get_following(user_id: int, session: Session = Depends(get_session)):
    follows = session.exec(
        select(Follow).where(Follow.follower_id == user_id)
    ).all()
    result = []
    for f in follows:
        user = session.get(User, f.followee_id)
        if user:
            result.append(user_out(user, session))
    return result


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
    result_posts = []
    for p in posts:
        author = session.get(User, p.author_id)
        likes_count = session.exec(
            select(func.count()).select_from(Like).where(Like.post_id == p.id)
        ).one()
        replies_count = session.exec(
            select(func.count()).select_from(Post).where(Post.reply_to_id == p.id)
        ).one()
        result_posts.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name,
            "handle": f"@{author.username}",
            "author_avatar": author.avatar_url,
            "author_is_admin": author.is_admin,
            "author_is_moderator": author.is_moderator,
            "author_is_banned": author.is_banned,
            "author_role": get_author_role(author, session),
            "text": p.text,
            "media_url": p.media_url,
            "likes_count": likes_count,
            "liked_by_me": False,
            "replies_count": replies_count,
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
    
    result = []
    for p in posts:
        author = session.get(User, p.author_id)
        likes_count = session.exec(
            select(func.count()).select_from(Like).where(Like.post_id == p.id)
        ).one()
        replies_count = session.exec(
            select(func.count()).select_from(Post).where(Post.reply_to_id == p.id)
        ).one()
        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name,
            "handle": f"@{author.username}",
            "author_avatar": author.avatar_url,
            "author_is_admin": author.is_admin,
            "author_is_moderator": author.is_moderator,
            "author_is_banned": author.is_banned,
            "author_role": get_author_role(author, session),
            "text": p.text,
            "media_url": p.media_url,
            "likes_count": likes_count,
            "liked_by_me": False,
            "replies_count": replies_count,
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
    result = []
    for p in posts:
        author = session.get(User, p.author_id)
        likes_count = session.exec(
            select(func.count()).select_from(Like).where(Like.post_id == p.id)
        ).one()
        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name,
            "handle": f"@{author.username}",
            "author_avatar": author.avatar_url,
            "author_is_admin": author.is_admin,
            "author_is_moderator": author.is_moderator,
            "author_is_banned": author.is_banned,
            "author_role": get_author_role(author, session),
            "text": p.text,
            "media_url": p.media_url,
            "likes_count": likes_count,
            "liked_by_me": True,
            "replies_count": 0,
        })
    return result


@app.get("/api/posts/{post_id}/replies")
def get_replies(post_id: int, session: Session = Depends(get_session)):
    """Получить все ответы на пост (включая вложенные)"""
    # Получаем ВСЕ ответы, связанные с этим постом (прямо или косвенно)
    all_replies = session.exec(
        select(Post).order_by(Post.created_at.asc())
    ).all()
    
    # Фильтруем только те, что относятся к этому посту
    post_replies = []
    post_ids_in_thread = {post_id}  # ID поста + всех его потомков
    
    # Первый проход: находим прямые ответы на пост
    for p in all_replies:
        if p.reply_to_id == post_id:
            post_ids_in_thread.add(p.id)
            post_replies.append(p)
    
    # Второй проход: находим ответы на ответы (рекурсивно)
    changed = True
    while changed:
        changed = False
        for p in all_replies:
            if p.reply_to_id in post_ids_in_thread and p.id not in post_ids_in_thread:
                post_ids_in_thread.add(p.id)
                post_replies.append(p)
                changed = True
    
    result = []
    for p in post_replies:
        author = session.get(User, p.author_id)
        likes_count = session.exec(
            select(func.count()).select_from(Like).where(Like.post_id == p.id)
        ).one()
        
        # 🆕 Определяем, на кого/что это ответ
        parent_info = None
        if p.reply_to_id and p.reply_to_id != post_id:
            parent_post = session.get(Post, p.reply_to_id)
            if parent_post:
                parent_author = session.get(User, parent_post.author_id)
                if parent_author:
                    parent_info = {
                        "id": parent_post.id,
                        "author_id": parent_author.id,
                        "author_name": parent_author.display_name,
                        "author_username": parent_author.username,
                    }
        
        # Подсчитываем количество прямых ответов на этот комментарий
        replies_count = session.exec(
            select(func.count()).select_from(Post).where(Post.reply_to_id == p.id)
        ).one()
        
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
            "likes_count": likes_count,
            "liked_by_me": False,
            "replies_count": replies_count,
            "reply_to_id": p.reply_to_id,  # 🆕 ID родителя
            "parent": parent_info,          # 🆕 Инфо о родителе
            "created_at": p.created_at.isoformat(),
        })
    
    # Сортируем по времени создания
    result.sort(key=lambda x: x["created_at"])
    
    return result


@app.post("/api/posts/{post_id}/like")
@limiter.limit("30/minute")
def toggle_like(
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
        return {"liked": False}
    like = Like(user_id=user.id, post_id=post_id)
    session.add(like)
    post = session.get(Post, post_id)
    if post and post.author_id != user.id:
        notif = Notification(
            user_id=post.author_id,
            actor_id=user.id,
            type="like",
            post_id=post_id,
        )
        session.add(notif)
    session.commit()
    return {"liked": True}


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
def delete_post(
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
    session.commit()
    return {"ok": True}


@app.get("/api/posts")
def get_posts(
    cursor: Optional[int] = None,
    limit: int = 20,
    session: Session = Depends(get_session),
):
    query = select(Post).where(Post.reply_to_id == None).order_by(Post.created_at.desc())
    
    if cursor:
        last_post = session.get(Post, cursor)
        if last_post:
            query = query.where(Post.created_at < last_post.created_at)
    
    posts = session.exec(query.limit(limit)).all()
    
    result = []
    for p in posts:
        author = session.get(User, p.author_id)
        likes_count = session.exec(
            select(func.count()).select_from(Like).where(Like.post_id == p.id)
        ).one()
        replies_count = session.exec(
            select(func.count()).select_from(Post).where(Post.reply_to_id == p.id)
        ).one()
        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name,
            "handle": f"@{author.username}",
            "author_avatar": author.avatar_url,
            "author_is_admin": author.is_admin,
            "author_is_moderator": author.is_moderator,
            "author_is_banned": author.is_banned,
            "author_role": get_author_role(author, session),
            "text": p.text,
            "media_url": p.media_url,
            "likes_count": likes_count,
            "liked_by_me": False,
            "replies_count": replies_count,
        })
    
    has_more = len(posts) == limit
    
    return {
        "posts": result,
        "has_more": has_more,
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
            result = cloudinary.uploader.upload(
                content,
                folder=UPLOAD_FOLDER,
                resource_type="auto",
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

    session.commit()

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
    rows = session.exec(
        select(PostTag.tag_id, func.count().label("cnt"))
        .group_by(PostTag.tag_id)
        .order_by(func.count().desc())
        .limit(10)
    ).all()
    result = []
    for tag_id, cnt in rows:
        tag = session.get(Tag, tag_id)
        if tag:
            result.append({"name": tag.name, "count": cnt})
    return result


@app.get("/api/tags/{tag_name}/posts", response_model=list[PostOut])
def tag_posts(tag_name: str, session: Session = Depends(get_session)):
    tag = session.exec(select(Tag).where(Tag.name == tag_name.lower())).first()
    if not tag:
        return []
    links = session.exec(select(PostTag).where(PostTag.tag_id == tag.id)).all()
    post_ids = [l.post_id for l in links]
    if not post_ids:
        return []
    posts = session.exec(
        select(Post).where(Post.id.in_(post_ids)).order_by(Post.created_at.desc())
    ).all()
    result = []
    for p in posts:
        author = session.get(User, p.author_id)
        likes_count = session.exec(
            select(func.count()).select_from(Like).where(Like.post_id == p.id)
        ).one()
        replies_count = session.exec(
            select(func.count()).select_from(Post).where(Post.reply_to_id == p.id)
        ).one()
        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name,
            "handle": f"@{author.username}",
            "author_avatar": author.avatar_url,
            "author_is_admin": author.is_admin,
            "author_is_moderator": author.is_moderator,
            "author_is_banned": author.is_banned,
            "author_role": get_author_role(author, session),
            "text": p.text,
            "media_url": p.media_url,
            "likes_count": likes_count,
            "liked_by_me": False,
            "replies_count": replies_count,
        })
    return result


@app.get("/api/roles")
def list_roles(session: Session = Depends(get_session)):
    roles = session.exec(select(Role).order_by(Role.created_at.desc())).all()
    result = []
    for r in roles:
        result.append({
            "id": r.id,
            "name": r.name,
            "color": r.color,
            "level": r.level,  # 🆕
            "permissions": json.loads(r.permissions),
        })
    return result


@app.post("/api/roles")
def create_role(
    name: str = Form(...),
    color: str = Form("#8b5cf6"),
    level: int = Form(1),  # 🆕
    permissions: str = Form("[]"),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")
    
    # 🛡️ Проверка: нельзя создать роль с уровнем >= своего
    max_lvl = max_level_for(staff, session)
    if level < 1 or level > max_lvl:
        raise HTTPException(
            status_code=403,
            detail=f"Вы можете создавать роли только с уровнем от 1 до {max_lvl}"
        )
    
    if session.exec(select(Role).where(Role.name == name)).first():
        raise HTTPException(400, "Role name already exists")
    
    role = Role(name=name, color=color, level=level, permissions=permissions)
    session.add(role)
    session.commit()
    session.refresh(role)
    return {
        "id": role.id,
        "name": role.name,
        "color": role.color,
        "level": role.level,
        "permissions": json.loads(role.permissions),
    }

@app.patch("/api/roles/{role_id}")
def update_role(
    role_id: int,
    name: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    level: Optional[int] = Form(None),  # 🆕
    permissions: Optional[str] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")
    
    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    
    # 🛡️ Проверка: нельзя редактировать роль с уровнем >= своего
    if get_user_level(staff, session) <= role.level and not staff.is_admin:
        raise HTTPException(
            status_code=403,
            detail=f"Недостаточно уровня для редактирования этой роли (её уровень: {role.level})"
        )
    
    # Если меняем уровень — проверяем новый
    if level is not None:
        max_lvl = max_level_for(staff, session)
        if level < 1 or level > max_lvl:
            raise HTTPException(
                status_code=403,
                detail=f"Вы можете устанавливать уровень только от 1 до {max_lvl}"
            )
        role.level = level
    
    if name:
        role.name = name
    if color:
        role.color = color
    if permissions:
        role.permissions = permissions
    
    session.add(role)
    session.commit()
    session.refresh(role)
    return {
        "id": role.id,
        "name": role.name,
        "color": role.color,
        "level": role.level,
        "permissions": json.loads(role.permissions),
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
    
    # 🛡️ Проверка иерархии
    if get_user_level(staff, session) <= role.level and not staff.is_admin:
        raise HTTPException(
            status_code=403,
            detail=f"Недостаточно уровня для удаления этой роли (её уровень: {role.level})"
        )
    
    users = session.exec(select(User).where(User.role_id == role_id)).all()
    for u in users:
        u.role_id = None
        session.add(u)
    session.delete(role)
    session.commit()
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
    return [user_out(u, session) for u in users]


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
def admin_delete_post(
    post_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    
    # 🆕 Каскадное удаление поста со всеми вложенными ответами
    cascade_delete_post(post_id, session)
    session.commit()
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
    
    session.commit()
    return {"ok": True, "deleted_count": total_deleted}

# ---------- техническая панель ----------

@app.get("/api/admin/stats")
def admin_get_stats(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "No permission: tech_access")
    
    # Общие счётчики
    total_users = session.exec(
        select(func.count()).select_from(User)
    ).one()
    total_posts = session.exec(
        select(func.count()).select_from(Post)
    ).one()
    total_likes = session.exec(
        select(func.count()).select_from(Like)
    ).one()
    total_chats = session.exec(
        select(func.count()).select_from(Chat)
    ).one()
    
    # Топ по подписчикам
    users_all = session.exec(select(User)).all()
    top_followers = []
    for u in users_all:
        followers = session.exec(
            select(func.count()).select_from(Follow).where(Follow.followee_id == u.id)
        ).one()
        top_followers.append({
            **user_out(u, session),
            "followers_count": followers,
        })
    top_followers.sort(key=lambda x: x["followers_count"], reverse=True)
    
    # Топ по постам
    top_posts = []
    for u in users_all:
        posts_count = session.exec(
            select(func.count()).select_from(Post).where(Post.author_id == u.id)
        ).one()
        top_posts.append({
            **user_out(u, session),
            "posts_count": posts_count,
        })
    top_posts.sort(key=lambda x: x["posts_count"], reverse=True)
    
    # Последние регистрации
    recent_users = session.exec(
        select(User).order_by(User.created_at.desc()).limit(10)
    ).all()
    
    return {
        "total_users": total_users,
        "total_posts": total_posts,
        "total_likes": total_likes,
        "total_chats": total_chats,
        "top_followers": top_followers[:5],
        "top_posts": top_posts[:5],
        "recent_registrations": [
            {
                **user_out(u, session),
                "created_at": u.created_at.isoformat(),
            }
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
    
    # Удаляем старую аватарку
    if target.avatar_url and "cloudinary.com" in target.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(target.avatar_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    
    try:
        result = cloudinary.uploader.upload(
            content,
            folder=UPLOAD_FOLDER,
            resource_type="image",
            transformation=[{"width": 400, "height": 400, "crop": "fill"}],
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
        select(ChatMember).where(ChatMember.user_id == user.id)
    ).all()
    
    result = []
    for m in memberships:
        other_member = session.exec(
            select(ChatMember).where(ChatMember.chat_id == m.chat_id, ChatMember.user_id != user.id)
        ).first()
        if not other_member:
            continue
        other = session.get(User, other_member.user_id)
        
        # Поиск по имени собеседника
        if q.strip():
            q_lower = q.lower()
            if (q_lower not in other.display_name.lower() and 
                q_lower not in other.username.lower()):
                continue
        
        chat = session.get(Chat, m.chat_id)
        
        last_msg = session.exec(
            select(Message)
            .where(Message.chat_id == m.chat_id)
            .order_by(Message.created_at.desc())
            .limit(1)
        ).first()
        unread = session.exec(
            select(func.count())
            .select_from(Message)
            .where(Message.chat_id == m.chat_id, Message.sender_id != user.id, Message.read == False)
        ).one()
        
        # Для секретных чатов — не показываем превью текста (он зашифрован)
        last_message_data = None
        if last_msg:
            if chat and chat.is_secret:
                # Показываем только факт наличия сообщения (не текст)
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
            "id": m.chat_id,
            "is_secret": chat.is_secret if chat else False,
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
            conn.execute(text("ALTER TABLE chat ADD COLUMN IF NOT EXISTS is_secret BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE message ADD COLUMN IF NOT EXISTS ciphertext TEXT;"))
            conn.commit()
        except Exception:
            pass
    
    # Системный аккаунт
    with Session(engine) as session:
        SYSTEM = session.exec(select(User).where(User.username == "System")).first()
        if not SYSTEM:
            session.add(User(
                username="System",
                display_name="SYSTEM",
                password_hash=hash_password("System"),
                is_system=True,
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
    # Проверка права: tech_access + delete_users, ИЛИ admin
    if not staff.is_admin:
        if not has_permission(staff, "tech_access", session) or not has_permission(staff, "delete_users", session):
            raise HTTPException(403, "No permission: delete_users")
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    
    # Нельзя удалить себя
    if target.id == staff.id:
        raise HTTPException(400, "Cannot delete your own account")
    
    # 🛡️ Только Founder может удалить Founder
    if target.is_admin and not staff.is_admin:
        raise HTTPException(403, "Только Founder может удалить Founder")
    
    # 🛡️ Moderator не может удалить другого Moderator
    if target.is_moderator and staff.is_moderator and not staff.is_admin:
        raise HTTPException(403, "Developer не может удалить другого Developer. Обратитесь к Founder.")
    
    # ---------- Полное удаление всех данных пользователя ----------
    
    # 1. Удаляем все посты пользователя (с зависимостями)
    posts = session.exec(select(Post).where(Post.author_id == user_id)).all()
    for post in posts:
        # Лайки на посте
        for like in session.exec(select(Like).where(Like.post_id == post.id)).all():
            session.delete(like)
        # Теги поста
        for pt in session.exec(select(PostTag).where(PostTag.post_id == post.id)).all():
            session.delete(pt)
        # Уведомления связанные с постом
        for notif in session.exec(select(Notification).where(Notification.post_id == post.id)).all():
            session.delete(notif)
        # Ответы на пост
        for reply in session.exec(select(Post).where(Post.reply_to_id == post.id)).all():
            session.delete(reply)
        # Медиа из Cloudinary
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
        # Сам пост
        session.delete(post)
    
    # 2. Удаляем лайки, которые пользователь поставил
    for like in session.exec(select(Like).where(Like.user_id == user_id)).all():
        session.delete(like)
    
    # 3. Удаляем подписки (где он подписчик или цель)
    for follow in session.exec(
        select(Follow).where(
            (Follow.follower_id == user_id) | (Follow.followee_id == user_id)
        )
    ).all():
        session.delete(follow)
    
    # 4. Удаляем уведомления (где он получатель или автор действия)
    for notif in session.exec(
        select(Notification).where(
            (Notification.user_id == user_id) | (Notification.actor_id == user_id)
        )
    ).all():
        session.delete(notif)
    
    # 5. Удаляем сообщения в чатах
    for msg in session.exec(select(Message).where(Message.sender_id == user_id)).all():
        session.delete(msg)
    
    # 6. Удаляем чаты, где он участник
    memberships = session.exec(
        select(ChatMember).where(ChatMember.user_id == user_id)
    ).all()
    for membership in memberships:
        # Удаляем всех участников этого чата
        for other_member in session.exec(
            select(ChatMember).where(ChatMember.chat_id == membership.chat_id)
        ).all():
            session.delete(other_member)
        # Удаляем сам чат
        chat = session.get(Chat, membership.chat_id)
        if chat:
            session.delete(chat)
    
    # 7. Удаляем жалобы (где он автор жалобы)
    for report in session.exec(select(Report).where(Report.reporter_id == user_id)).all():
        session.delete(report)
    
    # 8. Удаляем жалобы НА пользователя (если он был целью)
    for report in session.exec(
        select(Report).where(
            Report.target_type == "user",
            Report.target_id == user_id,
        )
    ).all():
        session.delete(report)
    
    # 9. Удаляем аватарку из Cloudinary
    if target.avatar_url and "cloudinary.com" in target.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(target.avatar_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    
    # 10. Удаляем самого пользователя
    session.delete(target)
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
            result = cloudinary.uploader.upload(
                content, folder=UPLOAD_FOLDER, resource_type="auto",
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
    
    chat = session.get(Chat, chat_id)
    messages = session.exec(
        select(Message).where(Message.chat_id == chat_id).order_by(Message.created_at)
    ).all()
    
    result = []
    for msg in messages:
        sender = session.get(User, msg.sender_id)
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
    unread = session.exec(
        select(Message).where(
            Message.chat_id == chat_id,
            Message.sender_id != user.id,
            Message.read == False,
        )
    ).all()
    for msg in unread:
        msg.read = True
        session.add(msg)
    session.commit()
    return {"ok": True}


@app.get("/api/chats/unread-count")
def chats_unread_count(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    memberships = session.exec(
        select(ChatMember).where(ChatMember.user_id == user.id)
    ).all()
    total = 0
    for m in memberships:
        cnt = session.exec(
            select(func.count())
            .select_from(Message)
            .where(
                Message.chat_id == m.chat_id,
                Message.sender_id != user.id,
                Message.read == False,
            )
        ).one()
        total += cnt
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
    result = []
    for n in notifs:
        actor = session.get(User, n.actor_id)
        result.append({
            "id": n.id,
            "type": n.type,
            "actor": user_out(actor, session),
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


@app.get("/api/team")
def get_team(session: Session = Depends(get_session)):
    """Возвращает всех пользователей команды, сгруппированных по уровням."""
    users = session.exec(select(User).where(User.is_banned == False).order_by(User.created_at)).all()
    
    # Группы по уровням (только 3-11, уровни 1-2 не показываются)
    groups = {
        "level_11": {"label": "System", "color": "#00ff41", "order": 0, "members": []},
        "level_10": {"label": "Founder", "color": "#ffffff", "order": 1, "members": []},
        "level_9": {"label": "Developer", "color": "#3b82f6", "order": 2, "members": []},
        "level_8": {"label": "Глава администрации", "color": "#B91C1C", "order": 3, "members": []},
        "level_7": {"label": "Технический раздел", "color": "#0E7490", "order": 4, "members": []},
        "level_6_3": {"label": "Модерация форума", "color": "#065F46", "order": 5, "members": []},
    }
    
    # Распределяем пользователей по группам
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
            role = session.get(Role, u.role_id)
            if role:
                member_data["role"] = {"id": role.id, "name": role.name, "color": role.color}
        
        # Распределение по уровням
        if level == 11:  # System
            groups["level_11"]["members"].append(member_data)
        elif level == 10:  # Founder (is_admin)
            groups["level_10"]["members"].append(member_data)
        elif level == 9:  # Developer (is_moderator)
            groups["level_9"]["members"].append(member_data)
        elif level == 8:  # Глава администрации
            groups["level_8"]["members"].append(member_data)
        elif level == 7:  # Технический раздел
            groups["level_7"]["members"].append(member_data)
        elif 3 <= level <= 6:  # Модерация форума (уровни 3-6)
            groups["level_6_3"]["members"].append(member_data)
        # Уровни 1-2 не добавляются в команды
    
    # Сортируем группы по order и фильтруем пустые
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

@app.get("/api/rules")
def get_rules():
    return {
        "title": "Условия использования",
        "subtitle": "Настоящий документ определяет правила использования социальной сети NEBULA. Используя ресурс, вы подтверждаете согласие со всеми положениями ниже.",
        "sections": [
            {
                "id": "general",
                "heading": "I. Общие положения",
                "items": [
                    "1.1. Использование ресурсов социальной сети NEBULA означает ваше полное и безоговорочное согласие с настоящими Правилами. Незнание Правил не освобождает от ответственности.",
                    "1.2. Использование социальной сети рекомендуется исключительно лицам, достигшими 18 лет. Лица младше 18 лет могут использовать сеть только под контролем родителей или законных представителей.",
                    "1.3. Пользователь несёт полную ответственность за все действия и публикации, совершённые от лица его учётной записи.",
                    "1.4. Пользователь несёт исключительную ответственность за безопасность своей учётной записи. Администрация предоставляет все необходимые средства для обеспечения безопасности, но не несёт ответственности за утерю учётной записи по вине пользователя.",
                    "1.5. На ресурсах социальной сети запрещены нежелательные сообщения (спам) — массовые рассылки без предварительного согласия получателя.",
                    "1.6. Нарушение любого из условий настоящего Соглашения влечёт полную блокировку учётной записи. Пользователь использует социальную сеть на свой страх и риск. Администрация не осуществляет премодерацию всего контента.",
                ],
            },
            {
                "id": "conditions",
                "heading": "II. Общие условия",
                "items": [
                    "2.1. Администрация NEBULA оставляет за собой право изменять настоящие Правила в любое время без предварительного уведомления. Актуальная версия всегда доступна в разделе «Правила».",
                    "2.2. Администрация вправе по своему усмотрению изменять меру наказания в отношении пользователя — как смягчать, так и ужесточать её — в зависимости от обстоятельств нарушения.",
                    "2.3. Администрация признаёт законодательство, нормативно-правовые акты и судебные прецеденты. Контент, первично не нарушающий Правил, может быть удалён по запросу суда любой инстанции.",
                ],
            },
            {
                "id": "ip",
                "heading": "III. Интеллектуальная собственность пользователей",
                "items": [
                    "3.1. Учётная запись и весь загруженный контент остаются собственностью пользователя. Никто не вправе посягать на них без согласия автора.",
                    "3.2. Материалы признаются интеллектуальной собственностью пользователя с момента их публикации в NEBULA, если только они не нарушают права иных лиц.",
                    "3.3. Интеллектуальная собственность пользователя не может быть полностью скопирована, повторно опубликована или представлена как собственность другого лица без указания авторства.",
                    "3.4. Оригинальным признаётся источник (пользователь), который опубликовал материал ранее других в NEBULA.",
                ],
            },
            {
                "id": "content",
                "heading": "IV. Основные правила ресурса",
                "items": [
                    "4.1. Запрещён контент, содержащий сцены насилия, жестокости, расправы, пыток.",
                    "4.2. Запрещена публикация порнографического контента.",
                    "4.3. Запрещено использовать огнестрельное, холодное и другое оружие в сценах, которые могут быть связаны с насилием или угрозой применения против людей или животных.",
                    "4.4. Запрещено публиковать материалы о разработке, модификации или уничтожении оружия. Исключение — научные или учебные цели.",
                    "4.5. Запрещены любые формы накрутки реакций (лайков, репостов, просмотров) и хештегов с помощью автоматизированных средств.",
                    "4.6. Контент, призывающий к насилию, вражде и ненависти, передаётся на рассмотрение модераторов и администрации.",
                ],
            },
            {
                "id": "oos",
                "heading": "V. ООС-правила",
                "items": [
                    "5.1. Любой публикуемый контент должен соответствовать общепринятым морально-этическим нормам.",
                    "5.2. Запрещено чрезмерно злоупотреблять оскорблениями, унижениями чести и достоинства.",
                    "5.3. Имя пользователя должно быть написано латиницей. Публикация контента допустима на русском и английском языках.",
                    "5.5. Запрещён ООС-юмор и контент, нарушающий атмосферу сообщества.",
                    "5.7. Запрещены ООС-оскорбления и ООС-неприязнь на просторах социальной сети.",
                    "5.8. Запрещена дискредитация проекта и его администрации.",
                    "5.9. Запрещены любые формы ООС-махинаций на ресурсах социальной сети.",
                    "5.10. Запрещено размещение фотографий и видео, снятых в реальной жизни.",
                    "5.11. Запрещено размещение изображений и видео, сгенерированных искусственным интеллектом, если они создают гиперреалистичный эффект.",
                    "5.12. Запрещено публиковать изображения с ООС-ремарками: логотипами, элементами интерфейса, служебной информацией.",
                    "5.13. Имя пользователя не должно содержать ООС-юмора или материалов, не связанных с тематикой платформы.",
                    "5.16. Запрещено создание фан-аккаунтов без оригинальной цели.",
                    "5.17. Запрещено выдавать за авторский контент произведения реальных исполнителей без указания авторства.",
                    "5.18. Аккаунты, не проявляющие активность более трёх месяцев, подлежат удалению.",
                    "5.19. Запрещена публикация материалов, связанных с экстремизмом, нацизмом в любом их проявлении.",
                    "5.20. Запрещена смена имени пользователя без уважительных причин.",
                    "5.21. Запрещены публикации с целью принуждения к употреблению наркотических средств.",
                    "5.22. Запрещено отправлять жалобы с использованием нецензурной лексики или угроз в адрес администрации.",
                ],
            },
            {
                "id": "punishments",
                "heading": "VII. Меры наказаний",
                "table": [
                    {
                        "num": "1",
                        "measure": "Устное предупреждение",
                        "description": "Выносится в личные сообщения или публично. Не влечёт блокировки, но фиксируется. Действует 30 дней.",
                        "violations": "Первое незначительное нарушение: мелкий спам, единичный запрещённый термин.",
                    },
                    {
                        "num": "2",
                        "measure": "Удаление поста / комментария",
                        "description": "Контент скрывается из общего доступа. Пользователь получает уведомление с указанием причины.",
                        "violations": "Публикация запрещённого контента, спама, ООС-контента.",
                    },
                    {
                        "num": "3",
                        "measure": "Перманентная блокировка",
                        "description": "Аккаунт полностью и безвозвратно блокируется вместе со всем контентом.",
                        "violations": "Систематические нарушения, распространение запрещённого контента, мошенничество.",
                    },
                    {
                        "num": "4",
                        "measure": "Снятие роли",
                        "description": "У профиля отзываются специальные роли и привилегии.",
                        "violations": "Злоупотребление доверием, публикация ложной информации.",
                    },
                ],
                "note": "Наказания могут применяться как по отдельности, так и в комбинации. Решение принимается администрацией по своему усмотрению.",
            },
            {
                "id": "stats",
                "heading": "VIII. Правила подсчёта реакций и просмотров",
                "items": [
                    "8.1. Для целей модерации и аналитики устанавливается соотношение: 1 реакция = 10 просмотров.",
                    "8.2. Данное соотношение применяется при оценке популярности публикаций, выявлении накрутки и формировании трендов.",
                ],
            },
        ],
        "footer": "Используя NEBULA, вы подтверждаете согласие со всеми вышеуказанными правилами.",
    }


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
    report_id: int,
    action: str = Form(...),  # delete_post, ban_user, ignore
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
            for like in session.exec(select(Like).where(Like.post_id == post.id)).all():
                session.delete(like)
            for pt in session.exec(select(PostTag).where(PostTag.post_id == post.id)).all():
                session.delete(pt)
            for notif in session.exec(select(Notification).where(Notification.post_id == post.id)).all():
                session.delete(notif)
            for reply in session.exec(select(Post).where(Post.reply_to_id == post.id)).all():
                session.delete(reply)
            if post.media_url and "cloudinary.com" in post.media_url:
                try:
                    public_id = extract_cloudinary_public_id(post.media_url)
                    if public_id:
                        cloudinary.uploader.destroy(public_id, resource_type="auto")
                except Exception:
                    pass
            session.delete(post)
    
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
    report.resolved_at = datetime.now()
    session.add(report)
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
    report.resolved_at = datetime.now()
    session.add(report)
    session.commit()
    
    return {"ok": True}

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
        bug.resolved_at = datetime.now()
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
    return get_user_posts(user.id, cursor, limit, session)


@app.get("/api/users/by-username/{username}/followers")
def get_followers_by_username(username: str, session: Session = Depends(get_session)):
    """Получить подписчиков по username"""
    clean_username = username.lstrip("@").lower()
    
    user = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not user:
        raise HTTPException(404, "User not found")
    
    return get_followers(user.id, session)


@app.get("/api/users/by-username/{username}/following")
def get_following_by_username(username: str, session: Session = Depends(get_session)):
    """Получить подписки по username"""
    clean_username = username.lstrip("@").lower()
    
    user = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not user:
        raise HTTPException(404, "User not found")
    
    return get_following(user.id, session)


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
    
    return is_following(target.id, user, session)


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
    
    return toggle_follow(request, target.id, user, session)


# ---------- БЛОГ ОБНОВЛЕНИЙ ----------

from models import Update

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
def list_updates(session: Session = Depends(get_session)):
    updates = session.exec(select(Update).order_by(Update.created_at.desc())).all()
    result = []
    for u in updates:
        author = session.get(User, u.author_id) if u.author_id else None
        result.append({
            "id": u.id,
            "title": u.title,
            "content": u.content,
            "importance": u.importance,
            "author": user_out(author, session) if author else None,
            "created_at": u.created_at.isoformat(),
            "edited_at": u.edited_at.isoformat() if u.edited_at else None,
        })
    return result


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
    session.delete(update)
    session.commit()
    return {"ok": True}