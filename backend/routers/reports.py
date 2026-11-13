from dependencies import cascade_delete_post, check_sanction_rights, get_client_ip, get_current_user, has_permission, limiter, log_action, require_staff, user_out
# app_split/routers/reports.py
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
    if target_type not in ("post", "user", "chat", "chat_message", "dm_user",
                           "channel", "channel_post", "channel_comment"):
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
    elif target_type == "user":
        target = session.get(User, target_id)
        if not target:
            raise HTTPException(404, "User not found")
        # Нельзя жаловаться на себя
        if target.id == user.id:
            raise HTTPException(400, "Cannot report yourself")
    
    if target_type == "chat_message":
        # Жалоба на конкретное сообщение в чате
        msg = session.get(Message, target_id)
        if not msg:
            raise HTTPException(404, "Message not found")
        if msg.sender_id == user.id:
            raise HTTPException(400, "Cannot report your own message")
    elif target_type == "chat":
        # Жалоба на весь групповой чат/канал
        chat = session.get(Chat, target_id)
        if not chat or not chat.is_group:
            raise HTTPException(404, "Chat not found")
    elif target_type == "dm_user":
        # Жалоба на пользователя из личного чата (контекст — сам диалог)
        target = session.get(User, target_id)
        if not target:
            raise HTTPException(404, "User not found")
        # Нельзя жаловаться на себя
        if target.id == user.id:
            raise HTTPException(400, "Cannot report yourself")
    elif target_type in ("channel", "channel_post", "channel_comment"):
        # 📢 Жалобы на каналы (изолированная система) — валидация в channels.py
        from channels import validate_channel_report_target
        validate_channel_report_target(session, target_type, target_id)

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
    target_kind: Optional[str] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_reports", session):
        raise HTTPException(403, "No permission: manage_reports")
    
    query = select(Report).order_by(Report.created_at.desc())
    if status:
        query = query.where(Report.status == status)
    if target_kind == "chat":
        # Отдельный вид репортов: жалобы из чатов (не посты и не обычные юзеры)
        query = query.where(Report.target_type.in_(["chat", "chat_message", "dm_user"]))
    
    reports = session.exec(query.limit(100)).all()
    _pre = batch_get_users([session.get(User, r.reporter_id) for r in reports if r.reporter_id], session)
    
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
        elif r.target_type == "chat_message":
            msg = session.get(Message, r.target_id)
            if msg:
                sender = session.get(User, msg.sender_id)
                chat = session.get(Chat, msg.chat_id) if msg.chat_id else None
                target_info = {
                    "type": "chat_message",
                    "id": msg.id,
                    "chat_id": msg.chat_id,
                    "text": (msg.text or "")[:200],
                    "sender_id": msg.sender_id,
                    "sender_name": sender.display_name if sender else "Unknown",
                    "sender_avatar": sender.avatar_url if sender else None,
                    "chat_name": chat.name if chat else None,
                }
        elif r.target_type == "chat":
            chat = session.get(Chat, r.target_id)
            if chat:
                target_info = {
                    "type": "chat",
                    "id": chat.id,
                    "chat_id": chat.id,
                    "name": chat.name or "Группа",
                    "avatar_url": chat.avatar_url,
                    "is_group": True,
                }
        elif r.target_type == "dm_user":
            target_user = session.get(User, r.target_id)
            if target_user:
                # Находим личный диалог между жалобщиком и целью
                member_rows = session.exec(
                    select(ChatMember).where(ChatMember.user_id.in_([r.reporter_id, r.target_id]))
                ).all()
                chat_members: dict = {}
                for m in member_rows:
                    chat_members.setdefault(m.chat_id, set()).add(m.user_id)
                dm_chat_id = None
                for cid, us in chat_members.items():
                    if us == {r.reporter_id, r.target_id}:
                        ch = session.get(Chat, cid)
                        if ch and not ch.is_group:
                            dm_chat_id = cid
                            break
                target_info = {
                    "type": "dm_user",
                    "id": target_user.id,
                    "username": target_user.username,
                    "display_name": target_user.display_name,
                    "avatar_url": target_user.avatar_url,
                    "chat_id": dm_chat_id,
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
            "reporter": user_out(reporter, session, _pre.get(reporter.id)) if reporter else None,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "target": target_info,
            "chat_id": target_info.get("chat_id") if target_info else None,
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
            await cascade_delete_post(post.id, session)
    elif action == "ban_user":
        if not has_permission(staff, "ban_users", session):
            raise HTTPException(403, "No permission: ban_users")
        target_user_id = None
        if report.target_type in ("user", "dm_user"):
            target_user_id = report.target_id
        elif report.target_type == "post":
            post = session.get(Post, report.target_id)
            if post:
                target_user_id = post.author_id
        elif report.target_type == "chat_message":
            msg = session.get(Message, report.target_id)
            if msg:
                target_user_id = msg.sender_id
        if target_user_id:
            target = session.get(User, target_user_id)
            if target and target.id != staff.id:
                # 🛡️ Единый иммунитет (Founder/Developer нельзя банить через жалобы)
                check_sanction_rights(staff, target, session, "банить этого пользователя")
                target.is_banned = True
                session.add(target)
    elif action == "delete_message" and report.target_type == "chat_message":
        msg = session.get(Message, report.target_id)
        if msg:
            sender = session.get(User, msg.sender_id)
            if sender and sender.id != staff.id:
                check_sanction_rights(staff, sender, session, "удалять сообщения этого пользователя")
            session.delete(msg)
    elif action == "warn_user":
        if not has_permission(staff, "warn_users", session):
            raise HTTPException(403, "No permission: warn_users")
        target_user_id = None
        if report.target_type in ("user", "dm_user"):
            target_user_id = report.target_id
        elif report.target_type == "chat_message":
            msg = session.get(Message, report.target_id)
            if msg:
                target_user_id = msg.sender_id
        elif report.target_type == "post":
            post = session.get(Post, report.target_id)
            if post:
                target_user_id = post.author_id
        if target_user_id:
            target = session.get(User, target_user_id)
            if target and target.id != staff.id:
                check_sanction_rights(staff, target, session, "выдавать предупреждения этому пользователю")
                session.add(Warning(user_id=target.id, issuer_id=staff.id,
                                    reason=f"Жалоба #{report.id}: {report.reason}"))
                session.add(Notification(user_id=target.id, actor_id=staff.id, type="warning"))
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
