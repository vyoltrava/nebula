# app_split/routers/search.py
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

@router.get("/api/search")
@limiter.limit("30/minute")
def search(
    request: Request,
    q: str = "",
    viewer: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    q = q.strip()
    if not q:
        return {"users": [], "posts": []}
    pattern = f"%{q.lower()}%"

    users = session.exec(
        select(User)
        .where(
            User.is_banned == False,
            User.username.ilike(pattern) | User.display_name.ilike(pattern)
        )
        .limit(15)
    ).all()

    posts = session.exec(
        select(Post)
        .where(
            Post.reply_to_id == None,
            func.lower(Post.text).like(pattern),
        )
        .order_by(Post.created_at.desc())
        .limit(30)
    ).all()

    if not posts:
        return {"users": [user_out(u, session) for u in users], "posts": []}

    post_ids = [p.id for p in posts]
    author_ids = list({p.author_id for p in posts})
    authors = {u.id: u for u in session.exec(
        select(User).where(User.id.in_(author_ids))
    ).all()}

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

    # 🆕 Подгружаем лайки и закладки для текущего пользователя
    liked_ids = set()
    bookmarked_ids = set()
    if viewer:
        liked_ids = set(session.exec(
            select(Like.post_id).where(Like.user_id == viewer.id, Like.post_id.in_(post_ids))
        ).all())
        bookmarked_ids = set(session.exec(
            select(Bookmark.post_id).where(Bookmark.user_id == viewer.id, Bookmark.post_id.in_(post_ids))
        ).all())

    # 🆕 Загружаем оригиналы для репостов
    repost_ids = list({p.repost_of_id for p in posts if p.repost_of_id})
    originals_map = {}
    if repost_ids:
        orig_posts = session.exec(select(Post).where(Post.id.in_(repost_ids))).all()
        orig_author_ids = {op.author_id for op in orig_posts}
        orig_authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(orig_author_ids))).all()}
        for op in orig_posts:
            originals_map[op.id] = {
                "id": op.id, "author_id": op.author_id,
                "author": orig_authors.get(op.author_id),
                "text": op.text, "media_url": op.media_url,
                "media_type": op.media_type,
                "created_at": op.created_at.isoformat(),
            }

    result_posts = []
    for p in posts:
        author = authors.get(p.author_id)
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
                    "media_type": orig["media_type"],
                    "created_at": orig["created_at"],
                }
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())
            else:
                repost_data = {"deleted": True}
                is_repost = not p.text.strip()
                is_quote = bool(p.text.strip())

        result_posts.append({
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
            "media_type": p.media_type,
            "likes_count": likes_counts.get(p.id, 0),
            "liked_by_me": p.id in liked_ids,
            "bookmarked": p.id in bookmarked_ids,
            "replies_count": replies_counts.get(p.id, 0),
            "views_count": p.views_count or 0,
            "created_at": p.created_at.isoformat(),
            "repost_of": repost_data,
            "is_repost": is_repost,
            "is_quote": is_quote,
        })

    return {
        "users": [user_out(u, session) for u in users],
        "posts": result_posts,
    }
