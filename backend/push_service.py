import os
import json
import base64
import logging
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

log = logging.getLogger("push")
KEYS_FILE = os.path.join(os.path.dirname(__file__), "vapid_keys.json")
_vapid = None


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def get_vapid() -> dict:
    """Генерирует VAPID-ключи один раз и кеширует"""
    global _vapid
    if _vapid:
        return _vapid

    # Из env (для Render — рекомендую зафиксировать ключи там)
    if os.getenv("VAPID_PRIVATE_PEM") and os.getenv("VAPID_PUBLIC_B64"):
        _vapid = {
            "private_pem": os.getenv("VAPID_PRIVATE_PEM"),
            "public_raw": os.getenv("VAPID_PUBLIC_B64"),
        }
        return _vapid

    if os.path.exists(KEYS_FILE):
        with open(KEYS_FILE) as f:
            _vapid = json.load(f)
            return _vapid

    # 🆕 Используем cryptography напрямую вместо py_vapid
    private_key = ec.generate_private_key(ec.SECP256R1())
    
    # Экспортируем приватный ключ в PEM
    priv_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    
    # Получаем публичный ключ в uncompressed формате (65 байт: 0x04 || x || y)
    public_key = private_key.public_key()
    pub_numbers = public_key.public_numbers()
    pub_raw = b"\x04" + pub_numbers.x.to_bytes(32, "big") + pub_numbers.y.to_bytes(32, "big")

    _vapid = {
        "private_pem": priv_pem,
        "public_raw": _b64url(pub_raw),
    }
    with open(KEYS_FILE, "w") as f:
        json.dump(_vapid, f)
    return _vapid


def send_push(user_id: int, title: str, body: str, url: str):
    """Синхронная отправка — вызывать через run_in_threadpool"""
    try:
        from pywebpush import webpush, WebPushException
        from database import engine
        from sqlmodel import Session, select
        from models import PushSubscription

        keys = get_vapid()
        with Session(engine) as session:
            subs = session.exec(
                select(PushSubscription).where(PushSubscription.user_id == user_id)
            ).all()
            dead = []
            for sub in subs:
                try:
                    webpush(
                        subscription_info={
                            "endpoint": sub.endpoint,
                            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                        },
                        data=json.dumps({"title": title, "body": body, "url": url}),
                        vapid_private_key=keys["private_pem"],
                        vapid_claims={"sub": "mailto:admin@trelod.app"},
                        timeout=10,
                    )
                except WebPushException as e:
                    status = getattr(getattr(e, "response", None), "status_code", None)
                    if status in (404, 410):
                        dead.append(sub)
                except Exception as e:
                    log.warning(f"push failed sub={sub.id}: {e}")
            for d in dead:
                session.delete(d)
            if dead:
                session.commit()
    except Exception as e:
        log.error(f"send_push error: {e}")