# ============================================================
# app/routers/suggestions.py
# ============================================================

from fastapi import APIRouter
from app.deps import *  # noqa: F401,F403  (shared helpers + imports)

router = APIRouter()

@router.get("/api/suggestions")
def get_suggestions(
    status: Optional[str] = None,
    user: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    query = select(Suggestion)
    if status:
        query = query.where(Suggestion.status == status)
    else:
        # Обычные юзеры не видят архив по умолчанию
        if not (user and (user.is_admin or user.is_moderator)):
            query = query.where(Suggestion.status != "archived")
            
    # Сортировка: Закрепленные -> По статусу (implemented > approved > pending > rejected) -> По дате
    query = query.order_by(
        Suggestion.is_pinned.desc(),
        case(
            (Suggestion.status == "implemented", 1),
            (Suggestion.status == "approved", 2),
            (Suggestion.status == "pending", 3),
            (Suggestion.status == "rejected", 4),
            else_=5
        ),
        Suggestion.created_at.desc()
    ).limit(100)
    
    suggestions = session.exec(query).all()
    author_ids = list({s.author_id for s in suggestions})
    authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(author_ids))).all()}
    
    return [{
        "id": s.id, "title": s.title, "content": s.content, "status": s.status, 
        "is_pinned": s.is_pinned, "created_at": s.created_at.isoformat(),
        "author": user_out(authors.get(s.author_id), session) if authors.get(s.author_id) else None
    } for s in suggestions]

@router.post("/api/suggestions")
@limiter.limit("3/minute")
def create_suggestion(
    request: Request, title: str = Form(...), content: str = Form(...),
    user: User = Depends(get_current_user), session: Session = Depends(get_session),
):
    if len(title.strip()) < 5 or len(content.strip()) < 20:
        raise HTTPException(400, "Заголовок мин. 5 символов, описание мин. 20")
    s = Suggestion(author_id=user.id, title=title.strip(), content=content.strip(), status="pending")
    session.add(s); session.commit(); session.refresh(s)
    return {"ok": True, "id": s.id}

@router.get("/api/suggestions/{suggestion_id}")
def get_suggestion_details(
    suggestion_id: int, session: Session = Depends(get_session),
):
    s = session.get(Suggestion, suggestion_id)
    if not s: raise HTTPException(404, "Not found")
    
    author = session.get(User, s.author_id)
    comments = session.exec(
        select(SuggestionComment).where(SuggestionComment.suggestion_id == suggestion_id).order_by(SuggestionComment.created_at.asc())
    ).all()
    
    comment_author_ids = list({c.author_id for c in comments})
    comment_authors = {u.id: u for u in session.exec(select(User).where(User.id.in_(comment_author_ids))).all()}
    
    return {
        "suggestion": {
            "id": s.id, "title": s.title, "content": s.content, "status": s.status, "is_pinned": s.is_pinned,
            "created_at": s.created_at.isoformat(),
            "author": user_out(author, session) if author else None
        },
        "comments": [{
            "id": c.id, "content": c.content, "created_at": c.created_at.isoformat(),
            "author": user_out(comment_authors.get(c.author_id), session) if comment_authors.get(c.author_id) else None
        } for c in comments]
    }

@router.post("/api/suggestions/thread/{thread_id}/comments")
def add_comment(
    thread_id: int,
    content: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    
    # 🆕 ИСПРАВЛЕНО: SuggestionThreadComment
    comment = SuggestionThreadComment(
        thread_id=thread_id,
        author_id=user.id,
        content=content.strip(),
    )
    session.add(comment)
    
    thread.updated_at = datetime.now(timezone.utc)
    session.add(thread)
    session.commit()
    session.refresh(comment)
    
    return {"ok": True, "id": comment.id}

@router.patch("/api/suggestions/{suggestion_id}/status")
def update_suggestion_status(
    suggestion_id: int, status: str = Form(...),
    staff: User = Depends(require_staff), session: Session = Depends(get_session),
):
    if status not in STATUS_BADGES: raise HTTPException(400, "Invalid status")
    s = session.get(Suggestion, suggestion_id)
    if not s: raise HTTPException(404, "Not found")
    s.status = status
    session.add(s); session.commit()
    return {"ok": True}

@router.patch("/api/suggestions/{suggestion_id}/pin")
def toggle_pin(
    suggestion_id: int, is_pinned: bool = Form(...),
    staff: User = Depends(require_staff), session: Session = Depends(get_session),
):
    s = session.get(Suggestion, suggestion_id)
    if not s: raise HTTPException(404, "Not found")
    s.is_pinned = is_pinned
    session.add(s); session.commit()
    return {"ok": True}


# ============================================================

@router.get("/api/suggestions/categories")
def get_suggestion_categories(
    session: Session = Depends(get_session)
):
    """Получить все разделы"""
    try:
        categories = session.exec(
            select(SuggestionCategory).order_by(SuggestionCategory.order)
        ).all()
        
        result = []
        for c in categories:
            # Безопасный подсчет тем
            threads_count = session.exec(
                select(func.count(SuggestionThread.id)).where(
                    SuggestionThread.category_id == c.id
                )
            ).one() or 0
            
            result.append({
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "icon": c.icon,
                "color": c.color,
                "order": c.order,
                "is_archived": c.is_archived,
                "threads_count": threads_count,
            })
        return result
    except Exception as e:
        print(f"❌ ОШИБКА В get_suggestion_categories: {e}")
        raise HTTPException(status_code=500, detail="Ошибка сервера при загрузке категорий")


@router.post("/api/suggestions/categories")
def create_suggestion_category(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    icon: str = Form("message-square"),
    color: str = Form("#8b5cf6"),
    # 🛡️ УБРАЛИ order из Form(). Теперь бэкенд считает его сам, что исключает 422 ошибку
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать раздел (только админ)"""
    if not user.is_admin:
        raise HTTPException(403, "Только администраторы")
    
    if not name.strip():
        raise HTTPException(400, "Название раздела обязательно")

    # 🛡️ Автоматически вычисляем порядок на бэкенде
    max_order = session.exec(select(func.max(SuggestionCategory.order))).one()
    next_order = (max_order or 0) + 1
    
    cat = SuggestionCategory(
        name=name.strip(),
        description=description.strip() if description else None,
        icon=icon,
        color=color,
        order=next_order,
        is_archived=False,
    )
    
    try:
        session.add(cat)
        session.commit()
        session.refresh(cat)
        return {"ok": True, "id": cat.id}
    except Exception as e:
        session.rollback()
        print(f"❌ ОШИБКА ПРИ СОЗДАНИИ КАТЕГОРИИ: {e}")
        raise HTTPException(status_code=500, detail="Не удалось создать раздел")

@router.get("/api/suggestions/threads/{category_id}")
def get_category_threads(
    category_id: int,
    cursor: Optional[int] = None,
    limit: int = 20,
    user: Optional[User] = Depends(get_optional_user),
    session: Session = Depends(get_session),
):
    """Получить темы раздела"""
    query = select(SuggestionThread).where(
        SuggestionThread.category_id == category_id
    ).order_by(
        SuggestionThread.is_pinned.desc(),
        SuggestionThread.created_at.desc()
    )
    
    if cursor:
        query = query.where(SuggestionThread.id < cursor)
    
    threads = session.exec(query.limit(limit)).all()
    
    result = []
    for t in threads:
        author = session.get(User, t.author_id)
        comments_count = session.exec(
            select(func.count(SuggestionComment.id)).where(
                SuggestionComment.thread_id == t.id
            )
        ).one()
        
        result.append({
            "id": t.id,
            "category_id": t.category_id,
            "title": t.title,
            "content": t.content,
            "is_pinned": t.is_pinned,
            "status": t.status,
            "views_count": t.views_count,
            "comments_count": comments_count,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "author": user_out(author, session) if author else None,
        })
    
    return {
        "threads": result,
        "has_more": len(threads) == limit,
        "next_cursor": threads[-1].id if threads else None,
    }

@router.post("/api/suggestions/threads")
def create_suggestion_thread(
    category_id: int = Form(...),
    title: str = Form(...),
    content: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать тему"""
    cat = session.get(SuggestionCategory, category_id)
    if not cat:
        raise HTTPException(404, "Раздел не найден")
    
    if cat.is_archived:
        raise HTTPException(403, "Раздел только для чтения")
    
    thread = SuggestionThread(
        category_id=category_id,
        author_id=user.id,
        title=title.strip(),
        content=content.strip(),
    )
    session.add(thread)
    session.commit()
    session.refresh(thread)
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
    
    author = session.get(User, thread.author_id)
    
    # 🆕 ИСПРАВЛЕНО: SuggestionThreadComment
    query = select(SuggestionThreadComment).where(
        SuggestionThreadComment.thread_id == thread_id
    ).order_by(SuggestionThreadComment.created_at.asc())
    
    if cursor:
        query = query.where(SuggestionThreadComment.id > cursor)
    
    comments = session.exec(query.limit(limit)).all()
    
    comments_data = []
    for c in comments:
        comment_author = session.get(User, c.author_id)
        comments_data.append({
            "id": c.id,
            "content": c.content,
            "created_at": c.created_at.isoformat(),
            "author": user_out(comment_author, session) if comment_author else None,
        })
    
    return {
        "thread": {
            "id": thread.id,
            "category_id": thread.category_id,
            "title": thread.title,
            "content": thread.content,
            "is_pinned": thread.is_pinned,
            "status": thread.status,
            "views_count": thread.views_count,
            "created_at": thread.created_at.isoformat(),
            "updated_at": thread.updated_at.isoformat() if thread.updated_at else None,
            "author": user_out(author, session) if author else None,
        },
        "comments": comments_data,
        "has_more": len(comments) == limit,
        "next_cursor": comments[-1].id if comments else None,
    }



@router.patch("/api/suggestions/thread/{thread_id}/status")
def update_thread_status(
    thread_id: int,
    status: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Изменить статус темы (ТОЛЬКО АДМИНЫ)"""
    if not user.is_admin:
        raise HTTPException(403, "Только администраторы могут менять статус")
    
    valid_statuses = ["pending", "approved", "implemented", "rejected", "archived"]
    if status not in valid_statuses:
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
    """Закрепить/открепить тему (ТОЛЬКО АДМИНЫ)"""
    if not user.is_admin:
        raise HTTPException(403, "Только администраторы")
    
    thread = session.get(SuggestionThread, thread_id)
    if not thread:
        raise HTTPException(404, "Тема не найдена")
    
    thread.is_pinned = is_pinned
    session.add(thread)
    session.commit()
    return {"ok": True}

