# routers/premium.py
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
@router.get("/api/premium/shop-status")
def get_shop_status(session: Session = Depends(get_session)):
    """Публичный статус магазина (включён/выключен)."""
    enabled = _shop_effectively_enabled(session)
    return {"enabled": enabled}


@router.post("/api/admin/premium/shop")
def set_shop_status(
    request: Request,
    enabled_form: bool = Form(True),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Включить/выключить магазин (право manage_usernames)."""
    if not has_permission(user, "manage_usernames", session):
        raise HTTPException(403, "Нет права: manage_usernames")
    enabled = _parse_enabled(request) if request.query_params.get("enabled") is not None else enabled_form
    setting = session.get(SystemSetting, SHOP_ENABLED_KEY)
    if setting is None:
        setting = SystemSetting(key=SHOP_ENABLED_KEY, value="true" if enabled else "false")
    else:
        setting.value = "true" if enabled else "false"
    session.add(setting)
    log_action(session, user.id, "toggle_premium_shop", details={"enabled": enabled})
    session.commit()
    return {"enabled": enabled}


@router.get("/api/admin/premium-usernames")
def get_premium_usernames_admin(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Полный список (включая проданные/неактивные). Право manage_usernames."""
    if not has_permission(user, "manage_usernames", session):
        raise HTTPException(403, "Нет права: manage_usernames")
    items = session.exec(
        select(PremiumUsername).order_by(PremiumUsername.created_at.desc())
    ).all()
    return [_serialize_premium(i) for i in items]


@router.post("/api/admin/premium-usernames")
def create_premium_username(
    data: PremiumUsernameCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Создать премиум-юзернейм. Право manage_usernames."""
    if not has_permission(user, "manage_usernames", session):
        raise HTTPException(403, "Нет права: manage_usernames")

    username = data.username.strip().lower()
    if not re.match(r"^[a-z0-9_]{3,30}$", username):
        raise HTTPException(400, "Username: 3-30 символов, только латиница, цифры и _")

    existing = session.exec(
        select(PremiumUsername).where(func.lower(PremiumUsername.username) == username)
    ).first()
    if existing:
        raise HTTPException(400, "Username already in premium list")

    taken = session.exec(
        select(User).where(func.lower(User.username) == username)
    ).first()
    if taken:
        raise HTTPException(400, f"Username @{username} is already taken by user {taken.display_name}")

    reserved_for = data.reserved_for
    if data.is_reserved and reserved_for is not None:
        target = session.get(User, reserved_for)
        if target is None:
            raise HTTPException(400, "Пользователь для резерва не найден")

    item = PremiumUsername(
        username=username,
        price=data.price,
        currency=(data.currency or "USD").upper(),
        category=data.category,
        created_by=user.id,
        is_reserved=data.is_reserved,
        reserved_for=reserved_for,
        reserved_until=data.reserved_until,
        price_history=json.dumps([{
            "price": data.price,
            "date": utcnow().isoformat(),
            "changed_by": user.id,
        }], default=str),
    )
    session.add(item)
    log_action(
        session, user.id, "create_premium_username",
        target_type="premium_username", details={"username": username, "price": data.price},
    )
    session.commit()
    session.refresh(item)
    return _serialize_premium(item)


@router.put("/api/admin/premium-usernames/{username_id}")
def update_premium_username(
    username_id: int,
    data: PremiumUsernameUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Обновить цену/категорию/статус. Право manage_usernames."""
    if not has_permission(user, "manage_usernames", session):
        raise HTTPException(403, "Нет права: manage_usernames")
    item = session.get(PremiumUsername, username_id)
    if not item:
        raise HTTPException(404, "Not found")

    if data.price is not None:
        try:
            history = json.loads(item.price_history or "[]")
        except Exception:
            history = []
        history.append({"price": data.price, "date": utcnow().isoformat(), "changed_by": user.id})
        item.price_history = json.dumps(history, default=str)
        item.price = data.price

    if data.category is not None:
        item.category = data.category
    if data.is_available is not None:
        item.is_available = data.is_available
    if data.is_reserved is not None:
        item.is_reserved = data.is_reserved
        item.reserved_for = data.reserved_for
        item.reserved_until = data.reserved_until

    session.add(item)
    log_action(session, user.id, "update_premium_username",
               target_type="premium_username", details={"username": item.username})
    session.commit()
    return _serialize_premium(item)


@router.delete("/api/admin/premium-usernames/{username_id}")
def delete_premium_username(
    username_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Мягкое удаление (is_active=False). Право manage_usernames."""
    if not has_permission(user, "manage_usernames", session):
        raise HTTPException(403, "Нет права: manage_usernames")
    item = session.get(PremiumUsername, username_id)
    if not item:
        raise HTTPException(404, "Not found")
    item.is_active = False
    session.add(item)
    log_action(session, user.id, "delete_premium_username",
               target_type="premium_username", details={"username": item.username})
    session.commit()
    return {"status": "deleted"}


@router.get("/api/premium-usernames")
def get_premium_usernames(
    limit: int = 50,
    offset: int = 0,
    category: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    session: Session = Depends(get_session),
):
    """Список доступных для покупки юзернеймов (только если магазин включён)."""
    if not _shop_effectively_enabled(session):
        return {"enabled": False, "total": 0, "items": []}

    query = select(PremiumUsername).where(
        PremiumUsername.is_available == True,   # noqa: E712
        PremiumUsername.is_active == True,      # noqa: E712
        PremiumUsername.is_reserved == False,   # noqa: E712
    )
    if category:
        query = query.where(func.lower(PremiumUsername.category) == category.lower())
    if min_price is not None:
        query = query.where(PremiumUsername.price >= min_price)
    if max_price is not None:
        query = query.where(PremiumUsername.price <= max_price)

    total = session.exec(query).all()
    total_count = len(total)
    if limit and limit > 0:
        query = query.limit(limit).offset(offset or 0)
    items = session.exec(query).all()

    return {
        "enabled": True,
        "total": total_count,
        "items": [
            {
                "id": i.id,
                "username": i.username,
                "price": i.price,
                "currency": i.currency,
                "category": i.category,
                "views": i.views_count,
            }
            for i in items
        ],
    }


@router.post("/api/premium-usernames/{username_id}/purchase")
def purchase_premium_username(
    username_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Покупка премиум-юзернейма."""
    if not _shop_effectively_enabled(session):
        raise HTTPException(403, "Магазин выключен")
    item = session.get(PremiumUsername, username_id)
    if not item:
        raise HTTPException(404, "Username not found")
    if not item.is_active or not item.is_available:
        raise HTTPException(400, "Username is not available")
    if item.is_reserved and item.reserved_for and item.reserved_for != user.id:
        raise HTTPException(403, "Этот юзернейм зарезервирован за другим пользователем")

    price = item.price or 0
    currency = item.currency.upper()

    if currency == "CREDITS" and price > 0:
        if user.credits < price:
            raise HTTPException(402, "Недостаточно кредитов")
        user.credits -= price

    # Проверка, что ник не занят
    taken = session.exec(
        select(User).where(func.lower(User.username) == item.username)
    ).first()
    if taken and taken.id != user.id:
        raise HTTPException(400, "Этот юзернейм уже занят")

    old_username = user.username
    user.username = item.username
    session.add(user)
    session.add(NickHistory(
        user_id=user.id,
        field="username",
        old_value=old_username or "",
        new_value=item.username,
        changed_by=user.id,
    ))

    # Фиксируем продажу
    item.is_available = False
    item.purchased_by = user.id
    item.purchased_at = utcnow()
    item.purchase_price = price
    session.add(item)

    # Доход для owner-panel (внешняя валюта фиксируется как оплаченная)
    if currency != "CREDITS" and price > 0:
        session.add(PaymentPurchase(
            user_id=user.id,
            role_id=0,
            payment_role_id=0,
            amount=float(price),
            currency=currency,
            status="success",
            provider="manual",
            meta_json=json.dumps({"type": "premium_username", "username": item.username}, default=str),
        ))

    log_action(session, user.id, "purchase_username",
               details={"username": item.username, "price": price, "currency": currency})
    session.commit()

    return {
        "status": "success",
        "new_username": item.username,
        "old_username": old_username,
    }

