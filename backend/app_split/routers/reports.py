# app_split/routers/reports.py
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

@router.post("/api/reports")
@limiter.limit("10/minute")
def create_report(
    request: Request,
    target_type: str = Form(...),
    target_id: int = Form(...),
    reason: str = Form(...),
    comment: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Валидация типа
    if target_type not in ("post", "user"):
        raise HTTPException(400, "Invalid target type")
    
    # Валидация причины
    valid_reasons = ["spam", "insult", "nsfw", "rules_violation", "other"]
    if reason not in valid_reasons:
        raise HTTPException(400, "Invalid reason")
    
    # Проверка что цель существует
    if target_type == "post":
        target = session.get(Post, target_id)
        if not target:
            raise HTTPException(404, "Post not found")
        # Нельзя жаловаться на свой пост
        if target.author_id == user.id:
            raise HTTPException(400, "Cannot report your own post")
    else:
        target = session.get(User, target_id)
        if not target:
            raise HTTPException(404, "User not found")
        # Нельзя жаловаться на себя
        if target.id == user.id:
            raise HTTPException(400, "Cannot report yourself")
    
    # Проверка на дубликат жалобы
    existing = session.exec(
        select(Report).where(
            Report.reporter_id == user.id,
            Report.target_type == target_type,
            Report.target_id == target_id,
            Report.status == "pending",
        )
    ).first()
    if existing:
        raise HTTPException(400, "Вы уже пожаловались на это. Жалоба рассматривается.")
    
    report = Report(
        reporter_id=user.id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        comment=comment,
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    
    return {"ok": True, "id": report.id}


@router.get("/api/reports")
def list_reports(
    status: Optional[str] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_reports", session):
        raise HTTPException(403, "No permission: manage_reports")
    
    query = select(Report).order_by(Report.created_at.desc())
    if status:
        query = query.where(Report.status == status)
    
    reports = session.exec(query.limit(100)).all()
    
    result = []
    for r in reports:
        reporter = session.get(User, r.reporter_id)
        
        target_info = None
        if r.target_type == "post":
            post = session.get(Post, r.target_id)
            if post:
                author = session.get(User, post.author_id)
                target_info = {
                    "type": "post",
                    "id": post.id,
                    "text": post.text[:200] if post.text else "",
                    "author_name": author.display_name if author else "Unknown",
                    "author_id": post.author_id,
                }
        else:
            target_user = session.get(User, r.target_id)
            if target_user:
                target_info = {
                    "type": "user",
                    "id": target_user.id,
                    "username": target_user.username,
                    "display_name": target_user.display_name,
                    "avatar_url": target_user.avatar_url,
                }
        
        result.append({
            "id": r.id,
            "reporter": user_out(reporter, session) if reporter else None,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "target": target_info,
            "reason": r.reason,
            "comment": r.comment,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        })
    
    return result


@router.post("/api/reports/{report_id}/resolve")
async def resolve_report( 
    request: Request,  # ← ДОБАВЬ
    report_id: int,
    action: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_reports", session):
        raise HTTPException(403, "No permission: manage_reports")
    
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "pending":
        raise HTTPException(400, "Report already processed")



    if action == "delete_post" and report.target_type == "post":
        if not has_permission(staff, "delete_posts", session):
            raise HTTPException(403, "No permission: delete_posts")
        post = session.get(Post, report.target_id)
        if post:
            # 🛡️ Иммунитет автора поста
            author = session.get(User, post.author_id)
            if author and author.id != staff.id:
                check_sanction_rights(staff, author, session, "удалять посты этого пользователя")
            cascade_delete_post(post.id, session)
    elif action == "ban_user":
        if not has_permission(staff, "ban_users", session):
            raise HTTPException(403, "No permission: ban_users")
        target_user_id = None
        if report.target_type == "user":
            target_user_id = report.target_id
        elif report.target_type == "post":
            post = session.get(Post, report.target_id)
            if post:
                target_user_id = post.author_id
        if target_user_id:
            target = session.get(User, target_user_id)
            if target and target.id != staff.id:
                # 🛡️ Единый иммунитет (Founder/Developer нельзя банить через жалобы)
                check_sanction_rights(staff, target, session, "банить этого пользователя")
                target.is_banned = True
                session.add(target)
    
    elif action != "ignore":
        raise HTTPException(400, "Invalid action")
    
    # Помечаем жалобу как обработанную
    report.status = "resolved"
    report.resolved_by = staff.id
    report.resolved_at = datetime.now(timezone.utc)
    session.add(report)
    
    # Логируем действие
    log_action(
        session, staff.id, f"resolve_report_{action}",
        target_type=report.target_type,
        target_id=report.target_id,
        details={"action": action, "reason": report.reason},
        ip_address=get_client_ip(request) if hasattr(request, 'headers') else None,
    )
    session.commit()
    
    return {"ok": True}


@router.post("/api/reports/{report_id}/reject")
def reject_report(
    report_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_reports", session):
        raise HTTPException(403, "No permission: manage_reports")
    
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(404, "Report not found")
    if report.status != "pending":
        raise HTTPException(400, "Report already processed")
    
    report.status = "rejected"
    report.resolved_by = staff.id
    report.resolved_at = datetime.now(timezone.utc)
    session.add(report)
    session.commit()
    
    return {"ok": True}


# ---------- IP И ЛОГИ ----------
