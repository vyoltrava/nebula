# routers/stickers.py
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
@router.get("/api/stickers/by-content")
def get_sticker_pack_by_content(
    content: str = "",
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Возвращает паку по URL стикера (для модалки «все стикеры пака»).

    Сообщения-стикеры хранят только media_url (content стикера),
    поэтому пак резолвим через совпадение content.
    """
    content = (content or "").strip()
    if not content:
        return {"pack": None, "stickers": []}
    sticker = session.exec(select(Sticker).where(Sticker.content == content)).first()
    if not sticker:
        return {"pack": None, "stickers": []}
    pack = session.get(StickerPack, sticker.pack_id)
    if not pack or not pack.is_active:
        return {"pack": None, "stickers": []}
    user_level = get_user_level(user, session)
    # 🛡 Приватные/забаненные паки — как в /api/sticker-packs
    if getattr(pack, "banned", False) and not user.is_admin:
        return {"pack": None, "stickers": []}
    if getattr(pack, "is_user", False) and not getattr(pack, "is_public", True):
        if pack.owner_id != user.id and not user.is_admin:
            return {"pack": None, "stickers": []}
    stickers = session.exec(
        select(Sticker).where(Sticker.pack_id == pack.id).order_by(Sticker.order)
    ).all()
    return {
        "pack": {
            "id": pack.id,
            "name": pack.name,
            "min_level": pack.min_level,
            "locked": (user_level < pack.min_level) and not user.is_admin,
        },
        "stickers": [{"id": s.id, "type": s.type, "content": s.content} for s in stickers],
    }

