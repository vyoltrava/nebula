# routers/suggestions.py
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
@router.get("/api/suggestions/categories")
def get_suggestion_categories(session: Session = Depends(get_session)):
    """Разделы со статистикой и последней активностью (как в XenForo)"""
    categories = session.exec(select(SuggestionCategory).order_by(SuggestionCategory.order)).all()
    result = []
    for c in categories:
        threads = session.exec(
            select(SuggestionThread).where(SuggestionThread.category_id == c.id)
        ).all()
        thread_ids = [t.id for t in threads]
        comments_count = 0
        last_data = None
        if thread_ids:
            comments_count = session.exec(
                select(func.count(SuggestionThreadComment.id))
                .where(SuggestionThreadComment.thread_id.in_(thread_ids))
            ).one() or 0
            last_thread = max(threads, key=lambda t: (t.updated_at or t.created_at))
            last_comment = session.exec(
                select(SuggestionThreadComment)
                .where(SuggestionThreadComment.thread_id == last_thread.id)
                .order_by(SuggestionThreadComment.created_at.desc()).limit(1)
            ).first()
            last_author = None
            last_time = last_thread.created_at
            if last_comment:
                last_author = session.get(User, last_comment.author_id)
                last_time = last_comment.created_at
            else:
                last_author = session.get(User, last_thread.author_id)
            last_data = {
                "thread_id": last_thread.id,
                "thread_title": last_thread.title,
                "author": user_out(last_author, session) if last_author else None,
                "created_at": last_time.isoformat(),
            }
        result.append({
            "id": c.id,
            "name": c.name,
            "description": c.description or "",
            "icon": c.icon,
            "color": c.color,
            "order": c.order,
            "is_archived": c.is_archived,   # = раздел закрыт
            "threads_count": len(thread_ids),
            "comments_count": comments_count,
            "last_activity": last_data,
        })
    return result


@router.post("/api/suggestions/categories")
def create_suggestion_category(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    icon: str = Form("message-square"),
    color: str = Form("#8b5cf6"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать раздел — только с правом manage_suggestions"""
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    if not name.strip():
        raise HTTPException(400, "Название обязательно")
    max_order = session.exec(select(func.max(SuggestionCategory.order))).one() or 0
    cat = SuggestionCategory(
        name=name.strip(),
        description=description.strip() if description else None,
        icon=icon, color=color,
        order=max_order + 1,
        is_archived=False,
    )
    session.add(cat)
    session.commit()
    session.refresh(cat)
    return {"ok": True, "id": cat.id}


@router.patch("/api/suggestions/categories/{cat_id}")
def update_suggestion_category(
    cat_id: int,
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    icon: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    is_archived: Optional[bool] = Form(None),   # 🆕 закрыть/открыть раздел
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Редактирование раздела + закрытие (никто не сможет создавать темы)"""
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    cat = session.get(SuggestionCategory, cat_id)
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    if name is not None:
        if not name.strip():
            raise HTTPException(400, "Название обязательно")
        cat.name = name.strip()
    if description is not None:
        cat.description = description.strip() or None
    if icon is not None:
        cat.icon = icon
    if color is not None:
        cat.color = color
    if is_archived is not None:
        cat.is_archived = is_archived
    session.add(cat)
    session.commit()
    return {"ok": True}


@router.get("/api/suggestions/prefixes")
def list_suggestion_prefixes_public(session: Session = Depends(get_session)):
    """Публичный список префиксов (для отображения бейджей)"""
    return _get_prefixes_list(session)


@router.post("/api/admin/suggestion-prefixes")
def create_suggestion_prefix(
    name: str = Form(...),
    color: str = Form("#ffffff"),
    bg_color: str = Form("#ef4444"),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Создать префикс — право manage_suggestions"""
    if not _can_manage_suggestions(staff, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    if not name.strip():
        raise HTTPException(400, "Название обязательно")
    prefixes = _get_prefixes_list(session)
    new_id = max([p.get("id", 0) for p in prefixes], default=0) + 1
    prefixes.append({"id": new_id, "name": name.strip(), "color": color, "bg_color": bg_color})
    setting = session.get(SystemSetting, "suggestion_prefixes")
    if not setting:
        setting = SystemSetting(key="suggestion_prefixes", value=json.dumps(prefixes))
        session.add(setting)
    else:
        setting.value = json.dumps(prefixes)
    session.commit()
    return {"ok": True, "id": new_id}


@router.delete("/api/admin/suggestion-prefixes/{prefix_id}")
def delete_suggestion_prefix(
    prefix_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Удалить префикс + снять его со всех тем"""
    if not _can_manage_suggestions(staff, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    prefixes = [p for p in _get_prefixes_list(session) if p.get("id") != prefix_id]
    setting = session.get(SystemSetting, "suggestion_prefixes")
    if setting:
        setting.value = json.dumps(prefixes)
    # Обнуляем префикс у тем
    session.exec(
        update(SuggestionThread)
        .where(SuggestionThread.prefix_id == prefix_id)
        .values(prefix_id=None)
    )
    session.commit()
    return {"ok": True}


@router.get("/api/suggestions/threads/{category_id}")
def get_category_threads(
    category_id: int,
    cursor: Optional[int] = None,
    limit: int = 20,
    user: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    """Список тем раздела со статистикой, префиксами и последним сообщением"""
    query = (
        select(SuggestionThread)
        .where(SuggestionThread.category_id == category_id)
        .order_by(SuggestionThread.is_pinned.desc(), SuggestionThread.created_at.desc())
    )
    if cursor:
        query = query.where(SuggestionThread.id < cursor)
    threads = session.exec(query.limit(limit)).all()
    if not threads:
        return {"threads": [], "has_more": False, "next_cursor": None}

    prefixes = {p["id"]: p for p in _get_prefixes_list(session)}
    thread_ids = [t.id for t in threads]

    comments_counts = dict(session.exec(
        select(SuggestionThreadComment.thread_id, func.count(SuggestionThreadComment.id))
        .where(SuggestionThreadComment.thread_id.in_(thread_ids))
        .group_by(SuggestionThreadComment.thread_id)
    ).all())

    # Последние комментарии (по одному на тему) одним запросом
    last_comments = {}
    lc_author_ids = set()
    rows = session.exec(
        select(SuggestionThreadComment)
        .where(SuggestionThreadComment.thread_id.in_(thread_ids))
        .order_by(SuggestionThreadComment.created_at.desc())
    ).all()
    for r in rows:
        if r.thread_id not in last_comments:
            last_comments[r.thread_id] = r
            lc_author_ids.add(r.author_id)
    lc_authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(list(lc_author_ids) or [0]))).all()}

    out = []
    for t in threads:
        lc = last_comments.get(t.id)
        last_data = None
        if lc:
            a = lc_authors.get(lc.author_id)
            last_data = {
                "author": user_out(a, session) if a else None,
                "created_at": lc.created_at.isoformat(),
            }
        out.append({
            "id": t.id,
            "category_id": t.category_id,
            "title": t.title,
            "content": t.content,
            "is_pinned": t.is_pinned,
            "is_closed": t.is_closed,
            "prefix": prefixes.get(t.prefix_id),
            "status": t.status,
            "views_count": t.views_count,
            "comments_count": comments_counts.get(t.id, 0),
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "author": user_out(session.get(User, t.author_id), session),
            "last_comment": last_data,
        })
    return {
        "threads": out,
        "has_more": len(threads) == limit,
        "next_cursor": threads[-1].id if threads else None,
    }


@router.post("/api/suggestions/threads")
def create_suggestion_thread(
    category_id: int = Form(...),
    title: str = Form(...),
    content: str = Form(...),
    prefix_id: Optional[int] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать тему — может любой пользователь, если раздел не закрыт"""
    cat = session.get(SuggestionCategory, category_id)
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    if cat.is_archived:
        raise HTTPException(403, "Раздел закрыт — создание тем недоступно")
    if len(title.strip()) < 3 or len(content.strip()) < 10:
        raise HTTPException(400, "Слишком короткий заголовок или описание")
    # Префикс могут ставить только менеджеры
    final_prefix = None
    if prefix_id and _can_manage_suggestions(user, session):
        if any(p["id"] == prefix_id for p in _get_prefixes_list(session)):
            final_prefix = prefix_id
    thread = SuggestionThread(
        category_id=category_id, author_id=user.id,
        title=title.strip(), content=content.strip(),
        prefix_id=final_prefix,
    )
    session.add(thread)
    session.commit()
    # id заполнен после commit (autoincrement) — refresh не нужен, он лишь
    # делает лишний SELECT и на нагруженной БД добавляет латентность.
    return {"ok": True, "id": thread.id}


@router.get("/api/suggestions/thread/{thread_id}")
def get_thread_detail(
    thread_id: int,
    cursor: Optional[int] = None,
    limit: int = 50,
    user: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    thread.views_count += 1
    session.add(thread)
    session.commit()
    prefixes = {p["id"]: p for p in _get_prefixes_list(session)}
    query = (
        select(SuggestionThreadComment)
        .where(SuggestionThreadComment.thread_id == thread_id)
        .order_by(SuggestionThreadComment.created_at.asc())
    )
    if cursor:
        query = query.where(SuggestionThreadComment.id > cursor)
    comments = session.exec(query.limit(limit)).all()
    return {
        "thread": {
            "id": thread.id,
            "category_id": thread.category_id,
            "title": thread.title,
            "content": thread.content,
            "is_pinned": thread.is_pinned,
            "is_closed": thread.is_closed,
            "prefix": prefixes.get(thread.prefix_id),
            "status": thread.status,
            "views_count": thread.views_count,
            "created_at": thread.created_at.isoformat(),
            "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
            "author": user_out(session.get(User, thread.author_id), session),
        },
        "comments": [{
            "id": c.id,
            "content": c.content,
            "created_at": c.created_at.isoformat(),
            "author": user_out(session.get(User, c.author_id), session),
        } for c in comments],
        "has_more": len(comments) == limit,
        "next_cursor": comments[-1].id if comments else None,
    }


@router.post("/api/suggestions/thread/{thread_id}/comments")
def add_thread_comment(
    thread_id: int,
    content: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    # 🆕 Закрытая тема: писать могут только менеджеры
    if thread.is_closed and not _can_manage_suggestions(user, session):
        raise HTTPException(400, "Тема закрыта — комментарии отключены")
    if len(content.strip()) < 2:
        raise HTTPException(400, "Комментарий слишком короткий")
    comment = SuggestionThreadComment(thread_id=thread_id, author_id=user.id, content=content.strip())
    session.add(comment)
    thread.updated_at = datetime.now(timezone.utc)
    session.add(thread)
    session.commit()
    session.refresh(comment)
    return {"ok": True, "id": comment.id}


@router.delete("/api/suggestions/comments/{comment_id}")
def delete_thread_comment(
    comment_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удаление комментария: автор ИЛИ право manage_suggestions"""
    c = session.get(SuggestionThreadComment, comment_id)
    if not c:
        raise HTTPException(404, "Комментарий не найден")
    if c.author_id != user.id and not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет прав на удаление")
    session.delete(c)
    session.commit()
    return {"ok": True}


@router.patch("/api/suggestions/thread/{thread_id}")
def edit_suggestion_thread(
    thread_id: int,
    title: Optional[str] = Form(None),
    content: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Редактирование темы: автор ИЛИ право manage_suggestions"""
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    if thread.author_id != user.id and not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет прав на редактирование")
    if title is not None:
        if len(title.strip()) < 3:
            raise HTTPException(400, "Слишком короткий заголовок")
        thread.title = title.strip()
    if content is not None:
        if len(content.strip()) < 10:
            raise HTTPException(400, "Слишком короткий текст")
        thread.content = content.strip()
    thread.updated_at = datetime.now(timezone.utc)
    session.add(thread)
    session.commit()
    return {"ok": True}


@router.patch("/api/suggestions/thread/{thread_id}/status")
def update_thread_status(
    thread_id: int,
    status: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    valid = ["pending", "approved", "implemented", "rejected", "archived"]
    if status not in valid:
        raise HTTPException(400, "Неверный статус")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    thread.status = status
    session.add(thread)
    session.commit()
    return {"ok": True}


@router.patch("/api/suggestions/thread/{thread_id}/pin")
def toggle_thread_pin(
    thread_id: int,
    is_pinned: bool = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    thread.is_pinned = is_pinned
    session.add(thread)
    session.commit()
    return {"ok": True}


@router.patch("/api/suggestions/thread/{thread_id}/close")
def toggle_thread_close(
    thread_id: int,
    closed: bool = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """🆕 Закрыть/открыть тему (никто не сможет писать)"""
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    thread.is_closed = closed
    session.add(thread)
    session.commit()
    return {"ok": True}


@router.patch("/api/suggestions/thread/{thread_id}/prefix")
def assign_thread_prefix(
    thread_id: int,
    prefix_id: int = Form(0),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """🆕 Выдать/снять префикс темы"""
    if not _can_manage_suggestions(user, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    if prefix_id:
        if not any(p["id"] == prefix_id for p in _get_prefixes_list(session)):
            raise HTTPException(404, "Префикс не найден")
    thread.prefix_id = prefix_id or None
    session.add(thread)
    session.commit()
    return {"ok": True}


@router.patch("/api/admin/suggestions/{thread_id}/move")
def move_suggestion_thread(
    thread_id: int,
    category_id: int = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Перенос темы между разделами"""
    if not _can_manage_suggestions(staff, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    if not session.get(SuggestionCategory, category_id):
        raise HTTPException(404, "Категория не найдена")
    thread.category_id = category_id
    session.add(thread)
    session.commit()
    return {"ok": True}


@router.delete("/api/admin/suggestions/{thread_id}")
def admin_delete_thread(
    thread_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Удаление темы (комментарии удалятся каскадно)"""
    if not _can_manage_suggestions(staff, session):
        raise HTTPException(403, "Нет права: manage_suggestions")
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    session.delete(thread)
    session.commit()
    return {"ok": True}

