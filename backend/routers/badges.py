# routers/badges.py
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
@router.get("/api/admin/nick-history")
def admin_nick_history(
    limit: int = 100,
    user_id: Optional[int] = None,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Лог смены ников всех пользователей (для окна техников).

    Опционально фильтр по user_id (чей ник менялся). Права: tech_access.
    """
    if not has_permission(staff, "tech_access", session):
        raise HTTPException(403, "Нет права: tech_access")

    query = select(NickHistory).order_by(NickHistory.changed_at.desc()).limit(limit)
    if user_id:
        query = query.where(NickHistory.user_id == user_id)
    rows = session.exec(query).all()

    user_ids = {r.user_id for r in rows} | {r.changed_by for r in rows}
    users = {}
    for u in session.exec(select(User).where(User.id.in_(user_ids))).all():
        users[u.id] = u

    result = []
    for r in rows:
        target = users.get(r.user_id)
        actor = users.get(r.changed_by)
        result.append({
            "id": r.id,
            "field": r.field,
            "old_value": r.old_value,
            "new_value": r.new_value,
            "changed_at": r.changed_at.isoformat() if r.changed_at else None,
            "user": {
                "id": target.id,
                "username": target.username,
                "display_name": target.display_name,
                "avatar_url": target.avatar_url,
            } if target else None,
            "changed_by": {
                "id": actor.id,
                "username": actor.username,
                "display_name": actor.display_name,
                "avatar_url": actor.avatar_url,
            } if actor else None,
        })
    return result


@router.get("/api/badges")
def get_badges(
    user: Optional[User] = Depends(get_optional_user),  # 🆕 ИЗМЕНЕНО: теперь токен не обязателен
    session: Session = Depends(get_session),
):
    """Получить все значки (доступно всем, чтобы фронт мог рендерить аватарки)"""
    badges = session.exec(select(Badge).order_by(Badge.id)).all()
    return [
        {
            "id": b.id,
            "name": b.name,
            "icon_url": b.icon_url,
            "glow_color": b.glow_color,
            "effect_type": b.effect_type,
            "role_id": b.role_id,
            "user_id": b.user_id,
            "is_selectable": b.is_selectable,
            # 🆕 Безопасное получение новых полей (на случай, если миграция ещё не прошла)
            "enable_ring": getattr(b, 'enable_ring', True),
            "enable_glow": getattr(b, 'enable_glow', True),
        }
        for b in badges
    ]


@router.post("/api/badges")
async def create_badge(
    name: str = Form(...),
    glow_color: Optional[str] = Form(None),
    effect_type: str = Form("none"),
    role_id: Optional[int] = Form(None),
    user_id: Optional[int] = Form(None),
    is_selectable: bool = Form(False),
    enable_ring: bool = Form(True),
    enable_glow: bool = Form(True),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать новый значок (только админ)"""
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    content = await file.read()
    result = await run_in_threadpool(
        lambda: cloudinary.uploader.upload(content, folder="badges", resource_type="image")
    )
    
    badge = Badge(
        name=name,
        icon_url=result["secure_url"],
        glow_color=glow_color if glow_color else None,
        effect_type=effect_type,
        role_id=role_id if role_id else None,
        user_id=user_id if user_id else None,
        is_selectable=is_selectable,
        enable_ring=enable_ring,
        enable_glow=enable_glow,
    )
    session.add(badge)
    session.commit()
    session.refresh(badge)
    return {"ok": True, "id": badge.id}


@router.post("/api/me/badge")
def select_my_badge(
    badge_id: Optional[int] = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if badge_id:
        badge = session.get(Badge, badge_id)
        if not badge:
            raise HTTPException(404, "Badge not found")
        
        user_level = get_user_level(user, session)
        can_select = (
            (badge.role_id == user.role_id) or 
            (badge.user_id == user.id) or
            (badge.is_selectable and user_level >= 3)
        )
        if not can_select:
            raise HTTPException(403, "У вас нет прав на этот значок")
        
        user.selected_badge_id = badge_id
        user.billet_url = None  # 🆕 СБРАСЫВАЕМ КАСТОМНЫЙ ПРИ ВЫБОРЕ СТОКОВОГО
    else:
        user.selected_badge_id = None
        user.billet_url = None
    
    session.add(user)
    session.commit()
    return {"ok": True}


@router.put("/api/badges/{badge_id}")
async def update_badge(
    badge_id: int,
    name: str = Form(...),
    glow_color: Optional[str] = Form(None),
    effect_type: str = Form("none"),
    role_id: Optional[int] = Form(None),
    user_id: Optional[int] = Form(None),
    is_selectable: bool = Form(False),
    enable_ring: bool = Form(True),
    enable_glow: bool = Form(True),
    file: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Обновить существующий значок"""
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    badge = session.get(Badge, badge_id)
    if not badge:
        raise HTTPException(404, "Badge not found")
    
    badge.name = name
    badge.glow_color = glow_color if glow_color else None
    badge.effect_type = effect_type
    badge.role_id = role_id if role_id else None
    badge.user_id = user_id if user_id else None
    badge.is_selectable = is_selectable
    badge.enable_ring = enable_ring
    badge.enable_glow = enable_glow
    
    # Если загружен новый файл - обновляем иконку
    if file and file.filename:
        content = await file.read()
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(content, folder="badges", resource_type="image")
        )
        badge.icon_url = result["secure_url"]
    
    session.add(badge)
    session.commit()
    session.refresh(badge)
    return {"ok": True, "id": badge.id}


@router.post("/api/admin/stock-badges")
async def admin_upload_stock_badges(
    name: str = Form(...),
    glow_color: str = Form("#8b5cf6"),
    effect_type: str = Form("none"),
    min_level: int = Form(1),
    is_selectable: bool = Form(True),
    files: List[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Массовая загрузка стоковых значков"""
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    # Создаём пак для стоковых значков
    pack = StickerPack(
        name=f"Stock: {name}",
        min_level=min_level,
        is_active=True,
        is_builtin=True,
    )
    session.add(pack)
    session.commit()
    session.refresh(pack)
    
    # Загружаем файлы
    import cloudinary.uploader
    uploaded_count = 0
    
    for file in files:
        if not file.content_type or not file.content_type.startswith("image/"):
            continue
        
        content = await file.read()
        try:
            result = cloudinary.uploader.upload(content, folder="badges", resource_type="image")
            
            # Создаём бейдж
            badge = Badge(
                name=f"{name} #{uploaded_count + 1}",
                icon_url=result["secure_url"],
                glow_color=glow_color if glow_color else None,
                effect_type=effect_type,
                role_id=None,  # Не привязан к роли
                user_id=None,  # Не привязан к пользователю
                is_selectable=is_selectable,
                enable_ring=True,
                enable_glow=True,
            )
            session.add(badge)
            uploaded_count += 1
        except Exception as e:
            print(f"[Stock Badges] Failed to upload: {e}")
    
    session.commit()
    return {"ok": True, "uploaded": uploaded_count}


@router.delete("/api/badges/{badge_id}")
def admin_delete_badge(
    badge_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Admin only")
    
    badge = session.get(Badge, badge_id)
    if not badge:
        raise HTTPException(404, "Badge not found")
    
    # 🆕 СБРАСЫВАЕМ значок у всех пользователей, у кого он выбран
    users_with_badge = session.exec(
        select(User).where(User.selected_badge_id == badge_id)
    ).all()
    
    for u in users_with_badge:
        u.selected_badge_id = None
        session.add(u)
    
    session.delete(badge)
    session.commit()
    
    # 🆕 РАССЫЛАЕМ всем, что значок удалён
    asyncio.create_task(manager.broadcast_all("badge_deleted", {"badge_id": badge_id}))
    
    return {"ok": True}


@router.get("/api/system-badges")
def list_system_badges(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Список всех системных плашек (levels 9-11)"""
    _require_badge_admin(staff, session)
    rows = session.exec(select(SystemBadge).order_by(SystemBadge.level)).all()
    return [_system_badge_out(b) for b in rows]


@router.put("/api/system-badges/{level}")
def upsert_system_badge(
    level: int,
    data: dict = Body(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Создать/обновить системную плашку для уровня 9-11"""
    lvl_req = _require_badge_admin(staff, session)
    if level not in (9, 10, 11):
        raise HTTPException(400, "Уровень должен быть 9, 10 или 11")
    # Менять плашку уровня 11 может только уровень 11+ (в т.ч. 10 → нет)
    if level == 11 and lvl_req < 11:
        raise HTTPException(403, "Менять плашку System (level 11) может только level 11+")
    if level == 10 and lvl_req < 10:
        raise HTTPException(403, "Менять плашку Founder (level 10) может только level 10+")

    b = session.get(SystemBadge, level)
    if not b:
        b = SystemBadge(level=level, name=data.get("name") or "Level")
        session.add(b)

    field_map = {
        "name": "name",
        "text_content": "text_content",
        "text_color": "text_color",
        "bg_type": "bg_type",
        "bg_color": "bg_color",
        "bg_gradient": "bg_gradient",
        "icon_url": "icon_url",
        "border_color": "border_color",
        "border_width": "border_width",
        "border_style": "border_style",
        "border_glow": "border_glow",
        "border_glow_intensity": "border_glow_intensity",
        "animation_flags": "animation_flags",
        "animation_speed": "animation_speed",
        "shadow_enabled": "shadow_enabled",
        "shadow_blur": "shadow_blur",
        "shadow_offset_x": "shadow_offset_x",
        "shadow_offset_y": "shadow_offset_y",
        "shadow_color": "shadow_color",
        "inner_glow_enabled": "inner_glow_enabled",
        "inner_glow_intensity": "inner_glow_intensity",
        "specular_enabled": "specular_enabled",
        "metallic_enabled": "metallic_enabled",
        "is_active": "is_active",
    }
    for src, dst in field_map.items():
        if src in data:
            setattr(b, dst, data[src])
    # animation_flags храним как JSON-строку
    if "animation_flags" in data and isinstance(data["animation_flags"], list):
        b.animation_flags = json.dumps(data["animation_flags"])
    b.updated_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(b)
    return _system_badge_out(b)


@router.delete("/api/system-badges/{level}")
def delete_system_badge(
    level: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Удалить системную плашку (сбросить на дефолт)"""
    lvl_req = _require_badge_admin(staff, session)
    if level in (10, 11) and lvl_req < level:
        raise HTTPException(403, f"Сбросить плашку уровня {level} может только level {level}+")
    b = session.get(SystemBadge, level)
    if b:
        session.delete(b)
        session.commit()
    return {"ok": True}

