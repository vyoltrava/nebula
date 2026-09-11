# routers/auth.py
# Endpoints вынесены из main.py. Общие зависимости — из dependencies.py.
import json, os, re, uuid, base64, io, time, secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile, Header, Query, Response, Body, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlmodel import Session, select, delete, func, update
import cloudinary
from database import get_session
from models import *
from dependencies import *
from dependencies import manager

router = APIRouter()


# ==== (миграция из main.py) ====
@router.post("/api/auth/refresh")
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

    token_sub = _jwt_sub(payload)
    if token_sub is None:
        raise HTTPException(401, "Invalid refresh token")
    # 🎯 Если клиент просит refresh для другого пользователя — отказ (protect multi-account).
    if requested_user_id is not None and requested_user_id != token_sub:
        raise HTTPException(401, "Refresh token does not match requested user")

    user = session.get(User, token_sub)
    if not user or user.is_banned:
        # 🛡️ Авто-разбан: срок истёк → пропускаем (иначе refresh не выдаётся)
        if user and user.is_banned and _maybe_autounban(user, session):
            pass
        else:
            raise HTTPException(401, "User not found")
    user_token_version = getattr(user, 'token_version', 0) or 0
    if payload.get("ver", 0) != user_token_version:
        raise HTTPException(401, "Session revoked")

    _refresh = set_refresh_cookie(response, user.id, user_token_version)
    return {
        "token": create_token(user.id, user_token_version, token_type="access"),
        "refresh_token": _refresh,
        "user": user_out(user, session),
    }


@router.post("/api/auth/logout")
def auth_logout(request: Request, response: Response):
    response.delete_cookie("refresh_token", path="/api/auth")
    return {"ok": True}


@router.get("/api/auth/validate")
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
    user_id = _jwt_sub(payload)
    if user_id is None:
        raise HTTPException(401, "Invalid token")
    user = session.get(User, user_id)
    if not user or user.is_banned:
        if user and user.is_banned and _maybe_autounban(user, session):
            pass
        else:
            raise HTTPException(401, "Invalid user")
    if payload.get("ver", 0) != (getattr(user, "token_version", 0) or 0):
        raise HTTPException(401, "Session revoked")
    return {"valid": True, "user": {"id": user.id, "username": user.username, "display_name": user.display_name}}


@router.post("/api/register")
@limiter.limit("5/minute")
def register(request: Request, response: Response, data: RegisterIn, session: Session = Depends(get_session)):
    username = data.username.strip().lower()
    if not re.match(r"^[a-z0-9_]{3,30}$", username):
        raise HTTPException(400, "Username: 3-30 символов, только латиница, цифры и _")
    # 🚫 Запрещённые / служебные юзернеймы
    forbidden = ["admin", "support", "moderator", "system", "root", "owner", "founder", "trelod", "mod", "staff", "official"]
    if username in forbidden:
        raise HTTPException(400, "This username is reserved")
    # 🤖 Префикс bot_ — каста ботов, обычным аккаунтам недоступен
    if username.startswith("bot_") or username.endswith("_bot"):
        raise HTTPException(400, "This username is reserved for bots")
    # 👑 Проверка на премиум-юзернейм (нельзя занять, только купить в магазине)
    premium = session.exec(
        select(PremiumUsername).where(
            func.lower(PremiumUsername.username) == username,
            PremiumUsername.is_active == True,  # noqa: E712
        )
    ).first()
    if premium:
        raise HTTPException(400, f"Username @{username} is premium. Buy it in the shop!")
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
    user_token_version = getattr(user, 'token_version', 0) or 0
    _refresh = set_refresh_cookie(response, user.id, user_token_version)
    return {"token": create_token(user.id, user_token_version), "refresh_token": _refresh, "user": user_out(user, session)}


@router.post("/api/2fa/setup")
@limiter.limit("5/minute")
def setup_2fa(
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Генерирует секрет и QR-код для привязки аутентификатора"""
    if user.totp_enabled:
        raise HTTPException(400, "2FA уже включена")

    # Ленивый импорт — не грузим pyotp/qrcode при старте
    import pyotp
    import qrcode

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


@router.post("/api/2fa/activate")
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

    # Ленивый импорт — не грузим pyotp при старте
    import pyotp

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


@router.post("/api/2fa/disable")
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

    # Ленивый импорт
    import pyotp

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


@router.get("/api/2fa/status")
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


@router.post("/api/2fa/backup-codes/regenerate")
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


@router.post("/api/login")
@limiter.limit("5/minute")
def login(request: Request, response: Response, data: LoginIn, session: Session = Depends(get_session)):
    # 🛡️ 1. ЗАЩИТА ОТ БРУТФОРСА ПО USERNAME
    fail_key = f"failed_login:{data.username.lower()}"
    fail_count = redis_client.get(fail_key)
    
    if fail_count and int(fail_count) >= 5:
        ttl = redis_client.ttl(fail_key)
        raise HTTPException(429, f"Слишком много попыток для этого аккаунта. Подождите {ttl // 60} мин.")

    # 🛡️ 0. Заблокированные IP не пускаем вообще
    _ip0 = get_client_ip(request)
    if is_ip_blocked(session, _ip0):
        raise HTTPException(403, "Your IP is blocked")

    # 2. ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ
    user = session.exec(select(User).where(User.username == data.username)).first()
    
    if not user or not check_password(data.password, user.password_hash):
        # 🤖 HONEYPOT: попытка входа в аккаунт бота → бан IP + блок всех
        # аккаунтов, светившихся с этого IP (боты — закрытая каста)
        if user and user.is_bot:
            _ip = get_client_ip(request)
            _ua = request.headers.get("user-agent")
            if not session.exec(select(IPBlock).where(IPBlock.ip_address == _ip)).first():
                session.add(IPBlock(
                    ip_address=_ip,
                    reason=f"Honeypot: попытка входа в аккаунт бота @{user.username}"))
            seen_ids = set(session.exec(
                select(IPLog.user_id).where(IPLog.ip_address == _ip)).all())
            for uid in seen_ids:
                u2 = session.get(User, uid)
                if u2 and not u2.is_admin and not u2.is_bot and not u2.is_banned:
                    u2.is_banned = True
                    session.add(u2)
            session.add(IPLog(user_id=user.id, ip_address=_ip, user_agent=_ua,
                              action="bot_honeypot"))
            session.commit()
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


@router.post("/api/login/2fa")
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

