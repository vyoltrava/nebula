# routers/recommendations.py
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
@router.get("/api/users/{user_id}/recommendations")
async def get_user_recommendations(
    user_id: int,
    request: Request,
    limit: int = 20,
    min_similarity: float = 30.0,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Список похожих пользователей + детальные метрики схожести.
    Кешируется в Redis (`redis_client`) на 24 часа.
    """
    anchor = session.get(User, user_id)
    if not anchor or getattr(anchor, "is_banned", False):
        raise HTTPException(404, "User not found")

    cache_key = f"recommendations:{user_id}:{limit}:{min_similarity}"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # кандидаты: все, кого видит текущий пользователь (или все активные)
    exclude = {user_id}
    if current_user:
        exclude.add(current_user.id)
    candidates = session.exec(
        select(User).where(User.id.not_in(list(exclude))).limit(200)
    ).all()

    results = []
    for cand in candidates:
        if getattr(cand, "is_banned", False):
            continue
        data = calculate_overall_similarity(session, anchor, cand, redis_client)
        if data["similarity_score"] >= min_similarity:
            results.append({
                "user": {
                    "id": cand.id,
                    "username": cand.username,
                    "display_name": cand.display_name,
                    "avatar_url": cand.avatar_url,
                    "bio": (cand.bio or "")[:100],
                    "badge": getattr(cand, "selected_badge_id", None),
                    "billet_url": cand.billet_url,
                    "is_verified": getattr(cand, "is_admin", False)
                    or getattr(cand, "is_moderator", False),
                },
                "similarity": data,
            })

    results.sort(key=lambda r: r["similarity"]["similarity_score"], reverse=True)
    payload = {
        "center_user": {
            "id": anchor.id,
            "username": anchor.username,
            "display_name": anchor.display_name,
            "avatar_url": anchor.avatar_url,
            "bio": anchor.bio,
        },
        "recommendations": results[:limit],
        "total": len(results),
    }
    redis_client.setex(cache_key, 86400, json.dumps(payload, default=str))
    return payload


@router.get("/api/recommendations/centrality")
async def get_recommendations_centrality(
    request: Request,
    session: Session = Depends(get_session),
    current_user: Optional[User] = Depends(get_optional_user),
):
    """
    Локальная паутина вокруг текущего пользователя.
    Возвращает центрального пользователя + до 12 самых близких.
    """
    anchor = current_user
    if not anchor:
        token = request.headers.get("authorization", "").replace("Bearer ", "")
        if not token:
            raise HTTPException(401, "No token")
        try:
            payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
            anchor = session.get(User, int(payload["sub"]))
        except Exception:
            raise HTTPException(401, "Invalid token")
    if not anchor or getattr(anchor, "is_banned", False):
        raise HTTPException(404, "User not found")

    cache_key = f"recommendations:centrality:{anchor.id}"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # берём 60 кандидатов, считаем схожесть, топ-12
    candidates = session.exec(select(User).where(User.id != anchor.id).limit(60)).all()
    scored = []
    for cand in candidates:
        if getattr(cand, "is_banned", False):
            continue
        data = calculate_overall_similarity(session, anchor, cand, redis_client)
        if data["similarity_score"] >= 25.0:
            scored.append({
                "user": {
                    "id": cand.id,
                    "username": cand.username,
                    "display_name": cand.display_name,
                    "avatar_url": cand.avatar_url,
                    "bio": (cand.bio or "")[:100],
                    "is_verified": getattr(cand, "is_admin", False)
                    or getattr(cand, "is_moderator", False),
                },
                "similarity": data,
            })
    scored.sort(key=lambda r: r["similarity"]["similarity_score"], reverse=True)
    payload = {
        "center_user": {
            "id": anchor.id,
            "username": anchor.username,
            "display_name": anchor.display_name,
            "avatar_url": anchor.avatar_url,
            "bio": anchor.bio,
        },
        "recommendations": scored[:12],
        "total": len(scored),
    }
    redis_client.setex(cache_key, 3600, json.dumps(payload, default=str))  # 1 час
    return payload

