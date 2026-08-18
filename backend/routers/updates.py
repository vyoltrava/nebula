# app_split/routers/updates.py
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

@router.get("/api/updates")
def list_updates(
    user: Optional[User] = Depends(get_optional_user),  # ← Изменили get_current_user на get_optional_user
    session: Session = Depends(get_session),
):
    updates = session.exec(select(Update).order_by(Update.created_at.desc())).all()
    if not updates:
        return []

    author_ids = list({u.author_id for u in updates if u.author_id})
    authors = {
        u.id: u for u in session.exec(
            select(User).where(User.id.in_(author_ids))
        ).all()
    } if author_ids else {}

    # 🆕 Получаем список ID прочитанных обновлений для текущего юзера
    read_update_ids = set()
    if user:
        read_rows = session.exec(
            select(UpdateRead.update_id).where(UpdateRead.user_id == user.id)
        ).all()
        read_update_ids = set(read_rows)

    result = []
    for u in updates:
        author = authors.get(u.author_id)
        result.append({
            "id": u.id,
            "title": u.title,
            "content": u.content,
            "importance": u.importance,
            "author": user_out(author, session) if author else None,
            "created_at": u.created_at.isoformat(),
            "edited_at": u.edited_at.isoformat() if u.edited_at else None,
            "is_read": u.id in read_update_ids,  # ← ДОБАВИЛИ ПОЛЕ
        })
    return result


@router.post("/api/updates/{update_id}/read")
def mark_update_read(
    update_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отметить обновление как прочитанное"""
    existing = session.exec(
        select(UpdateRead).where(
            UpdateRead.user_id == user.id, 
            UpdateRead.update_id == update_id
        )
    ).first()
    
    if not existing:
        session.add(UpdateRead(user_id=user.id, update_id=update_id))
        session.commit()
    
    return {"ok": True}


@router.post("/api/updates/read-all")
def mark_all_updates_read(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Отметить ВСЕ обновления как прочитанные"""
    all_updates = session.exec(select(Update.id)).all()
    existing = {
        r.update_id for r in session.exec(
            select(UpdateRead.update_id).where(UpdateRead.user_id == user.id)
        ).all()
    }
    
    new_ids = set(all_updates) - existing
    
    for uid in new_ids:
        session.add(UpdateRead(user_id=user.id, update_id=uid))
    
    session.commit()
    return {"ok": True, "marked": len(new_ids)}


@router.post("/api/updates")
@limiter.limit("10/minute")
async def create_update( # 👈 ИЗМЕНИЛИ def на async def
    request: Request,
    title: str = Form(...),
    content: str = Form(...),
    importance: str = Form("minor"),
    user: User = Depends(require_announcer),
    session: Session = Depends(get_session),
):
    if len(title.strip()) < 3:
        raise HTTPException(400, "Заголовок: минимум 3 символа")
    if len(content.strip()) < 10:
        raise HTTPException(400, "Текст: минимум 10 символов")
    if importance not in ("major", "minor", "patch"):
        raise HTTPException(400, "Неверный тип важности")
        
    update = Update(
        title=title.strip(),
        content=content.strip(),
        importance=importance,
        author_id=user.id,
    )
    session.add(update)
    session.commit()
    session.refresh(update)
    
    # 🆕 РАССЫЛАЕМ СОБЫТИЕ ВСЕМ КЛИЕНТАМ ЧЕРЕЗ WEBSOCKET
    await manager.broadcast_all("new_update", {
        "id": update.id,
        "title": update.title,
        "importance": update.importance
    })
    
    return {"ok": True, "id": update.id}


@router.delete("/api/updates/{update_id}")
def delete_update(
    update_id: int,
    user: User = Depends(require_announcer),   # 🆕 было require_founder
    session: Session = Depends(get_session),
):
    update = session.get(Update, update_id)
    if not update:
        raise HTTPException(404, "Update not found")
    
    # Один запрос вместо N+1
    session.exec(delete(UpdateRead).where(UpdateRead.update_id == update_id))
    session.delete(update)
    session.commit()
    return {"ok": True}

def _update_last_seen_sync(user_id: int):
    """Синхронная функция для обновления last_seen (выполняется в threadpool)"""
    with Session(engine) as session:
        user = session.get(User, user_id)
        if user:
            user.last_seen = datetime.now(timezone.utc)
            session.add(user)
            session.commit()


def _track_view_sync(post_id: int, viewer_hash: str):
    """Синхронная функция для обновления views (выполняется в фоне)"""
    with Session(engine) as session:
        post = session.get(Post, post_id)
        if not post:
            return
        yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
        existing = session.exec(
            select(PostView).where(
                PostView.post_id == post_id,
                PostView.viewer_hash == viewer_hash,
                PostView.viewed_at > yesterday
            )
        ).first()
        if not existing:
            session.add(PostView(post_id=post_id, viewer_hash=viewer_hash))
            post.views_count = (post.views_count or 0) + 1
            session.add(post)
            session.commit()
