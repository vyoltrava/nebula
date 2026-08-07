from typing import Optional
from sqlmodel import SQLModel, Field
from datetime import datetime, timezone



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
    created_at: datetime = Field(default_factory=datetime.now)


class Post(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    author_id: int = Field(foreign_key="user.id")
    text: str
    media_url: Optional[str] = None
    reply_to_id: Optional[int] = Field(default=None, foreign_key="post.id")
    created_at: datetime = Field(default_factory=datetime.now)


class Like(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    post_id: int = Field(foreign_key="post.id")
    created_at: datetime = Field(default_factory=datetime.now)


class Follow(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    follower_id: int = Field(foreign_key="user.id")
    followee_id: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.now)


class Notification(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    actor_id: int = Field(foreign_key="user.id")
    type: str
    post_id: Optional[int] = Field(default=None, foreign_key="post.id")
    read: bool = False
    created_at: datetime = Field(default_factory=datetime.now)


class Tag(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)


class PostTag(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="post.id")
    tag_id: int = Field(foreign_key="tag.id")


class Chat(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.now)
    is_secret: bool = Field(default=False)


class ChatMember(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    chat_id: int = Field(foreign_key="chat.id")
    user_id: int = Field(foreign_key="user.id")


class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    chat_id: int = Field(foreign_key="chat.id")
    sender_id: int = Field(foreign_key="user.id")
    text: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None  # "image", "video", "gif"
    read: bool = False
    edited: bool = Field(default=False)  # ← ДОБАВЬТЕ
    edited_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)
    ciphertext: Optional[str] = None

class Role(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    color: str = "#8b5cf6"
    level: int = Field(default=1)  # ← ДОЛЖНО БЫТЬ ЭТО ПОЛЕ
    permissions: str = "[]"
    created_at: datetime = Field(default_factory=datetime.now)

class Report(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reporter_id: int = Field(foreign_key="user.id")
    target_type: str  # "post" или "user"
    target_id: int
    reason: str  # spam, insult, nsfw, rules_violation, other
    comment: Optional[str] = None
    status: str = "pending"  # pending, resolved, rejected
    resolved_by: Optional[int] = Field(default=None, foreign_key="user.id")
    resolved_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)

class BugReport(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    reporter_id: int = Field(foreign_key="user.id")
    title: str
    description: str
    status: str = "new"  # new, in_progress, resolved, rejected
    priority: str = "medium"  # low, medium, high, critical
    resolved_by: Optional[int] = Field(default=None, foreign_key="user.id")
    resolved_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)

class Update(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    content: str
    importance: str = "minor"
    author_id: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    edited_at: Optional[datetime] = None

class UserKey(SQLModel, table=True):
    """Публичный ключ пользователя для E2EE. Приватный ключ — только на устройстве."""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", unique=True)
    public_key: str  # base64 X25519 public key
    fingerprint: str  # SHA256[:16] для верификации
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChatSessionKey(SQLModel, table=True):
    """Session key чата, зашифрованный публичным ключом каждого участника."""
    id: Optional[int] = Field(default=None, primary_key=True)
    chat_id: int = Field(foreign_key="chat.id")
    user_id: int = Field(foreign_key="user.id")
    encrypted_session_key: str  # base64
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class IPLog(SQLModel, table=True):
    """Лог IP-адресов пользователей (входы, регистрации)"""
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    ip_address: str
    user_agent: Optional[str] = None
    action: str = "login"  # login, register, request
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class IPBlock(SQLModel, table=True):
    """Заблокированные IP-адреса"""
    id: Optional[int] = Field(default=None, primary_key=True)
    ip_address: str = Field(unique=True)
    reason: Optional[str] = None
    blocked_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))