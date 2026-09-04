# ============================================================
# 📢 КАНАЛЫ (CHANNELS) — полностью изолированная система вещания.
#
#    Свои таблицы, свои роуты (/api/channels/...), свои WS-события
#    (channel_*). НЕ модифицирует схему Chat / ChatMember / Message.
#    Единственное осознанное использование существующих таблиц —
#    пересылка постов во «внешние» чаты (создание строки Message в
#    целевом чате) и чтение членства для проверки доступа.
# ============================================================

import asyncio
import json
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel
from sqlmodel import Session, select, func

from database import get_session
from models import (
    User, SystemSetting, Report,
    Channel, ChannelSubscriber, ChannelPost, ChannelPostView,
    ChannelComment, ChannelInvite, ChannelInviteRequest,
)
from main import get_current_user, log_action, get_client_ip
from websocket_manager import manager

router = APIRouter(tags=["channels"])


def utcnow():
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------
# 🔗 Валидация custom_slug (vanity URL)
# ------------------------------------------------------------------
SLUG_RE = re.compile(r"^[a-z0-9_]{5,32}$")
RESERVED_SLUGS = {
    "admin", "api", "nebula", "support", "help", "login", "register",
    "settings", "profile", "posts", "comments", "invites", "requests",
    "subscribe", "join", "create", "new", "search", "about", "terms",
    "my", "by-slug", "feed",
}


def validate_slug(raw: str) -> str:
    """Регистронезависимый slug: латиница, цифры, '_', длина 5-32."""
    slug = (raw or "").strip().lstrip("@").lower()
    if not SLUG_RE.match(slug):
        raise HTTPException(
            400,
            "Ссылка: только латиница, цифры и '_', длина 5-32 символов",
        )
    if slug in RESERVED_SLUGS:
        raise HTTPException(400, "Эта ссылка зарезервирована")
    return slug


def slug_taken(session: Session, slug: str, exclude_channel_id: int = None) -> bool:
    q = select(Channel).where(Channel.custom_slug == slug)
    if exclude_channel_id:
        q = q.where(Channel.id != exclude_channel_id)
    return session.exec(q).first() is not None


# ------------------------------------------------------------------
# 🧩 Сериализаторы и хелперы
# ------------------------------------------------------------------
def channel_settings(channel: Channel) -> dict:
    try:
        s = json.loads(channel.settings or "{}")
        return s if isinstance(s, dict) else {}
    except Exception:
        return {}


def channel_out(channel: Channel, session: Session, viewer: Optional[User] = None) -> dict:
    subs_count = session.exec(
        select(func.count(ChannelSubscriber.id)).where(ChannelSubscriber.channel_id == channel.id)
    ).one()
    my_role = None
    muted = False
    unread = 0
    if viewer:
        sub = get_subscription(session, channel.id, viewer.id)
        if sub:
            my_role = sub.role
            muted = sub.muted_until is not None and sub.muted_until > utcnow()
            if sub.last_seen_post_at:
                unread = session.exec(
                    select(func.count(ChannelPost.id)).where(
                        ChannelPost.channel_id == channel.id,
                        ChannelPost.is_published == True,  # noqa: E712
                        ChannelPost.created_at > sub.last_seen_post_at,
                    )
                ).one()
    owner = session.get(User, channel.owner_id)
    return {
        "id": channel.id,
        "title": channel.title,
        "description": channel.description,
        "avatar_url": channel.avatar_url,
        "custom_slug": channel.custom_slug,
        "is_public": channel.is_public,
        "settings": {
            "show_author_signature": bool(channel_settings(channel).get("show_author_signature", True)),
            "silent_messages_by_default": bool(channel_settings(channel).get("silent_messages_by_default", False)),
        },
        "comments_enabled": channel.comments_enabled,
        "owner": {
            "id": owner.id, "username": owner.username,
            "display_name": owner.display_name, "avatar_url": owner.avatar_url,
        } if owner else None,
        "subscribers_count": subs_count,
        "created_at": channel.created_at.isoformat() if channel.created_at else None,
        "my_role": my_role,
        "is_muted": muted,
        "unread_count": unread,
        "is_channel": True,
    }


def post_media(media_json: str) -> list:
    try:
        arr = json.loads(media_json or "[]")
        return arr if isinstance(arr, list) else []
    except Exception:
        return []


def post_out(post: ChannelPost, session: Session, with_author: bool = True) -> dict:
    author = session.get(User, post.author_id) if with_author else None
    comments_count = session.exec(
        select(func.count(ChannelComment.id)).where(ChannelComment.post_id == post.id)
    ).one()
    return {
        "id": post.id,
        "channel_id": post.channel_id,
        "author_id": post.author_id,
        "author": {
            "id": author.id, "username": author.username,
            "display_name": author.display_name, "avatar_url": author.avatar_url,
        } if author else None,
        "text": post.text,
        "media": post_media(post.media),
        "is_silent": post.is_silent,
        "is_pinned": post.is_pinned,
        "views_count": post.views_count,
        "comments_count": comments_count,
        "scheduled_at": post.scheduled_at.isoformat() if post.scheduled_at else None,
        "is_published": post.is_published,
        "created_at": post.created_at.isoformat() if post.created_at else None,
        "edited_at": post.edited_at.isoformat() if post.edited_at else None,
    }


def get_channel_or_404(session: Session, channel_id: int) -> Channel:
    ch = session.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Канал не найден")
    return ch


def get_subscription(session: Session, channel_id: int, user_id: int) -> Optional[ChannelSubscriber]:
    return session.exec(
        select(ChannelSubscriber).where(
            ChannelSubscriber.channel_id == channel_id,
            ChannelSubscriber.user_id == user_id,
        )
    ).first()


def require_admin(session: Session, channel: Channel, user: User) -> ChannelSubscriber:
    """owner/admin, иначе 403."""
    sub = get_subscription(session, channel.id, user.id)
    if not sub or sub.role not in ("owner", "admin"):
        raise HTTPException(403, "Недостаточно прав")
    return sub


def require_owner(session: Session, channel: Channel, user: User) -> ChannelSubscriber:
    sub = get_subscription(session, channel.id, user.id)
    if not sub or sub.role != "owner":
        raise HTTPException(403, "Только владелец канала")
    return sub


async def notify_subscribers(session: Session, channel_id: int, event: str, data: dict,
                             exclude_user_id: int = None):
    """WS-пуш всем подписчикам канала (channel_* события, изолированный префикс)."""
    subs = session.exec(
        select(ChannelSubscriber).where(ChannelSubscriber.channel_id == channel_id)
    ).all()
    ids = [s.user_id for s in subs if s.user_id != exclude_user_id]
    if ids:
        await manager.broadcast_to_users(ids, event, data)


# ------------------------------------------------------------------
# 📋 Pydantic-схемы
# ------------------------------------------------------------------
class ChannelCreateIn(BaseModel):
    title: str
    description: Optional[str] = None
    custom_slug: str
    is_public: bool = True
    avatar_url: Optional[str] = None


class ChannelUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    is_public: Optional[bool] = None
    custom_slug: Optional[str] = None


class ChannelSettingsIn(BaseModel):
    show_author_signature: Optional[bool] = None
    silent_messages_by_default: Optional[bool] = None
    comments_enabled: Optional[bool] = None


class PostCreateIn(BaseModel):
    text: Optional[str] = None
    media: Optional[list] = None
    is_silent: Optional[bool] = None
    scheduled_at: Optional[str] = None  # ISO datetime
    # ✅ Пересылка сообщения из чата в канал (создать пост на основе Message)
    forwarded_from_chat: Optional[int] = None  # message_id исходного сообщения


class ForwardPostIn(BaseModel):
    # Куда переслать пост канала: "chat" (обычный чат) | "channel" (другой канал)
    target_type: str
    target_id: int


class PostUpdateIn(BaseModel):
    text: Optional[str] = None
    media: Optional[list] = None


# ------------------------------------------------------------------
# 🛠 Управление каналом
# ------------------------------------------------------------------
@router.patch("/channels/{channel_id}")
async def update_channel(
    channel_id: int,
    data: ChannelUpdateIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    require_admin(session, ch, user)

    if data.title is not None:
        title = data.title.strip()
        if not title:
            raise HTTPException(400, "Название не может быть пустым")
        ch.title = title[:100]
    if data.description is not None:
        ch.description = data.description.strip()[:500] or None
    if data.avatar_url is not None:
        ch.avatar_url = data.avatar_url or None
    if data.is_public is not None:
        ch.is_public = data.is_public
    if data.custom_slug is not None:
        slug = validate_slug(data.custom_slug)
        if slug_taken(session, slug, exclude_channel_id=ch.id):
            raise HTTPException(409, "Ссылка уже занята")
        ch.custom_slug = slug

    session.add(ch)
    session.commit()
    session.refresh(ch)

    await notify_subscribers(session, ch.id, "channel_updated", {"channel_id": ch.id})
    return {"ok": True, "channel": channel_out(ch, session, user)}


@router.patch("/channels/{channel_id}/settings")
async def update_channel_settings(
    channel_id: int,
    data: ChannelSettingsIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    require_admin(session, ch, user)

    s = channel_settings(ch)
    if data.show_author_signature is not None:
        s["show_author_signature"] = data.show_author_signature
    if data.silent_messages_by_default is not None:
        s["silent_messages_by_default"] = data.silent_messages_by_default
    ch.settings = json.dumps(s)
    if data.comments_enabled is not None:
        ch.comments_enabled = data.comments_enabled

    session.add(ch)
    session.commit()
    return {"ok": True, "channel": channel_out(ch, session, user)}


@router.delete("/channels/{channel_id}")
async def delete_channel(
    channel_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    require_owner(session, ch, user)

    # Каскадное удаление всех данных канала
    for post in session.exec(select(ChannelPost).where(ChannelPost.channel_id == ch.id)).all():
        for c in session.exec(select(ChannelComment).where(ChannelComment.post_id == post.id)).all():
            session.delete(c)
        for v in session.exec(select(ChannelPostView).where(ChannelPostView.post_id == post.id)).all():
            session.delete(v)
        session.delete(post)
    for r in session.exec(select(ChannelInviteRequest).where(ChannelInviteRequest.channel_id == ch.id)).all():
        session.delete(r)
    for i in session.exec(select(ChannelInvite).where(ChannelInvite.channel_id == ch.id)).all():
        session.delete(i)
    for s in session.exec(select(ChannelSubscriber).where(ChannelSubscriber.channel_id == ch.id)).all():
        session.delete(s)
    session.delete(ch)
    session.commit()

    log_action(session, user.id, "channel_delete", target_type="channel", target_id=channel_id)
    await notify_subscribers(session, ch.id, "channel_deleted", {"channel_id": ch.id})
    return {"ok": True}


# ------------------------------------------------------------------
# 👥 Подписчики
# ------------------------------------------------------------------
@router.get("/channels/{channel_id}/subscribers")
def list_subscribers(
    channel_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    subs = session.exec(
        select(ChannelSubscriber).where(ChannelSubscriber.channel_id == ch.id)
    ).all()
    users = {u.id: u for u in session.exec(
        select(User).where(User.id.in_([s.user_id for s in subs] or [0]))
    ).all()}
    return [
        {
            "user": {
                "id": users[s.user_id].id, "username": users[s.user_id].username,
                "display_name": users[s.user_id].display_name,
                "avatar_url": users[s.user_id].avatar_url,
            },
            "role": s.role,
            "joined_at": s.joined_at.isoformat() if s.joined_at else None,
        }
        for s in subs if s.user_id in users
    ]


@router.patch("/channels/{channel_id}/mute")
async def mute_channel(
    channel_id: int,
    forever: bool = False,
    hours: Optional[int] = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    sub = get_subscription(session, ch.id, user.id)
    if not sub:
        raise HTTPException(403, "Вы не подписаны на канал")
    if forever:
        sub.muted_until = datetime(9999, 1, 1, tzinfo=timezone.utc)
    elif hours:
        sub.muted_until = utcnow() + timedelta(hours=hours)
    else:
        sub.muted_until = None  # unmute
    session.add(sub)
    session.commit()
    return {"ok": True, "is_muted": sub.muted_until is not None and sub.muted_until > utcnow()}


@router.patch("/channels/{channel_id}/subscribers/{user_id}")
async def update_subscriber(
    channel_id: int,
    user_id: int,
    role: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    if role not in ("admin", "subscriber"):
        raise HTTPException(400, "role: admin | subscriber")
    require_owner(session, ch, user)

    target = get_subscription(session, ch.id, user_id)
    if not target:
        raise HTTPException(404, "Подписчик не найден")
    if target.role == "owner":
        raise HTTPException(400, "Нельзя менять роль владельца")
    target.role = role
    session.add(target)
    session.commit()

    await manager.send_to_user(user_id, "channel_role_changed",
                               {"channel_id": ch.id, "role": role})
    return {"ok": True}


@router.delete("/channels/{channel_id}/subscribers/{user_id}")
async def kick_subscriber(
    channel_id: int,
    user_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    require_admin(session, ch, user)
    target = get_subscription(session, ch.id, user_id)
    if not target:
        raise HTTPException(404, "Подписчик не найден")
    if target.role == "owner":
        raise HTTPException(400, "Нельзя исключить владельца")
    session.delete(target)
    session.commit()

    await manager.send_to_user(user_id, "channel_subscriber_left", {"channel_id": ch.id})
    await notify_subscribers(session, ch.id, "channel_subscriber_left",
                             {"channel_id": ch.id, "user_id": user_id})
    return {"ok": True}


# ------------------------------------------------------------------
# 📝 Посты
# ------------------------------------------------------------------
async def _broadcast_new_post(session: Session, ch: Channel, post: ChannelPost):
    """Пуш подписчикам (channel_new_post), если не тихий пост."""
    payload = {
        "channel_id": ch.id,
        "custom_slug": ch.custom_slug,
        "post": post_out(post, session),
    }
    if post.is_silent:
        await notify_subscribers(session, ch.id, "channel_new_post_silent", payload)
    else:
        await notify_subscribers(session, ch.id, "channel_new_post", payload)


@router.post("/channels/{channel_id}/posts")
async def create_post(
    channel_id: int,
    data: PostCreateIn,
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    require_admin(session, ch, user)
    if is_channel_blocked(session, ch.id):
        raise HTTPException(403, "🔒 Канал заблокирован модерацией")

    if not (data.text or "").strip() and not data.media and not data.forwarded_from_chat:
        raise HTTPException(400, "Пост не может быть пустым")

    scheduled_at = None
    is_published = True
    if data.scheduled_at:
        try:
            scheduled_at = datetime.fromisoformat(data.scheduled_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(400, "Неверный формат даты")
        if scheduled_at.tzinfo is None:
            scheduled_at = scheduled_at.replace(tzinfo=timezone.utc)
        if scheduled_at > utcnow():
            is_published = False

    settings = channel_settings(ch)
    is_silent = data.is_silent if data.is_silent is not None \
        else bool(settings.get("silent_messages_by_default", False))

    # ✅ Пересылка из чата в канал: берём текст/медиа из исходного Message
    media = data.media or []
    text = (data.text or "").strip()[:8000]
    if data.forwarded_from_chat:
        from models import Chat, ChatMember, Message  # read + helper
        msg = session.get(Message, data.forwarded_from_chat)
        if not msg:
            raise HTTPException(404, "Сообщение не найдено")
        src_chat = session.get(Chat, msg.chat_id)
        if src_chat and src_chat.is_secret:
            raise HTTPException(403, "Нельзя пересылать из секретных чатов")
        # Доступ к исходному чату
        smember = session.exec(
            select(ChatMember).where(
                ChatMember.chat_id == msg.chat_id,
                ChatMember.user_id == user.id,
            )
        ).first()
        if not smember:
            raise HTTPException(403, "Нет доступа к исходному сообщению")
        src_name = src_chat.name if src_chat and src_chat.is_group else (
            "Чат" if not src_chat else "Личный чат")
        note = f"🔄 Переслано из чата «{src_name}»"
        text = f"{note}\n\n{msg.text}" if msg.text else note
        if not media and msg.media_url:
            media = [{"type": msg.media_type or "image", "url": msg.media_url}]

    post = ChannelPost(
        channel_id=ch.id,
        author_id=user.id,
        text=text or None,
        media=json.dumps(media),
        is_silent=is_silent,
        scheduled_at=scheduled_at,
        is_published=is_published,
    )
    session.add(post)
    session.commit()
    session.refresh(post)

    log_action(session, user.id, "channel_post_create",
               target_type="channel_post", target_id=post.id,
               ip_address=get_client_ip(request))

    if is_published:
        await _broadcast_new_post(session, ch, post)
    return {"ok": True, "post": post_out(post, session)}


@router.get("/channels/{channel_id}/posts")
def list_posts(
    channel_id: int,
    offset: int = 0,
    limit: int = 30,
    include_scheduled: bool = False,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    sub = get_subscription(session, ch.id, user.id)
    if not ch.is_public and not sub:
        raise HTTPException(403, "Это приватный канал")

    limit = max(1, min(limit, 50))
    is_admin = sub is not None and sub.role in ("owner", "admin")

    q = select(ChannelPost).where(ChannelPost.channel_id == ch.id)
    if not (is_admin and include_scheduled):
        q = q.where(ChannelPost.is_published == True)  # noqa: E712
    q = q.order_by(ChannelPost.is_pinned.desc(), ChannelPost.created_at.desc())
    posts = session.exec(q.offset(offset).limit(limit)).all()

    # 👁 Счётчик просмотров увеличивается при fetch ленты (с дедупликацией)
    now = utcnow()
    for p in posts:
        already = session.exec(
            select(ChannelPostView).where(
                ChannelPostView.post_id == p.id,
                ChannelPostView.user_id == user.id,
            )
        ).first()
        if not already:
            session.add(ChannelPostView(post_id=p.id, user_id=user.id))
            p.views_count += 1
    session.commit()

    # Обновляем last_seen (бейдж непрочитанных)
    if sub:
        sub.last_seen_post_at = now
        session.add(sub)
        session.commit()

    return [post_out(p, session) for p in posts]


@router.patch("/channels/{channel_id}/posts/{post_id}")
async def update_post(
    channel_id: int,
    post_id: int,
    data: PostUpdateIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    require_admin(session, ch, user)
    post = session.get(ChannelPost, post_id)
    if not post or post.channel_id != ch.id:
        raise HTTPException(404, "Пост не найден")

    if data.text is not None:
        post.text = data.text.strip()[:8000] or None
    if data.media is not None:
        post.media = json.dumps(data.media)
    post.edited_at = utcnow()
    session.add(post)
    session.commit()
    session.refresh(post)

    await notify_subscribers(session, ch.id, "channel_post_edited",
                             {"channel_id": ch.id, "post": post_out(post, session)})
    return {"ok": True, "post": post_out(post, session)}


@router.delete("/channels/{channel_id}/posts/{post_id}")
async def delete_post(
    channel_id: int,
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    require_admin(session, ch, user)
    post = session.get(ChannelPost, post_id)
    if not post or post.channel_id != ch.id:
        raise HTTPException(404, "Пост не найден")

    for c in session.exec(select(ChannelComment).where(ChannelComment.post_id == post.id)).all():
        session.delete(c)
    for v in session.exec(select(ChannelPostView).where(ChannelPostView.post_id == post.id)).all():
        session.delete(v)
    session.delete(post)
    session.commit()

    await notify_subscribers(session, ch.id, "channel_post_deleted",
                             {"channel_id": ch.id, "post_id": post_id})
    return {"ok": True}


@router.post("/channels/{channel_id}/posts/{post_id}/pin")
async def toggle_pin_post(
    channel_id: int,
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    require_admin(session, ch, user)
    post = session.get(ChannelPost, post_id)
    if not post or post.channel_id != ch.id:
        raise HTTPException(404, "Пост не найден")

    post.is_pinned = not post.is_pinned
    post.pinned_at = utcnow() if post.is_pinned else None
    session.add(post)
    session.commit()

    await notify_subscribers(session, ch.id, "channel_post_pinned",
                             {"channel_id": ch.id, "post_id": post.id,
                              "is_pinned": post.is_pinned})
    return {"ok": True, "is_pinned": post.is_pinned}


@router.post("/channels/{channel_id}/posts/{post_id}/view")
def register_view(
    channel_id: int,
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Статистика просмотров с дедупликацией по user_id."""
    ch = get_channel_or_404(session, channel_id)
    post = session.get(ChannelPost, post_id)
    if not post or post.channel_id != ch.id:
        raise HTTPException(404, "Пост не найден")

    already = session.exec(
        select(ChannelPostView).where(
            ChannelPostView.post_id == post.id,
            ChannelPostView.user_id == user.id,
        )
    ).first()
    if not already:
        session.add(ChannelPostView(post_id=post.id, user_id=user.id))
        post.views_count += 1
        session.add(post)
        session.commit()
    return {"ok": True, "views_count": post.views_count}


# ------------------------------------------------------------------
# 🔁 Пересылка постов каналов
#   • пост канала → обычный чат (Message)  : target_type="chat"
#   • пост канала → другой канал (ChannelPost) : target_type="channel"
# ------------------------------------------------------------------
@router.post("/channels/{channel_id}/posts/{post_id}/forward")
async def forward_channel_post(
    channel_id: int,
    post_id: int,
    data: ForwardPostIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    post = session.get(ChannelPost, post_id)
    if not post or post.channel_id != ch.id:
        raise HTTPException(404, "Пост не найден")
    # Доступ к источнику: подписчик (или публичный канал)
    sub = get_subscription(session, ch.id, user.id)
    if not ch.is_public and not sub:
        raise HTTPException(403, "Нет доступа к посту канала")

    media = post_media(post.media)

    if data.target_type == "chat":
        from models import Chat, ChatMember, Message, Notification
        target = session.get(Chat, data.target_id)
        if not target:
            raise HTTPException(404, "Целевой чат не найден")
        tmember = session.exec(
            select(ChatMember).where(
                ChatMember.chat_id == target.id,
                ChatMember.user_id == user.id,
            )
        ).first()
        if not tmember:
            raise HTTPException(403, "Нет доступа к целевому чату")
        if target.is_secret:
            raise HTTPException(403, "Нельзя пересылать в секретные чаты")
        # Не создаём в «Избранном/секретных» — только обычные чаты/группы
        first = media[0] if media else None
        new_msg = Message(
            chat_id=target.id,
            sender_id=user.id,
            text=post.text,
            ciphertext=None,
            media_url=first["url"] if first else None,
            media_type=first["type"] if first else None,
            forwarded_from_id=None,
            forwarded_sender_name=f"Канал @{ch.custom_slug}",
        )
        session.add(new_msg)
        others = session.exec(
            select(ChatMember).where(
                ChatMember.chat_id == target.id,
                ChatMember.user_id != user.id,
            )
        ).all()
        ntype = "group_message" if target.is_group else "message"
        for o in others:
            session.add(Notification(user_id=o.user_id, actor_id=user.id, type=ntype))
        session.commit()
        session.refresh(new_msg)

        await manager.broadcast_to_chat(target.id, "new_message", {
            "id": new_msg.id,
            "chat_id": target.id,
            "sender_id": new_msg.sender_id,
            "sender_name": user.display_name,
            "sender_avatar": user.avatar_url,
            "text": new_msg.text,
            "ciphertext": None,
            "media_url": new_msg.media_url,
            "media_type": new_msg.media_type,
            "is_encrypted_media": False,
            "forwarded_from_id": None,
            "forwarded_sender_name": new_msg.forwarded_sender_name,
            "created_at": new_msg.created_at.isoformat(),
            "pinned": False,
            "pinned_by": None,
        }, session)
        return {"ok": True, "target_type": "chat", "target_id": target.id}

    if data.target_type == "channel":
        target_ch = session.get(Channel, data.target_id)
        if not target_ch:
            raise HTTPException(404, "Целевой канал не найден")
        require_admin(session, target_ch, user)
        if is_channel_blocked(session, target_ch.id):
            raise HTTPException(403, "🔒 Канал заблокирован модерацией")
        note = f"📣 Переслано из @{ch.custom_slug}"
        new_post = ChannelPost(
            channel_id=target_ch.id,
            author_id=user.id,
            text=f"{note}\n\n{post.text}" if post.text else note,
            media=json.dumps(media),
            is_silent=False,
            is_published=True,
        )
        session.add(new_post)
        session.commit()
        session.refresh(new_post)
        await _broadcast_new_post(session, target_ch, new_post)
        return {"ok": True, "target_type": "channel", "target_id": target_ch.id,
                "post": post_out(new_post, session)}

    raise HTTPException(400, "target_type: chat | channel")


# ------------------------------------------------------------------
# ⏰ Планировщик отложенных постов (poll-воркер, запускается на startup)
# ------------------------------------------------------------------
async def scheduled_posts_worker(interval: int = 30):
    """Каждые `interval` секунд публикует посты с наступившим scheduled_at."""
    from database import engine
    while True:
        try:
            await asyncio.sleep(interval)
            with Session(engine) as session:
                due = session.exec(
                    select(ChannelPost).where(
                        ChannelPost.is_published == False,  # noqa: E712
                        ChannelPost.scheduled_at != None,  # noqa: E711
                        ChannelPost.scheduled_at <= utcnow(),
                    )
                ).all()
                for post in due:
                    post.is_published = True
                    post.created_at = utcnow()
                    session.add(post)
                    session.commit()
                    session.refresh(post)
                    ch = session.get(Channel, post.channel_id)
                    if ch:
                        await _broadcast_new_post(session, ch, post)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f"⚠️ scheduled_posts_worker: {e}")


def start_channels_scheduler():
    """Вызывается из main.py startup."""
    return asyncio.create_task(scheduled_posts_worker())


# ------------------------------------------------------------------
# 💬 Нативные комментарии (треды через parent_comment_id)
# ------------------------------------------------------------------
class CommentCreateIn(BaseModel):
    text: str
    parent_comment_id: Optional[int] = None
    media: Optional[list] = None


def comment_out(c: ChannelComment, session: Session) -> dict:
    user = session.get(User, c.user_id)
    return {
        "id": c.id,
        "post_id": c.post_id,
        "user_id": c.user_id,
        "user": {
            "id": user.id, "username": user.username,
            "display_name": user.display_name, "avatar_url": user.avatar_url,
        } if user else None,
        "parent_comment_id": c.parent_comment_id,
        "text": c.text,
        "media": post_media(c.media),
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "edited_at": c.edited_at.isoformat() if c.edited_at else None,
    }


def _flat_comments_to_tree(flat: list) -> list:
    """Плоский список (отсортирован по created_at) → дерево вложенности."""
    by_id = {c["id"]: {**c, "replies": []} for c in flat}
    roots = []
    for c in flat:
        node = by_id[c["id"]]
        parent = by_id.get(c["parent_comment_id"])
        if parent and parent["id"] != c["id"]:
            parent["replies"].append(node)
        else:
            roots.append(node)
    return roots


@router.get("/channels/posts/{post_id}/comments")
def list_comments(
    post_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = session.get(ChannelPost, post_id)
    if not post:
        raise HTTPException(404, "Пост не найден")
    ch = session.get(Channel, post.channel_id)
    sub = get_subscription(session, ch.id, user.id)
    if not ch.is_public and not sub:
        raise HTTPException(403, "Это приватный канал")

    flat = session.exec(
        select(ChannelComment)
        .where(ChannelComment.post_id == post_id)
        .order_by(ChannelComment.created_at)
    ).all()
    return {"comments": _flat_comments_to_tree([comment_out(c, session) for c in flat]),
            "total": len(flat)}


@router.post("/channels/posts/{post_id}/comments")
async def create_comment(
    post_id: int,
    data: CommentCreateIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = session.get(ChannelPost, post_id)
    if not post:
        raise HTTPException(404, "Пост не найден")
    ch = session.get(Channel, post.channel_id)
    if not ch.comments_enabled:
        raise HTTPException(403, "Комментарии отключены в этом канале")
    sub = get_subscription(session, ch.id, user.id)
    if not ch.is_public and not sub:
        raise HTTPException(403, "Только подписчики могут комментировать")
    if not (data.text or "").strip():
        raise HTTPException(400, "Комментарий не может быть пустым")

    parent = None
    if data.parent_comment_id:
        parent = session.get(ChannelComment, data.parent_comment_id)
        if not parent or parent.post_id != post_id:
            raise HTTPException(400, "Родительский комментарий не найден")

    c = ChannelComment(
        post_id=post_id,
        user_id=user.id,
        parent_comment_id=parent.id if parent else None,
        text=data.text.strip()[:2000],
        media=json.dumps(data.media or []),
    )
    session.add(c)
    session.commit()
    session.refresh(c)

    # WS: пуш всем участникам обсуждения под постом
    participants = {post.author_id}
    for t in session.exec(
        select(ChannelComment).where(ChannelComment.post_id == post_id)
    ).all():
        participants.add(t.user_id)
    payload = {"post_id": post_id, "channel_id": ch.id, "comment": comment_out(c, session)}
    await manager.broadcast_to_users(list(participants), "channel_new_comment", payload)

    return {"ok": True, "comment": comment_out(c, session)}


@router.patch("/channels/posts/{post_id}/comments/{comment_id}")
async def update_comment(
    post_id: int,
    comment_id: int,
    data: CommentCreateIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    c = session.get(ChannelComment, comment_id)
    if not c or c.post_id != post_id:
        raise HTTPException(404, "Комментарий не найден")
    if c.user_id != user.id:
        raise HTTPException(403, "Можно редактировать только свои комментарии")
    if not (data.text or "").strip():
        raise HTTPException(400, "Комментарий не может быть пустым")

    c.text = data.text.strip()[:2000]
    if data.media is not None:
        c.media = json.dumps(data.media)
    c.edited_at = utcnow()
    session.add(c)
    session.commit()
    session.refresh(c)

    await manager.send_to_user(c.user_id, "channel_comment_edited",
                               {"post_id": post_id, "comment": comment_out(c, session)})
    return {"ok": True, "comment": comment_out(c, session)}


@router.delete("/channels/posts/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: int,
    comment_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    c = session.get(ChannelComment, comment_id)
    if not c or c.post_id != post_id:
        raise HTTPException(404, "Комментарий не найден")

    ch = session.get(Channel, session.get(ChannelPost, post_id).channel_id)
    my_sub = get_subscription(session, ch.id, user.id)
    is_admin = my_sub is not None and my_sub.role in ("owner", "admin")
    if c.user_id != user.id and not is_admin:
        raise HTTPException(403, "Недостаточно прав")

    # Каскадное удаление ветки ответов
    def _drop_replies(parent_id: int):
        for r in session.exec(select(ChannelComment).where(
                ChannelComment.parent_comment_id == parent_id)).all():
            _drop_replies(r.id)
            session.delete(r)
    _drop_replies(c.id)
    session.delete(c)
    session.commit()

    await manager.send_to_user(c.user_id, "channel_comment_deleted",
                               {"post_id": post_id, "comment_id": comment_id})
    return {"ok": True}


# ------------------------------------------------------------------
# 🔗 Подписки, инвайты и заявки на вступление
# ------------------------------------------------------------------
class JoinByInviteIn(BaseModel):
    token: str


def _channel_admin_ids(session: Session, channel_id: int) -> list:
    admins = session.exec(select(ChannelSubscriber).where(
        ChannelSubscriber.channel_id == channel_id,
        ChannelSubscriber.role.in_(["owner", "admin"]),
    )).all()
    return [a.user_id for a in admins]


async def _create_pending_request(session: Session, ch: Channel, user: User,
                                  invite_token: str = None) -> dict:
    """Создаёт/возобновляет заявку pending и пушит админам."""
    existing = session.exec(
        select(ChannelInviteRequest).where(
            ChannelInviteRequest.channel_id == ch.id,
            ChannelInviteRequest.user_id == user.id,
        )
    ).first()
    if existing and existing.status == "pending":
        raise HTTPException(409, "Заявка уже отправлена")
    if existing:
        existing.status = "pending"
        existing.invite_token = invite_token
        existing.created_at = utcnow()
        existing.resolved_at = None
        existing.reviewed_by = None
        session.add(existing)
    else:
        session.add(ChannelInviteRequest(channel_id=ch.id, user_id=user.id,
                                         invite_token=invite_token))
    session.commit()

    await manager.broadcast_to_users(
        _channel_admin_ids(session, ch.id), "channel_invite_request",
        {"channel_id": ch.id, "user_id": user.id,
         "user": {"id": user.id, "username": user.username,
                  "display_name": user.display_name, "avatar_url": user.avatar_url}},
    )
    return {"ok": True, "status": "pending"}


@router.post("/channels/{channel_id}/subscribe")
async def subscribe(
    channel_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    if get_subscription(session, ch.id, user.id):
        raise HTTPException(409, "Вы уже подписаны")

    if ch.is_public:
        # Публичный: подписка сразу
        session.add(ChannelSubscriber(channel_id=ch.id, user_id=user.id, role="subscriber"))
        session.commit()
        await notify_subscribers(session, ch.id, "channel_subscriber_joined",
                                 {"channel_id": ch.id, "user_id": user.id})
        return {"ok": True, "status": "joined"}

    # Приватный: заявка pending
    return await _create_pending_request(session, ch, user)


@router.delete("/channels/{channel_id}/subscribe")
async def unsubscribe(
    channel_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    sub = get_subscription(session, ch.id, user.id)
    if not sub:
        raise HTTPException(404, "Вы не подписаны")
    if sub.role == "owner":
        raise HTTPException(400, "Владелец не может отписаться — удалите канал")
    session.delete(sub)
    session.commit()

    await notify_subscribers(session, ch.id, "channel_subscriber_left",
                             {"channel_id": ch.id, "user_id": user.id})
    return {"ok": True}


@router.get("/channels/{channel_id}/requests")
def list_requests(
    channel_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    require_admin(session, ch, user)
    reqs = session.exec(
        select(ChannelInviteRequest)
        .where(ChannelInviteRequest.channel_id == ch.id,
               ChannelInviteRequest.status == "pending")
        .order_by(ChannelInviteRequest.created_at)
    ).all()
    users = {u.id: u for u in session.exec(
        select(User).where(User.id.in_([r.user_id for r in reqs] or [0]))
    ).all()}
    return [
        {
            "id": r.id,
            "user": {
                "id": users[r.user_id].id, "username": users[r.user_id].username,
                "display_name": users[r.user_id].display_name,
                "avatar_url": users[r.user_id].avatar_url,
            },
            "invite_token": r.invite_token,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in reqs if r.user_id in users
    ]


@router.patch("/channels/{channel_id}/requests/{req_id}")
async def resolve_request(
    channel_id: int,
    req_id: int,
    action: str,  # approve | reject
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    require_admin(session, ch, user)
    if action not in ("approve", "reject"):
        raise HTTPException(400, "action: approve | reject")

    req = session.get(ChannelInviteRequest, req_id)
    if not req or req.channel_id != ch.id:
        raise HTTPException(404, "Заявка не найдена")
    if req.status != "pending":
        raise HTTPException(409, "Заявка уже рассмотрена")

    req.status = "approved" if action == "approve" else "rejected"
    req.reviewed_by = user.id
    req.resolved_at = utcnow()
    session.add(req)

    if action == "approve" and not get_subscription(session, ch.id, req.user_id):
        session.add(ChannelSubscriber(channel_id=ch.id, user_id=req.user_id,
                                      role="subscriber"))
    session.commit()

    # WS: результат заявителю
    await manager.send_to_user(req.user_id, "channel_request_resolved",
                               {"channel_id": ch.id, "status": req.status})
    if action == "approve":
        await notify_subscribers(session, ch.id, "channel_subscriber_joined",
                                 {"channel_id": ch.id, "user_id": req.user_id})
    return {"ok": True, "status": req.status}


@router.post("/channels/{channel_id}/invites")
async def create_invite(
    channel_id: int,
    auto_approve: bool = False,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    require_admin(session, ch, user)

    token = secrets.token_urlsafe(24)
    inv = ChannelInvite(
        channel_id=ch.id, token=token, created_by=user.id,
        auto_approve=auto_approve,
    )
    session.add(inv)
    session.commit()
    return {"ok": True, "token": token,
            "url": f"/c/{ch.custom_slug}?invite={token}",
            "auto_approve": auto_approve}


@router.get("/channels/invites/{token}")
def invite_info(
    token: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Превью канала по инвайт-ссылке (до перехода)."""
    inv = session.exec(select(ChannelInvite).where(ChannelInvite.token == token)).first()
    if not inv or not inv.is_active:
        raise HTTPException(404, "Инвайт не найден или отозван")
    ch = session.get(Channel, inv.channel_id)
    return {"channel": channel_out(ch, session, user), "auto_approve": inv.auto_approve}


@router.post("/channels/join-by-invite")
async def join_by_invite(
    data: JoinByInviteIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    inv = session.exec(select(ChannelInvite).where(ChannelInvite.token == data.token)).first()
    if not inv or not inv.is_active:
        raise HTTPException(404, "Инвайт не найден или отозван")
    ch = session.get(Channel, inv.channel_id)
    if get_subscription(session, ch.id, user.id):
        raise HTTPException(409, "Вы уже подписаны")

    if ch.is_public or inv.auto_approve:
        # Прямое вступление
        session.add(ChannelSubscriber(channel_id=ch.id, user_id=user.id, role="subscriber"))
        session.commit()
        await notify_subscribers(session, ch.id, "channel_subscriber_joined",
                                 {"channel_id": ch.id, "user_id": user.id})
        return {"ok": True, "status": "joined", "channel": channel_out(ch, session, user)}

    # Приватный + ручное одобрение → заявка pending
    result = await _create_pending_request(session, ch, user, invite_token=data.token)
    result["channel"] = channel_out(ch, session, user)
    return result


# ------------------------------------------------------------------
# 🧲 АГРЕГАТОР ЛЕНТ: chats + channels (единый список для UI)
# ------------------------------------------------------------------
@router.get("/feed/chats-and-channels")
def feed_chats_and_channels(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Единый список для левого меню: личные/групповые чаты И каналы.

    Каналы полностью изолированы (channel_*), но UI получает один массив:
    у каналов is_channel=True, активность = последний пост.
    Читаем chat/chatmember/message ТОЛЬКО на чтение — ничего не меняем.
    """
    from models import Chat, ChatMember, Message  # read-only

    items = []

    # --- Чаты (без изменений существующих таблиц) ---
    memberships = session.exec(
        select(ChatMember).where(ChatMember.user_id == user.id)
    ).all()
    for m in memberships:
        chat = session.get(Chat, m.chat_id)
        if not chat or chat.is_secret:
            continue
        last_msg = session.exec(
            select(Message).where(Message.chat_id == chat.id)
            .order_by(Message.created_at.desc())
        ).first()
        unread = session.exec(
            select(func.count(Message.id)).where(
                Message.chat_id == chat.id,
                Message.read == False,  # noqa: E712
                Message.sender_id != user.id,
            )
        ).one() if not chat.is_group else None
        # имя чата
        if chat.is_group:
            name = chat.name or "Группа"
            avatar = chat.avatar_url
        else:
            others = session.exec(
                select(ChatMember).where(
                    ChatMember.chat_id == chat.id,
                    ChatMember.user_id != user.id,
                )
            ).all()
            other = session.get(User, others[0].user_id) if others else None
            name = other.display_name if other else "Диалог"
            avatar = other.avatar_url if other else None
        items.append({
            "id": chat.id,
            "kind": "chat",
            "is_channel": False,
            "is_group": chat.is_group,
            "is_saved": chat.is_saved,
            "name": name,
            "avatar_url": avatar,
            "last_activity": last_msg.created_at.isoformat() if last_msg else
                             (chat.created_at.isoformat() if chat.created_at else None),
            "unread_count": unread,
            "muted": m.muted_until is not None and m.muted_until > utcnow(),
        })

    # --- Каналы (свои таблицы) ---
    subs = session.exec(
        select(ChannelSubscriber).where(ChannelSubscriber.user_id == user.id)
    ).all()
    for s in subs:
        ch = session.get(Channel, s.channel_id)
        if not ch:
            continue
        last_post = session.exec(
            select(ChannelPost).where(
                ChannelPost.channel_id == ch.id,
                ChannelPost.is_published == True,  # noqa: E712
            ).order_by(ChannelPost.created_at.desc())
        ).first()
        unread = 0
        if s.last_seen_post_at:
            unread = session.exec(
                select(func.count(ChannelPost.id)).where(
                    ChannelPost.channel_id == ch.id,
                    ChannelPost.is_published == True,  # noqa: E712
                    ChannelPost.created_at > s.last_seen_post_at,
                )
            ).one()
        items.append({
            "id": ch.id,
            "kind": "channel",
            "is_channel": True,
            "is_group": False,
            "is_saved": False,
            "name": ch.title,
            "avatar_url": ch.avatar_url,
            "custom_slug": ch.custom_slug,
            "my_role": s.role,
            "last_activity": last_post.created_at.isoformat() if last_post else
                             (ch.created_at.isoformat() if ch.created_at else None),
            "unread_count": unread,
            "muted": s.muted_until is not None and s.muted_until > utcnow(),
        })

    items.sort(key=lambda x: x["last_activity"] or "", reverse=True)
    return items


# ------------------------------------------------------------------
# 🛡 МОДЕРАЦИЯ КАНАЛОВ (как у чатов: доступ ТОЛЬКО при активной жалобе)
# ------------------------------------------------------------------
CHANNEL_REPORT_TYPES = ["channel", "channel_post", "channel_comment"]


def _report_channel_id(session: Session, r: Report):
    """channel_id цели жалобы (None, если цель удалена/не канал)."""
    if r.target_type == "channel":
        return r.target_id
    if r.target_type == "channel_post":
        post = session.get(ChannelPost, r.target_id)
        return post.channel_id if post else None
    if r.target_type == "channel_comment":
        c = session.get(ChannelComment, r.target_id)
        if not c:
            return None
        post = session.get(ChannelPost, c.post_id)
        return post.channel_id if post else None
    return None


def _active_channel_report(session: Session, channel_id: int):
    """Активная (pending) жалоба на канал — та же практика приватности, что у чатов."""
    pending = session.exec(
        select(Report).where(
            Report.status == "pending",
            Report.target_type.in_(CHANNEL_REPORT_TYPES),
        ).order_by(Report.created_at.desc())
    ).all()
    return next((r for r in pending
                 if _report_channel_id(session, r) == channel_id), None)


def validate_channel_report_target(session: Session, target_type: str, target_id: int):
    """Валидация жалоб channel/channel_post/channel_comment (для /api/reports)."""
    if target_type == "channel":
        ch = session.get(Channel, target_id)
        if not ch:
            raise HTTPException(404, "Channel not found")
        return ch.id
    if target_type == "channel_post":
        post = session.get(ChannelPost, target_id)
        if not post:
            raise HTTPException(404, "Channel post not found")
        return post.channel_id
    if target_type == "channel_comment":
        c = session.get(ChannelComment, target_id)
        if not c:
            raise HTTPException(404, "Channel comment not found")
        post = session.get(ChannelPost, c.post_id)
        return post.channel_id if post else None
    return None


@router.get("/admin/channels")
def admin_list_channels(
    staff: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """🔒 ПРИВАТНОСТЬ: список каналов НЕ отдаётся. Возвращаются ТОЛЬКО каналы
    с активной (pending) жалобой. Жалобу закрыли → доступ пропал.
    Тот же принцип, что у /api/admin/chats."""
    from main import has_permission
    if not has_permission(staff, "manage_groups", session):
        raise HTTPException(403, "Нет права: manage_groups")

    pending = session.exec(
        select(Report).where(
            Report.status == "pending",
            Report.target_type.in_(CHANNEL_REPORT_TYPES),
        ).order_by(Report.created_at.desc())
    ).all()

    by_channel: dict = {}  # channel_id -> (scope, reason)
    for r in pending:
        cid = _report_channel_id(session, r)
        if cid is None:
            continue
        scope = "channel" if r.target_type == "channel" else "post"
        if cid not in by_channel or scope == "channel":
            by_channel[cid] = (scope, r.reason)

    result = []
    for cid, (scope, reason) in by_channel.items():
        ch = session.get(Channel, cid)
        if not ch:
            continue
        result.append({
            "id": ch.id,
            "name": ch.title,
            "custom_slug": ch.custom_slug,
            "avatar_url": ch.avatar_url,
            "subscribers_count": session.exec(
                select(func.count(ChannelSubscriber.id)).where(
                    ChannelSubscriber.channel_id == ch.id)
            ).one(),
            "posts_count": session.exec(
                select(func.count(ChannelPost.id)).where(
                    ChannelPost.channel_id == ch.id)
            ).one(),
            "is_blocked": bool(session.get(SystemSetting, f"channel_blocked_{ch.id}")),
            "access_scope": scope,
            "report_reason": reason,
            "created_at": ch.created_at.isoformat() if ch.created_at else None,
        })
    return result


@router.get("/admin/channels/{channel_id}/posts")
def admin_channel_posts(
    channel_id: int,
    limit: int = 200,
    staff: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """🔒 Посты канала доступны ТОЛЬКО при активной (pending) жалобе.
    Жалоба на пост → только этот пост; на канал → вся лента."""
    from main import has_permission
    if not has_permission(staff, "manage_groups", session):
        raise HTTPException(403, "Нет права: manage_groups")
    ch = session.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Канал не найден")

    report = _active_channel_report(session, channel_id)
    if not report:
        raise HTTPException(403, "🔒 Приватность: доступ к каналу открывается только при активной жалобе")

    if report.target_type == "channel_post":
        post = session.get(ChannelPost, report.target_id)
        if not post or post.channel_id != channel_id:
            raise HTTPException(404, "Пост не найден")
        return [post_out(post, session)]

    posts = session.exec(
        select(ChannelPost).where(ChannelPost.channel_id == channel_id)
        .order_by(ChannelPost.created_at.desc()).limit(min(limit, 500))
    ).all()
    return [post_out(p, session) for p in posts]


@router.post("/admin/channels/{channel_id}/block")
def admin_block_channel(
    channel_id: int,
    reason: str = "",
    staff: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Блокировка канала (постинг запрещён) — из окна модерации."""
    from main import has_permission, log_action as _log
    if not has_permission(staff, "manage_groups", session):
        raise HTTPException(403, "Нет права: manage_groups")
    ch = session.get(Channel, channel_id)
    if not ch:
        raise HTTPException(404, "Канал не найден")
    if not _active_channel_report(session, channel_id):
        raise HTTPException(403, "🔒 Блокировка возможна только при активной жалобе")

    session.add(SystemSetting(key=f"channel_blocked_{channel_id}", value="1"))
    _log(session, staff.id, "block_channel", target_type="channel",
         target_id=channel_id, details={"reason": reason})
    session.commit()
    return {"ok": True, "blocked": True}


@router.post("/admin/channels/{channel_id}/unblock")
def admin_unblock_channel(
    channel_id: int,
    staff: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    from main import has_permission, log_action as _log
    if not has_permission(staff, "manage_groups", session):
        raise HTTPException(403, "Нет права: manage_groups")
    setting = session.get(SystemSetting, f"channel_blocked_{channel_id}")
    if setting:
        session.delete(setting)
    _log(session, staff.id, "unblock_channel", target_type="channel", target_id=channel_id)
    session.commit()
    return {"ok": True, "blocked": False}


def is_channel_blocked(session: Session, channel_id: int) -> bool:
    """Хелпер: канал заблокирован модерацией → постинг запрещён."""
    return bool(session.get(SystemSetting, f"channel_blocked_{channel_id}"))


@router.post("/channels/{channel_id}/avatar")
async def upload_channel_avatar(
    channel_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Загрузка аватара канала (по образцу /api/chats/{chat_id}/avatar)."""
    import os as _os
    import cloudinary
    import cloudinary.uploader
    from cloudinary_config import UPLOAD_FOLDER
    from main import extract_cloudinary_public_id, check_size_before_read
    from fastapi.concurrency import run_in_threadpool

    ch = get_channel_or_404(session, channel_id)
    require_admin(session, ch, user)

    if not file.filename:
        raise HTTPException(400, "No file provided")
    ext = _os.path.splitext(file.filename)[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        raise HTTPException(400, f"Неверный формат: {ext}. Поддерживаются: .jpg, .jpeg, .png, .gif, .webp")
    err = check_size_before_read(file.headers, 5 * 1024 * 1024)
    if err:
        raise HTTPException(413, err)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(400, "Файл слишком большой (максимум 5 МБ)")

    # Удаляем старую аватарку
    if ch.avatar_url and "cloudinary.com" in ch.avatar_url:
        try:
            public_id = extract_cloudinary_public_id(ch.avatar_url)
            if public_id:
                cloudinary.uploader.destroy(public_id)
        except Exception:
            pass

    try:
        result = await run_in_threadpool(
            lambda: cloudinary.uploader.upload(
                content,
                folder=UPLOAD_FOLDER,
                resource_type="image",
                transformation=[{"width": 400, "height": 400, "crop": "fill"}],
            )
        )
        ch.avatar_url = result.get("secure_url")
    except Exception as e:
        raise HTTPException(400, f"Ошибка загрузки: {str(e)}")

    session.add(ch)
    session.commit()
    await notify_subscribers(session, ch.id, "channel_updated", {"channel_id": ch.id})
    return {"ok": True, "avatar_url": ch.avatar_url}


@router.delete("/admin/channels/{channel_id}/posts/{post_id}")
def admin_delete_channel_post(
    channel_id: int,
    post_id: int,
    staff: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Удаление поста канала из окна модерации (только при активной жалобе)."""
    from main import has_permission, log_action as _log
    if not has_permission(staff, "manage_groups", session):
        raise HTTPException(403, "Нет права: manage_groups")
    if not _active_channel_report(session, channel_id):
        raise HTTPException(403, "🔒 Действие возможно только при активной жалобе")
    post = session.get(ChannelPost, post_id)
    if not post or post.channel_id != channel_id:
        raise HTTPException(404, "Пост не найден")

    for c in session.exec(select(ChannelComment).where(ChannelComment.post_id == post.id)).all():
        session.delete(c)
    for v in session.exec(select(ChannelPostView).where(ChannelPostView.post_id == post.id)).all():
        session.delete(v)
    session.delete(post)
    _log(session, staff.id, "admin_delete_channel_post",
         target_type="channel_post", target_id=post_id)
    session.commit()
    return {"ok": True}
    media: Optional[list] = None


# ------------------------------------------------------------------
# 🛠 Управление каналом
# ------------------------------------------------------------------
@router.post("/channels")
async def create_channel(
    data: ChannelCreateIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    title = (data.title or "").strip()
    if not title:
        raise HTTPException(400, "Название канала обязательно")
    if len(title) > 100:
        raise HTTPException(400, "Название максимум 100 символов")

    slug = validate_slug(data.custom_slug)
    if slug_taken(session, slug):
        raise HTTPException(409, "Ссылка уже занята")

    ch = Channel(
        owner_id=user.id,
        title=title,
        description=(data.description or "").strip()[:500] or None,
        avatar_url=data.avatar_url,
        custom_slug=slug,
        is_public=data.is_public,
    )
    session.add(ch)
    session.commit()
    session.refresh(ch)

    session.add(ChannelSubscriber(channel_id=ch.id, user_id=user.id, role="owner"))
    session.commit()

    log_action(session, user.id, "channel_create",
               target_type="channel", target_id=ch.id,
               details={"title": ch.title, "slug": ch.custom_slug})

    return {"ok": True, "channel": channel_out(ch, session, user)}


@router.get("/channels/my")
def my_channels(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    subs = session.exec(
        select(ChannelSubscriber).where(ChannelSubscriber.user_id == user.id)
    ).all()
    channels = []
    for s in subs:
        ch = session.get(Channel, s.channel_id)
        if ch:
            channels.append(channel_out(ch, session, user))
    return channels


@router.get("/channels/by-slug/{slug}")
def channel_by_slug(
    slug: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = session.exec(
        select(Channel).where(Channel.custom_slug == validate_slug(slug))
    ).first()
    if not ch:
        raise HTTPException(404, "Канал не найден")
    sub = get_subscription(session, ch.id, user.id)
    if not ch.is_public and not sub:
        raise HTTPException(403, "Это приватный канал")
    return channel_out(ch, session, user)


@router.get("/channels/{channel_id}")
def get_channel(
    channel_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    ch = get_channel_or_404(session, channel_id)
    sub = get_subscription(session, ch.id, user.id)
    if not ch.is_public and not sub:
        raise HTTPException(403, "Это приватный канал")
    return channel_out(ch, session, user)