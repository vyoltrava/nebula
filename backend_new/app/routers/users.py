# ============================================================
# app/routers/users.py
# ============================================================

from fastapi import APIRouter
from app.deps import *  # noqa: F401,F403  (shared helpers + imports)

router = APIRouter()

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

    allowed_ids = {r.id for r in assignable_roles_for(staff, session)}
    if role_id:
        if role_id not in allowed_ids:
            raise HTTPException(403, "Эту роль назначить нельзя: уровень или чужой отдел")
    else:
        # Снятие роли: лидер может снять только ту, которую сам мог выдать
        if not can_manage and target.role_id and target.role_id not in allowed_ids:
            raise HTTPException(403, "Недостаточно прав, чтобы снять эту роль")

    target.role_id = role_id
    session.add(target)
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


# ---------- ЭНДПОИНТЫ ПО USERNAME ----------

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


@router.patch("/api/users/me/prism-anchor")
async def update_prism_anchor(
    shard1_encrypted: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Обновление Якоря пользователя (например, при смене PIN-кода)"""
    user.prism_anchor = shard1_encrypted
    session.add(user)
    session.commit()
    return {"ok": True}


