# app_split/routers/users.py
# Сгенерировано автоматически. Проверь импорты!

from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile, Header, Query
from sqlmodel import Session, select, delete, func
from typing import Optional, List
from datetime import datetime, timezone
import json, os

from database import get_session
from models import *
from app_split.dependencies import *

router = APIRouter()

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
            "media_type": p.media_type,  # 🆕
        })

    return {
        "users": [user_out(u, session) for u in users],
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


@router.get("/api/users/by-username/{username}")
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


@router.get("/api/users/{identifier}/posts")
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
            "liked_by_me": False,
            "replies_count": replies_counts.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
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


@router.get("/api/users/{identifier}/following")
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


@router.post("/api/users/{user_id}/role")
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
    protect_system_account(target, staff, "менять роль")
    
    # 🛡️ Единый иммунитет
    if target.id != staff.id:
        check_sanction_rights(staff, target, session, "изменять роль этого пользователя")
    
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


@router.get("/api/users/by-username/{username}/followers")
def get_followers_by_username(username: str, session: Session = Depends(get_session)):
    """Получить подписчиков по username"""
    clean_username = username.lstrip("@").lower()
    
    user = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not user:
        raise HTTPException(404, "User not found")
    
    return get_followers(str(user.id), session)


@router.get("/api/users/by-username/{username}/following")
def get_following_by_username(username: str, session: Session = Depends(get_session)):
    """Получить подписки по username"""
    clean_username = username.lstrip("@").lower()
    
    user = session.exec(
        select(User).where(func.lower(User.username) == clean_username)
    ).first()
    
    if not user:
        raise HTTPException(404, "User not found")
    
    return get_following(str(user.id), session)


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
