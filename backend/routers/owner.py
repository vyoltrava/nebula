# routers/owner.py
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
@router.get("/api/admin/backups")
def admin_list_backups(
    actor_id: Optional[int] = None,
    limit: int = 100,
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Очередь резервных действий админов (для ручного отката)."""
    _require_backup_manager(admin, session)
    q = select(AdminBackup).where(AdminBackup.restored == False)
    if actor_id:
        q = q.where(AdminBackup.actor_id == actor_id)
    q = q.order_by(AdminBackup.created_at.desc()).limit(min(limit, 500))
    backups = session.exec(q).all()
    actors = {u.id: u for u in session.exec(select(User).where(User.id.in_({b.actor_id for b in backups}))).all()} if backups else {}
    return {
        "backups": [
            {
                "id": b.id,
                "actor": {
                    "id": a.id, "username": a.username, "avatar_url": a.avatar_url,
                } if (a := actors.get(b.actor_id)) else None,
                "action": b.action,
                "target_type": b.target_type,
                "target_id": b.target_id,
                "payload_preview": (b.payload or "")[:300],
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in backups
        ]
    }


@router.post("/api/admin/backups/{backup_id}/restore")
def admin_restore_backup(
    backup_id: int,
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Откатить одно действие из резерва (вернуть пост / снять бан)."""
    _require_backup_manager(admin, session)
    backup = session.get(AdminBackup, backup_id)
    if not backup:
        raise HTTPException(404, "Backup not found")
    result = restore_backup(backup, session, admin.id)
    session.commit()
    return result


@router.post("/api/admin/backups/purge")
def admin_purge_old_backups(
    days: int = 30,
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Чистка резерва: удаляет ОТКАЧЕННЫЕ записи старше N дней (нескандированные не трогаем)."""
    _require_backup_manager(admin, session)
    cutoff = utcnow() - timedelta(days=max(days, 1))
    old = session.exec(
        select(AdminBackup).where(AdminBackup.restored == True, AdminBackup.created_at < cutoff)
    ).all()
    for b in old:
        session.delete(b)
    session.commit()
    return {"deleted": len(old)}


@router.get("/api/owner-panel/stats")
def get_owner_stats(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Статистика для панели владельца (право access_owner_panel).
    ЕДИНЫЙ источник правды для окна владельца."""
    if not has_permission(user, "access_owner_panel", session):
        raise HTTPException(403, "Нет права: access_owner_panel")

    now = utcnow()
    day_ago = now - timedelta(days=1)
    month_ago = now - timedelta(days=30)

    total_users = len(session.exec(select(User)).all())
    dau = len(session.exec(select(User).where(User.last_seen >= day_ago)).all())

    monthly = session.exec(
        select(PaymentPurchase).where(
            PaymentPurchase.created_at >= month_ago,
            PaymentPurchase.status.in_(["success"]),
        )
    ).all()
    monthly_revenue = sum(float(p.amount or 0) for p in monthly)

    all_paid = session.exec(select(PaymentPurchase).where(PaymentPurchase.status.in_(["success"]))).all()
    total_revenue = sum(float(p.amount or 0) for p in all_paid)

    username_sales = len(session.exec(
        select(PremiumUsername).where(
            PremiumUsername.purchased_at >= month_ago,
            PremiumUsername.purchased_by.is_not(None),
        )
    ).all()) or 0

    posts_per_day = len(session.exec(select(Post).where(Post.created_at >= day_ago)).all())
    messages_per_day = len(session.exec(select(Message).where(Message.created_at >= day_ago)).all())
    new_chats = len(session.exec(select(Chat).where(Chat.created_at >= day_ago)).all())
    pending_reports = len(session.exec(select(Report).where(Report.status == "pending")).all())

    # Топ-активные пользователи по постам
    top_rows = session.exec(
        select(Post.author_id, func.count(Post.id))
        .group_by(Post.author_id)
        .order_by(func.count(Post.id).desc())
        .limit(10)
    ).all()
    top_users = []
    for author_id, cnt in top_rows:
        u = session.get(User, author_id)
        if u:
            top_users.append({
                "id": u.id,
                "display_name": u.display_name,
                "username": u.username,
                "posts_count": cnt,
            })

    audit_logs = session.exec(
        select(ActionLog).order_by(ActionLog.created_at.desc()).limit(50)
    ).all()
    audit_payload = []
    for log in audit_logs:
        actor = session.get(User, log.actor_id) if log.actor_id else None
        audit_payload.append({
            "time": log.created_at.strftime("%H:%M %d.%m") if log.created_at else "",
            "user": actor.display_name if actor else "system",
            "action": log.action,
            "ip": log.ip_address or "",
        })

    return {
        "total_users": total_users,
        "dau": dau,
        "monthly_revenue": round(monthly_revenue, 2),
        "total_revenue": round(total_revenue, 2),
        "username_sales": username_sales,
        "pending_reports": pending_reports,
        "posts_per_day": posts_per_day,
        "messages_per_day": messages_per_day,
        "new_chats_per_day": new_chats,
        "top_users": top_users,
        "audit_logs": audit_payload,
        "shop_enabled": _shop_effectively_enabled(session),
        "premium_usernames_total": len(session.exec(select(PremiumUsername)).all()),
    }


@router.get("/api/owner-panel/backups")
def owner_list_db_backups(
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Список файловых бэкапов БД."""
    _require_owner_backup(admin, session)
    return {"backups": list_db_backups()}


@router.post("/api/owner-panel/backups/create")
def owner_create_db_backup(
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Создать файловый снимок базы."""
    _require_owner_backup(admin, session)
    return create_db_backup(session, admin)


@router.get("/api/owner-panel/backups/download/{name}")
def owner_download_db_backup(
    name: str,
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Скачать файловый снимок БД."""
    _require_owner_backup(admin, session)
    fp = _backup_abs(name)
    if not fp or not os.path.exists(fp):
        raise HTTPException(404, "Бэкап не найден")
    from fastapi.responses import FileResponse
    return FileResponse(fp, media_type="application/octet-stream", filename=name)


@router.delete("/api/owner-panel/backups/{name}")
def owner_delete_db_backup(
    name: str,
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Удалить файловый снимок БД."""
    _require_owner_backup(admin, session)
    fp = _backup_abs(name)
    if not fp or not os.path.exists(fp):
        raise HTTPException(404, "Бэкап не найден")
    os.remove(fp)
    log_action(session, admin.id, "delete_db_backup", target_type="system",
               details={"filename": name})
    session.commit()
    return {"ok": True, "deleted": name}


@router.post("/api/owner-panel/backups/{name}/restore")
def owner_restore_db_backup(
    name: str,
    admin: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Восстановить БД из снимка (с автоматической страховочной копией)."""
    _require_owner_backup(admin, session)
    return restore_db_backup(session, admin, name)

