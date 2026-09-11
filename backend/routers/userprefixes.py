# routers/userprefixes.py
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
@router.get("/api/user-prefixes")
def list_user_prefixes_public(session: Session = Depends(get_session)):
    """Публичный список всех созданных префиксов (для превью в админке/формах)."""
    return [
        {"id": p.id, "icon": p.icon, "color": p.color, "bg_color": p.bg_color}
        for p in session.exec(select(UserPrefix)).all()
    ]


@router.get("/api/user-prefixes/assignments")
def list_user_prefix_assignments_public(session: Session = Depends(get_session)):
    """Публичная карта user_id → префикс. Используется фронтом для отображения
    префиксов в постах/чатах, где в payload есть только author_id."""
    assigns = session.exec(select(UserPrefixAssign)).all()
    prefixes = {p.id: p for p in session.exec(select(UserPrefix)).all()}
    out = []
    for a in assigns:
        p = prefixes.get(a.prefix_id)
        if not p:
            continue
        out.append({"user_id": a.user_id, "icon": p.icon, "color": p.color, "bg_color": p.bg_color})
    return out


@router.get("/api/admin/user-prefixes")
def admin_list_user_prefixes(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    _prefix_admin_guard(staff, session)
    return [
        {"id": p.id, "icon": p.icon, "color": p.color, "bg_color": p.bg_color}
        for p in session.exec(select(UserPrefix)).all()
    ]


@router.post("/api/admin/user-prefixes")
def admin_create_user_prefix(
    data: dict,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    _prefix_admin_guard(staff, session)
    icon = str(data.get("icon") or "star").strip()[:40]
    color = str(data.get("color") or "#ffffff")[:20]
    bg_color = str(data.get("bg_color") or "#8b5cf6")[:20]
    p = UserPrefix(icon=icon, color=color, bg_color=bg_color)
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"id": p.id, "icon": p.icon, "color": p.color, "bg_color": p.bg_color}


@router.patch("/api/admin/user-prefixes/{prefix_id}")
def admin_update_user_prefix(
    prefix_id: int,
    data: dict,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    _prefix_admin_guard(staff, session)
    p = session.get(UserPrefix, prefix_id)
    if not p:
        raise HTTPException(404, "Префикс не найден")
    if "icon" in data: p.icon = str(data["icon"]).strip()[:40]
    if "color" in data: p.color = str(data["color"])[:20]
    if "bg_color" in data: p.bg_color = str(data["bg_color"])[:20]
    session.add(p)
    session.commit()
    return {"id": p.id, "icon": p.icon, "color": p.color, "bg_color": p.bg_color}


@router.delete("/api/admin/user-prefixes/{prefix_id}")
def admin_delete_user_prefix(
    prefix_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    _prefix_admin_guard(staff, session)
    p = session.get(UserPrefix, prefix_id)
    if not p:
        raise HTTPException(404, "Префикс не найден")
    # снимаем назначения
    for a in session.exec(select(UserPrefixAssign).where(UserPrefixAssign.prefix_id == prefix_id)).all():
        session.delete(a)
    session.delete(p)
    session.commit()
    return {"ok": True}


@router.post("/api/admin/user-prefixes/assign")
def admin_assign_user_prefix(
    data: dict,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Массовая выдача/снятие префикса: {user_ids: [...], prefix_id: int|null}."""
    _prefix_admin_guard(staff, session)
    prefix = None
    if data.get("prefix_id") is not None:
        prefix = session.get(UserPrefix, int(data["prefix_id"]))
        if not prefix:
            raise HTTPException(404, "Префикс не найден")
    ids = [int(i) for i in (data.get("user_ids") or []) if i]
    for uid in ids:
        target = session.get(User, uid)
        if not target:
            continue
        existing = session.exec(
            select(UserPrefixAssign).where(UserPrefixAssign.user_id == uid)
        ).first()
        if prefix is None:
            if existing:
                session.delete(existing)
        else:
            if existing:
                existing.prefix_id = prefix.id
                session.add(existing)
            else:
                session.add(UserPrefixAssign(prefix_id=prefix.id, user_id=uid))
    session.commit()
    return {"ok": True, "assigned": len(ids)}

