# routers/keys.py
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
@router.post("/api/keys/register")
@limiter.limit("10/minute")
def register_public_key(
    request: Request,
    public_key: str = Form(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Клиент регистрирует РЕАЛЬНЫЕ ключи. Перезаписывает placeholder."""
    import hashlib
    fingerprint = hashlib.sha256(public_key.encode()).hexdigest()[:16]

    existing = session.exec(select(UserKey).where(UserKey.user_id == user.id)).first()
    if existing:
        # ✅ ПЕРЕЗАПИСЫВАЕМ — клиент прислал реальный ключ
        existing.public_key = public_key
        existing.fingerprint = fingerprint
        existing.is_pending = False
        session.add(existing)
        session.commit()
        return {"ok": True, "fingerprint": fingerprint, "already_existed": True}

    key = UserKey(user_id=user.id, public_key=public_key, fingerprint=fingerprint, is_pending=False)
    session.add(key)
    session.commit()
    return {"ok": True, "fingerprint": fingerprint, "already_existed": False}


@router.get("/api/invite/{token}")
def get_invite_info(token: str, actor: Optional[User] = Depends(get_optional_user), session: Session = Depends(get_session)):
    """Публичная инфа о приглашении (авторизация не обязана)."""
    inv = session.exec(select(ChatInvite).where(ChatInvite.token == token, ChatInvite.is_active == True)).first()
    if not inv or not _invite_valid(inv):
        raise HTTPException(404, "Приглашение не найдено")
    chat = session.get(Chat, inv.chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")
    members = session.exec(select(ChatMember).where(ChatMember.chat_id == chat.id)).all()
    owner = session.get(User, chat.owner_id)
    return {
        "token": token, "chat_id": chat.id, "name": chat.name or "Группа", "avatar_url": chat.avatar_url,
        "is_group": chat.is_group or chat.is_prism, "members_count": len(members),
        "owner": user_out(owner, session) if owner else None,
        "is_member": any(m.user_id == actor.id for m in members) if actor else False,
    }


@router.post("/api/invite/{token}/join")
async def join_chat_invite(token: str, request: Request, actor: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Вступить в чат по приглашению."""
    inv = session.exec(select(ChatInvite).where(ChatInvite.token == token, ChatInvite.is_active == True)).first()
    if not inv or not _invite_valid(inv):
        raise HTTPException(404, "Приглашение не найдено")
    chat = session.get(Chat, inv.chat_id)
    if not chat:
        raise HTTPException(404, "Чат не найден")
    existing = session.exec(select(ChatMember).where(ChatMember.chat_id == chat.id, ChatMember.user_id == actor.id)).first()
    if existing:
        return {"chat_id": chat.id, "joined": False}
    session.add(ChatMember(chat_id=chat.id, user_id=actor.id, role="member"))
    session.commit()
    log_action(session, actor.id, "chat_join_invite", target_type="chat", target_id=chat.id, ip_address=get_client_ip(request))
    await manager.broadcast_to_chat(chat.id, "group_member_added", {"chat_id": chat.id, "user": user_out(actor, session)})
    return {"chat_id": chat.id, "joined": True}

