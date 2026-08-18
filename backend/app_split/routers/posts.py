# app_split/routers/posts.py
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

@router.get("/api/posts/following")
def get_following_posts(
    cursor: Optional[int] = None,
    limit: int = 20,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    follows = session.exec(select(Follow).where(Follow.follower_id == user.id)).all()
    followee_ids = [f.followee_id for f in follows]

    if not followee_ids:
        return {"posts": [], "has_more": False, "next_cursor": None}

    query = (
        select(Post)
        .where(Post.reply_to_id == None, Post.author_id.in_(followee_ids))
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

    # Массовые запросы
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

    liked_ids = set(session.exec(
        select(Like.post_id).where(Like.user_id == user.id, Like.post_id.in_(post_ids))
    ).all())

    # ... (предыдущий код функции) ...
    bookmarked_ids = set(session.exec(
        select(Bookmark.post_id).where(Bookmark.user_id == user.id, Bookmark.post_id.in_(post_ids))
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
                "id": op.id, "author_id": op.author_id,
                "author": orig_authors.get(op.author_id),
                "text": op.text, "media_url": op.media_url,
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
                    "id": orig["id"], "author_id": orig["author_id"],
                    "author": orig_author.display_name if orig_author else "Удалённый пользователь",
                    "handle": f"@{orig_author.username}" if orig_author else "@deleted",
                    "author_avatar": orig_author.avatar_url if orig_author else None,
                    "author_is_admin": orig_author.is_admin if orig_author else False,
                    "author_is_moderator": orig_author.is_moderator if orig_author else False,
                    "author_role": get_author_role(orig_author, session) if orig_author else None,
                    "text": orig["text"], "media_url": orig["media_url"],
                    "created_at": orig["created_at"],
                }
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())
            else:
                repost_data = {"deleted": True}
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())

        result.append({
            "id": p.id, "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "author_avatar": author.avatar_url if author else None,
            "author_is_admin": author.is_admin if author else False,
            "author_is_moderator": author.is_moderator if author else False,
            "author_is_banned": author.is_banned if author else False,
            "author_role": get_author_role(author, session) if author else None,
            "text": p.text, "media_url": p.media_url,
            "likes_count": likes_counts.get(p.id, 0),
            "liked_by_me": p.id in liked_ids,
            "bookmarked": p.id in bookmarked_ids,
            "replies_count": replies_counts.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
            "media_type": p.media_type,  # 🆕
            "repost_of": repost_data,
            "is_repost": is_repost,
            "is_quote": is_quote,
        })
    has_more = len(posts) == limit

    return {
        "posts": result,
        "has_more": has_more,
        "next_cursor": posts[-1].id if posts else None,
    }


@router.get("/api/posts/liked", response_model=list[PostOut])
def get_liked_posts(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    likes = session.exec(
        select(Like).where(Like.user_id == user.id).order_by(Like.created_at.desc())
    ).all()

    post_ids = [l.post_id for l in likes]

    if not post_ids:
        return []

    posts = session.exec(select(Post).where(Post.id.in_(post_ids))).all()

    if not posts:
        return []

    # Массовые запросы
    ids = [p.id for p in posts]
    author_ids = list({p.author_id for p in posts})

    authors = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(author_ids))
        ).all()
    }

    likes_counts = dict(session.exec(
        select(Like.post_id, func.count(Like.id))
        .where(Like.post_id.in_(ids))
        .group_by(Like.post_id)
    ).all())

    result = []
    for p in posts:
        author = authors.get(p.author_id)
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
            "liked_by_me": True,
            "replies_count": 0,
            "views_count": p.views_count or 0,
            "media_type": p.media_type,  # 🆕
            "created_at": p.created_at.isoformat(),
        })
    return result


@router.get("/api/posts/{post_id}/replies")
def get_replies(post_id: int, session: Session = Depends(get_session)):
    # 1. BFS для сбора всех ID в дереве
    post_ids_in_thread = {post_id}
    queue = [post_id]

    while queue:
        current_id = queue.pop(0)
        children = session.exec(
            select(Post.id).where(Post.reply_to_id == current_id)
        ).all()
        for child_id in children:
            if child_id not in post_ids_in_thread:
                post_ids_in_thread.add(child_id)
                queue.append(child_id)

    id_list = list(post_ids_in_thread)

    # 2. Один запрос на все ответы
    replies = session.exec(
        select(Post).where(Post.id.in_(id_list), Post.id != post_id)
        .order_by(Post.created_at.asc())
    ).all()

    if not replies:
        return []

    reply_ids = [p.id for p in replies]

    # 3. Массовые запросы для лайков и ответов
    likes_counts = dict(session.exec(
        select(Like.post_id, func.count(Like.id))
        .where(Like.post_id.in_(reply_ids))
        .group_by(Like.post_id)
    ).all())

    replies_counts = dict(session.exec(
        select(Post.reply_to_id, func.count(Post.id))
        .where(Post.reply_to_id.in_(reply_ids))
        .group_by(Post.reply_to_id)
    ).all())

    # 4. Массовый запрос авторов
    author_ids = list({p.author_id for p in replies})
    authors = {u.id: u for u in session.exec(
        select(User).where(User.id.in_(author_ids))
    ).all()}

    # 5. Собираем результат
    result = []
    for p in replies:
        author = authors.get(p.author_id)

        parent_info = None
        if p.reply_to_id and p.reply_to_id != post_id:
            parent_post = session.get(Post, p.reply_to_id)
            if parent_post:
                parent_author = authors.get(parent_post.author_id)
                if parent_author:
                    parent_info = {
                        "id": parent_post.id,
                        "author_id": parent_author.id,
                        "author_name": parent_author.display_name,
                        "author_username": parent_author.username,
                    }

        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "username": author.username if author else "unknown",
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
            "reply_to_id": p.reply_to_id,
            "parent": parent_info,
            "media_type": p.media_type,  # 🆕
            "created_at": p.created_at.isoformat(),
        })

    return result


@router.get("/api/posts/{post_id}/echo")
def get_echo_tree(post_id: int, session: Session = Depends(get_session)):
    """Рекурсивный сбор всей цепочки репостов и цитат ОТ КОРНЯ"""
    # 1. Находим корневой пост (оригинал), поднимаясь вверх по repost_of_id
    root_id = post_id
    current = session.get(Post, post_id)
    while current and current.repost_of_id:
        root_id = current.repost_of_id
        current = session.get(Post, root_id)
    
    # 2. BFS от корня — собираем ВСЕХ потомков
    visited = set()
    queue = [root_id]
    all_ids = []
    while queue:
        curr = queue.pop(0)
        if curr in visited:
            continue
        visited.add(curr)
        all_ids.append(curr)
        children = session.exec(select(Post.id).where(Post.repost_of_id == curr)).all()
        for c in children:
            if c not in visited:
                queue.append(c)
    
    if not all_ids:
        return []
    
    posts = session.exec(select(Post).where(Post.id.in_(all_ids))).all()
    author_ids = list({p.author_id for p in posts})
    authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(author_ids))).all()}
    
    # Массовый подсчет лайков
    likes_map = dict(session.exec(
        select(Like.post_id, func.count(Like.id))
        .where(Like.post_id.in_(all_ids))
        .group_by(Like.post_id)
    ).all())
    
    result = []
    for p in posts:
        author = authors.get(p.author_id)
        result.append({
            "id": p.id,
            "author_id": p.author_id,
            "author": author.display_name if author else "Unknown",
            "handle": f"@{author.username}" if author else "@unknown",
            "author_avatar": author.avatar_url if author else None,
            "text": p.text,
            "media_url": p.media_url,
            "created_at": p.created_at.isoformat(),
            "repost_of_id": p.repost_of_id,
            "is_quote": bool(p.text.strip()),
            "likes_count": likes_map.get(p.id, 0),
        })
    return result


@router.get("/api/posts/{post_id}")
def get_single_post(
    post_id: int,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    
    author = session.get(User, post.author_id)
    likes_count = session.exec(select(func.count()).select_from(Like).where(Like.post_id == post_id)).one()
    replies_count = session.exec(select(func.count()).select_from(Post).where(Post.reply_to_id == post_id)).one()
    
    liked_by_me = False
    bookmarked = False
    if viewer:
        liked_by_me = session.exec(select(Like).where(Like.user_id == viewer.id, Like.post_id == post_id)).first() is not None
        bookmarked = session.exec(select(Bookmark).where(Bookmark.user_id == viewer.id, Bookmark.post_id == post_id)).first() is not None

    repost_data = None
    is_repost = False
    is_quote = False
    if post.repost_of_id:
        orig = session.get(Post, post.repost_of_id)
        if orig:
            orig_author = session.get(User, orig.author_id)
            repost_data = {
                "id": orig.id, "author_id": orig.author_id,
                "author": orig_author.display_name if orig_author else "Удалённый пользователь",
                "handle": f"@{orig_author.username}" if orig_author else "@deleted",
                "author_avatar": orig_author.avatar_url if orig_author else None,
                "author_is_admin": orig_author.is_admin if orig_author else False,
                "author_is_moderator": orig_author.is_moderator if orig_author else False,
                "author_role": get_author_role(orig_author, session) if orig_author else None,
                "text": orig.text, "media_url": orig.media_url,
                "media_type": orig.media_type, "created_at": orig.created_at.isoformat(),
            }
            is_repost = not post.text.strip()
            is_quote = bool(post.text.strip())
        else:
            repost_data = {"deleted": True}
            is_repost = not post.text.strip()
            is_quote = bool(post.text.strip())

    return {
        "id": post.id, "author_id": post.author_id,
        "author": author.display_name if author else "Unknown",
        "handle": f"@{author.username}" if author else "@unknown",
        "author_avatar": author.avatar_url if author else None,
        "author_is_admin": author.is_admin if author else False,
        "author_is_moderator": author.is_moderator if author else False,
        "author_is_banned": author.is_banned if author else False,
        "author_role": get_author_role(author, session) if author else None,
        "text": post.text, "media_url": post.media_url, "media_type": post.media_type,
        "likes_count": likes_count, "liked_by_me": liked_by_me, "bookmarked": bookmarked,
        "replies_count": replies_count, "views_count": post.views_count or 0,
        "created_at": post.created_at.isoformat(), "reply_to_id": post.reply_to_id,
        "repost_of": repost_data, "is_repost": is_repost, "is_quote": is_quote,
    }


@router.post("/api/posts/{post_id}/like")
@limiter.limit("30/minute")
async def toggle_like(
    request: Request,
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(Like).where(Like.user_id == user.id, Like.post_id == post_id)
    ).first()
    
    # True, если мы ставим лайк. False, если снимаем.
    is_liking = not bool(existing)
    
    if existing:
        session.delete(existing)
    else:
        like = Like(user_id=user.id, post_id=post_id)
        session.add(like)
        log_action(session, user.id, "like_post", target_type="post", target_id=post_id)
        
        # Уведомление автору поста
        post = session.get(Post, post_id)
        if post and post.author_id != user.id:
            notif = Notification(user_id=post.author_id, actor_id=user.id, type="like", post_id=post_id)
            session.add(notif)
            
    session.commit()
    
    # Считаем актуальное количество лайков после коммита
    cnt = session.exec(
        select(func.count()).select_from(Like).where(Like.post_id == post_id)
    ).one()
    
    # 🚀 Единый payload для WebSocket (всё, что нужно фронту)
    ws_payload = {
        "post_id": post_id,
        "likes_count": cnt,
        "liker_id": user.id,      # 👈 КРИТИЧЕСКИ ВАЖНО: фронт должен знать, КТО лайкнул
        "liked": is_liking,       # 👈 True (поставил) / False (снял)
    }
    
    # Рассылаем ВСЕМ подключенным клиентам (включая второе/третье устройство этого же юзера)
    await manager.broadcast_all("post_liked", ws_payload)
    
    # Возвращаем полные данные на фронт, чтобы UI обновился мгновенно из HTTP-ответа
    return {
        "liked": is_liking,
        "likes_count": cnt
    }


@router.post("/api/posts/{post_id}/bookmark")
@limiter.limit("30/minute")
def toggle_bookmark(
    request: Request,
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    
    existing = session.exec(
        select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.post_id == post_id)
    ).first()
    if existing:
        session.delete(existing)
        session.commit()
        return {"bookmarked": False}
    
    session.add(Bookmark(user_id=user.id, post_id=post_id))
    session.commit()
    return {"bookmarked": True}


@router.get("/api/posts/{post_id}/is-bookmarked")
def is_bookmarked(
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.post_id == post_id)
    ).first()
    return {"bookmarked": existing is not None}


@router.get("/api/posts/{post_id}/is-liked")
def is_liked(
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(Like).where(Like.user_id == user.id, Like.post_id == post_id)
    ).first()
    return {"liked": existing is not None}


@router.delete("/api/posts/{post_id}")
async def delete_post(
    request: Request,
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    if post.author_id != user.id and not has_permission(user, "delete_posts", session):
        raise HTTPException(403, "Not your post")
    # 🛡️ Чужой пост — только если цель ниже по иерархии (Founder/Developer неприкосновенны)
    if post.author_id != user.id:
        author = session.get(User, post.author_id)
        if author:
            check_sanction_rights(user, author, session, "удалять посты этого пользователя")
    await cascade_delete_post(post_id, session)
    log_action(
        session, user.id, "delete_post",
        target_type="post", target_id=post_id,
        details={"text": post.text[:100] if post.text else None},
        ip_address=get_client_ip(request),
    )
    session.commit()
    await manager.broadcast_all("post_deleted", {"post_id": post_id})
    return {"ok": True}


@router.delete("/api/posts/{post_id}/repost")
async def cancel_repost(
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отменить свой репост (удаляет пост-репост, а не оригинал)"""
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    if post.author_id != user.id:
        raise HTTPException(403, "Это не ваш репост")
    if not post.repost_of_id:
        raise HTTPException(400, "Это не репост")
    
    # Каскадно удаляем сам репост
    cascade_delete_post(post.id, session)
    await manager.broadcast_all("post_deleted", {"post_id": post.id})
    return {"ok": True}


@router.get("/api/posts")
def get_posts(
    cursor: Optional[int] = None,
    limit: int = 20,
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    query = select(Post).where(Post.reply_to_id == None).order_by(Post.created_at.desc())
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

    ids = [p.id for p in posts]
    repost_ids = list({p.repost_of_id for p in posts if p.repost_of_id})

    authors = session.exec(select(User).where(User.id.in_({p.author_id for p in posts}))).all()
    authors_map = {u.id: u for u in authors}

    likes_map = dict(session.exec(
        select(Like.post_id, func.count()).where(Like.post_id.in_(ids)).group_by(Like.post_id)
    ).all())
    replies_map = dict(session.exec(
        select(Post.reply_to_id, func.count()).where(Post.reply_to_id.in_(ids)).group_by(Post.reply_to_id)
    ).all())

    # 🆕 Загрузка оригинальных постов для репостов
    originals_map = {}
    if repost_ids:
        orig_posts = session.exec(select(Post).where(Post.id.in_(repost_ids))).all()
        orig_author_ids = {op.author_id for op in orig_posts}
        orig_authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(orig_author_ids))).all()}
        for op in orig_posts:
            originals_map[op.id] = {
                "id": op.id,
                "author_id": op.author_id,
                "author": orig_authors.get(op.author_id),
                "text": op.text,
                "media_url": op.media_url,
                "media_type": op.media_type,  # ✅ op, не p!
                "created_at": op.created_at.isoformat(),
            }

    liked_ids = set()
    bookmarked_ids = set()
    if viewer:
        liked_ids = set(session.exec(
            select(Like.post_id).where(Like.user_id == viewer.id, Like.post_id.in_(ids))
        ).all())
        bookmarked_ids = set(session.exec(
            select(Bookmark.post_id).where(Bookmark.user_id == viewer.id, Bookmark.post_id.in_(ids))
        ).all())

    result = []
    for p in posts:
        author = authors_map.get(p.author_id)

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
                    "media_type": orig["media_type"],  # ✅ из originals_map
                    "created_at": orig["created_at"],
                }
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())
            else:
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
            "media_type": p.media_type,  # ✅ p здесь — это текущий пост
            "likes_count": likes_map.get(p.id, 0),
            "liked_by_me": p.id in liked_ids,
            "bookmarked": p.id in bookmarked_ids,
            "replies_count": replies_map.get(p.id, 0),
            "created_at": p.created_at.isoformat(),
            "views_count": p.views_count or 0,
            "repost_of": repost_data,
            "is_repost": is_repost,
            "is_quote": is_quote,
        })

    return {
        "posts": result,
        "has_more": len(posts) == limit,
        "next_cursor": posts[-1].id if posts else None,
    }


@router.post("/api/posts")
@limiter.limit("10/minute")
async def create_post(
    request: Request,
    text: str = Form(""),
    reply_to: Optional[int] = Form(None),
    repost_of: Optional[int] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not text.strip() and not file and not repost_of:
        raise HTTPException(400, "Пост не может быть пустым")
    
    if repost_of and reply_to:
        raise HTTPException(400, "Нельзя одновременно отвечать и репостить")

    original_post = None
    if repost_of:
        original_post = session.get(Post, repost_of)
        if not original_post:
            raise HTTPException(404, "Оригинальный пост не найден")
        if original_post.repost_of_id:
            raise HTTPException(400, "Нельзя репостить репост")
        if original_post.author_id == user.id:
            raise HTTPException(400, "Нельзя репостить свой же пост")

    media_url = None
    media_type = None
    if file and file.filename:
        ext = os.path.splitext(file.filename)[1].lower()
        content_type = (file.content_type or "").lower()
        
        # 🎯 ПРАВИЛЬНОЕ определение типа: по MIME, а не по расширению
        # audio/webm → аудио, video/webm → видео
        is_audio = (
            ext in ALLOWED_AUDIO_EXT 
            or content_type.startswith("audio/")
            or (ext == ".webm" and "audio" in content_type)
        )
        is_video = (
            ext in ALLOWED_VIDEO_EXT 
            or content_type.startswith("video/")
            or (ext == ".webm" and "video" in content_type)
        )
        is_image = ext in ALLOWED_IMAGE_EXT or content_type.startswith("image/")
        
        if is_audio:
            user_level = get_user_level(user, session)
            if user_level < 2:
                raise HTTPException(403, "🎙️ Голосовые посты доступны только со 2-го уровня и выше")
            media_type = "audio"
            resource_type = "video"  # Cloudinary хранит аудио как video
        elif is_image:
            media_type = "image"
            resource_type = "image"
        elif is_video:
            media_type = "video"
            resource_type = "video"
        else:
            raise HTTPException(400, f"Неподдерживаемый формат файла: {ext} ({content_type})")

        content = await file.read()
        if len(content) > 50 * 1024 * 1024:  # 50 МБ для аудио/видео
            raise HTTPException(400, "Файл слишком большой (максимум 50 МБ)")
        
        try:
            result = await run_in_threadpool(
                lambda: cloudinary.uploader.upload(
                    content, folder=UPLOAD_FOLDER, resource_type=resource_type
                )
            )
            media_url = result.get("secure_url")
        except Exception as e:
            raise HTTPException(400, f"Ошибка загрузки: {str(e)}")

    if repost_of and not text.strip() and media_url:
        raise HTTPException(400, "Обычный репост не может содержать медиа")

    post = Post(
        author_id=user.id,
        text=text.strip() if text else "",
        media_url=media_url,
        media_type=media_type,  # 🆕
        reply_to_id=reply_to,
        repost_of_id=repost_of,
    )
    session.add(post)
    session.commit()
    session.refresh(post)


    # Теги и упоминания (только для цитат и обычных постов)
    if text.strip():
        for tag_name in extract_tags(text):
            tag = session.exec(select(Tag).where(Tag.name == tag_name)).first()
            if not tag:
                tag = Tag(name=tag_name)
                session.add(tag)
                session.commit()
                session.refresh(tag)
            session.add(PostTag(post_id=post.id, tag_id=tag.id))

        for username in extract_mentions(text):
            mentioned = session.exec(
                select(User).where(func.lower(User.username) == username)
            ).first()
            if mentioned and mentioned.id != user.id:
                session.add(Notification(
                    user_id=mentioned.id, actor_id=user.id,
                    type="mention", post_id=post.id,
                ))

    # Уведомление автору оригинала о репосте/цитате
    if original_post and original_post.author_id != user.id:
        notif_type = "quote" if text.strip() else "repost"
        session.add(Notification(
            user_id=original_post.author_id,
            actor_id=user.id,
            type=notif_type,
            post_id=post.id,
        ))

    # Ответ на пост
    if reply_to:
        parent = session.get(Post, reply_to)
        if parent and parent.author_id != user.id:
            session.add(Notification(
                user_id=parent.author_id, actor_id=user.id, type="reply",
            ))

    log_action(
        session, user.id, "create_post",
        target_type="post", target_id=post.id,
        details={
            "text": post.text[:100] if post.text else None,
            "is_repost": bool(repost_of),
        },
        ip_address=get_client_ip(request),
    )
    session.commit()

    # WebSocket рассылка (только для корневых постов)
    if not reply_to:
        post_data = {
            "id": post.id,
            "author_id": post.author_id,
            "author": user.display_name,
            "handle": f"@{user.username}",
            "username": user.username,
            "author_avatar": user.avatar_url,
            "author_is_admin": user.is_admin,
            "author_is_moderator": user.is_moderator,
            "author_is_banned": user.is_banned,
            "author_role": get_author_role(user, session),
            "text": post.text,
            "media_url": post.media_url,
            "likes_count": 0,
            "liked_by_me": False,
            "bookmarked": False,
            "replies_count": 0,
            "created_at": post.created_at.isoformat(),
            "views_count": 0,
            "repost_of_id": post.repost_of_id,  # 🆕
            "media_type": post.media_type,  # 🆕
        }
        
        # Если это репост/цитата — подгружаем оригинал для WebSocket
        if post.repost_of_id and original_post:
            orig_author = session.get(User, original_post.author_id)
            post_data["repost_of"] = {
                "id": original_post.id,
                "author_id": original_post.author_id,
                "author": orig_author.display_name if orig_author else "Unknown",
                "handle": f"@{orig_author.username}" if orig_author else "@unknown",
                "author_avatar": orig_author.avatar_url if orig_author else None,
                "text": original_post.text,
                "media_url": original_post.media_url,
            }
        
        await manager.broadcast_all("new_post", post_data)

    return {
        "id": post.id,
        "author_id": post.author_id,
        "author": user.display_name,
        "handle": f"@{user.username}",
        "author_avatar": user.avatar_url,
        "author_is_admin": user.is_admin,
        "author_is_moderator": user.is_moderator,
        "author_is_banned": user.is_banned,
        "author_role": get_author_role(user, session),
        "text": post.text,
        "media_url": post.media_url,
        "likes_count": 0,
        "liked_by_me": False,
        "replies_count": 0,
        "created_at": post.created_at.isoformat(),
        "views_count": 0,
        "repost_of_id": post.repost_of_id,  # 🆕
        "media_type": post.media_type,
    }


@router.post("/api/video-note")
@limiter.limit("10/minute")
async def process_video_note(
    request: Request,
    file: UploadFile = File(...),
    mirror: str = Form("0"),
    size: str = Form("640"),
    user: User = Depends(get_current_user),
):
    """Обрезает видео в квадрат, применяет зеркало, отдаёт mp4"""
    if not file.filename:
        raise HTTPException(400, "No file provided")
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_VIDEO_EXT:
        raise HTTPException(400, f"Неверный формат: {ext}")
    
    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (макс 50 МБ)")
    
    target_size = int(size) if size.isdigit() else 640
    
    # Временные файлы
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_in:
        tmp_in.write(content)
        input_path = tmp_in.name
    
    output_path = input_path.replace(ext, "_square.mp4")
    
    try:
        # Фильтр ffmpeg: квадрат по центру → ресайз → зеркало (если нужно)
        vf = f"crop=min(iw\\,ih):min(iw\\,ih):(iw-min(iw\\,ih))/2:(ih-min(iw\\,ih))/2,scale={target_size}:{target_size}"
        if mirror == "1":
            vf += ",hflip"
        
        cmd = [
            get_ffmpeg_exe(), "-y", "-i", input_path,
            "-vf", vf,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "128k",
            "-pix_fmt", "yuv420p",
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        
        if result.returncode != 0:
            print(f"FFMPEG ERROR: {result.stderr}")
            raise HTTPException(500, "Ошибка обработки видео")
        
        with open(output_path, "rb") as f:
            output_bytes = f.read()
        
        return Response(
            content=output_bytes,
            media_type="video/mp4",
            headers={"Content-Disposition": f"attachment; filename=video-note-{int(time.time())}.mp4"}
        )
        
    except subprocess.TimeoutExpired:
        raise HTTPException(500, "Видео обрабатывается слишком долго")
    except Exception as e:
        raise HTTPException(500, f"Ошибка обработки: {str(e)}")
    finally:
        # Чистим мусор
        for p in [input_path, output_path]:
            try:
                if os.path.exists(p):
                    os.unlink(p)
            except:
                pass


@router.get("/api/tags/popular")
def popular_tags(session: Session = Depends(get_session)):
    import time
    now = time.time()

    cached = _popular_tags_cache.get("tags")
    if cached:
        cached_time, cached_data = cached
        if now - cached_time < _POPULAR_TAGS_TTL:
            return cached_data

    # JOIN вместо N+1
    rows = session.exec(
        select(Tag.name, func.count(PostTag.post_id).label("cnt"))
        .join(PostTag, Tag.id == PostTag.tag_id)
        .group_by(Tag.id, Tag.name)
        .order_by(func.count(PostTag.post_id).desc())
        .limit(10)
    ).all()

    result = [{"name": name, "count": cnt} for name, cnt in rows]

    _popular_tags_cache["tags"] = (now, result)
    return result


@router.get("/api/tags/{tag_name}/posts")
def tag_posts(tag_name: str, session: Session = Depends(get_session)):
    tag = session.exec(select(Tag).where(Tag.name == tag_name.lower())).first()
    if not tag:
        return []

    links = session.exec(select(PostTag.post_id).where(PostTag.tag_id == tag.id)).all()
    post_ids = list(links)
    if not post_ids:
        return []

    posts = session.exec(
        select(Post).where(Post.id.in_(post_ids)).order_by(Post.created_at.desc())
    ).all()

    if not posts:
        return []

    # Массовые запросы
    author_ids = list({p.author_id for p in posts})
    authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(author_ids))).all()}

    likes_map = dict(session.exec(
        select(Like.post_id, func.count()).where(Like.post_id.in_(post_ids)).group_by(Like.post_id)
    ).all())

    replies_map = dict(session.exec(
        select(Post.reply_to_id, func.count()).where(Post.reply_to_id.in_(post_ids)).group_by(Post.reply_to_id)
    ).all())

    result = []
    for p in posts:
        author = authors.get(p.author_id)
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
            "likes_count": likes_map.get(p.id, 0),
            "liked_by_me": False,
            "replies_count": replies_map.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
            "media_type": p.media_type,  # 🆕
        })
    return result


@router.patch("/api/posts/{post_id}")
async def edit_post(
    post_id: int,
    text: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Редактирование поста: автор ИЛИ право edit_posts (с учётом иерархии)"""
    post = session.get(Post, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    is_author = post.author_id == user.id
    if not is_author and not has_permission(user, "edit_posts", session):
        raise HTTPException(403, "Нет права: edit_posts")
    if not text.strip():
        raise HTTPException(400, "Пост не может быть пустым")
    # 🛡️ Чужой пост — только если можешь санкционировать автора
    if not is_author:
        author = session.get(User, post.author_id)
        if author:
            check_sanction_rights(user, author, session, "редактировать посты этого пользователя")
    old_text = post.text
    post.text = text.strip()
    session.add(post)
    log_action(session, user.id, "edit_post",
               target_type="post", target_id=post_id,
               details={"by_moderator": not is_author,
                        "old_text": (old_text or "")[:100],
                        "new_text": text.strip()[:100]})
    session.commit()
    return {"ok": True, "id": post.id, "text": post.text}


@router.post("/api/posts/{post_id}/view")
async def track_view(
    request: Request, 
    post_id: int, 
    background_tasks: BackgroundTasks,
):
    """🔥 Асинхронный view-трекинг — не блокирует ответ"""
    token = request.headers.get("Authorization", "")
    if token.startswith("Bearer "):
        try:
            payload = jwt.decode(token.split(" ", 1)[1], SECRET, algorithms=[ALGORITHM])
            viewer_hash = f"u{payload['sub']}"
        except Exception:
            viewer_hash = f"ip:{get_client_ip(request)}"
    else:
        viewer_hash = f"ip:{get_client_ip(request)}"
    
    # Запускаем в фоне — ответ возвращается мгновенно
    background_tasks.add_task(_track_view_sync, post_id, viewer_hash)
    return {"ok": True}
