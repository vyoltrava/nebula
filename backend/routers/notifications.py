# app_split/routers/notifications.py
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select, func
from pydantic import BaseModel
from typing import Optional

from database import get_session
from models import User, Message, ChatMember, Notification, Update, UpdateRead, PushSubscription
from dependencies import get_current_user, user_out

router = APIRouter()

# 🔥 Локальное определение модели, чтобы избежать ForwardRef ошибок Pydantic
class PushSubscribeIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.get("/api/counts")
def get_all_counts(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Чаты — один запрос
    chats_unread = session.exec(
        select(func.count(Message.id))
        .join(ChatMember, ChatMember.chat_id == Message.chat_id)
        .where(
            ChatMember.user_id == user.id,
            Message.sender_id != user.id,
            Message.read == False,
        )
    ).one()
    
    # Уведомления — один запрос
    notifications_unread = session.exec(
        select(func.count(Notification.id))
        .where(
            Notification.user_id == user.id,
            Notification.read == False,
        )
    ).one()

    # 🆕 ОБНОВЛЕНИЯ: считаем сколько всего обновлений и сколько юзер прочитал
    total_updates = session.exec(select(func.count()).select_from(Update)).one()
    read_updates = session.exec(
        select(func.count()).select_from(UpdateRead).where(UpdateRead.user_id == user.id)
    ).one()
    # Если прочитанных somehow больше чем всего (например, удалили пост), страховка от минуса
    updates_unread = max(0, total_updates - read_updates) 

    return {
        "chats_unread": chats_unread,
        "notifications_unread": notifications_unread,
        "updates_unread": updates_unread,  # 👈 ДОБАВИЛИ
    }

# ---------- ЗАКЛАДКИ ----------


@router.get("/api/push/vapid")
def get_vapid_public_key():
    from push_service import get_vapid
    return {"public_key": get_vapid()["public_raw"]}


@router.post("/api/push/subscribe")
def push_subscribe(
    data: PushSubscribeIn,  # <-- ИСПРАВЛЕНО
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(PushSubscription).where(PushSubscription.endpoint == data.endpoint)
    ).first()
    if existing:
        existing.user_id = user.id
        existing.p256dh = data.p256dh
        existing.auth = data.auth
        session.add(existing)
    else:
        session.add(PushSubscription(
            user_id=user.id, endpoint=data.endpoint,
            p256dh=data.p256dh, auth=data.auth,
        ))
    session.commit()
    return {"ok": True}


@router.post("/api/push/unsubscribe")
def push_unsubscribe(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    for s in session.exec(
        select(PushSubscription).where(PushSubscription.user_id == user.id)
    ).all():
        session.delete(s)
    session.commit()
    return {"ok": True}


@router.get("/api/push/status")
def push_status(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    count = session.exec(
        select(func.count()).select_from(PushSubscription)
        .where(PushSubscription.user_id == user.id)
    ).one()
    return {"subscribed": count > 0}


@router.get("/api/notifications")
def get_notifications(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    notifs = session.exec(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    ).all()

    if not notifs:
        return []

    actor_ids = list({n.actor_id for n in notifs if n.actor_id})
    actors = {}
    if actor_ids:
        actors = {u.id: u for u in session.exec(
            select(User).where(User.id.in_(actor_ids))
        ).all()}

    # 🚀 Оптимизация N+1: прогреваем кэш ролей одним запросом, чтобы
    # лёгкий сериализатор актора не делал запросов на каждое уведомление.
    role_ids = {u.role_id for u in actors.values() if u.role_id}
    if role_ids:
        _now = time.time()
        for r in session.exec(select(Role).where(Role.id.in_(role_ids))).all():
            _role_cache[r.id] = (_now, r)

    def _actor_light(a: "User") -> dict:
        # Только те поля, что реально нужны фронту (аватар/имя/id) + роль
        # из кэша. Без permissions/badges/level/2FA — они тут не нужны.
        role = get_author_role(a, session)
        return {
            "id": a.id,
            "username": a.username,
            "display_name": a.display_name,
            "avatar_url": a.avatar_url,
            "is_admin": a.is_admin,
            "is_moderator": a.is_moderator,
            "is_banned": a.is_banned,
            "role": role,
        }

    result = []
    for n in notifs:
        actor = actors.get(n.actor_id)
        result.append({
            "id": n.id,
            "type": n.type,
            "actor": _actor_light(actor) if actor else None,
            "post_id": n.post_id,
            "read": n.read,
            "created_at": n.created_at.isoformat(),
        })
    return result


@router.get("/api/notifications/unread-count")
def get_unread_count(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    count = session.exec(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read == False)
    ).one()
    return {"count": count}


@router.post("/api/notifications/{notif_id}/read")
def mark_read(
    notif_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    notif = session.get(Notification, notif_id)
    if notif and notif.user_id == user.id:
        notif.read = True
        session.add(notif)
        session.commit()
    return {"ok": True}


@router.post("/api/notifications/read-all")
def mark_all_notifications_read(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    unread = session.exec(
        select(Notification).where(
            Notification.user_id == user.id,
            Notification.read == False,
        )
    ).all()
    count = 0
    for notif in unread:
        notif.read = True
        session.add(notif)
        count += 1
    session.commit()
    return {"ok": True, "marked": count}
