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
        {"id": perm_id, "label": label, "category": cat}
        for perm_id, (label, cat) in PERMISSION_LABELS.items()
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

    def _safe_perms(raw) -> list:
        # 🛡 Самолечение: битый/NULL JSON в role.permissions не должен ронять
        # всю страницу ролей (500 → белая страница / редирект на /).
        try:
            parsed = json.loads(raw) if raw else []
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []

    return [
        {
            "id": r.id,
            "name": r.name,
            "color": r.color,
            "level": r.level,
            "description": r.description or "",
            "is_staff": r.is_staff,
            "show_in_payments": r.show_in_payments,
            "position": r.position or 0,
            "category_id": r.category_id,
            "permissions": _safe_perms(r.permissions),
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
    show_in_payments: bool = Form(False),
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
        show_in_payments=show_in_payments,
        position=position, permissions=json.dumps(parse_and_validate_permissions(permissions)),
        category_id=category_id,
    )
    session.add(role)
    session.commit()
    session.refresh(role)
    invalidate_role_cache()
    return {
        "id": role.id, "name": role.name, "color": role.color, "level": role.level,
        "description": role.description, "is_staff": role.is_staff,
        "show_in_payments": role.show_in_payments,
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
    show_in_payments: Optional[bool] = Form(None),
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
    if show_in_payments is not None:
        role.show_in_payments = show_in_payments
    if permissions is not None:
        role.permissions = json.dumps(parse_and_validate_permissions(permissions))
    if category_id is not None:
        role.category_id = category_id if category_id > 0 else None
    session.add(role)
    session.commit()
    session.refresh(role)
    invalidate_role_cache()
    return {
        "id": role.id, "name": role.name, "color": role.color, "level": role.level,
        "description": role.description, "is_staff": role.is_staff,
        "show_in_payments": role.show_in_payments,
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

    # 🔄 роль удалена → все её носители теряют членство в рабочих чатах
    try:
        from work_chats import sync_user_work_membership
        for u in users:
            sync_user_work_membership(session, u, staff)
    except Exception as _e:
        print("work membership sync (role delete):", _e)

    # 🆕 Чистим историю ролей, иначе FK violation (в проде constraint без ON DELETE SET NULL)
    hist = session.exec(
        select(RoleHistory).where(
            (RoleHistory.old_role_id == role_id) | (RoleHistory.new_role_id == role_id)
        )
    ).all()
    for h in hist:
        if h.old_role_id == role_id:
            h.old_role_id = None
        if h.new_role_id == role_id:
            h.new_role_id = None
        session.add(h)

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



# ==== (миграция из main.py) ====
@router.get("/api/roles/assignable")
def list_assignable_roles(
    staff: User = Depends(require_staff),
    session: Session = Depends(get_session),
):
    roles = assignable_roles_for(staff, session)
    return sorted(
        [
            {
                "id": r.id, "name": r.name, "color": r.color, "level": r.level,
                "category_id": r.category_id, "is_staff": r.is_staff,
            }
            for r in roles
        ],
        key=lambda r: (r["category_id"] or 0, -r["level"]),
    )

