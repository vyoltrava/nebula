# dependencies/auth.py
"""
Зависимости для аутентификации и прав доступа
"""

import os
import jwt
import json
import hashlib
import bcrypt
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import Depends, Header, HTTPException, BackgroundTasks, Request
from sqlmodel import Session, select, func

from models import User, IPLog, Notification, UserKey, ActionLog, Role
from database import get_session, engine

# ============================================================
# КОНСТАНТЫ
# ============================================================

SECRET = os.getenv("SECRET_KEY", "nebula-super-secret-key-2026-minimum-32-chars")
ALGORITHM = "HS256"

# ============================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
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

def generate_code() -> str:
    import random
    return ''.join(str(random.randint(0, 9)) for _ in range(6))

def send_password_reset_email(email: str, code: str, name: str):
    print(f"[EMAIL] Сброс пароля для {email}: код {code}")

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    return request.client.host if request.client else "unknown"

def ensure_user_has_keys(user_id: int, session: Session):
    existing = session.exec(
        select(UserKey).where(UserKey.user_id == user_id)
    ).first()
    if existing:
        return
    placeholder_key = f"pending_{user_id}_{os.urandom(8).hex()}"
    fingerprint = hashlib.sha256(placeholder_key.encode()).hexdigest()[:16]
    key = UserKey(
        user_id=user_id,
        public_key=placeholder_key,
        fingerprint=fingerprint,
        is_pending=True,
    )
    session.add(key)
    session.commit()

def is_ip_blocked(session: Session, ip: str):
    from models import IPBlock
    block = session.exec(
        select(IPBlock).where(IPBlock.ip_address == ip)
    ).first()
    if block and block.expires_at and block.expires_at < datetime.now(timezone.utc):
        session.delete(block)
        session.commit()
        return None
    return block

def log_action(
    session: Session,
    actor_id: Optional[int],
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[int] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
):
    log = ActionLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=json.dumps(details, default=str) if details else None,
        ip_address=ip_address,
    )
    session.add(log)

def user_out(user: User, session: Session = None) -> dict:
    role_data = None
    permissions = []
    
    if session:
        try:
            from routers.utils import get_user_permissions, get_user_level
            permissions = get_user_permissions(user, session)
        except ImportError:
            pass
        if user.role_id:
            role = session.get(Role, user.role_id)
            if role:
                role_data = {
                    "id": role.id,
                    "name": role.name,
                    "color": role.color,
                    "level": role.level,
                    "permissions": json.loads(role.permissions) if role.permissions else [],
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
        "level": 1,
        "bio": user.bio,
        "last_seen": user.last_seen.isoformat() if user.last_seen else None,
        "cover_url": user.cover_url,
        "two_fa_enabled": bool(getattr(user, "totp_enabled", False)),
        "email_linked": bool(getattr(user, "email", None)),
    }

# ============================================================
# ОСНОВНЫЕ ЗАВИСИМОСТИ
# ============================================================

def get_current_user(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.split(" ", 1)[1]
    
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    
    user = session.get(User, int(user_id))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    if payload.get("ver", 0) != user.token_version:
        raise HTTPException(status_code=401, detail="Session revoked")
    
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Account banned")
    
    return user

def get_optional_user(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> Optional[User]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    
    token = authorization.split(" ", 1)[1]
    
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    except Exception:
        return None
    
    user_id = payload.get("sub")
    if not user_id:
        return None
    
    user = session.get(User, int(user_id))
    if not user or user.is_banned:
        return None
    
    return user

def require_staff(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    user = get_current_user(authorization=authorization, session=session)
    if not user.is_admin and not user.is_moderator:
        raise HTTPException(status_code=403, detail="Staff only")
    return user

def require_admin(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    user = get_current_user(authorization=authorization, session=session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user

def require_founder(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    user = get_current_user(authorization=authorization, session=session)
    return user

def require_announcer(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    user = get_current_user(authorization=authorization, session=session)
    return user

def require_support_staff(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    user = get_current_user(authorization=authorization, session=session)
    if user.is_admin:
        return user
    raise HTTPException(status_code=403, detail="Support staff only")

def _update_last_seen(user_id: int):
    with Session(engine) as session:
        user = session.get(User, user_id)
        if user:
            user.last_seen = datetime.now(timezone.utc)
            session.add(user)
            session.commit()

# ============================================================
# RATE LIMITER
# ============================================================

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
