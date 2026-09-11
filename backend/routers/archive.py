# routers/archive.py
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
@router.get("/api/archive")
def get_archive(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Список заархивированных чатов и каналов текущего юзера."""
    chat_ids = session.exec(
        select(ChatMember.chat_id).where(
            ChatMember.user_id == user.id,
            ChatMember.archived_at.is_not(None),  # type: ignore[union-attr]
        )
    ).all()
    channel_ids = session.exec(
        select(ChannelSubscriber.channel_id).where(
            ChannelSubscriber.user_id == user.id,
            ChannelSubscriber.archived_at.is_not(None),  # type: ignore[union-attr]
        )
    ).all()
    return {"chats": list(chat_ids), "channels": list(channel_ids)}


@router.post("/api/archive/sync")
def sync_archive(
    data: ArchiveSyncIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Синхронизация архива: архивация/разархивация чатов и каналов.
    Только те элементы, где юзер — участник/подписчик."""
    now = utcnow()
    changed = False

    if data.archive_chats:
        for cm in session.exec(
            select(ChatMember).where(
                ChatMember.user_id == user.id,
                ChatMember.chat_id.in_(data.archive_chats),  # type: ignore[union-attr]
            )
        ).all():
            if cm.archived_at is None:
                cm.archived_at = now
                session.add(cm)
                changed = True
    if data.unarchive_chats:
        for cm in session.exec(
            select(ChatMember).where(
                ChatMember.user_id == user.id,
                ChatMember.chat_id.in_(data.unarchive_chats),  # type: ignore[union-attr]
            )
        ).all():
            if cm.archived_at is not None:
                cm.archived_at = None
                session.add(cm)
                changed = True
    if data.archive_channels:
        for sub in session.exec(
            select(ChannelSubscriber).where(
                ChannelSubscriber.user_id == user.id,
                ChannelSubscriber.channel_id.in_(data.archive_channels),  # type: ignore[union-attr]
            )
        ).all():
            if sub.archived_at is None:
                sub.archived_at = now
                session.add(sub)
                changed = True
    if data.unarchive_channels:
        for sub in session.exec(
            select(ChannelSubscriber).where(
                ChannelSubscriber.user_id == user.id,
                ChannelSubscriber.channel_id.in_(data.unarchive_channels),  # type: ignore[union-attr]
            )
        ).all():
            if sub.archived_at is not None:
                sub.archived_at = None
                session.add(sub)
                changed = True

    if changed:
        session.commit()

    chat_ids = session.exec(
        select(ChatMember.chat_id).where(
            ChatMember.user_id == user.id,
            ChatMember.archived_at.is_not(None),  # type: ignore[union-attr]
        )
    ).all()
    channel_ids = session.exec(
        select(ChannelSubscriber.channel_id).where(
            ChannelSubscriber.user_id == user.id,
            ChannelSubscriber.archived_at.is_not(None),  # type: ignore[union-attr]
        )
    ).all()
    return {"ok": True, "chats": list(chat_ids), "channels": list(channel_ids)}

