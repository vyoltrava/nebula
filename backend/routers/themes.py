# app_split/routers/themes.py
# Сгенерировано автоматически. Проверь импорты!

from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile, Header, Query
from sqlmodel import Session, select, delete, func
from typing import Optional, List
from datetime import datetime, timezone
import json, os

from database import get_session
from models import *
from app_split.dependencies import *

router = APIRouter()

@router.get("/api/themes")
def get_themes(
    user: Optional[User] = Depends(get_current_user_optional),
    session: Session = Depends(get_session),
):
    """Публичный список тем — фильтруем по уровню доступа пользователя"""
    # Глобальный тумблер
    enabled_row = session.get(SystemSetting, "themes_enabled")
    themes_enabled = enabled_row.value == "true" if enabled_row else False
    
    if not themes_enabled:
        return []

    user_level = get_user_level(user, session) if user else 0
    is_admin = user.is_admin if user else False

    # Берём активные темы, доступные пользователю по уровню
    query = select(Theme).where(Theme.is_active == True)
    themes = session.exec(query).all()

    result = []
    for t in themes:
        # Пропускаем недоступные (кроме админов — они видят всё)
        if not is_admin and t.min_level > user_level:
            continue
        result.append(theme_to_dict(t))
    return result


@router.get("/api/themes/all")
def get_all_themes(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Все темы — для админки"""
    if not user.is_admin:
        raise HTTPException(403, "Только для админов")
    
    themes = session.exec(select(Theme).order_by(Theme.created_at.desc())).all()
    return [theme_to_dict(t) for t in themes]


@router.post("/api/themes")
def create_theme(
    name: str,
    type: str,
    colors: str,  # JSON
    speed: float = 24.0,
    intensity: float = 0.22,
    blur: int = 80,
    min_level: int = 0,
    is_default: bool = False,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Только для админов")
    
    if type not in {"aurora", "gradient", "liquid", "neon"}:
        raise HTTPException(400, "Неверный тип анимации")
    
    # Валидация JSON цветов
    try:
        colors_list = json.loads(colors) if isinstance(colors, str) else colors
        if not isinstance(colors_list, list) or len(colors_list) < 2 or len(colors_list) > 4:
            raise ValueError
    except:
        raise HTTPException(400, "Цвета должны быть JSON массивом из 2-4 цветов")
    
    # Если делаем дефолтной — снимаем флаг с других
    if is_default:
        for existing in session.exec(select(Theme).where(Theme.is_default == True)).all():
            existing.is_default = False
            session.add(existing)
    
    theme = Theme(
        name=name,
        type=type,
        colors=json.dumps(colors_list),
        speed=speed,
        intensity=intensity,
        blur=blur,
        is_default=is_default,
        min_level=min_level,
        is_active=True,
        created_by=user.id,
    )
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme_to_dict(theme)


@router.put("/api/themes/{theme_id}")
def update_theme(
    theme_id: int,
    name: str,
    type: str,
    colors: str,
    speed: float,
    intensity: float,
    blur: int,
    min_level: int,
    is_default: bool,
    is_active: bool,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Только для админов")
    
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "Тема не найдена")
    
    try:
        colors_list = json.loads(colors) if isinstance(colors, str) else colors
    except:
        raise HTTPException(400, "Неверный формат цветов")
    
    # Снимаем is_default с других если эта становится дефолтной
    if is_default and not theme.is_default:
        for existing in session.exec(select(Theme).where(
            Theme.is_default == True, Theme.id != theme_id
        )).all():
            existing.is_default = False
            session.add(existing)
    
    theme.name = name
    theme.type = type
    theme.colors = json.dumps(colors_list)
    theme.speed = speed
    theme.intensity = intensity
    theme.blur = blur
    theme.min_level = min_level
    theme.is_default = is_default
    theme.is_active = is_active
    
    session.add(theme)
    session.commit()
    session.refresh(theme)
    return theme_to_dict(theme)


@router.delete("/api/themes/{theme_id}")
def delete_theme(
    theme_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403, "Только для админов")
    
    theme = session.get(Theme, theme_id)
    if not theme:
        raise HTTPException(404, "Тема не найдена")
    
    session.delete(theme)
    session.commit()
    return {"ok": True}


@router.get("/api/themes/settings")
def get_themes_settings(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403)
    
    enabled_row = session.get(SystemSetting, "themes_enabled")
    return {"themes_enabled": enabled_row.value == "true" if enabled_row else False}


@router.post("/api/themes/settings")
def update_themes_settings(
    enabled: bool,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not user.is_admin:
        raise HTTPException(403)
    
    row = session.get(SystemSetting, "themes_enabled")
    if not row:
        row = SystemSetting(key="themes_enabled", value=str(enabled).lower())
    else:
        row.value = str(enabled).lower()
        row.updated_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    return {"ok": True, "enabled": enabled}
