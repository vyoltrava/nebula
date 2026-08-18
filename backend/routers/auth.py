# routers/auth.py
import re
import json
import io
import base64
import uuid
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, Form
from sqlmodel import Session, select
from pydantic import BaseModel
import pyotp
import qrcode

from database import get_session
from models import User, IPLog, Notification, UserKey
from dependencies import (
    LoginIn, RegisterIn, check_password, create_token,
    ensure_user_has_keys, get_client_ip, get_current_user,
    hash_password, limiter, log_action, user_out,
    SECRET, ALGORITHM, generate_code, send_password_reset_email
)

router = APIRouter()

# Модель для второго этапа 2FA
class Verify2FALoginIn(BaseModel):
    temp_token: str
    code: str


@router.post("/api/register")
@limiter.limit("5/minute")
def register(request: Request, data: RegisterIn, session: Session = Depends(get_session)):
    username = data.username.strip().lower()
    if not re.match(r"^[a-z0-9_]{3,30}$", username):
        raise HTTPException(400, "Username: 3-30 символов, только латиница, цифры и _")
    
    existing = session.exec(select(User).where(func.lower(User.username) == username)).first()
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
    
    ip = get_client_ip(request)
    session.add(IPLog(
        user_id=user.id, 
        ip_address=ip, 
        user_agent=request.headers.get("user-agent"), 
        action="register"
    ))
    session.commit()
    
    return {"token": create_token(user.id, user.token_version), "user": user_out(user, session)}


@router.post("/api/login")
@limiter.limit("5/minute")
def login(request: Request, data: LoginIn, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.username == data.username)).first()
    if not user or not check_password(data.password, user.password_hash):
        raise HTTPException(401, "Wrong username or password")
    
    if getattr(user, "is_banned", False):
        raise HTTPException(403, "Account banned")
    
    ensure_user_has_keys(user.id, session)
    
    ip = get_client_ip(request)
    ua = request.headers.get("user-agent")
    
    # 🛡️ ПРОВЕРКА 2FA
    if getattr(user, "totp_enabled", False):
        # Генерируем временный токен сроком на 5 минут ТОЛЬКО для прохождения 2FA
        temp_token = jwt.encode(
            {
                "sub": str(user.id),
                "purpose": "2fa_pending",
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5)
            },
            SECRET,
            algorithm=ALGORITHM
        )
        return {
            "requires_2fa": True,
            "temp_token": temp_token,
            "username": user.username
        }
    
    # Обычный логин без 2FA
    last_log = session.exec(
        select(IPLog).where(IPLog.user_id == user.id).order_by(IPLog.created_at.desc()).limit(1)
    ).first()
    
    if last_log and (last_log.ip_address != ip or last_log.user_agent != ua):
        session.add(Notification(user_id=user.id, actor_id=user.id, type="login_alert"))
        
    session.add(IPLog(user_id=user.id, ip_address=ip, user_agent=ua, action="login"))
    log_action(session, user.id, "login", ip_address=ip)
    session.commit()
    
    return {
        "requires_2fa": False,
        "token": create_token(user.id, user.token_version), 
        "user": user_out(user, session)
    }


@router.post("/api/login/2fa")
@limiter.limit("5/minute")
def login_2fa(request: Request, data: Verify2FALoginIn, session: Session = Depends(get_session)):
    """Второй этап логина — проверка 2FA кода по временному токену"""
    try:
        payload = jwt.decode(data.temp_token, SECRET, algorithms=[ALGORITHM])
        if payload.get("purpose") != "2fa_pending":
            raise HTTPException(400, "Неверный тип токена")
        
        user = session.get(User, int(payload["sub"]))
        if not user or not getattr(user, "totp_enabled", False):
            raise HTTPException(400, "2FA не включена")
        
        totp = pyotp.TOTP(user.totp_secret)
        is_valid_totp = totp.verify(data.code, valid_window=1)
        is_valid_backup = False
        
        # Проверка резервного кода, если TOTP не подошёл
        if not is_valid_totp and user.totp_backup_codes:
            backup_codes = json.loads(user.totp_backup_codes)
            for i, hashed in enumerate(backup_codes):
                if check_password(data.code.upper(), hashed):
                    backup_codes.pop(i) # Удаляем использованный код
                    user.totp_backup_codes = json.dumps(backup_codes)
                    is_valid_backup = True
                    break
        
        if not (is_valid_totp or is_valid_backup):
            raise HTTPException(401, "Неверный код 2FA")
        
        # Успех — выдаём настоящий токен
        ensure_user_has_keys(user.id, session)
        
        ip = get_client_ip(request)
        ua = request.headers.get("user-agent")
        session.add(IPLog(user_id=user.id, ip_address=ip, user_agent=ua, action="login_2fa"))
        log_action(session, user.id, "login_2fa", ip_address=ip)
        session.commit()
        
        return {
            "requires_2fa": False,
            "token": create_token(user.id, user.token_version), 
            "user": user_out(user, session)
        }
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Время на ввод кода истекло. Войдите заново.")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Неверный или просроченный токен")


@router.post("/api/2fa/setup")
def setup_2fa(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if getattr(user, "totp_enabled", False):
        raise HTTPException(400, "2FA уже включена")
    
    secret = pyotp.random_base32()
    user.totp_secret = secret
    session.add(user)
    session.commit()
    
    totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user.username, issuer_name="Nebula")
    
    img = qrcode.make(totp_uri)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    backup_codes = [uuid.uuid4().hex[:8].upper() for _ in range(10)]
    
    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "backup_codes": backup_codes,
        "uri": totp_uri,
    }


@router.post("/api/2fa/activate")
def activate_2fa(
    code: str = Form(...),
    backup_codes: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if getattr(user, "totp_enabled", False):
        raise HTTPException(400, "2FA уже включена")
    if not user.totp_secret:
        raise HTTPException(400, "Сначала вызовите /api/2fa/setup")
    
    totp = pyotp.TOTP(user.totp_secret)
    if not totp.verify(code, valid_window=1):
        raise HTTPException(400, "Неверный код. Проверьте и попробуйте снова.")
    
    try:
        codes_list = json.loads(backup_codes)
        if not isinstance(codes_list, list) or len(codes_list) != 10:
            raise ValueError
    except:
        raise HTTPException(400, "Неверный формат резервных кодов")
    
    hashed_codes = [hash_password(c) for c in codes_list]
    user.totp_enabled = True
    user.totp_backup_codes = json.dumps(hashed_codes)
    session.add(user)
    session.commit()
    
    log_action(session, user.id, "2fa_enabled")
    return {"ok": True, "message": "2FA успешно активирована"}


@router.post("/api/2fa/disable")
def disable_2fa(
    code: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not getattr(user, "totp_enabled", False):
        raise HTTPException(400, "2FA не включена")
    
    totp = pyotp.TOTP(user.totp_secret)
    if totp.verify(code, valid_window=1):
        pass # Это валидный TOTP код
    else:
        backup_codes = json.loads(user.totp_backup_codes) if user.totp_backup_codes else []
        found = False
        for i, hashed in enumerate(backup_codes):
            if check_password(code.upper(), hashed):
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
    return {"ok": True, "message": "2FA отключена"}


@router.get("/api/2fa/status")
def get_2fa_status(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    backup_codes_left = 0
    if user.totp_backup_codes:
        try:
            backup_codes_left = len(json.loads(user.totp_backup_codes))
        except:
            pass
    
    return {
        "enabled": getattr(user, "totp_enabled", False),
        "backup_codes_left": backup_codes_left,
        "email_linked": bool(getattr(user, "email", None)),
        "email_verified": getattr(user, "email_verified", False),
        "email": getattr(user, "email", None),
    }


@router.post("/api/2fa/backup-codes/regenerate")
def regenerate_backup_codes(
    code: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not getattr(user, "totp_enabled", False):
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


@router.post("/api/me/email")
def link_email(
    email: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    email = email.strip().lower()
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        raise HTTPException(400, "Неверный формат email")
    
    existing = session.exec(select(User).where(User.email == email, User.id != user.id)).first()
    if existing:
        raise HTTPException(400, "Этот email уже привязан к другому аккаунту")
    
    user.email = email
    user.email_verified = False
    session.add(user)
    session.commit()
    
    log_action(session, user.id, "email_linked", details={"email": email})
    return {"ok": True, "email": email}


@router.delete("/api/me/email")
def unlink_email(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user.email = None
    user.email_verified = False
    session.add(user)
    session.commit()
    return {"ok": True}


@router.post("/api/password-reset/request")
@limiter.limit("3/minute")
def request_password_reset(
    request: Request,
    email: str = Form(...),
    session: Session = Depends(get_session),
):
    email = email.strip().lower()
    user = session.exec(select(User).where(User.email == email, User.email_verified == True)).first()
    
    if user:
        code = generate_code()
        user.password_reset_code = code
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(minutes=15)
        session.add(user)
        session.commit()
        
        import threading
        threading.Thread(
            target=send_password_reset_email,
            args=(user.email, code, user.display_name),
            daemon=True
        ).start()
    
    # Всегда возвращаем ok для защиты от перебора email
    return {"ok": True, "message": "Если email существует и подтверждён, код отправлен"}


@router.post("/api/keys/register")
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
        existing.is_pending = False
        session.add(existing)
        session.commit()
        return {"ok": True, "fingerprint": fingerprint, "already_existed": True}

    key = UserKey(user_id=user.id, public_key=public_key, fingerprint=fingerprint, is_pending=False)
    session.add(key)
    session.commit()
    return {"ok": True, "fingerprint": fingerprint, "already_existed": False}