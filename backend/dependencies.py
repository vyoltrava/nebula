# backend/dependencies.py
import os
import re
import json
import time
import hashlib
import uuid
import random
import logging
import jwt
import bcrypt
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import Depends, Header, HTTPException, BackgroundTasks, Request
from sqlmodel import Session, select, func
from sqlalchemy import text, update, delete
from pydantic import BaseModel
from models import (
    User, Role, IPBlock, ActionLog, Post, Like, Follow, Notification, 
    PostTag, Bookmark, PostView, LastReadPost, Message, MessageReaction,
    Sticker, StickerPack, Theme, UserKey
)
from database import engine, get_session
from fastapi.concurrency import run_in_threadpool
import cloudinary.uploader

# ============================================================
# 🔑 СЕКРЕТЫ И КОНСТАНТЫ
# ============================================================
SECRET = os.getenv("SECRET_KEY", "nebula-super-secret-key-2026-minimum-32-chars")
ALGORITHM = "HS256"

ALL_PERMISSIONS = [
    "delete_posts", "ban_users", "remove_avatars", "assign_moderator",
    "manage_roles", "manage_users", "manage_reports", "tech_access",
    "delete_users", "manage_stickers", "pin_messages", "edit_posts",
    "manage_groups", "manage_announcements", "warn_users", "manage_support",
]
MODERATOR_PERMISSIONS = ALL_PERMISSIONS.copy()

# ============================================================
# 🚀 ГЛОБАЛЬНЫЕ КЭШИ
# ============================================================
_ip_block_cache = {}
_IP_BLOCK_CACHE_TTL = 300

_role_cache = {}
_ROLE_CACHE_TTL = 600

_popular_tags_cache = {}
_POPULAR_TAGS_TTL = 300

_follow_cache = {}
_FOLLOW_CACHE_TTL = 60

# ============================================================
# 🔐 АВТОРИЗАЦИЯ
# ============================================================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: int, token_version: int = 0) -> str:
    payload = {"sub": str(user_id), "ver": token_version, "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)

def get_current_user(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
    background_tasks: BackgroundTasks = None,
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(authorization.split(" ", 1)[1], SECRET, algorithms=[ALGORITHM])
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = session.get(User, int(payload["sub"]))
    if not user or user.is_banned or payload.get("ver", 0) != user.token_version:
        raise HTTPException(401, "User not found or banned")
    
    now = datetime.now(timezone.utc)
    if not user.last_seen or (now - user.last_seen).total_seconds() > 180:
        if background_tasks:
            background_tasks.add_task(_update_last_seen_sync, user.id)
    return user

def get_optional_user(authorization: str = Header(default=None), session: Session = Depends(get_session)) -> Optional[User]:
    if not authorization or not authorization.startswith("Bearer "): return None
    try:
        payload = jwt.decode(authorization.split(" ", 1)[1], SECRET, algorithms=[ALGORITHM])
        user = session.get(User, int(payload["sub"]))
        return user if user and not user.is_banned else None
    except Exception:
        return None

async def get_current_user_optional(authorization: str = Header(None), session: Session = Depends(get_session)):
    if not authorization or not authorization.startswith("Bearer "): return None
    try:
        payload = jwt.decode(authorization.split(" ")[1], SECRET, algorithms=[ALGORITHM])
        return session.get(User, int(payload.get("sub"))) if payload.get("sub") else None
    except:
        return None

def _update_last_seen_sync(user_id: int):
    with Session(engine) as session:
        user = session.get(User, user_id)
        if user:
            user.last_seen = datetime.now(timezone.utc)
            session.add(user)
            session.commit()

# ============================================================
# 🛡️ ПРАВА И ИЕРАРХИЯ
# ============================================================
def get_role_cached(session: Session, role_id: int) -> Optional[Role]:
    if role_id is None: return None
    now = time.time()
    cached = _role_cache.get(role_id)
    if cached and (now - cached[0] < _ROLE_CACHE_TTL): return cached[1]
    role = session.get(Role, role_id)
    _role_cache[role_id] = (now, role)
    return role

def get_user_permissions(user: User, session: Session) -> list:
    if user.is_admin or user.is_system: return ALL_PERMISSIONS.copy()
    permissions = []
    if user.is_moderator: permissions.extend(MODERATOR_PERMISSIONS)
    if user.role_id:
        role = get_role_cached(session, user.role_id)
        if role:
            try:
                for p in json.loads(role.permissions):
                    if p not in permissions: permissions.append(p)
            except Exception: pass
    return permissions

def has_permission(user: User, permission: str, session: Session) -> bool:
    return True if user.is_admin else permission in get_user_permissions(user, session)

def get_user_level(user: User, session: Session = None) -> int:
    if user.is_admin: return 10
    if user.is_moderator: return 9
    if user.role_id:
        role = get_role_cached(session, user.role_id) if session else None
        if role and role.level: return role.level
    return 1

def require_staff(authorization: str = Header(default=None), session: Session = Depends(get_session)) -> User:
    user = get_current_user(authorization=authorization, session=session)
    if not get_user_permissions(user, session): raise HTTPException(403, "Staff only")
    return user

def require_admin(authorization: str = Header(default=None), session: Session = Depends(get_session)) -> User:
    user = get_current_user(authorization=authorization, session=session)
    if not user.is_admin: raise HTTPException(403, "Admin only")
    return user

def require_founder(authorization: str = Header(default=None), session: Session = Depends(get_session)) -> User:
    user = get_current_user(authorization=authorization, session=session)
    if get_user_level(user, session) < 10: raise HTTPException(403, "Только Founder и System")
    return user

def require_announcer(authorization: str = Header(default=None), session: Session = Depends(get_session)) -> User:
    user = get_current_user(authorization=authorization, session=session)
    if get_user_level(user, session) >= 10 or has_permission(user, "manage_announcements", session): return user
    raise HTTPException(403, "Нужен уровень Founder или право manage_announcements")

def can_moderate(actor: User, target: User, session: Session) -> bool:
    return get_user_level(actor, session) > get_user_level(target, session)

def max_level_for(actor: User, session: Session) -> int:
    return 8 if actor.is_admin else get_user_level(actor, session) - 1

def check_hierarchy_or_403(actor: User, target: User, session: Session, action: str = "этого"):
    if target.is_system and actor.is_admin: return
    if get_user_level(target, session) >= get_user_level(actor, session):
        raise HTTPException(403, f"🛡️ Иммунитет: уровень цели ≥ вашего. Вы не можете {action}.")

def protect_system_account(target: User, actor: User = None, action: str = "этого"):
    if target.is_system and not (actor and actor.is_admin):
        raise HTTPException(403, f"🛡️ Системный аккаунт нельзя {action}.")

def check_sanction_rights(actor: User, target: User, session: Session, action: str = "применять санкции"):
    if actor.is_admin: return
    if target.is_admin or target.is_moderator or target.is_system:
        raise HTTPException(403, f"🛡️ Иммунитет: только Founder может {action}.")
    if get_user_level(target, session) >= get_user_level(actor, session):
        raise HTTPException(403, f"🛡️ Иммунитет: уровень цели ≥ вашего.")

def user_out(user: User, session: Session = None) -> dict:
    role_data = None
    if session and user.role_id:
        role = get_role_cached(session, user.role_id)
        if role:
            role_data = {"id": role.id, "name": role.name, "color": role.color, "level": role.level, "permissions": json.loads(role.permissions)}
    return {
        "id": user.id, "username": user.username, "display_name": user.display_name,
        "avatar_url": user.avatar_url, "is_admin": user.is_admin, "is_moderator": user.is_moderator,
        "is_banned": user.is_banned, "is_system": user.is_system, "role": role_data,
        "permissions": get_user_permissions(user, session) if session else [],
        "level": get_user_level(user, session) if session else 1, "bio": user.bio,
        "last_seen": user.last_seen.isoformat() if user.last_seen else None,
        "cover_url": user.cover_url, "two_fa_enabled": user.totp_enabled, "email_linked": bool(user.email),
    }

def resolve_user(identifier: str, session: Session) -> User:
    if identifier.isdigit(): user = session.get(User, int(identifier))
    else: user = session.exec(select(User).where(func.lower(User.username) == identifier.lstrip("@").lower())).first()
    if not user: raise HTTPException(404, "User not found")
    return user

# ============================================================
# 🛠️ УТИЛИТЫ И КЭШИ
# ============================================================
def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded: return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    return real_ip if real_ip else (request.client.host if request.client else "unknown")

def log_action(session: Session, actor_id: Optional[int], action: str, target_type: Optional[str] = None, target_id: Optional[int] = None, details: Optional[dict] = None, ip_address: Optional[str] = None):
    session.add(ActionLog(actor_id=actor_id, action=action, target_type=target_type, target_id=target_id, details=json.dumps(details, default=str) if details else None, ip_address=ip_address))

def is_ip_blocked(session: Session, ip: str) -> Optional[IPBlock]:
    now = time.time()
    cached = _ip_block_cache.get(ip)
    if cached and (now - cached[0] < _IP_BLOCK_CACHE_TTL):
        if cached[1] is None: return None
        if cached[1].expires_at and cached[1].expires_at < datetime.now(timezone.utc):
            try: session.delete(cached[1]); session.commit()
            except: pass
            _ip_block_cache[ip] = (now, None)
            return None
        return cached[1]
    block = session.exec(select(IPBlock).where(IPBlock.ip_address == ip)).first()
    if block and block.expires_at and block.expires_at < datetime.now(timezone.utc):
        session.delete(block); session.commit(); block = None
    _ip_block_cache[ip] = (now, block)
    return block

def invalidate_role_cache(role_id: Optional[int] = None):
    if role_id is None: _role_cache.clear()
    else: _role_cache.pop(role_id, None)

def invalidate_ip_block_cache(ip: Optional[str] = None):
    if ip is None: _ip_block_cache.clear()
    else: _ip_block_cache.pop(ip, None)

def invalidate_follow_cache(follower_id: int, followee_id: int):
    _follow_cache.pop((follower_id, followee_id), None)

def extract_cloudinary_public_id(url: str) -> Optional[str]:
    try:
        parts = url.split("/upload/")
        if len(parts) < 2: return None
        path = "/".join([p for p in parts[1].split("/") if not (p.startswith("v") and p[1:].isdigit())])
        return os.path.splitext(path)[0]
    except: return None

def get_author_role(user: User, session: Session) -> Optional[dict]:
    if user.role_id:
        role = get_role_cached(session, user.role_id)
        if role: return {"name": role.name, "color": role.color, "level": role.level}
    return None

def extract_tags(text: str) -> list: return list({t.lower() for t in re.findall(r"#(\w+)", text)})
def extract_mentions(text: str) -> list: return list({m.lower() for m in re.findall(r"@(\w+)", text)})

def ensure_user_has_keys(user_id: int, session: Session):
    if session.exec(select(UserKey).where(UserKey.user_id == user_id)).first(): return
    placeholder_key = f"pending_{user_id}_{uuid.uuid4().hex[:16]}"
    session.add(UserKey(user_id=user_id, public_key=placeholder_key, fingerprint=hashlib.sha256(placeholder_key.encode()).hexdigest()[:16], is_pending=True))
    session.commit()

def get_reply_preview(session: Session, reply_to_id: int) -> Optional[dict]:
    if not reply_to_id: return None
    original = session.get(Message, reply_to_id)
    if not original: return None
    sender = session.get(User, original.sender_id)
    preview_text = original.text or ""
    if original.media_type and not original.text:
        preview_text = {"image": "📷 Фото", "video": "🎬 Видео", "audio": "🎙️ Голосовое", "video_note": "📹 Видеокружок", "gif": "🎞️ GIF"}.get(original.media_type, "📎 Вложение")
    return {"id": original.id, "sender_name": sender.display_name if sender else "Unknown", "sender_id": original.sender_id, "text": preview_text[:120], "media_type": original.media_type}

def _track_view_sync(post_id: int, viewer_hash: str):
    with Session(engine) as session:
        post = session.get(Post, post_id)
        if not post: return
        yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
        if not session.exec(select(PostView).where(PostView.post_id == post_id, PostView.viewer_hash == viewer_hash, PostView.viewed_at > yesterday)).first():
            session.add(PostView(post_id=post_id, viewer_hash=viewer_hash))
            post.views_count = (post.views_count or 0) + 1
            session.add(post)
            session.commit()

def generate_code() -> str: return f"{random.randint(100000, 999999)}"
def send_password_reset_email(email: str, code: str, display_name: str):
    logging.info(f"📧 [MOCK EMAIL] Код сброса пароля для {email} ({display_name}): {code}")

# ============================================================
# 🗑️ УДАЛЕНИЕ
# ============================================================
async def cascade_delete_post(post_id: int, session: Session):
    ids_to_clean = {post_id}
    queue = [post_id]
    while queue:
        current_id = queue.pop(0)
        for child_id in session.exec(select(Post.id).where(Post.reply_to_id == current_id)).all():
            if child_id not in ids_to_clean: ids_to_clean.add(child_id); queue.append(child_id)
    id_list = list(ids_to_clean)
    posts_with_media = session.exec(select(Post).where(Post.id.in_(id_list))).all()
    
    session.exec(delete(Like).where(Like.post_id.in_(id_list)))
    session.exec(delete(PostTag).where(PostTag.post_id.in_(id_list)))
    session.exec(delete(Notification).where(Notification.post_id.in_(id_list)))
    session.exec(delete(Bookmark).where(Bookmark.post_id.in_(id_list)))
    session.exec(delete(PostView).where(PostView.post_id.in_(id_list)))
    session.exec(delete(LastReadPost).where(LastReadPost.post_id.in_(id_list)))
    
    for rp in session.exec(select(Post).where(Post.repost_of_id.in_(id_list))).all():
        rp.repost_of_id = None; session.add(rp)
        
    for post in posts_with_media:
        if post.media_url and "cloudinary.com" in post.media_url:
            try:
                public_id = extract_cloudinary_public_id(post.media_url)
                if public_id: await run_in_threadpool(cloudinary.uploader.destroy, public_id, resource_type="auto")
            except: pass
        elif post.media_url:
            file_path = os.path.join("uploads", post.media_url.split("/")[-1])
            if os.path.exists(file_path):
                try: await run_in_threadpool(os.remove, file_path)
                except: pass
                
    root_post = session.get(Post, post_id)
    if root_post: session.delete(root_post)
    session.exec(delete(PostTag).where(PostTag.post_id == post_id))
    session.commit()
    return len(ids_to_clean)

# ============================================================
# 😂 РЕАКЦИИ И ТЕМЫ
# ============================================================
def reaction_limit_for(user: User, session: Session) -> int:
    return 5 if get_user_level(user, session) >= 2 else 3

def build_reactions_map(session: Session, message_ids: list, current_user_id: int) -> dict:
    if not message_ids: return {}
    rows = session.exec(select(MessageReaction).where(MessageReaction.message_id.in_(message_ids))).all()
    sticker_ids = [r.sticker_id for r in rows if r.sticker_id]
    stickers_map = {s.id: s for s in session.exec(select(Sticker).where(Sticker.id.in_(sticker_ids))).all()} if sticker_ids else {}
    
    grouped = {}
    for r in rows:
        grouped.setdefault(r.message_id, {})
        if r.sticker_id:
            sticker = stickers_map.get(r.sticker_id)
            if not sticker: continue
            item = grouped[r.message_id].setdefault(f"sticker_{r.sticker_id}", {"type": "sticker", "sticker_id": r.sticker_id, "content": sticker.content, "count": 0, "me": False})
        else:
            item = grouped[r.message_id].setdefault(f"emoji_{r.emoji}", {"type": "emoji", "emoji": r.emoji, "content": r.emoji, "count": 0, "me": False})
        item["count"] += 1
        if r.user_id == current_user_id: item["me"] = True
    return {mid: sorted(reactions.values(), key=lambda x: -x["count"]) for mid, reactions in grouped.items()}

def theme_to_dict(t: Theme) -> dict:
    return {"id": t.id, "name": t.name, "type": t.type, "colors": json.loads(t.colors) if isinstance(t.colors, str) else t.colors, "speed": t.speed, "intensity": t.intensity, "blur": t.blur, "is_default": t.is_default, "min_level": t.min_level, "is_active": t.is_active, "created_at": t.created_at.isoformat() if t.created_at else None}

# ============================================================
# 📋 PYDANTIC МОДЕЛИ
# ============================================================
class RegisterIn(BaseModel):
    username: str
    display_name: str
    password: str
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[a-z0-9_]{3,30}$", v): raise ValueError("Username: 3-30 символов, только латиница, цифры и _")
        return v

class LoginIn(BaseModel): username: str; password: str
class PostIn(BaseModel): text: str
class UpdateUserIn(BaseModel): display_name: str; bio: Optional[str] = None
class ChangePasswordIn(BaseModel): old_password: str; new_password: str
class MarkReadingIn(BaseModel): post_id: int

class PostOut(BaseModel):
    id: int; author_id: int; author: str; handle: str; author_avatar: Optional[str] = None
    author_is_admin: bool = False; author_is_moderator: bool = False; author_is_banned: bool = False
    author_role: Optional[dict] = None; text: str; media_url: Optional[str] = None
    likes_count: int = 0; liked_by_me: bool = False; replies_count: int = 0
    created_at: datetime; bookmarked_by_me: bool = False; author_level: int = 1; author_bio: Optional[str] = None