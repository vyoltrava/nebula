from typing import Optional
from sqlmodel import SQLModel, Field
from sqlalchemy import UniqueConstraint
from datetime import datetime, timezone

def utcnow():
    return datetime.now(timezone.utc)

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True)
    display_name: str
    password_hash: str
    avatar_url: Optional[str] = None
    is_admin: bool = False
    is_moderator: bool = False
    is_banned: bool = False
    is_system: bool = Field(default=False)
    role_id: Optional[int] = Field(default=None, foreign_key="role.id")
    created_at: datetime = Field(default_factory=utcnow)
    bio: Optional[str] = None
    live_text_enabled: bool = True     # 🆕 показывать ли живые сообщения других
    live_text_broadcast: bool = True   # 🆕 транслировать ли мой набор текста
    last_seen: Optional[datetime] = None
    token_version: int = Field(default=0)   # для "выйти со всех устройств"
    totp_secret: Optional[str] = None       # задел под будущую 2FA
    totp_enabled: bool = Field(default=False)
    cover_url: Optional[str] = None 


# ============================================================
# 🎨 ТЕМЫ (АНИМИРОВАННЫЕ ФОНЫ)
# ============================================================

class Theme(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=80)
    type: str = Field(max_length=20)  # aurora | gradient | liquid | neon
    colors: str = Field(default='[]')  # JSON-массив цветов: '["#8b5cf6","#6366f1"]'
    speed: float = Field(default=24.0)
    intensity: float = Field(default=0.22)
    blur: int = Field(default=80)
    is_default: bool = Field(default=False)
    min_level: int = Field(default=0)  # 0 = всем, 3 = спонсорам, 9 = админам
    is_active: bool = Field(default=True)  # админ может отключить тему
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)


class SystemSetting(SQLModel, table=True):
    """Глобальные настройки системы (ключ-значение)"""
    key: str = Field(primary_key=True, max_length=50)
    value: str = Field(default="")
    updated_at: datetime = Field(default_factory=utcnow)

class Post(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    author_id: int = Field(foreign_key="user.id", index=True)
    text: str
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    reply_to_id: Optional[int] = Field(default=None, foreign_key="post.id")
    repost_of_id: Optional[int] = Field(default=None, foreign_key="post.id")
    echo_parent_id: Optional[int] = Field(default=None, foreign_key="post.id", index=True)  # 🆕 ЭХО
    created_at: datetime = Field(default_factory=utcnow, index=True)
    views_count: int = Field(default=0)
    edited: bool = Field(default=False)
    edited_at: Optional[datetime] = None


class Like(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    post_id: int = Field(foreign_key="post.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    __table_args__ = (UniqueConstraint("user_id", "post_id"),)


class Follow(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    follower_id: int = Field(foreign_key="user.id", index=True)
    followee_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    __table_args__ = (UniqueConstraint("follower_id", "followee_id"),)


class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    actor_id: int = Field(foreign_key="user.id")
    type: str
    post_id: Optional[int] = Field(default=None, foreign_key="post.id")
    read: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)


class Tag(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)


class PostTag(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="post.id", index=True)
    tag_id: int = Field(foreign_key="tag.id", index=True)
    __table_args__ = (UniqueConstraint("post_id", "tag_id"),)


class Chat(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=utcnow)
    is_secret: bool = Field(default=False)
    # 🆕 Групповые поля
    is_group: bool = Field(default=False)
    name: Optional[str] = Field(default=None, max_length=80)
    avatar_url: Optional[str] = None
    owner_id: Optional[int] = Field(default=None, foreign_key="user.id")
    pinned_by: Optional[int] = Field(default=None, foreign_key="user.id")
    pinned_at: Optional[datetime] = None


class ChatMember(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    chat_id: int = Field(foreign_key="chat.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    # 🆕 Роль в чате: "owner" | "admin" | "member"
    role: str = Field(default="member")
    joined_at: datetime = Field(default_factory=utcnow)
    __table_args__ = (UniqueConstraint("chat_id", "user_id"),)

class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    chat_id: int = Field(foreign_key="chat.id", index=True)
    sender_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    text: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # "image", "video", "gif"
    read: bool = False
    edited: bool = Field(default=False)  # ← ДОБАВЬТЕ
    edited_at: Optional[datetime] = None
    ciphertext: Optional[str] = None
    pinned: bool = Field(default=False)           # ← ДОЛЖНО БЫТЬ
    pinned_at: Optional[datetime] = None          # ← ДОЛЖНО БЫТЬ
    pinned_by: Optional[int] = Field(default=None, foreign_key="user.id")  # ← ДОЛЖНО БЫТЬ
    forwarded_from_id: Optional[int] = Field(default=None, foreign_key="message.id")
    forwarded_sender_name: Optional[str] = None
    reply_to_id: Optional[int] = Field(default=None, foreign_key="message.id") 


class RoleCategory(SQLModel, table=True):
    """Группа/отдел для структуризации ролей"""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=60)
    color: str = Field(default="#8b5cf6")
    description: Optional[str] = Field(default=None, max_length=200)
    order: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)


class Role(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    color: str = "#8b5cf6"
    level: int = Field(default=1)
    description: Optional[str] = None      # 🆕 чем занимается роль
    is_staff: bool = Field(default=False)  # 🆕 показывать ли в правилах
    position: int = Field(default=0)       # 🆕 порядок отображения
    category_id: Optional[int] = Field(default=None, foreign_key="rolecategory.id")
    permissions: str = "[]"
    created_at: datetime = Field(default_factory=utcnow)





class Warning(SQLModel, table=True):
    """Предупреждение пользователю (право warn_users)"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    issuer_id: int = Field(foreign_key="user.id")
    reason: str = Field(max_length=500)
    active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: Optional[datetime] = None

class Report(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reporter_id: int = Field(foreign_key="user.id", index=True)
    target_type: str  # "post" или "user"
    target_id: int
    reason: str  # spam, insult, nsfw, rules_violation, other
    comment: Optional[str] = None
    status: str = Field(default="pending", index=True)  
    resolved_by: Optional[int] = Field(default=None, foreign_key="user.id")
    resolved_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)

class BugReport(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reporter_id: int = Field(foreign_key="user.id")
    title: str
    description: str
    status: str = Field(default="new", index=True) # new, in_progress, resolved, rejected
    priority: str = "medium"  # low, medium, high, critical
    resolved_by: Optional[int] = Field(default=None, foreign_key="user.id")
    resolved_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)

class Update(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    content: str
    importance: str = "minor"
    author_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)
    edited_at: Optional[datetime] = None

class UserKey(SQLModel, table=True):
    """Публичный ключ пользователя для E2EE. Приватный ключ — только на устройстве."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True)
    public_key: str  # base64 X25519 public key
    fingerprint: str  # SHA256[:16] для верификации
    created_at: datetime = Field(default_factory=utcnow)


class ChatSessionKey(SQLModel, table=True):
    """Session key чата, зашифрованный публичным ключом каждого участника."""
    id: Optional[int] = Field(default=None, primary_key=True)
    chat_id: int = Field(foreign_key="chat.id")
    user_id: int = Field(foreign_key="user.id")
    encrypted_session_key: str  # base64
    created_at: datetime = Field(default_factory=utcnow)


class IPLog(SQLModel, table=True):
    """Лог IP-адресов пользователей (входы, регистрации)"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    ip_address: str
    user_agent: Optional[str] = None
    action: str = "login"  # login, register, request
    created_at: datetime = Field(default_factory=utcnow)


class IPBlock(SQLModel, table=True):
    """Заблокированные IP-адреса"""
    id: Optional[int] = Field(default=None, primary_key=True)
    ip_address: str = Field(unique=True)
    reason: Optional[str] = None
    blocked_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: Optional[datetime] = None  # None = навсегда


class ActionLog(SQLModel, table=True):
    """Общий лог действий в системе"""
    id: Optional[int] = Field(default=None, primary_key=True)
    actor_id: Optional[int] = Field(default=None, foreign_key="user.id")
    action: str  # ban_user, delete_post, create_role, etc.
    target_type: Optional[str] = None  # user, post, role
    target_id: Optional[int] = None
    details: Optional[str] = None  # JSON с доп. инфой
    ip_address: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)

class Bookmark(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    post_id: int = Field(foreign_key="post.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    __table_args__ = (UniqueConstraint("user_id", "post_id"),)

class SiteRules(SQLModel, table=True):
    __tablename__ = "siterules"
    id: Optional[int] = Field(default=None, primary_key=True)
    content: str = Field(default="{}")
    updated_by: Optional[int] = Field(default=None, foreign_key="user.id")
    updated_at: datetime = Field(default_factory=utcnow)

class PostView(SQLModel, table=True):
    __tablename__ = "postview"
    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="post.id")
    viewer_hash: str
    viewed_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))

class Draft(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    text: str
    media_url: Optional[str] = None
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))


class UpdateRead(SQLModel, table=True):
    """Таблица для отслеживания прочитанных обновлений"""
    __tablename__ = "updateread"
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    update_id: int = Field(foreign_key="update.id", primary_key=True)
    read_at: datetime = Field(default_factory=utcnow)

class PushSubscription(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    endpoint: str = Field(unique=True, index=True)
    p256dh: str
    auth: str
    created_at: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============================================================
# 😂 СТИКЕРЫ И РЕАКЦИИ (УНИВЕРСАЛЬНАЯ СИСТЕМА)
# ============================================================

class StickerPack(SQLModel, table=True):
    """Пак стикеров (содержит эмодзи и картинки)"""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=60)
    min_level: int = Field(default=1)
    is_active: bool = Field(default=True)
    is_builtin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


class Sticker(SQLModel, table=True):
    """Отдельный стикер в паке (эмодзи или картинка)"""
    id: Optional[int] = Field(default=None, primary_key=True)
    pack_id: int = Field(foreign_key="stickerpack.id")
    type: str = Field(max_length=10)  # "emoji" или "image"
    content: str = Field(max_length=500)  # эмодзи или URL картинки
    order: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)


class MessageReaction(SQLModel, table=True):
    """Реакция на сообщение (стикер или эмодзи)"""
    id: Optional[int] = Field(default=None, primary_key=True)
    message_id: int = Field(foreign_key="message.id")
    user_id: int = Field(foreign_key="user.id")
    sticker_id: Optional[int] = Field(default=None, foreign_key="sticker.id")
    emoji: Optional[str] = Field(default=None, max_length=16)  # fallback
    created_at: datetime = Field(default_factory=utcnow)




class LastReadPost(SQLModel, table=True):
    """Один последний читаемый пост на пользователя (вместо прогресса скролла)"""
    __tablename__ = "lastreadpost"
    user_id: int = Field(foreign_key="user.id", primary_key=True)
    post_id: int = Field(foreign_key="post.id")
    saved_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
