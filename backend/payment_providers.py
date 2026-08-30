# ============================================================
# 💳 ПЛАТЁЖНЫЕ ПРОВАЙДЕРЫ — модульный слой
#
# Каждый провайдер реализует интерфейс:
#   create_payment(role, purchase, user) -> dict
#       { "url": ..., "clientSecret": ..., "provider_id": ..., "subscription_id": ... }
#
# Провайдеры:
#   - "manual" — тестовый режим / ручное подтверждение админом.
#   - "stripe" — реальная интеграция через REST API (используем requests).
#
# Для добавления нового провайдера:
#   1) добавить ветку в create_payment()
#   2) добавить verify_webhook() для приёма колбэков
# ============================================================

import os
import json
import hmac
import hashlib
import requests

from models import PaymentRole, PaymentPurchase


def _role_dict(role: PaymentRole) -> dict:
    """Описываем плашку для платежного провайдера."""
    try:
        features = json.loads(role.features) if role.features else []
    except Exception:
        features = []
    return {
        "role_id": role.role_id,
        "role_name": role.role_name,
        "price": role.price,
        "currency": role.currency,
        "period": role.period,
        "trial_days": role.trial_days,
        "description": role.description,
        "features": features,
        "is_recurring": role.is_recurring,
    }


def create_manual_payment(role, purchase, user):
    """Manual / тестовый режим. Платёж остаётся pending до подтверждения админом."""
    return {
        "url": None,
        "clientSecret": None,
        "provider_id": None,
        "subscription_id": None,
        "provider": "manual",
    }

def create_stripe_payment(role, purchase, user):
    """Создаёт Stripe Checkout Session (одноразовая или подписка)."""
    secret = os.getenv("STRIPE_SECRET_KEY", "")
    if not secret:
        return {"error": "stripe_not_configured"}

    amount_cents = int(round(role.price * 100))
    currency = role.currency.lower()
    base_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    url = "https://api.stripe.com/v1/checkout/sessions"
    auth = (secret, "")
    data = {
        "mode": "subscription" if role.is_recurring else "payment",
        "client_reference_id": str(purchase.id),
        "metadata[role_id]": str(role.role_id),
        "metadata[purchase_id]": str(purchase.id),
        "success_url": f"{base_url}/settings?purchase={purchase.id}&status=success",
        "cancel_url": f"{base_url}/settings?purchase={purchase.id}&status=cancelled",
    }

    if role.is_recurring:
        price_id = None
        if role.provider_data:
            try:
                pd = json.loads(role.provider_data)
                price_id = pd.get("price_id")
            except Exception:
                price_id = None
        if not price_id:
            interval = "month" if role.period == "monthly" else "year"
            price_id = _create_stripe_price(secret, amount_cents, currency, interval, role)
            if not price_id:
                return {"error": "stripe_price_create_failed"}
        if role.trial_days and role.trial_days > 0:
            data["subscription_data[trial_period_days]"] = str(role.trial_days)
        data["line_items[0][price]"] = price_id
        data["line_items[0][quantity]"] = "1"
    else:
        data["line_items[0][price_data][currency]"] = currency
        data["line_items[0][price_data][unit_amount]"] = str(amount_cents)
        data["line_items[0][price_data][product_data][name]"] = role.role_name
        data["line_items[0][quantity]"] = "1"

    try:
        resp = requests.post(url, auth=auth, data=data, timeout=20)
        if resp.status_code != 200:
            return {"error": f"stripe_http_{resp.status_code}", "detail": resp.text[:300]}
        s = resp.json()
        return {
            "url": s.get("url"),
            "clientSecret": s.get("client_secret"),
            "provider_id": s.get("id"),
            "payment_intent": s.get("payment_intent"),
            "subscription_id": s.get("subscription"),
            "provider": "stripe",
        }
    except Exception:  # noqa: BLE001
        return {"error": "stripe_network", "detail": "network error"}


def _create_stripe_price(secret, amount_cents, currency, interval, role):
    try:
        resp = requests.post(
            "https://api.stripe.com/v1/prices",
            auth=(secret, ""),
            data={
                "currency": currency,
                "unit_amount": str(amount_cents),
                "product_data[name]": role.role_name,
                "recurring[interval]": interval,
            },
            timeout=20,
        )
        if resp.status_code != 200:
            return None
        return resp.json().get("id")
    except Exception:  # noqa: BLE001
        return None


# ============================================================
# ВЕБХУКИ
# ============================================================

def verify_stripe_webhook(payload: bytes, signature: str = None) -> dict | None:
    """Проверяет подпись Stripe и возвращает событие (или None)."""
    wh_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    try:
        if wh_secret and signature:
            parts = dict(item.split("=", 1) for item in signature.split(","))
            ts = parts.get("t", "")
            v1 = parts.get("v1", "")
            signed = f"{ts}.{payload.decode('utf-8')}".encode("utf-8")
            expected = hmac.new(wh_secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, v1):
                return None
        return json.loads(payload.decode("utf-8"))
    except Exception:  # noqa: BLE001
        return None


# ============================================================
# ЕДИНАЯ ТОЧКА ВХОДА — фабрика
# ============================================================

def create_payment(role, purchase, user):
    """Создаёт платёж во внешнем провайдере. Возвращает dict с данными для клиента."""
    provider = (role.payment_provider or "stripe").lower()
    if provider == "manual":
        return create_manual_payment(role, purchase, user)
    if provider == "stripe":
        return create_stripe_payment(role, purchase, user)
    return {"error": f"unknown_provider:{provider}"}
