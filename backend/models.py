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
    is_trelod: bool = Field(default=False)
    role_id: Optional[int] = Field(default=None, foreign_key="role.id")
    selected_badge_id: Optional[int] = Field(default=None)

    custom_badge_url: Optional[str] = Field(default=None)  # 🆕 URL загруженного пользователем значка
    created_at: datetime = Field(default_factory=utcnow)
    bio: Optional[str] = None
    live_text_enabled: bool = True     # 🆕 показывать ли живые сообщения других
    live_text_broadcast: bool = True   # 🆕 транслировать ли мой набор текста
    last_seen: Optional[datetime] = None
    token_version: int = Field(default=0)   # для "выйти со всех устройств"
    # 2FA
    totp_secret: Optional[str] = Field(default=None)
    totp_enabled: bool = Field(default=False)
    totp_backup_codes: Optional[str] = Field(default=None)  # JSON массив хешей
    
    # Email
    email: Optional[str] = Field(default=None)
    email_verified: bool = Field(default=False)
    
    cover_url: Optional[str] = None 

    prism_anchor: Optional[str] = Field(default=None) 



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
    message_id: Optional[int] = Field(default=None, foreign_key="message.id")
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
    is_saved: bool = Field(default=False) # 🆕 Флаг избранного
    is_prism: bool = Field(default=False)
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
    is_pending: bool = Field(default=False) 
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
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


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


class SupportMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    ticket_id: int = Field(foreign_key="supportticket.id")
    sender_id: int = Field(foreign_key="user.id")
    text: Optional[str] = None  # ← ИЗМЕНИ: было str, стало Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SupportTicket(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    status: str = Field(default="open", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: Optional[datetime] = Field(default_factory=utcnow)


class Badge(SQLModel, table=True):
    """Значки для аватарок"""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=60)
    icon_url: str
    glow_color: Optional[str] = Field(default=None)  # Цвет свечения (null = цвет роли)
    effect_type: str = Field(default="none", max_length=20)  # none, gold, pulse
    
    # 🆕 Настройки эффектов
    enable_ring: bool = Field(default=True)  # Включить вращающееся кольцо
    enable_glow: bool = Field(default=True)  # Включить пульсацию свечения
    
    role_id: Optional[int] = Field(default=None, foreign_key="role.id")
    user_id: Optional[int] = Field(default=None, foreign_key="user.id")
    is_selectable: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


# ============================================================
# 🏷️ КАСТОМНЫЕ ПЛАШКИ (BADGES 2.0)
# ============================================================

class CustomBadge(SQLModel, table=True):
    """Кастомная плашка с расширенными визуальными настройками"""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=80)
    description: Optional[str] = Field(default=None, max_length=300)
    icon_url: Optional[str] = Field(default=None)              # логотип/иконка
    text: Optional[str] = Field(default=None, max_length=40)   # кастомный текст на плашке

    # Фон
    bg_type: str = Field(default="solid", max_length=20)      # solid | gradient | image
    bg_color: str = Field(default="#8b5cf6")
    gradient_colors: str = Field(default='["#8b5cf6","#6366f1"]')  # JSON-массив
    gradient_type: str = Field(default="linear", max_length=10)    # linear | radial
    gradient_angle: int = Field(default=135)
    bg_image_url: Optional[str] = Field(default=None)
    bg_image_mode: str = Field(default="cover", max_length=10) # cover | contain | tile

    # Обводка
    border_color: str = Field(default="#ffffff")
    border_width: int = Field(default=2)        # 0-5 px
    border_style: str = Field(default="solid", max_length=10)  # solid | dashed | dotted
    border_glow: int = Field(default=0)         # 0-100 интенсивность свечения обводки

    # Анимации (JSON-список): perimeter_wave, pulse_glow, shimmer, blink, icon_spin, float
    animations: str = Field(default="[]")
    animation_speed: str = Field(default="normal", max_length=10)  # slow | normal | fast

    # Эффекты
    drop_shadow: int = Field(default=0)         # 0-100
    inner_glow: bool = Field(default=False)
    specular: bool = Field(default=False)       # блики
    metallic: bool = Field(default=False)       # металлический эффект

    # Шаблон/пресет
    preset: Optional[str] = Field(default=None, max_length=30)  # birthday | owner | vip | sponsor | veteran

    is_active: bool = Field(default=True)
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)


class CustomBadgeTemplate(SQLModel, table=True):
    """Сохранённый шаблон кастомной плашки"""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=80)
    preset: Optional[str] = Field(default=None, max_length=30)
    icon_url: Optional[str] = Field(default=None)
    text: Optional[str] = Field(default=None, max_length=40)
    bg_type: str = Field(default="solid", max_length=20)
    bg_color: str = Field(default="#8b5cf6")
    gradient_colors: str = Field(default='["#8b5cf6","#6366f1"]')
    gradient_type: str = Field(default="linear", max_length=10)
    gradient_angle: int = Field(default=135)
    bg_image_url: Optional[str] = Field(default=None)
    bg_image_mode: str = Field(default="cover", max_length=10)
    border_color: str = Field(default="#ffffff")
    border_width: int = Field(default=2)
    border_style: str = Field(default="solid", max_length=10)
    border_glow: int = Field(default=0)
    animations: str = Field(default="[]")
    animation_speed: str = Field(default="normal", max_length=10)
    drop_shadow: int = Field(default=0)
    inner_glow: bool = Field(default=False)
    specular: bool = Field(default=False)
    metallic: bool = Field(default=False)
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)


class CustomBadgeAssignment(SQLModel, table=True):
    """Выдача кастомной плашки пользователю"""
    id: Optional[int] = Field(default=None, primary_key=True)
    badge_id: int = Field(foreign_key="custombadge.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    issued_by: int = Field(foreign_key="user.id")
    issued_at: datetime = Field(default_factory=utcnow)
    expires_at: Optional[datetime] = Field(default=None)  # None = бессрочно
    priority: int = Field(default=1)            # >0 = перекрывает стандартные плашки
    notify_user: bool = Field(default=False)
    custom_message: Optional[str] = Field(default=None, max_length=300)
    revoked: bool = Field(default=False)
    revoked_at: Optional[datetime] = Field(default=None)
    revoked_by: Optional[int] = Field(default=None, foreign_key="user.id")

class Suggestion(SQLModel, table=True):
    """Старые предложения (для обратной совместимости)"""
    __tablename__ = "suggestion"
    id: Optional[int] = Field(default=None, primary_key=True)
    author_id: int = Field(foreign_key="user.id", ondelete="CASCADE")
    title: str = Field(max_length=200)
    content: str
    status: str = Field(default="pending")  # pending, approved, implemented, rejected, archived
    is_pinned: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SuggestionComment(SQLModel, table=True):
    """Комментарии к старым предложениям"""
    __tablename__ = "suggestion_comment"
    id: Optional[int] = Field(default=None, primary_key=True)
    suggestion_id: int = Field(foreign_key="suggestion.id", ondelete="CASCADE")
    author_id: int = Field(foreign_key="user.id", ondelete="CASCADE")
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SuggestionCategory(SQLModel, table=True):
    """Разделы форума (Сайт, Сервер, Архив и т.д.)"""
    __tablename__ = "suggestion_category"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=60)
    description: Optional[str] = None
    icon: str = Field(default="message-square")
    color: str = Field(default="#8b5cf6")
    order: int = Field(default=0)
    is_archived: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SuggestionThread(SQLModel, table=True):
    """Темы внутри разделов форума"""
    __tablename__ = "suggestion_thread"
    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="suggestion_category.id", ondelete="CASCADE")
    author_id: int = Field(foreign_key="user.id", ondelete="CASCADE")
    title: str = Field(max_length=200)
    content: str
    is_pinned: bool = Field(default=False)
    is_closed: bool = Field(default=False)          # 🆕 тема закрыта (писать нельзя)
    prefix_id: Optional[int] = None                 # 🆕 префикс темы
    status: str = Field(default="pending")
    views_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = Field(default=None)

class SuggestionThreadComment(SQLModel, table=True):
    """Комментарии к темам форума"""
    __tablename__ = "suggestion_thread_comment"
    id: Optional[int] = Field(default=None, primary_key=True)
    thread_id: int = Field(foreign_key="suggestion_thread.id", ondelete="CASCADE")
    author_id: int = Field(foreign_key="user.id", ondelete="CASCADE")
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TeamStatistic(SQLModel, table=True):
    """Статистика действий команды"""
    __tablename__ = "team_statistic"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", ondelete="CASCADE")
    action_type: str
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    details: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RoleHistory(SQLModel, table=True):
    """История смены ролей"""
    __tablename__ = "role_history"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", ondelete="CASCADE")
    old_role_id: Optional[int] = Field(default=None, foreign_key="role.id", ondelete="SET NULL")
    new_role_id: Optional[int] = Field(default=None, foreign_key="role.id", ondelete="SET NULL")
    changed_by: int = Field(foreign_key="user.id", ondelete="CASCADE")
    changed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============================================================
# 🎨 КАСТОМНЫЕ ПЛАШКИ (BADGES)
# ============================================================

class CustomBadge(SQLModel, table=True):
    """Кастомная плашка/бейджик для пользователя"""
    __tablename__ = "custom_badge"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=80)                    # Название плашки
    description: Optional[str] = None                  # Описание
    icon_url: Optional[str] = None                     # URL иконки/логотипа
    text_content: Optional[str] = None                  # Кастомный текст на плашке

    # === Визуальные настройки ===
    bg_type: str = Field(default="solid")              # solid | gradient | image
    bg_color: Optional[str] = None                     # Цвет для solid
    bg_gradient: Optional[str] = None                  # CSS-градиент
    bg_gradient_type: Optional[str] = None             # linear | radial
    bg_gradient_angle: Optional[int] = None            # Угол градиента
    bg_image_url: Optional[str] = None                # URL фонового изображения
    bg_image_mode: Optional[str] = None               # cover | contain | tile

    border_color: Optional[str] = None
    border_width: Optional[int] = None                 # 0-5px
    border_style: Optional[str] = None                 # solid | dashed | dotted
    border_glow: bool = Field(default=False)           # Свечение обводки
    border_glow_intensity: Optional[int] = None       # Интенсивность свечения

    animation_flags: Optional[str] = None             # JSON массив анимаций
    animation_speed: Optional[str] = None             # slow | normal | fast

    shadow_enabled: bool = Field(default=True)
    shadow_blur: Optional[int] = None
    shadow_offset_x: Optional[int] = None
    shadow_offset_y: Optional[int] = None
    shadow_color: Optional[str] = None

    inner_glow_enabled: bool = Field(default=False)
    inner_glow_intensity: Optional[int] = None
    specular_enabled: bool = Field(default=False)
    metallic_enabled: bool = Field(default=False)

    priority: Optional[int] = None                     # Приоритет отображения
    is_active: bool = Field(default=True)              # Активна ли плашка
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)


class CustomBadgeTemplate(SQLModel, table=True):
    """Шаблоны для кастомных плашек"""
    __tablename__ = "custom_badge_template"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=80)                  # Название шаблона
    description: Optional[str] = None                  # Описание
    badge_config: str = Field(default="{}")            # JSON конфигурация плашки
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)
    is_system: bool = Field(default=False)             # Системный (готовый) шаблон


class CustomBadgeAssignment(SQLModel, table=True):
    """Назначение плашек пользователям"""
    __tablename__ = "custom_badge_assignment"
    __table_args__ = (
        UniqueConstraint("user_id", "badge_id", name="uq_user_badge"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    badge_id: int = Field(foreign_key="custom_badge.id")
    granted_by: int = Field(foreign_key="user.id")
    granted_at: datetime = Field(default_factory=utcnow)
    expires_at: Optional[datetime] = None              # Дата истечения
    is_active: bool = Field(default=True)              # Активна ли выдача
    custom_message: Optional[str] = None               # Кастомное сообщение
    override_priority: bool = Field(default=True)     # Перекрывает все плашки

    @property
    def is_expired(self) -> bool:
        """Проверка истечения срока"""
        if self.expires_at:
            return datetime.now(timezone.utc) > self.expires_at
        return False