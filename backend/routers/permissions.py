from dependencies import get_user_level, has_permission, invalidate_role_cache, max_level_for, require_staff
# app_split/routers/permissions.py
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

@router.get("/api/permissions")
def list_permissions():
    return [
        # === Модерация контента ===
        {"id": "delete_posts", "label": "Удалять посты", "category": "content"},
        {"id": "edit_posts", "label": "Редактировать чужие посты", "category": "content"},
        {"id": "remove_avatars", "label": "Удалять аватарки", "category": "content"},
        {"id": "manage_stickers", "label": "Управлять стикер-паками", "category": "content"},
        {"id": "manage_announcements", "label": "Публиковать объявления", "category": "content"},
        
        # === Модерация пользователей ===
        {"id": "ban_users", "label": "Банить пользователей", "category": "users"},
        {"id": "warn_users", "label": "Выдавать предупреждения", "category": "users"},
        {"id": "delete_users", "label": "Удалять пользователей", "category": "users"},
        {"id": "assign_moderator", "label": "Назначать модераторов", "category": "users"},
        
        # === Чаты и группы ===
        {"id": "pin_messages", "label": "Закреплять сообщения везде", "category": "chats"},
        {"id": "manage_groups", "label": "Администрировать любые группы", "category": "chats"},
        {"id": "manage_support", "label": "Чат поддержки", "category": "chats"},
        
        # === Система ===
        {"id": "manage_roles", "label": "Управлять ролями", "category": "system"},
        {"id": "manage_users", "label": "Доступ к панели управления", "category": "system"},
        {"id": "manage_reports", "label": "Управление жалобами", "category": "system"},
        {"id": "tech_access", "label": "Технический доступ", "category": "system"},
    ]


@router.get("/api/roles")
def list_roles(session: Session = Depends(get_session)):
    roles = session.exec(select(Role)).all()
    
    # Сортируем: сначала staff по position, потом остальные по level DESC
    staff_roles = sorted(
        [r for r in roles if r.is_staff],
        key=lambda r: (r.position or 0)
    )
    other_roles = sorted(
        [r for r in roles if not r.is_staff],
        key=lambda r: -(r.level or 0)
    )
    
    sorted_roles = staff_roles + other_roles
    
    return [
        {
            "id": r.id,
            "name": r.name,
            "color": r.color,
            "level": r.level,
            "description": r.description or "",
            "is_staff": r.is_staff,
            "position": r.position or 0,
            "category_id": r.category_id,
            "permissions": json.loads(r.permissions),
        }
        for r in sorted_roles
    ]


@router.post("/api/roles")
def create_role(
    name: str = Form(...),
    color: str = Form("#8b5cf6"),
    level: int = Form(1),
    description: Optional[str] = Form(None),
    is_staff: bool = Form(False),
    permissions: str = Form("[]"),
    category_id: Optional[int] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    max_lvl = max_level_for(staff, session)
    if level < 1 or level > max_lvl:
        raise HTTPException(403, f"Уровень должен быть от 1 до {max_lvl}")

    if session.exec(select(Role).where(Role.name == name)).first():
        raise HTTPException(400, "Role name already exists")

    position = 0
    if is_staff:
        staff_roles = session.exec(select(Role).where(Role.is_staff == True)).all()
        position = max([r.position for r in staff_roles], default=0) + 1

    role = Role(
        name=name, color=color, level=level,
        description=description, is_staff=is_staff,
        position=position, permissions=permissions,
        category_id=category_id,
    )
    session.add(role)
    session.commit()
    session.refresh(role)
    invalidate_role_cache()
    return {
        "id": role.id, "name": role.name, "color": role.color, "level": role.level,
        "description": role.description, "is_staff": role.is_staff,
        "position": role.position, "permissions": json.loads(role.permissions),
    }


@router.patch("/api/roles/{role_id}")
def update_role(
    role_id: int,
    name: Optional[str] = Form(None),
    color: Optional[str] = Form(None),
    level: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    is_staff: Optional[bool] = Form(None),
    permissions: Optional[str] = Form(None),
    category_id: Optional[int] = Form(None),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")

    if get_user_level(staff, session) <= role.level and not staff.is_admin:
        raise HTTPException(403, f"Недостаточно уровня (роль: {role.level})")

    if level is not None:
        max_lvl = max_level_for(staff, session)
        if level < 1 or level > max_lvl:
            raise HTTPException(403, f"Уровень должен быть от 1 до {max_lvl}")
        role.level = level

    if name:
        role.name = name
    if color:
        role.color = color
    if description is not None:
        role.description = description
    if is_staff is not None:
        if is_staff and not role.is_staff:
            staff_roles = session.exec(select(Role).where(Role.is_staff == True)).all()
            role.position = max([r.position for r in staff_roles], default=0) + 1
        role.is_staff = is_staff
    if permissions:
        role.permissions = permissions
    if category_id is not None:
        role.category_id = category_id if category_id > 0 else None
    session.add(role)
    session.commit()
    session.refresh(role)
    invalidate_role_cache()
    return {
        "id": role.id, "name": role.name, "color": role.color, "level": role.level,
        "description": role.description, "is_staff": role.is_staff,
        "position": role.position, "permissions": json.loads(role.permissions),
    }


@router.delete("/api/roles/{role_id}")
def delete_role(
    role_id: int,
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")

    if get_user_level(staff, session) <= role.level and not staff.is_admin:
        raise HTTPException(403, f"Недостаточно уровня (роль: {role.level})")

    users = session.exec(select(User).where(User.role_id == role_id)).all()
    for u in users:
        u.role_id = None
        session.add(u)
    session.delete(role)
    session.commit()
    invalidate_role_cache()
    return {"ok": True}


@router.post("/api/roles/{role_id}/move")
def move_role(
    role_id: int,
    direction: str = Form(...),
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    if not has_permission(staff, "manage_roles", session):
        raise HTTPException(403, "No permission: manage_roles")

    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")

    staff_roles = session.exec(select(Role).where(Role.is_staff == True)).all()
    staff_roles.sort(key=lambda r: ((r.position or 0), -(r.level or 0)))

    # Нормализуем позиции в 1..N — без этого кнопки ↑↓ меняют 0 на 0
    for i, r in enumerate(staff_roles, start=1):
        r.position = i

    idx = next((i for i, r in enumerate(staff_roles) if r.id == role_id), -1)
    if idx == -1:
        raise HTTPException(400, "Роль не отмечена как staff")

    swap_with = None
    if direction == "up" and idx > 0:
        swap_with = staff_roles[idx - 1]
    elif direction == "down" and idx < len(staff_roles) - 1:
        swap_with = staff_roles[idx + 1]

    if swap_with is not None:
        role.position, swap_with.position = swap_with.position, role.position
        session.add(role)
        session.add(swap_with)

    session.commit()
    invalidate_role_cache()
    return {"ok": True}
