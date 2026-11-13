from dependencies import ChangePasswordIn, MarkReadingIn, UpdateUserIn, _FOLLOW_CACHE_TTL, _follow_cache, check_password, check_sanction_rights, extract_cloudinary_public_id, get_author_role, get_current_user, get_user_level, has_permission, hash_password, invalidate_follow_cache, limiter, max_level_for, protect_system_account, require_staff, resolve_user, user_out
# app_split/routers/users.py
# Сгенерировано автоматически. Проверь импорты!

from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile, Header, Query
from sqlmodel import Session, select, delete, func
from typing import Optional, List
from datetime import datetime, timezone
import json, os

from database import get_session
from models import *
from dependencies import *

router = APIRouter()

@router.post("/api/me/logout-all")
def logout_all(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user.token_version = getattr(user, "token_version", 0) + 1  # все старые токены становятся невалидными
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
    changed = False

    # display_name — только если реально изменился
    if data.display_name is not None and data.display_name != user.display_name:
        old_name = user.display_name
        user.display_name = data.display_name
        session.add(NickHistory(
            user_id=user.id,
            field="display_name",
            old_value=old_name or "",
            new_value=data.display_name or "",
            changed_by=user.id,
        ))
        changed = True

    # bio — только если передали (может быть пустым для очистки)
    if data.bio is not None:
        user.bio = data.bio.strip()[:500] if data.bio.strip() else None
        changed = True

    if not changed:
        # Ничего не меняли — не пишем NickHistory и не трогаем сессию без нужды
        session.refresh(user)
        return user_out(user, session)

    session.add(user)
    session.commit()
    session.refresh(user)
    return user_out(user, session)


@router.post("/api/me/password")
@limiter.limit("5/minute")
def change_password(
    request: Request,
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

    # 🛡️ Magic bytes check: real file type, not client-declared extension
    ok, verr = validate_upload(content[:16], file.filename, file.content_type,
                               allowed_categories={"image"},
                               allowed_exts={".jpg", ".jpeg", ".png", ".gif", ".webp"})
    if not ok:
        raise HTTPException(400, verr)
    
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
        is_gif = ext == ".gif" or (file.content_type or "") == "image/gif"
        if is_gif:
            # 🎞 GIF: без трансформаций — сохраняем анимацию и исходное качество
            result = await run_in_threadpool(
                lambda: cloudinary.uploader.upload(
                    content,
                    folder=UPLOAD_FOLDER,
                    resource_type="image",
                )
            )
        else:
            # 🖼 Статичные: уменьшаем только если больше 1024px, сохраняем пропорции
            # и ОРИГИНАЛЬНЫЙ формат + явное качество 90 (без «мыла» от quality:auto).
            result = await run_in_threadpool(
                lambda: cloudinary.uploader.upload(
                    content,
                    folder=UPLOAD_FOLDER,
                    resource_type="image",
                    transformation=[{"width": 1024, "height": 1024, "crop": "limit", "quality": 90}],
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

    # 🛡️ Проверяем размер ДО чтения + magic bytes
    err = check_size_before_read(file.headers, 10 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)

    err = check_size_before_read(file.headers, 10 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, f"Файл слишком большой (максимум 10 МБ)")

    ok, verr = validate_upload(content[:16], file.filename, file.content_type,
                               allowed_categories={"image"},
                               allowed_exts={".jpg", ".jpeg", ".png", ".webp"})
    if not ok:
        raise HTTPException(400, verr)
    
    # Удаляем старую обложку
    if user.cover_url and "cloudinary.com" in user.cover_url:
        try:
            public_id = extract_cloudinary_public_id(user.cover_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    
    # Загружаем новую (уменьшаем только если шире 1920px, сохраняем пропорции и кадрирование
    # оставляем CSS object-cover — без обрезки на сервере и без агрессивного auto-сжатия)
    try:
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder=UPLOAD_FOLDER,
                resource_type="image",
                transformation=[{"width": 1920, "height": 1080, "crop": "limit", "quality": 90}],
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


@router.get("/api/users/recommended")
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
            User.is_bot == False,  # 🤖 боты не рекомендуем в правой панели
            User.id != user.id,
            ~User.id.in_(followed_ids)
        )
        .group_by(User.id)
        .order_by(func.count(Follow.follower_id).desc())
        .limit(5)
    )

    results = session.exec(query).all()

    _pre = batch_get_users([u for u, _ in results], session)
    return [
        {**user_out(user_obj, session, _pre.get(user_obj.id)), "followers_count": count}
        for user_obj, count in results
    ]


@router.get("/api/users")
def search_users_by_query(
    q: str = "",
    limit: int = 20,
    session: Session = Depends(get_session),
):
    """Поиск пользователей и постов по query-параметру"""
    if not q.strip():
        return {"users": [], "posts": []}

    pattern = f"%{q.strip().lower()}%"
    users = session.exec(
        select(User)
        .where(
            User.is_bot == False,  # 🤖 системный бот не в поиске
            User.username.ilike(pattern) | User.display_name.ilike(pattern)  # 🚀 ilike вместо func.lower().like()
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

    _pre = batch_get_users(users, session)
    if not posts:
        return {
            "users": [user_out(u, session, _pre.get(u.id)) for u in users],
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
            "dislikes_count": 0,
            "disliked_by_me": False,
            "replies_count": replies_counts.get(p.id, 0),
            "media_type": p.media_type,  # 🆕
        })

    _pre = batch_get_users(users, session)
    return {
        "users": [user_out(u, session, _pre.get(u.id)) for u in users],
        "posts": result_posts
    }


@router.post("/api/users/{identifier}/follow")
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
        invalidate_follow_cache(user.id, target.id)  # 🔥 Сбрасываем кеш
        return {"following": False}
    follow = Follow(follower_id=user.id, followee_id=target.id)
    session.add(follow)
    notif = Notification(user_id=target.id, actor_id=user.id, type="follow")
    session.add(notif)
    session.commit()
    invalidate_follow_cache(user.id, target.id)  # 🔥 Сбрасываем кеш
    return {"following": True}


@router.get("/api/users/{identifier}/is-following")
def is_following(
    identifier: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    target = resolve_user(identifier, session)
    cache_key = (user.id, target.id)
    
    # Проверяем кеш
    now = time.time()
    cached = _follow_cache.get(cache_key)
    if cached:
        cached_time, cached_val = cached
        if now - cached_time < _FOLLOW_CACHE_TTL:
            return {"following": cached_val}
    
    existing = session.exec(
        select(Follow).where(Follow.follower_id == user.id, Follow.followee_id == target.id)
    ).first()
    result = existing is not None
    
    _follow_cache[cache_key] = (now, result)
    return {"following": result}


@router.get("/api/users/{identifier}")
def get_user_profile(
    identifier: str,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    user = resolve_user(identifier, session)
    # 🛡 Приватный аккаунт: неавторизованные и не-подписчики видят только замок
    if not _can_view_profile(viewer, user, session):
        return _profile_locked_response(user)
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


@router.get("/api/users/by-username/{username}")
def get_user_by_username(
    username: str,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    """Получить профиль пользователя по username (без @)"""
    # Убираем @ если пользователь передал с ним
    clean_username = username.lstrip("@").lower()
    
    user = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not user:
        raise HTTPException(404, "User not found")
    
    # 🛡 Приватный аккаунт: замок для неавторизованных и не-подписчиков
    if not _can_view_profile(viewer, user, session):
        return _profile_locked_response(user)

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


@router.get("/api/users/{identifier}/posts")
def get_user_posts(
    identifier: str,
    cursor: Optional[int] = None,
    limit: int = 20,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    user = resolve_user(identifier, session)
    # 🛡 Приватный аккаунт: посты видят только подписчики (+ staff с manage_users)
    if not _can_view_profile(viewer, user, session):
        raise HTTPException(403, "Приватный аккаунт")
    query = (
        select(Post)
        .where(Post.author_id == user.id, Post.reply_to_id == None)
        .order_by(Post.created_at.desc())
    )
    if cursor:
        last_post = session.get(Post, cursor)
        if last_post:
            # 🚀 Учитываем одинаковое время создания
            query = query.where(
                (Post.created_at < last_post.created_at) |
                ((Post.created_at == last_post.created_at) & (Post.id < last_post.id))
            )

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

    dislikes_counts = dict(session.exec(
        select(Dislike.post_id, func.count(Dislike.id))
        .where(Dislike.post_id.in_(post_ids))
        .group_by(Dislike.post_id)
    ).all())

    # 🆕 Загрузка лайков и дизлайков текущего пользователя (viewer)
    liked_ids = set()
    disliked_ids = set()
    if viewer:
        liked_ids = set(session.exec(
            select(Like.post_id).where(Like.user_id == viewer.id, Like.post_id.in_(post_ids))
        ).all())
        disliked_ids = set(session.exec(
            select(Dislike.post_id).where(Dislike.user_id == viewer.id, Dislike.post_id.in_(post_ids))
        ).all())

    # 🆕 Массовая загрузка оригинальных постов для репостов
    repost_ids = list({p.repost_of_id for p in posts if p.repost_of_id})
    originals_map = {}
    if repost_ids:
        orig_posts = session.exec(select(Post).where(Post.id.in_(repost_ids))).all()
        orig_author_ids = {p.author_id for p in orig_posts}
        orig_authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(orig_author_ids))).all()}
        for op in orig_posts:
            originals_map[op.id] = {
                "id": op.id,
                "author_id": op.author_id,
                "author": orig_authors.get(op.author_id),
                "text": op.text,
                "media_url": op.media_url,
                "created_at": op.created_at.isoformat(),
                "media_type": op.media_type,  # 🆕
            }

    result = []
    for p in posts:
        author = authors.get(p.author_id)
        
        # 🆕 Формируем данные репоста/цитаты
        repost_data = None
        is_repost = False
        is_quote = False
        if p.repost_of_id:
            orig = originals_map.get(p.repost_of_id)
            if orig:
                orig_author = orig["author"]
                repost_data = {
                    "id": orig["id"],
                    "author_id": orig["author_id"],
                    "author": orig_author.display_name if orig_author else "Удалённый пользователь",
                    "handle": f"@{orig_author.username}" if orig_author else "@deleted",
                    "author_avatar": orig_author.avatar_url if orig_author else None,
                    "author_is_admin": orig_author.is_admin if orig_author else False,
                    "author_is_moderator": orig_author.is_moderator if orig_author else False,
                    "author_role": get_author_role(orig_author, session) if orig_author else None,
                    "text": orig["text"],
                    "media_url": orig["media_url"],
                    "created_at": orig["created_at"],
                }
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())
            else:
                # Оригинал был удалён
                repost_data = {"deleted": True}
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())

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
            "dislikes_count": dislikes_counts.get(p.id, 0),
            "disliked_by_me": p.id in disliked_ids,
            "replies_count": replies_counts.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
            "edited_at": p.edited_at.isoformat() if p.edited_at else None,
            "media_type": p.media_type,  # 🆕
            "repost_of": repost_data,      # 🆕
            "is_repost": is_repost,         # 🆕
            "is_quote": is_quote,           # 🆕
            
        })

    has_more = len(posts) == limit

    return {
        "posts": result,
        "has_more": has_more,
        "next_cursor": posts[-1].id if posts else None,
    }


@router.get("/api/users/{identifier}/followers")
def get_followers(
    identifier: str,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    user = resolve_user(identifier, session)
    # 🛡 Приватный аккаунт или скрытый список подписчиков — только для себя/staff
    if not _can_view_profile(viewer, user, session):
        raise HTTPException(403, "Приватный аккаунт")
    if getattr(user, "hide_followers", False) and (
        viewer is None or (viewer.id != user.id and not viewer.is_admin and not viewer.is_moderator
                           and not has_permission(viewer, "manage_users", session))
    ):
        raise HTTPException(403, "Список подписчиков скрыт настройками приватности")
    follows = session.exec(
        select(Follow).where(Follow.followee_id == user.id)
    ).all()
    
    if not follows:
        return []
    
    user_ids = [f.follower_id for f in follows]
    users = session.exec(
        select(User).where(User.id.in_(user_ids))
    ).all()
    
    _pre = batch_get_users(users, session)
    return [user_out(u, session, _pre.get(u.id)) for u in users]


@router.get("/api/users/{identifier}/following")
def get_following(
    identifier: str,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    user = resolve_user(identifier, session)
    # 🛡 Приватный аккаунт или скрытый список «читает» — только для себя/staff
    if not _can_view_profile(viewer, user, session):
        raise HTTPException(403, "Приватный аккаунт")
    if getattr(user, "hide_following", False) and (
        viewer is None or (viewer.id != user.id and not viewer.is_admin and not viewer.is_moderator
                           and not has_permission(viewer, "manage_users", session))
    ):
        raise HTTPException(403, "Список подписок скрыт настройками приватности")
    follows = session.exec(
        select(Follow).where(Follow.follower_id == user.id)
    ).all()
    
    if not follows:
        return []
    
    user_ids = [f.followee_id for f in follows]
    users = session.exec(
        select(User).where(User.id.in_(user_ids))
    ).all()
    
    _pre = batch_get_users(users, session)
    return [user_out(u, session, _pre.get(u.id)) for u in users]


@router.post("/api/users/{user_id}/role")
def assign_role(
    user_id: int,
    role_id: Optional[int] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    can_manage = has_permission(staff, "manage_roles", session)
    can_assign = has_permission(staff, "assign_roles", session)
    if not can_manage and not can_assign:
        raise HTTPException(403, "Нет права: manage_roles или assign_roles")

    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    protect_system_account(target, staff, "менять роль")

    if target.id != staff.id:
        check_sanction_rights(staff, target, session, "изменять роль этого пользователя")

    # 🆕 Founder (уровень 10+) может надеть на себя ЛЮБУЮ роль (обход иерархии отделов/уровней)
    is_self = target.id == staff.id
    self_founder = is_self and get_user_level(staff, session) >= 10

    if not self_founder:
        allowed_ids = {r.id for r in assignable_roles_for(staff, session)}
        if role_id:
            if role_id not in allowed_ids:
                raise HTTPException(403, "Эту роль назначить нельзя: уровень или чужой отдел")
        else:
            # Снятие роли: лидер может снять только ту, которую сам мог выдать
            if not can_manage and target.role_id and target.role_id not in allowed_ids:
                raise HTTPException(403, "Недостаточно прав, чтобы снять эту роль")

    old_role_id = target.role_id
    target.role_id = role_id
    session.add(target)
    session.commit()

    session.add(RoleHistory(
        user_id=target.id,
        old_role_id=old_role_id,
        new_role_id=role_id,
        changed_by=staff.id,
    ))
    session.commit()

    # 🔄 Плашка → рабочий чат отдела: получил staff-роль — добавили в чат,
    #    снял — убрали из чата.
    try:
        from work_chats import sync_user_work_membership
        sync_user_work_membership(session, target, staff)
    except Exception as _e:
        print("work membership sync:", _e)

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


@router.get("/api/users/{user_id}/public-key")
def get_user_public_key(user_id: int, session: Session = Depends(get_session)):
    key = session.exec(select(UserKey).where(UserKey.user_id == user_id)).first()
    if not key:
        raise HTTPException(404, "У пользователя нет ключа")
    return {
        "public_key": key.public_key,
        "fingerprint": key.fingerprint,
        "is_pending": getattr(key, 'is_pending', False),
    }


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


def get_reply_preview(session: Session, reply_to_id: int) -> dict | None:
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
            "video_note": "📹 Видеокружок",
            "gif": "🎞️ GIF",
        }
        preview_text = media_labels.get(original.media_type, "📎 Вложение")
    return {
        "id": original.id,
        "sender_name": sender.display_name if sender else "Unknown",
        "sender_id": original.sender_id,
        "text": preview_text[:120],
        "media_type": original.media_type,
    }


@router.get("/api/users/by-username/{username}/posts")
def get_user_posts_by_username(
    username: str,
    cursor: Optional[int] = None,
    limit: int = 20,
    viewer: Optional[User] = Depends(get_optional_user),
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
    return get_user_posts(str(user.id), cursor, limit, viewer, session)


@router.get("/api/users/by-username/{username}/followers")
def get_followers_by_username(
    username: str,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    """Получить подписчиков по username"""
    clean_username = username.lstrip("@").lower()
    
    user = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not user:
        raise HTTPException(404, "User not found")
    
    return get_followers(str(user.id), viewer, session)


@router.get("/api/users/by-username/{username}/following")
def get_following_by_username(
    username: str,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    """Получить подписки по username"""
    clean_username = username.lstrip("@").lower()
    
    user = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not user:
        raise HTTPException(404, "User not found")
    
    return get_following(str(user.id), viewer, session)


@router.get("/api/users/by-username/{username}/is-following")
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


@router.post("/api/users/by-username/{username}/follow")
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

def require_announcer(
    authorization: str = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    """Founder/System ИЛИ право manage_announcements"""
    user = get_current_user(authorization=authorization, session=session)
    if get_user_level(user, session) >= 10 or has_permission(user, "manage_announcements", session):
        return user
    raise HTTPException(403, "Нужен уровень Founder или право manage_announcements")



# ==== (миграция из main.py) ====
@router.delete("/api/me/avatar")
@limiter.limit("5/minute")
async def delete_own_avatar(
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удаление своей аватарки (обнуление avatar_url)"""
    if not user.avatar_url:
        raise HTTPException(400, "Аватарка уже отсутствует")

    # Удаляем файл из Cloudinary, если он там лежит
    if "cloudinary.com" in user.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(user.avatar_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception as e:
            print(f"  ⚠️ Failed to delete avatar from cloudinary: {e}")

    user.avatar_url = None
    session.add(user)
    session.commit()
    return {"ok": True, "avatar_url": None}


@router.get("/api/me/privacy")
async def get_privacy_settings(user: User = Depends(get_current_user)):
    """🛡 Настройки приватности профиля (полный набор, Twitter-like)."""
    return {
        "is_private": getattr(user, "is_private", False),
        "allow_messages": user.allow_messages,
        "allow_calls": user.allow_calls,
        "allow_comments": getattr(user, "allow_comments", "everyone"),
        "hide_following": getattr(user, "hide_following", False),
        "hide_followers": getattr(user, "hide_followers", False),
    }


@router.patch("/api/me/privacy")
async def update_privacy_settings(
    data: PrivacyIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    for key, allowed in _PROFILE_PRIVACY_STRINGS.items():
        value = getattr(data, key)
        if value is not None:
            if value not in allowed:
                raise HTTPException(400, f"Недопустимое значение {key}")
            setattr(user, key, value)
    for key in _PROFILE_PRIVACY_BOOLS:
        value = getattr(data, key)
        if value is not None:
            setattr(user, key, bool(value))
    session.add(user)
    session.commit()
    return {
        "is_private": getattr(user, "is_private", False),
        "allow_messages": user.allow_messages,
        "allow_calls": user.allow_calls,
        "allow_comments": getattr(user, "allow_comments", "everyone"),
        "hide_following": getattr(user, "hide_following", False),
        "hide_followers": getattr(user, "hide_followers", False),
    }
