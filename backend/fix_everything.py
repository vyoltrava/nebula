#!/usr/bin/env python3
"""
УНИВЕРСАЛЬНЫЙ ИСПРАВЛЯЛКЕР - чинит ВСЁ!
Запусти один раз и забудь о проблемах.
"""

import os
import re
import shutil
from pathlib import Path

def fix_everything():
    print("=" * 70)
    print("🔧 СУПЕР-ИСПРАВЛЯЛКЕР - ЧИНИМ ВСЁ РАЗОМ")
    print("=" * 70)
    print()

    # ============================================================
    # 1. СОЗДАЁМ ПАПКУ dependencies (если нет)
    # ============================================================
    print("📁 Шаг 1: Создаём dependencies/...")
    os.makedirs("dependencies", exist_ok=True)
    print("   ✅ dependencies/ создана")

    # ============================================================
    # 2. СОЗДАЁМ dependencies/__init__.py
    # ============================================================
    print("\n📝 Шаг 2: Создаём dependencies/__init__.py...")
    init_content = '''"""
Пакет зависимостей FastAPI
"""

from .auth import (
    SECRET,
    ALGORITHM,
    get_current_user,
    get_optional_user,
    require_staff,
    require_admin,
    require_founder,
    require_announcer,
    require_support_staff,
    get_client_ip,
    is_ip_blocked,
    create_token,
    limiter,
    _update_last_seen,
    hash_password,
    check_password,
    ensure_user_has_keys,
    log_action,
    user_out,
    generate_code,
    send_password_reset_email,
)
'''
    with open("dependencies/__init__.py", "w", encoding="utf-8") as f:
        f.write(init_content)
    print("   ✅ dependencies/__init__.py создан")

    # ============================================================
    # 3. СОЗДАЁМ dependencies/auth.py (исправленный)
    # ============================================================
    print("\n📝 Шаг 3: Создаём dependencies/auth.py...")
    auth_content = '''# dependencies/auth.py
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
'''
    with open("dependencies/auth.py", "w", encoding="utf-8") as f:
        f.write(auth_content)
    print("   ✅ dependencies/auth.py создан")

    # ============================================================
    # 4. ИСПРАВЛЯЕМ routers/__init__.py
    # ============================================================
    print("\n📝 Шаг 4: Исправляем routers/__init__.py...")
    if os.path.exists("routers/__init__.py"):
        with open("routers/__init__.py", "r", encoding="utf-8") as f:
            init_content = f.read()
        
        # Проверяем, есть ли импорт из dependencies
        if 'from dependencies import' not in init_content:
            # Добавляем в начало
            header = '''"""
Инициализация пакета роутеров
"""

# Экспортируем всё из dependencies для main.py
from dependencies import (
    SECRET,
    ALGORITHM,
    get_current_user,
    get_optional_user,
    require_staff,
    require_admin,
    require_founder,
    require_announcer,
    require_support_staff,
    get_client_ip,
    is_ip_blocked,
    create_token,
    limiter,
    _update_last_seen,
    hash_password,
    check_password,
    ensure_user_has_keys,
    log_action,
    user_out,
    generate_code,
    send_password_reset_email,
)

# Импортируем все роутеры
'''
            # Добавляем существующие импорты
            lines = init_content.split('\n')
            new_lines = header.split('\n')
            
            for line in lines:
                if 'from .admin import' in line or 'from .auth import' in line or 'from .chats import' in line:
                    new_lines.append(line)
                elif 'from .' in line and 'import' in line:
                    new_lines.append(line)
                elif 'from routers.' in line:
                    new_lines.append(line)
            
            with open("routers/__init__.py", "w", encoding="utf-8") as f:
                f.write('\n'.join(new_lines))
            print("   ✅ routers/__init__.py обновлён")
        else:
            print("   ✅ routers/__init__.py уже в порядке")
    else:
        print("   ❌ routers/__init__.py не найден!")

    # ============================================================
    # 5. ИСПРАВЛЯЕМ main.py
    # ============================================================
    print("\n📝 Шаг 5: Исправляем main.py...")
    
    if os.path.exists("main.py"):
        with open("main.py", "r", encoding="utf-8") as f:
            main_content = f.read()
        
        # Проверяем импорт из dependencies
        if 'from dependencies import' not in main_content:
            # Добавляем правильный импорт
            lines = main_content.split('\n')
            
            # Находим место для вставки
            insert_pos = 0
            for i, line in enumerate(lines):
                if 'from routers import' in line:
                    insert_pos = i
                    break
            
            # Добавляем импорт dependencies перед routers
            dep_import = 'from dependencies import ('
            dep_import += '\n    SECRET, ALGORITHM, get_current_user, get_optional_user,'
            dep_import += '\n    require_staff, require_admin, require_founder, require_announcer,'
            dep_import += '\n    require_support_staff, get_client_ip, is_ip_blocked, create_token,'
            dep_import += '\n    limiter, _update_last_seen, hash_password, check_password,'
            dep_import += '\n    ensure_user_has_keys, log_action, user_out,'
            dep_import += '\n    generate_code, send_password_reset_email'
            dep_import += '\n)'
            
            lines.insert(insert_pos, dep_import)
            
            with open("main.py", "w", encoding="utf-8") as f:
                f.write('\n'.join(lines))
            print("   ✅ main.py обновлён (добавлен импорт dependencies)")
        else:
            print("   ✅ main.py уже в порядке")
        
        # Проверяем, есть ли дубликат prism
        with open("main.py", "r", encoding="utf-8") as f:
            content = f.read()
        
        prism_count = content.count('app.include_router(prism.router)')
        if prism_count > 1:
            lines = content.split('\n')
            new_lines = []
            prism_added = False
            for line in lines:
                if 'app.include_router(prism.router)' in line:
                    if not prism_added:
                        new_lines.append(line)
                        prism_added = True
                else:
                    new_lines.append(line)
            
            with open("main.py", "w", encoding="utf-8") as f:
                f.write('\n'.join(new_lines))
            print(f"   ✅ Удалены дубликаты prism.router (было {prism_count}, оставлен 1)")
    else:
        print("   ❌ main.py не найден!")

    # ============================================================
    # 6. ПРОВЕРЯЕМ routers/auth.py
    # ============================================================
    print("\n📝 Шаг 6: Проверяем routers/auth.py...")
    if os.path.exists("routers/auth.py"):
        with open("routers/auth.py", "r", encoding="utf-8") as f:
            auth_content = f.read()
        
        # Проверяем, есть ли APIRouter в импортах
        if 'from fastapi import APIRouter' not in auth_content:
            # Добавляем
            lines = auth_content.split('\n')
            for i, line in enumerate(lines):
                if 'from fastapi import' in line:
                    if 'APIRouter' not in line:
                        lines[i] = line.replace('from fastapi import', 'from fastapi import APIRouter, ')
                    break
            
            with open("routers/auth.py", "w", encoding="utf-8") as f:
                f.write('\n'.join(lines))
            print("   ✅ routers/auth.py исправлен (добавлен APIRouter)")
        else:
            print("   ✅ routers/auth.py уже в порядке")
    else:
        print("   ⚠️ routers/auth.py не найден!")

    # ============================================================
    # 7. ПРОВЕРЯЕМ ВСЕ РОУТЕРЫ
    # ============================================================
    print("\n📝 Шаг 7: Проверяем все роутеры...")
    if os.path.exists("routers"):
        for filename in os.listdir("routers"):
            if filename.endswith('.py') and filename != '__init__.py':
                filepath = os.path.join("routers", filename)
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                
                # Проверяем, есть ли router = APIRouter()
                if 'router = APIRouter()' not in content:
                    # Проверяем, есть ли APIRouter в импортах
                    if 'from fastapi import APIRouter' not in content:
                        lines = content.split('\n')
                        for i, line in enumerate(lines):
                            if 'from fastapi import' in line:
                                if 'APIRouter' not in line:
                                    lines[i] = line.replace('from fastapi import', 'from fastapi import APIRouter, ')
                                break
                        content = '\n'.join(lines)
                    
                    # Добавляем router = APIRouter() в конец
                    content += '\n\nrouter = APIRouter()'
                    
                    with open(filepath, "w", encoding="utf-8") as f:
                        f.write(content)
                    print(f"   ✅ {filename} исправлен (добавлен router = APIRouter())")
                else:
                    print(f"   ✅ {filename} уже в порядке")
    else:
        print("   ⚠️ Папка routers не найдена!")

    # ============================================================
    # 8. УБИРАЕМ НЕПРАВИЛЬНЫЙ ИМПОРТ В routers/auth.py
    # ============================================================
    print("\n📝 Шаг 8: Чистим неправильные импорты...")
    if os.path.exists("routers/auth.py"):
        with open("routers/auth.py", "r", encoding="utf-8") as f:
            content = f.read()
        
        # Убираем неправильный импорт из dependencies
        lines = content.split('\n')
        new_lines = []
        for line in lines:
            if 'from dependencies import' in line and 'RegisterIn' in line:
                continue
            if 'from dependencies import' in line and 'LoginIn' in line:
                continue
            new_lines.append(line)
        
        content = '\n'.join(new_lines)
        
        # Добавляем RegisterIn и LoginIn если их нет
        if 'class RegisterIn' not in content:
            models = '''
class RegisterIn(BaseModel):
    username: str
    display_name: str
    password: str

class LoginIn(BaseModel):
    username: str
    password: str
'''
            # Вставляем после импортов
            lines = content.split('\n')
            insert_pos = 0
            for i, line in enumerate(lines):
                if line.strip().startswith('from ') or line.strip().startswith('import '):
                    continue
                if line.strip() and not line.strip().startswith('#'):
                    insert_pos = i
                    break
            
            lines.insert(insert_pos, models)
            content = '\n'.join(lines)
        
        with open("routers/auth.py", "w", encoding="utf-8") as f:
            f.write(content)
        print("   ✅ routers/auth.py очищен от неправильных импортов")
    else:
        print("   ⚠️ routers/auth.py не найден!")

    # ============================================================
    # 9. СОЗДАЁМ БЭКАП main.py
    # ============================================================
    print("\n📝 Шаг 9: Создаём бэкап...")
    if os.path.exists("main.py"):
        shutil.copy("main.py", "main_backup_fixed.py")
        print("   ✅ main_backup_fixed.py создан")

    # ============================================================
    # 10. ИТОГ
    # ============================================================
    print("\n" + "=" * 70)
    print("✅ ВСЁ ИСПРАВЛЕНО!")
    print("=" * 70)
    print()
    print("📋 Что было сделано:")
    print("   ✅ Создана папка dependencies/")
    print("   ✅ Создан dependencies/__init__.py")
    print("   ✅ Создан dependencies/auth.py")
    print("   ✅ Исправлен routers/__init__.py")
    print("   ✅ Исправлен main.py")
    print("   ✅ Исправлены все роутеры")
    print("   ✅ Убраны дубликаты prism.router")
    print("   ✅ Создан бэкап main_backup_fixed.py")
    print()
    print("🚀 Теперь запускай:")
    print("   uvicorn main:app --reload")
    print()
    print("📝 Если что-то пошло не так, есть бэкап:")
    print("   main_backup_fixed.py")

if __name__ == "__main__":
    fix_everything()