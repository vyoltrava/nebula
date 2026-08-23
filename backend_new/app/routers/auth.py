# ============================================================
# app/routers/auth.py
# ============================================================

from fastapi import APIRouter
from app.deps import *  # noqa: F401,F403  (shared helpers + imports)

router = APIRouter()

@router.post("/api/register")
@limiter.limit("5/minute")
def register(request: Request, data: RegisterIn, session: Session = Depends(get_session)):
    username = data.username.strip().lower()
    if not re.match(r"^[a-z0-9_]{3,30}$", username):
        raise HTTPException(400, "Username: 3-30 символов, только латиница, цифры и _")
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
    return {"token": create_token(user.id, user.token_version), "user": user_out(user, session)}



@router.post("/api/me/logout-all")
def logout_all(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user.token_version += 1  # все старые токены становятся невалидными
    session.add(user)
    session.commit()
    return {"ok": True}


@router.get("/api/me")
def me(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return user_out(user, session)


@router.patch("/api/me")
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


@router.post("/api/me/password")
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

@router.get("/api/me/live-text-settings")
def get_live_text_settings(
    user: User = Depends(get_current_user),
):
    """🆕 Настройки живых сообщений"""
    return {
        "enabled": bool(user.live_text_enabled),
        "broadcast": bool(user.live_text_broadcast),
    }

@router.post("/api/me/live-text-settings")
def set_live_text_settings(
    enabled: Optional[bool] = Form(None),
    broadcast: Optional[bool] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """🆕 Обновление настроек живых сообщений"""
    if enabled is not None:
        user.live_text_enabled = enabled
    if broadcast is not None:
        user.live_text_broadcast = broadcast
    session.add(user)
    session.commit()
    return {"ok": True, "enabled": bool(user.live_text_enabled), "broadcast": bool(user.live_text_broadcast)}


@router.post("/api/me/avatar")
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


@router.post("/api/me/cover")
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


@router.delete("/api/me/cover")
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


@router.post("/api/me/last-read")
def mark_as_last_read(
    data: MarkReadingIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Запоминаем последний открытый пост. Вызывается с /post/{id}."""
    post = session.get(Post, data.post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    
    existing = session.get(LastReadPost, user.id)
    if existing:
        existing.post_id = data.post_id
        existing.saved_at = datetime.now(timezone.utc)
    else:
        session.add(LastReadPost(user_id=user.id, post_id=data.post_id))
    session.commit()
    return {"ok": True}


@router.get("/api/me/last-read")
def get_last_read_post(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Возвращает последний читаемый пост для кнопки 'Продолжить'"""
    record = session.get(LastReadPost, user.id)
    if not record:
        return {"has_post": False}
    
    post = session.get(Post, record.post_id)
    if not post:
        session.delete(record)
        session.commit()
        return {"has_post": False}
    
    author = session.get(User, post.author_id)
    return {
        "has_post": True,
        "post_id": post.id,
        "text_preview": (post.text or "📎 Медиа")[:100],
        "author_name": author.display_name if author else "Удалённый пользователь",
        "author_avatar": author.avatar_url if author else None,
        "saved_at": record.saved_at.isoformat(),
    }


@router.delete("/api/me/last-read")
def clear_last_read_post(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Стираем запись. Вызывается при открытии поста ИЛИ при клике '✕'."""
    record = session.get(LastReadPost, user.id)
    if record:
        session.delete(record)
        session.commit()
    return {"ok": True}


@router.get("/api/media/{filename}")
async def download_encrypted_media(
    filename: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Скачивание шифрованного медиа (с проверкой доступа)"""
    # Проверяем, что файл существует
    filepath = os.path.join("uploads", filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, "Файл не найден")

    # Проверяем, что пользователь имеет доступ к чату с этим медиа
    # Находим сообщение с этим media_url
    msg = session.exec(
        select(Message).where(Message.media_url == filename)
    ).first()
    if not msg:
        raise HTTPException(404, "Медиа не найдено")

    # Проверяем, что пользователь участник чата
    member = session.exec(
        select(ChatMember).where(
            ChatMember.chat_id == msg.chat_id,
            ChatMember.user_id == user.id,
        )
    ).first()
    if not member:
        raise HTTPException(403, "Нет доступа к этому медиа")

    # Отдаём файл
    from fastapi.responses import FileResponse
    return FileResponse(filepath, media_type="application/octet-stream")


@router.post("/api/me/badge")
def select_my_badge(
    badge_id: Optional[int] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if badge_id:
        badge = session.get(Badge, badge_id)
        if not badge:
            raise HTTPException(404, "Badge not found")
        
        user_level = get_user_level(user, session)
        can_select = (
            (badge.role_id == user.role_id) or 
            (badge.user_id == user.id) or
            (badge.is_selectable and user_level >= 3)
        )
        if not can_select:
            raise HTTPException(403, "У вас нет прав на этот значок")
        
        user.selected_badge_id = badge_id
        user.custom_badge_url = None  # 🆕 СБРАСЫВАЕМ КАСТОМНЫЙ ПРИ ВЫБОРЕ СТОКОВОГО
    else:
        user.selected_badge_id = None
        user.custom_badge_url = None
    
    session.add(user)
    session.commit()
    return {"ok": True}

@router.post("/api/me/custom-badge")
@limiter.limit("5/minute")
async def upload_custom_badge(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Загрузить свой значок (только если есть доступ к selectable бейджам)"""
    user_level = get_user_level(user, session)
    has_selectable_badge = session.exec(
        select(func.count(Badge.id)).where(
            Badge.is_selectable == True,
            Badge.user_id == user.id
        )
    ).one() > 0
    
    if not has_selectable_badge and user_level < 3:
        raise HTTPException(403, "У вас нет права загружать значок")
    
    if not file.filename:
        raise HTTPException(400, "No file provided")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        raise HTTPException(400, f"Неверный формат: {ext}")
    
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (макс 2 МБ)")
    
    # Удаляем старый значок
    if user.custom_badge_url and "cloudinary.com" in user.custom_badge_url:
        try:
            public_id = extract_cloudinary_public_id(user.custom_badge_url)
            if public_id:
                await run_in_threadpool(lambda: cloudinary.uploader.destroy(public_id))
        except Exception:
            pass
    
    # Загружаем новый
    try:
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder="user_badges",
                resource_type="image",
                transformation=[{"width": 100, "height": 100, "crop": "fill"}],
            )
        )
        user.custom_badge_url = result.get("secure_url")
        user.selected_badge_id = None  # 🆕 СБРАСЫВАЕМ СТОКОВЫЙ БЕЙДЖ
        session.add(user)
        session.commit()
        return {"ok": True, "custom_badge_url": user.custom_badge_url}
    except Exception as e:
        raise HTTPException(400, f"Ошибка загрузки: {str(e)}")

@router.delete("/api/me/custom-badge")
def delete_custom_badge(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удалить загруженный значок"""
    if user.custom_badge_url and "cloudinary.com" in user.custom_badge_url:
        try:
            public_id = extract_cloudinary_public_id(user.custom_badge_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    user.custom_badge_url = None
    session.add(user)
    session.commit()
    return {"ok": True}


