# routers/media.py
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
@router.post("/api/media/upload")
@limiter.limit("20/minute")
async def upload_media_for_post(
    request: Request,
    file: UploadFile = File(...),
    actor: User = Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(400, "No file provided")
    ext = os.path.splitext(file.filename)[1].lower()
    kind = file.content_type or ""
    is_image = ext in {".jpg", ".jpeg", ".png", ".gif", ".webp"} or kind.startswith("image/")
    is_video = kind.startswith("video/") or ext in {".mp4", ".webm", ".mov"}
    is_audio = kind.startswith("audio/") or ext in {".mp3", ".ogg", ".wav"}
    if not (is_image or is_video or is_audio):
        raise HTTPException(400, f"Неверный формат: {ext}")
    err = check_size_before_read(file.headers, 10 * 1024 * 1024)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "Файл слишком большой (максимум 10 МБ)")
    media_type = "image" if is_image else ("video" if is_video else "audio")
    try:
        result = await run_in_threadpool(lambda: cloudinary.uploader.upload(
            content, folder=UPLOAD_FOLDER,
            resource_type="video" if media_type != "image" else "image",
        ))
        url = result.get("secure_url")
    except Exception as e:
        raise HTTPException(400, f"Ошибка загрузки: {str(e)}")
    return {"url": url, "media_type": media_type}

