# routers/billets.py
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
@router.post("/api/me/billet")
@limiter.limit("5/minute")
async def upload_billet(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Загрузить свой значок (только если есть доступ к selectable бейджам)"""
    user_level = get_user_level(user, session)
    has_selectable_badge = session.exec(
        select(func.count(Badge.id)).where(
            Badge.is_selectable == True,
            Badge.user_id == user.id
        )
    ).one() > 0
    
    if not has_selectable_badge and user_level < 3:
        raise HTTPException(403, "У вас нет права загружать значок")
    
    if not file.filename:
        raise HTTPException(400, "No file provided")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        raise HTTPException(400, f"Неверный формат: {ext}")
    
    err = check_size_before_read(file.headers, 2 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (макс 2 МБ)")
    
    # Удаляем старый значок
    if user.billet_url and "cloudinary.com" in user.billet_url:
        try:
            public_id = extract_cloudinary_public_id(user.billet_url)
            if public_id:
                await run_in_threadpool(lambda: cloudinary.uploader.destroy(public_id))
        except Exception:
            pass
    
    # Загружаем новый
    try:
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder="user_badges",
                resource_type="image",
                transformation=[{"width": 100, "height": 100, "crop": "fill"}],
            )
        )
        user.billet_url = result.get("secure_url")
        user.selected_badge_id = None  # 🆕 СБРАСЫВАЕМ СТОКОВЫЙ БЕЙДЖ
        session.add(user)
        session.commit()
        return {"ok": True, "billet_url": user.billet_url}
    except Exception as e:
        raise HTTPException(400, f"Ошибка загрузки: {str(e)}")


@router.delete("/api/me/billet")
def delete_billet(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удалить загруженный значок"""
    if user.billet_url and "cloudinary.com" in user.billet_url:
        try:
            public_id = extract_cloudinary_public_id(user.billet_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass
    user.billet_url = None
    session.add(user)
    session.commit()
    return {"ok": True}


@router.get("/api/billets")
def list_billets(
    staff: User = Depends(require_staff), 
    session: Session = Depends(get_session)
):
    """Список всех кастомных плашек"""
    _require_badge_admin(staff, session)
    billets = session.exec(select(Billet).order_by(Billet.created_at.desc())).all()
    return [_billet_out(b) for b in billets]


@router.post("/api/billets")
def create_billet(
    request: Request,  # <-- ДОБАВЛЕНО: для получения IP
    billet_data: Billet,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Создание новой кастомной плашки (принимает JSON)"""
    _require_badge_admin(staff, session)

    new_badge = Billet(
        name=billet_data.name,
        description=billet_data.description,
        icon_url=billet_data.icon_url,
        text_content=billet_data.text_content,
        text_color=billet_data.text_color or "#ffffff",  # 🆕 ДОБАВЛЕНО
        bg_type=billet_data.bg_type or "solid",
        bg_color=billet_data.bg_color,
        bg_gradient=billet_data.bg_gradient,
        bg_gradient_type=billet_data.bg_gradient_type,
        bg_gradient_angle=billet_data.bg_gradient_angle,
        bg_image_url=billet_data.bg_image_url,
        bg_image_mode=billet_data.bg_image_mode,
        border_color=billet_data.border_color,
        border_width=billet_data.border_width,
        border_style=billet_data.border_style,
        border_glow=billet_data.border_glow,
        border_glow_intensity=billet_data.border_glow_intensity,
        animation_flags=billet_data.animation_flags,
        animation_speed=billet_data.animation_speed,
        shadow_enabled=billet_data.shadow_enabled,
        shadow_blur=billet_data.shadow_blur,
        shadow_offset_x=billet_data.shadow_offset_x,
        shadow_offset_y=billet_data.shadow_offset_y,
        shadow_color=billet_data.shadow_color,
        inner_glow_enabled=billet_data.inner_glow_enabled,
        inner_glow_intensity=billet_data.inner_glow_intensity,
        specular_enabled=billet_data.specular_enabled,
        metallic_enabled=billet_data.metallic_enabled,
        priority=billet_data.priority or 0,
        is_active=billet_data.is_active,
        created_by=staff.id,
    )
    
    session.add(new_badge)
    
    # ✅ ИСПРАВЛЕНО: передаем реальный request в get_client_ip
    log_entry = ActionLog(
        actor_id=staff.id,
        action="badge_create",
        target_type="Billet",
        target_id=new_badge.id,
        details=f'Created custom billet "{new_badge.name}"',
        ip_address=get_client_ip(request),
    )
    session.add(log_entry)
    session.commit()
    session.refresh(new_badge)
    
    return _billet_out(new_badge)


@router.put("/api/billets/{billet_id}")
def update_billet(
    request: Request,  # <-- ДОБАВЛЕНО: для получения IP
    billet_id: int,
    billet_data: Billet,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Обновление плашки (принимает JSON)"""
    _require_badge_admin(staff, session)
    billet = session.get(Billet, billet_id)
    if not billet:
        raise HTTPException(404, "Плашка не найдена")

    update_fields = [
        "name", "description", "icon_url", "text_content", "text_color",
        "bg_type", "bg_color", "bg_gradient", "bg_gradient_type", "bg_gradient_angle",
        "bg_image_url", "bg_image_mode",
        "border_color", "border_width", "border_style", "border_glow", "border_glow_intensity",
        "animation_flags", "animation_speed",
        "shadow_enabled", "shadow_blur", "shadow_offset_x", "shadow_offset_y", "shadow_color",
        "inner_glow_enabled", "inner_glow_intensity", "specular_enabled", "metallic_enabled",
        "priority", "is_active"
    ]
    
    for field in update_fields:
        val = getattr(billet_data, field)
        if val is not None:
            setattr(billet, field, val)

    session.add(billet)
    
    # ✅ ИСПРАВЛЕНО: передаем реальный request в get_client_ip
    log_entry = ActionLog(
        actor_id=staff.id,
        action="badge_update",
        target_type="Billet",
        target_id=billet.id,
        details=f"Updated custom billet '{billet.name}'",
        ip_address=get_client_ip(request),
    )
    session.add(log_entry)
    session.commit()
    session.refresh(billet)

    return _billet_out(billet)


@router.delete("/api/billets/{billet_id}")
def delete_billet(
    request: Request,  # <-- ДОБАВЛЕНО: для получения IP
    billet_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Удаление плашки"""
    lvl = _require_badge_admin(staff, session)
    if lvl < 10: 
         raise HTTPException(403, "Удалять плашки может только уровень 10+")

    billet = session.get(Billet, billet_id)
    if not billet:
        raise HTTPException(404, "Плашка не найдена")

    # 1. Сначала снимаем (деактивируем) плашку у всех, кому она выдана —
    #    она мгновенно исчезает из профилей
    session.exec(
        update(BilletAssignment)
        .where(BilletAssignment.billet_id == billet_id)
        .values(is_active=False)
    )
    session.commit()

    # 2. Удаляем все выдачи одним массовым запросом, чтобы не нарушить FK
    session.exec(
        delete(BilletAssignment).where(BilletAssignment.billet_id == billet_id)
    )
    session.commit()

    # 3. Удаляем саму плашку
    session.delete(billet)
    
    # ✅ ИСПРАВЛЕНО: передаем реальный request в get_client_ip
    log_entry = ActionLog(
        actor_id=staff.id,
        action="badge_delete",
        target_type="Billet",
        target_id=billet_id,
        details=f"Deleted custom billet '{billet.name}'",
        ip_address=get_client_ip(request),
    )
    session.add(log_entry)
    session.commit()

    return {"success": True}


@router.post("/api/billets/{billet_id}/upload-icon")
def upload_badge_icon(
    billet_id: int,
    icon_base64: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Загрузка иконки плашки через base64"""
    _require_badge_admin(staff, session)
    billet = session.get(Billet, billet_id)
    if not billet:
        raise HTTPException(404, "Плашка не найдена")

    try:
        from cloudinary_config import upload_base64_image
        url = upload_base64_image(icon_base64, folder="billets/icons", public_id=f"badge_icon_{billet_id}")
        billet.icon_url = url
        session.add(billet)
        session.commit()
        return {"icon_url": url}
    except Exception as e:
        raise HTTPException(500, f"Ошибка загрузки: {str(e)}")


@router.post("/api/billets/{billet_id}/upload-bg-image")
def upload_badge_bg_image(
    billet_id: int,
    bg_image_base64: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Загрузка фона плашки через base64"""
    _require_badge_admin(staff, session)
    billet = session.get(Billet, billet_id)
    if not billet:
        raise HTTPException(404, "Плашка не найдена")

    try:
        from cloudinary_config import upload_base64_image
        url = upload_base64_image(bg_image_base64, folder="billets/bgs", public_id=f"badge_bg_{billet_id}")
        billet.bg_image_url = url
        session.add(billet)
        session.commit()
        return {"bg_image_url": url}
    except Exception as e:
        raise HTTPException(500, f"Ошибка загрузки: {str(e)}")


@router.get("/api/billet-assignments")
def list_assignments(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
    user_id: Optional[int] = None,
    active_only: bool = True,
):
    """Список всех назначений плашек"""
    _require_badge_admin(staff, session)
    
    query = select(BilletAssignment).order_by(BilletAssignment.granted_at.desc())
    if user_id:
        query = query.where(BilletAssignment.user_id == user_id)
    if active_only:
        query = query.where(BilletAssignment.is_active == True)
        
    assignments = session.exec(query).all()
    return [_assignment_out(a, session) for a in assignments]


@router.post("/api/billet-assignments")
def assign_billet(
    request: Request,  # <-- ДОБАВЛЕНО
    user_id: int = Form(...),
    billet_id: int = Form(...),
    expires_at: Optional[str] = Form(None),
    priority: int = Form(1),
    notify_user: bool = Form(False),
    custom_message: Optional[str] = Form(None),
    override_priority: bool = Form(True),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    """Выдача плашки пользователю"""
    lvl = _require_badge_admin(staff, session)
    
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "Пользователь не найден")
        
    billet = session.get(Billet, billet_id)
    if not billet:
        raise HTTPException(404, "Плашка не найдена")

    staff_level = get_user_level(staff, session)
    target_level = get_user_level(target, session)
    is_self = staff.id == target.id

    # Founder (уровень 10+) может выдать ЛЮБУЮ плашку ЛЮБОМУ и самому себе
    # (в т.ч. подменить собственную плашку) — обход строгой иерархии.
    founder_override = staff_level >= 10

    if not is_self and not founder_override:
        # Обычный админ плашек (уровень 9) не может выдавать уровень выше своего.
        if target_level > staff_level:
            raise HTTPException(
                403,
                f"Уровень {staff_level} не может выдавать плашки пользователям уровня {target_level}+",
            )

    if is_self:
        # Самовыдача всегда разрешена: позволяет подменить собственную плашку.
        override_priority = True

    now = datetime.now(timezone.utc)
    expiry: Optional[datetime] = None
    if expires_at:
        try:
            expiry = datetime.fromisoformat(expires_at).replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    existing = session.exec(
        select(BilletAssignment).where(
            BilletAssignment.user_id == user_id,
            BilletAssignment.billet_id == billet_id,
            BilletAssignment.is_active == True
        )
    ).all()
    for old in existing:
        old.is_active = False
        session.add(old)

    assignment = BilletAssignment(
        user_id=user_id,
        billet_id=billet_id,
        granted_by=staff.id,
        granted_at=now,
        expires_at=expiry,
        is_active=True,
        custom_message=custom_message,
        override_priority=override_priority,
    )
    session.add(assignment)
    
    if notify_user:
        session.add(Notification(
            user_id=user_id,
            actor_id=staff.id,
            type="badge_granted",
            message=custom_message or f"Вам выдана плашка «{billet.name}»",
        ))

    session.commit()
    session.refresh(assignment)

    # ✅ ИСПРАВЛЕНО: передаем request
    log_entry = ActionLog(
        actor_id=staff.id,
        action="badge_assign",
        target_type="BilletAssignment",
        target_id=assignment.id,
        details=f"Granted billet '{billet.name}' to user {user_id}",
        ip_address=get_client_ip(request),
    )
    session.add(log_entry)
    session.commit()
    
    return {"success": True, "assignment": _assignment_out(assignment, session)}


@router.post("/api/billet-assignments/{assign_id}/revoke")
def revoke_assignment(
    request: Request,  # <-- ДОБАВЛЕНО
    assign_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session)
):
    """Отозвать плашку"""
    _require_badge_admin(staff, session)
    assignment = session.get(BilletAssignment, assign_id)
    if not assignment:
        raise HTTPException(404, "Назначение не найдено")
        
    assignment.is_active = False
    session.add(assignment)
    session.commit()

    # ✅ ИСПРАВЛЕНО: передаем request
    log_entry = ActionLog(
        actor_id=staff.id,
        action="badge_revoke",
        target_type="BilletAssignment",
        target_id=assign_id,
        details=f"Revoked billet assignment {assign_id}",
        ip_address=get_client_ip(request),
    )
    session.add(log_entry)
    session.commit()
    
    return {"success": True}


@router.post("/api/billet-assignments/{assign_id}/extend")
def extend_assignment(
    request: Request,  # <-- ДОБАВЛЕНО
    assign_id: int,
    duration_type: str = Form(...),
    duration_days: Optional[int] = Form(None),
    expires_at: Optional[str] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session)
):
    """Продлить срок действия"""
    _require_badge_admin(staff, session)
    assignment = session.get(BilletAssignment, assign_id)
    if not assignment:
        raise HTTPException(404, "Назначение не найдено")

    now = datetime.now(timezone.utc)
    base = assignment.expires_at if (assignment.expires_at and assignment.expires_at > now) else now

    if duration_type == "permanent":
        assignment.expires_at = None
    elif duration_type == "days" and duration_days:
        assignment.expires_at = base + timedelta(days=duration_days)
    elif duration_type == "date" and expires_at:
        try:
            assignment.expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        except Exception:
            raise HTTPException(400, "Invalid date format")
            
    assignment.is_active = True
    session.add(assignment)
    session.commit()
    
    return {"success": True, "assignment": _assignment_out(assignment, session)}

