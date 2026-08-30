# ============================================================
# 💳 ПЛАТЁЖНЫЙ СЛОЙ — модульная продажа ЛЮБЫХ ролей/плашек
#
#   Админ включает "режим оплаты" для любой роли (toggle) →
#   пользователь покупает → webhook → роль присваивается авто.
#
# Провайдеры: manual (тест), stripe (REST). Добавление нового —
# в payment_providers.create_payment() + verify_webhook.
# ============================================================

import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import (
    User, Role, Notification, SystemSetting,
    PaymentRole, PaymentPurchase,
)
from main import get_current_user, require_admin
from payment_providers import create_payment, verify_stripe_webhook

router = APIRouter(prefix="/payments", tags=["payments"])

SETTING_KEY = "payment_system_enabled"
PERIOD_DAYS = {"monthly": 30, "yearly": 365}


def utcnow():
    return datetime.now(timezone.utc)


def _get_setting(session: Session, key: str, default: str) -> str:
    row = session.get(SystemSetting, key)
    return row.value if row else default


def _set_setting(session: Session, key: str, value: str):
    row = session.get(SystemSetting, key)
    if row:
        row.value = value
        row.updated_at = utcnow()
    else:
        session.add(SystemSetting(key=key, value=value, updated_at=utcnow()))
    session.commit()


def _features(role: PaymentRole) -> list:
    try:
        return json.loads(role.features) if role.features else []
    except Exception:  # noqa: BLE001
        return []


def _has_active_purchase(session: Session, user: User, role_id: int) -> bool:
    """Есть ли у пользователя активная (неистёкшая) покупка этой роли."""
    if user.role_id == role_id:
        return True
    purchases = session.exec(
        select(PaymentPurchase)
        .where(PaymentPurchase.user_id == user.id)
        .where(PaymentPurchase.role_id == role_id)
        .where(PaymentPurchase.status == "success")
    ).all()
    now = utcnow()
    return any(p.expires_at is None or p.expires_at > now for p in purchases)


def _assign_role(session: Session, purchase: PaymentPurchase):
    """Присваивает роль пользователю (предыдущая сохраняется в metadata)."""
    user = session.get(User, purchase.user_id)
    if not user:
        return
    try:
        meta = json.loads(purchase.meta_json) if purchase.meta_json else {}
    except Exception:  # noqa: BLE001
        meta = {}
    if "previous_role_id" not in meta:
        meta["previous_role_id"] = user.role_id
        purchase.meta_json = json.dumps(meta)
        session.add(purchase)
    user.role_id = purchase.role_id
    session.add(user)
    session.add(Notification(
        user_id=user.id, actor_id=user.id, type="payment_success",
    ))
    session.commit()


def _revoke_role(session: Session, purchase: PaymentPurchase):
    """Забирает роль (возврат/истечение), откатывая на предыдущую."""
    user = session.get(User, purchase.user_id)
    if not user or user.role_id != purchase.role_id:
        return
    prev = None
    try:
        prev = (json.loads(purchase.meta_json) or {}).get("previous_role_id")
    except Exception:  # noqa: BLE001
        prev = None
    user.role_id = prev if isinstance(prev, int) else None
    session.add(user)
    session.commit()


def _role_out(r: PaymentRole) -> dict:
    return {
        "id": r.id,
        "roleId": r.role_id,
        "roleName": r.role_name,
        "isActive": r.is_active,
        "price": r.price,
        "currency": r.currency,
        "period": r.period,
        "trialDays": r.trial_days,
        "description": r.description,
        "features": _features(r),
        "isRecurring": r.is_recurring,
        "paymentProvider": r.payment_provider,
    }

# ------------------------------------------------------------------
# 🌐 Системный статус (публичный / админский toggle)
# ------------------------------------------------------------------

@router.get("/system/status")
def system_status(session: Session = Depends(get_session)):
    enabled = _get_setting(session, SETTING_KEY, "true") == "true"
    return {"isEnabled": enabled,
            "message": None if enabled else "Платежная система временно отключена"}


@router.post("/system/status")
def set_system_status(data: dict, admin: User = Depends(require_admin),
                      session: Session = Depends(get_session)):
    enabled = bool(data.get("isEnabled", True))
    _set_setting(session, SETTING_KEY, "true" if enabled else "false")
    return {"success": True, "isEnabled": enabled}


# ------------------------------------------------------------------
# 🛠 АДМИНКА — управление платежными ролями
# ------------------------------------------------------------------

@router.get("/roles")
def list_payment_roles(admin: User = Depends(require_admin),
                       session: Session = Depends(get_session)):
    """Только роли с флагом show_in_payments (как is_staff → правила)."""
    flagged_ids = set(
        r.id for r in session.exec(
            select(Role).where(Role.show_in_payments == True)  # noqa: E712
        ).all()
    )
    rows = [r for r in session.exec(select(PaymentRole)).all() if r.role_id in flagged_ids]
    return [_role_out(r) for r in rows]


@router.post("/roles/toggle")
def toggle_payment_role(data: dict, admin: User = Depends(require_admin),
                        session: Session = Depends(get_session)):
    role_id = int(data["roleId"])
    is_active = bool(data.get("isActive", True))
    role = session.exec(
        select(PaymentRole).where(PaymentRole.role_id == role_id)
    ).first()
    if not role:
        sys_role = session.get(Role, role_id)
        if not sys_role:
            raise HTTPException(404, "Role not found")
        role = PaymentRole(role_id=role_id, role_name=sys_role.name, is_active=is_active)
        session.add(role)
    else:
        role.is_active = is_active
        role.updated_at = utcnow()
        session.add(role)
    session.commit()
    return {"success": True, "isActive": is_active}


class PaymentRoleSave(BaseModel):
    roleId: int
    price: float
    currency: str = "USD"
    period: str = "once"             # once | monthly | yearly
    trialDays: int = 0
    description: Optional[str] = None
    features: list = []
    isRecurring: bool = False
    paymentProvider: str = "stripe"  # stripe | manual


@router.post("/roles/save")
def save_payment_role(data: PaymentRoleSave, admin: User = Depends(require_admin),
                      session: Session = Depends(get_session)):
    if not (0.01 <= data.price <= 100000):
        raise HTTPException(400, "Price out of allowed range")
    if data.period not in ("once", "monthly", "yearly"):
        raise HTTPException(400, "Invalid period")
    if len(data.features) > 20:
        raise HTTPException(400, "Too many features")
    sys_role = session.get(Role, data.roleId)
    if not sys_role:
        raise HTTPException(404, "Role not found")

    role = session.exec(
        select(PaymentRole).where(PaymentRole.role_id == data.roleId)
    ).first()
    if not role:
        role = PaymentRole(role_id=data.roleId, role_name=sys_role.name)
    role.role_name = sys_role.name
    role.is_active = True
    role.price = data.price
    role.currency = data.currency
    role.period = data.period
    role.trial_days = max(0, data.trialDays)
    role.description = data.description
    role.features = json.dumps(data.features)
    role.is_recurring = data.isRecurring or data.period != "once"
    role.payment_provider = data.paymentProvider
    role.updated_at = utcnow()
    session.add(role)
    session.commit()
    return {"success": True}

# ------------------------------------------------------------------
# 👤 ПОЛЬЗОВАТЕЛЬСКИЕ эндпоинты
# ------------------------------------------------------------------

@router.get("/available")
def available_roles(current: User = Depends(get_current_user),
                    session: Session = Depends(get_session)):
    """Активные плашки, которые пользователь ещё не имеет."""
    enabled = _get_setting(session, SETTING_KEY, "true") == "true"
    if not enabled:
        return {"isEnabled": False, "roles": []}
    rows = session.exec(
        select(PaymentRole).where(PaymentRole.is_active == True)  # noqa: E712
    ).all()
    out = []
    for r in rows:
        if not session.get(Role, r.role_id):
            continue
        if _has_active_purchase(session, current, r.role_id):
            continue
        out.append(_role_out(r))
    return {"isEnabled": True, "roles": out}


@router.get("/my")
def my_purchases(current: User = Depends(get_current_user),
                 session: Session = Depends(get_session)):
    rows = session.exec(
        select(PaymentPurchase)
        .where(PaymentPurchase.user_id == current.id)
    ).all()
    rows = sorted(rows, key=lambda p: p.created_at or utcnow(), reverse=True)
    return [{
        "id": p.id, "roleId": p.role_id, "amount": p.amount,
        "currency": p.currency, "status": p.status, "provider": p.provider,
        "expiresAt": p.expires_at.isoformat() if p.expires_at else None,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
    } for p in rows[:50]]


@router.post("/create")
def create_payment_endpoint(data: dict, current: User = Depends(get_current_user),
                            session: Session = Depends(get_session)):
    if _get_setting(session, SETTING_KEY, "true") != "true":
        raise HTTPException(403, "Платежная система временно отключена")
    try:
        role_id = int(data.get("roleId", 0))
    except (TypeError, ValueError):
        raise HTTPException(400, "Invalid roleId")
    role = session.exec(
        select(PaymentRole)
        .where(PaymentRole.role_id == role_id)
        .where(PaymentRole.is_active == True)  # noqa: E712
    ).first()
    if not role:
        raise HTTPException(404, "Payment not available")
    if _has_active_purchase(session, current, role_id):
        raise HTTPException(409, "У вас уже есть эта плашка")

    purchase = PaymentPurchase(
        user_id=current.id, role_id=role_id, payment_role_id=role.id,
        amount=role.price, currency=role.currency,
        status="pending", provider=role.payment_provider,
    )
    session.add(purchase)
    session.commit()
    session.refresh(purchase)

    try:
        result = create_payment(role, purchase, current)
    except Exception as e:  # noqa: BLE001
        purchase.status = "failed"
        purchase.meta_json = json.dumps({"error": str(e)[:300]})
        session.add(purchase)
        session.commit()
        raise HTTPException(502, f"Payment provider error: {e}")

    if result.get("error"):
        purchase.status = "failed"
        session.add(purchase)
        session.commit()
        raise HTTPException(400, result["error"])

    if result.get("provider_id"):
        purchase.provider_id = str(result["provider_id"])
        session.add(purchase)
        session.commit()
    return {"purchaseId": purchase.id, **result}

# ------------------------------------------------------------------
# 🔔 WEBHOOKS
# ------------------------------------------------------------------

def _period_of(session: Session, purchase: PaymentPurchase) -> Optional[int]:
    pr = session.get(PaymentRole, purchase.payment_role_id)
    return PERIOD_DAYS.get(pr.period) if pr else None


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request, session: Session = Depends(get_session)):
    payload = await request.body()
    event = verify_stripe_webhook(payload, request.headers.get("stripe-signature"))
    if not event:
        raise HTTPException(400, "Invalid signature")

    etype = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}
    md = obj.get("metadata") or {}
    try:
        purchase_id = int(md.get("purchase_id", 0))
    except (TypeError, ValueError):
        purchase_id = 0

    if etype in ("checkout.session.completed", "payment_intent.succeeded"):
        purchase = session.get(PaymentPurchase, purchase_id)
        if purchase and purchase.status == "pending":
            purchase.status = "success"
            purchase.provider_id = str(obj.get("payment_intent") or obj.get("id"))
            days = _period_of(session, purchase)
            purchase.expires_at = (utcnow() + timedelta(days=days)) if days else None
            session.add(purchase)
            session.commit()
            _assign_role(session, purchase)
    elif etype in ("invoice.payment_failed", "customer.subscription.deleted"):
        purchase = session.get(PaymentPurchase, purchase_id)
        if purchase and purchase.status == "success":
            purchase.status = "expired"
            session.add(purchase)
            session.commit()
            _revoke_role(session, purchase)
    return {"status": "ok"}


# ------------------------------------------------------------------
# 🛠 АДМИН — ручное подтверждение / возврат / статистика
# ------------------------------------------------------------------

@router.post("/manual-confirm/{purchase_id}")
def manual_confirm(purchase_id: int, admin: User = Depends(require_admin),
                   session: Session = Depends(get_session)):
    """Подтверждение 'manual'-платежа или ручное одобрение."""
    purchase = session.get(PaymentPurchase, purchase_id)
    if not purchase:
        raise HTTPException(404, "Purchase not found")
    if purchase.status == "success":
        return {"success": True, "already": True}
    purchase.status = "success"
    purchase.provider_id = f"manual:{admin.username}"
    days = _period_of(session, purchase)
    purchase.expires_at = (utcnow() + timedelta(days=days)) if days else None
    session.add(purchase)
    session.commit()
    _assign_role(session, purchase)
    return {"success": True}


@router.post("/refund/{purchase_id}")
def refund(purchase_id: int, admin: User = Depends(require_admin),
           session: Session = Depends(get_session)):
    purchase = session.get(PaymentPurchase, purchase_id)
    if not purchase:
        raise HTTPException(404, "Purchase not found")
    if purchase.status != "success":
        raise HTTPException(400, "Only successful purchases can be refunded")
    purchase.status = "refunded"
    session.add(purchase)
    session.commit()
    _revoke_role(session, purchase)
    return {"success": True}


@router.get("/stats")
def stats(admin: User = Depends(require_admin), session: Session = Depends(get_session)):
    all_p = session.exec(select(PaymentPurchase)).all()
    success = [p for p in all_p if p.status == "success"]
    now = utcnow()
    return {
        "totalRevenue": round(sum(p.amount for p in success if p.currency == "USD"), 2),
        "totalPurchases": len(success),
        "totalBuyers": len({p.user_id for p in success}),
        "activeSubscriptions": sum(1 for p in success if p.expires_at and p.expires_at > now),
        "recent": [{
            "id": p.id, "userId": p.user_id, "roleId": p.role_id,
            "amount": p.amount, "currency": p.currency,
            "status": p.status, "provider": p.provider,
            "createdAt": p.created_at.isoformat() if p.created_at else None,
        } for p in sorted(all_p, key=lambda x: x.created_at or utcnow(), reverse=True)[:20]],
    }



