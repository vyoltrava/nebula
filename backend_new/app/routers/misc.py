# ============================================================
# app/routers/misc.py
# ============================================================

from fastapi import APIRouter
from app.deps import *  # noqa: F401,F403  (shared helpers + imports)

router = APIRouter()

@router.get("/debug/perf")
async def debug_perf():
    return JSONResponse(get_perf_summary())


@router.get("/health")
def health_check():
    return {"status": "ok", "service": "nebula-api"}

# ---------- 2FA: НАСТРОЙКА ----------

@router.post("/api/2fa/setup")
def setup_2fa(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Генерирует секрет и QR-код для привязки аутентификатора"""
    if user.totp_enabled:
        raise HTTPException(400, "2FA уже включена")
    
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
def activate_2fa(
    code: str = Form(...),
    backup_codes: str = Form(...),  # JSON массив кодов
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Активирует 2FA после проверки кода из аутентификатора"""
    if user.totp_enabled:
        raise HTTPException(400, "2FA уже включена")
    
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
def disable_2fa(
    code: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отключает 2FA (нужен код из аутентификатора ИЛИ резервный код)"""
    if not user.totp_enabled:
        raise HTTPException(400, "2FA не включена")
    
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


# ---------- 2FA: ПРОВЕРКА ПРИ ЛОГИНЕ ----------

@router.post("/api/login")
@limiter.limit("5/minute")
def login(request: Request, data: LoginIn, session: Session = Depends(get_session)):
    # 🛡️ 1. ЗАЩИТА ОТ БРУТФОРСА ПО USERNAME
    fail_key = f"failed_login:{data.username.lower()}"
    fail_count = redis_client.get(fail_key)
    
    if fail_count and int(fail_count) >= 5:
        ttl = redis_client.ttl(fail_key)
        raise HTTPException(429, f"Слишком много попыток для этого аккаунта. Подождите {ttl // 60} мин.")

    # 2. ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ
    user = session.exec(select(User).where(User.username == data.username)).first()
    
    if not user or not check_password(data.password, user.password_hash):
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
    
    return {"token": create_token(user.id, user.token_version), "user": user_out(user, session)}


@router.post("/api/login/2fa")
@limiter.limit("5/minute")
def login_2fa(
    request: Request,
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
    
    return {"token": create_token(user.id, user.token_version), "user": user_out(user, session)}





@router.get("/api/keys/me")
def get_my_public_key(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    key = session.exec(select(UserKey).where(UserKey.user_id == user.id)).first()
    if not key:
        raise HTTPException(404, "Ключ не зарегистрирован")
    return {"public_key": key.public_key, "fingerprint": key.fingerprint}


@router.post("/api/keys/register")
def register_public_key(
    public_key: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Клиент регистрирует РЕАЛЬНЫЕ ключи. Перезаписывает placeholder."""
    import hashlib
    fingerprint = hashlib.sha256(public_key.encode()).hexdigest()[:16]

    existing = session.exec(select(UserKey).where(UserKey.user_id == user.id)).first()
    if existing:
        # ✅ ПЕРЕЗАПИСЫВАЕМ — клиент прислал реальный ключ
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


@router.get("/api/online-count")
def get_online_count(user: User = Depends(get_current_user)):
    """Сколько пользователей сейчас онлайн"""
    return {"count": manager.total_connections}



