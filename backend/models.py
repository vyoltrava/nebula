from typing import Optional
from sqlmodel import SQLModel, Field, Index
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

    billet_url: Optional[str] = Field(default=None)  # 🆕 URL загруженного пользователем значка
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

    # 💰 Баланс кредитов (для покупки премиум-юзернеймов за CREDITS)
    credits: int = Field(default=0)

    # 🛡 ПРИВАТНОСТЬ: кто может писать мне в ЛС / звонить
    # "everyone" | "followers" | "following" | "nobody"
    allow_messages: str = Field(default="everyone")
    allow_calls: str = Field(default="everyone")

    # 🛡 ПРИВАТНОСТЬ ПРОФИЛЯ (Twitter-like)
    is_private: bool = Field(default=False)                # приватный аккаунт: профиль/посты только для подписчиков (+ staff с manage_users)
    allow_comments: str = Field(default="everyone")        # "everyone" | "followers" | "following" | "mentioned"
    hide_following: bool = Field(default=False)            # скрыть список «читает»
    hide_followers: bool = Field(default=False)            # скрыть список подписчиков 



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


# ============================================================
# 💳 ПЛАТЕЖНАЯ СИСТЕМА — продажа плашек/ролей
# "Платёжный слой": можно навесить оплату на ЛЮБУЮ роль.
# (модели: PaymentRole, PaymentPurchase)
# ============================================================

class PaymentRole(SQLModel, table=True):
    """Настройка продажи конкретной роли. Одна запись на роль.

    Поля JSON хранятся строками (SQLModel/sqlite-совместимо):
      features   — список строк ["VIP чат", "Скидка 20%"]
      provider_data — dict для провайдера (price_id у Stripe и т.п.)
    """
    id: int = Field(default=None, primary_key=True)
    role_id: int = Field(unique=True, index=True)      # ID роли из таблицы role
    role_name: str = Field(default="")                 # человекочитаемое имя (копия из Role)
    is_active: bool = Field(default=False)             # включена ли продажа
    price: float = Field(default=0.0)                  # цена в основной валюте
    currency: str = Field(default="USD")
    period: str = Field(default="once")                # once | monthly | yearly
    trial_days: int = Field(default=0)                 # пробный период (для подписок)
    description: Optional[str] = None                  # что даёт плашка
    features: str = Field(default="[]")                # JSON-массив строк
    is_recurring: bool = Field(default=False)          # подписка или разовая
    payment_provider: str = Field(default="stripe")    # stripe | manual
    provider_data: Optional[str] = Field(default=None) # JSON (например price_id)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PaymentPurchase(SQLModel, table=True):
    """Запись о покупке плашки/роли."""
    id: int = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    role_id: int = Field(index=True)
    payment_role_id: int = Field(foreign_key="paymentrole.id", index=True)
    amount: float = Field(default=0.0)
    currency: str = Field(default="USD")
    status: str = Field(default="pending")             # pending | success | failed | refunded | expired
    provider: str = Field(default="stripe")
    provider_id: Optional[str] = Field(default=None)   # ID транзакции у провайдера
    subscription_id: Optional[str] = Field(default=None)
    expires_at: Optional[datetime] = None              # когда истекает (для подписок)
    meta_json: Optional[str] = Field(default=None)      # JSON (previous_role_id, период и т.п.)
    created_at: datetime = Field(default_factory=utcnow)
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


class Dislike(SQLModel, table=True):
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
    # 🔗 Пригласительная ссылка (как в Telegram)
    invite_token: Optional[str] = Field(default=None, unique=True, index=True)
    # 🆕 Кто может добавлять участников ("members" | "admins")
    can_add_members: str = Field(default="admins")
    # 🏢 Системные папки и команды:
    # system_folder: None = обычный чат | "work" = системная папка 📁 РАБОТА (нельзя удалять/переименовать юзером)
    system_folder: Optional[str] = Field(default=None, max_length=30)
    # Отдел, которому принадлежит чат (рабочий чат отдела)
    category_id: Optional[int] = Field(default=None, foreign_key="rolecategory.id")
    # 🔗 Межгрупповой чат: None | "heads_only" (только главы отделов) | "deputies_only" (только замы)
    cross_team_type: Optional[str] = Field(default=None, max_length=30)




class ChatMember(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    chat_id: int = Field(foreign_key="chat.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    # 🆕 Роль в чате: "owner" | "admin" | "member"
    role: str = Field(default="member")
    joined_at: datetime = Field(default_factory=utcnow)
    # 🔕 Отключение уведомлений чата: NULL = включены; дата в будущем = до момента;
    # 9999-01-01 = навсегда
    muted_until: Optional[datetime] = Field(default=None, sa_column_kwargs={"server_default": None})
    # 🏢 Иерархия внутри рабочего чата отдела: head | deputy | senior | junior | cross_head
    # NULL для обычных чатов. По умолчанию вычисляется из уровня юзера, переопределится вручную в /stat.
    team_hierarchy: Optional[str] = Field(default=None, max_length=20)
    # 🔒 Иерархия задана вручную в /stat — авто-синк по уровню роли её не перетирает
    team_hierarchy_manual: bool = Field(default=False)
    # 🎫 Типы заявок, за которые отвечает участник (JSON: ["complaint","appeal"]; "[]" = все типы)
    ticket_kinds: str = Field(default="[]")
    # 🟢 Смена в чате отдела: /enter — на смене, /exit — ушёл со смены
    on_shift: bool = Field(default=False)
    shift_entered_at: Optional[datetime] = None
    # 🔢 Сколько заявок взято за текущую смену (для round-robin «по порядку»)
    shift_taken: int = Field(default=0)
    # 🏢 Локальные права внутри конкретного чата отдела (JSON-массив: ["can_handle_tasks", ...])
    team_permissions: str = Field(default="[]")
    # 🤖 Участник добавлен автоматически (по роли/плашке) — при снятии роли автоматически кикается
    auto_assigned: bool = Field(default=False)
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


class ChatInvite(SQLModel, table=True):
    """Приглашительная ссылка на чат."""
    id: Optional[int] = Field(default=None, primary_key=True)
    chat_id: int = Field(foreign_key="chat.id", index=True)
    token: str = Field(index=True, unique=True)
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)
    is_active: bool = Field(default=True)
    name: Optional[str] = Field(default=None, max_length=80)  # 🆕 название ссылки
    expires_at: Optional[datetime] = None  # 🆕 срок действия (временные ссылки)


class RoleCategory(SQLModel, table=True):
    """Группа/отдел для структуризации ролей"""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=60)
    color: str = Field(default="#8b5cf6")
    description: Optional[str] = Field(default=None, max_length=200)
    order: int = Field(default=0)
    # 🏢 Рабочий чат отдела (создаётся автоматически, см. ensure_team_chat_for_category)
    team_chat_id: Optional[int] = Field(default=None, foreign_key="chat.id")
    created_at: datetime = Field(default_factory=utcnow)


class Role(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    color: str = "#8b5cf6"
    level: int = Field(default=1)
    description: Optional[str] = None      # 🆕 чем занимается роль
    is_staff: bool = Field(default=False)  # 🆕 показывать ли в правилах
    show_in_payments: bool = Field(default=False)  # 💳 показывать в системе оплаты
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


class AdminBackup(SQLModel, table=True):
    """🛡️ Резервная БД: снимки действий администраторов.
    Любое деструктивное действие (удаление поста, бан и т.п.) применяется
    сразу, но снимок лежит здесь и может быть откачен. При «бане админа»
    все его действия восстанавливаются автоматически."""
    __tablename__ = "admin_backup"

    id: Optional[int] = Field(default=None, primary_key=True)
    actor_id: int = Field(index=True)                    # кто совершил действие
    action: str                                          # delete_post | ban_user
    target_type: str                                     # post | user
    target_id: Optional[int] = None
    payload: str = Field(default="{}")                   # JSON-снимок для отката
    created_at: datetime = Field(default_factory=utcnow, index=True)
    restored: bool = Field(default=False, index=True)
    restored_at: Optional[datetime] = None
    restored_by: Optional[int] = Field(default=None, foreign_key="user.id")

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


class ChatDraft(SQLModel, table=True):
    """Черновик текста: чата (chat_id = "{id}") или создания поста (chat_id = "post")."""
    __tablename__ = "chatdraft"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    chat_id: str = Field(index=True, max_length=64)   # "{chat_id}" для чата, "post" — черновик поста
    text: str = Field(default="", max_length=20000)
    updated_at: datetime = Field(default_factory=utcnow)
    __table_args__ = (UniqueConstraint("user_id", "chat_id", name="uq_user_chat_draft"),)


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




class PostReaction(SQLModel, table=True):
    """Реакция на пост (стикер или эмодзи). Одна реакция на пользователя на пост."""
    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="post.id")
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


class NickHistory(SQLModel, table=True):
    """История смены ника (username / display_name)"""
    __tablename__ = "nick_history"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", ondelete="CASCADE")
    field: str = Field(default="display_name")  # username | display_name
    old_value: str = Field(default="")
    new_value: str = Field(default="")
    changed_by: int = Field(foreign_key="user.id", ondelete="CASCADE")
    changed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ============================================================
# 🏷️ КАСТОМНЫЕ ПЛАШКИ (BADGES 2.0)
# ============================================================

class Billet(SQLModel, table=True):
    """Кастомная плашка/бейджик для пользователя"""
    __tablename__ = "billet"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=80)                    # Название плашки
    description: Optional[str] = None                  # Описание
    icon_url: Optional[str] = None                     # URL иконки/логотипа
    text_content: Optional[str] = None    
    text_color: Optional[str] = Field(default="#ffffff")  # 🆕 ДОБАВЛЕНО: цвет текста внутри плашки


    # === Визуальные настройки ===
    bg_type: str = Field(default="solid")              # solid | gradient | image
    bg_color: Optional[str] = None                     # Цвет для solid
    bg_gradient: Optional[str] = None                  # CSS-градиент (например, linear-gradient(...))
    bg_gradient_type: Optional[str] = None             # linear | radial (для справки)
    bg_gradient_angle: Optional[int] = None            # Угол градиента
    bg_image_url: Optional[str] = None                # URL фонового изображения
    bg_image_mode: Optional[str] = None               # cover | contain | tile

    border_color: Optional[str] = None
    border_width: Optional[int] = None                 # 0-5px
    border_style: Optional[str] = None                 # solid | dashed | dotted
    border_glow: bool = Field(default=False)           # Свечение обводки (вкл/выкл)
    border_glow_intensity: Optional[int] = None       # Интенсивность свечения (0-100)

    animation_flags: Optional[str] = None             # JSON массив анимаций (e.g. ["pulse", "float"])
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
    # 🏢 Отдел, к которому привязана плашка (опционально: выдача плашки = вход в рабочий чат отдела)
    category_id: Optional[int] = Field(default=None, foreign_key="rolecategory.id")
    is_active: bool = Field(default=True)              # Активна ли плашка
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)


class BilletTemplate(SQLModel, table=True):
    """Шаблоны для кастомных плашек"""
    __tablename__ = "billet_template"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=80)                  # Название шаблона
    description: Optional[str] = None                  # Описание
    badge_config: str = Field(default="{}")            # JSON конфигурация плашки
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)
    is_system: bool = Field(default=False)             # Системный (готовый) шаблон


class BilletAssignment(SQLModel, table=True):
    """Назначение плашек пользователям"""
    __tablename__ = "billet_assignment"
    __table_args__ = (
        UniqueConstraint("user_id", "billet_id", name="uq_user_billet"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    billet_id: int = Field(foreign_key="billet.id")
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


class SystemBadge(SQLModel, table=True):
    """Системная плашка (уровни 9-11: Developer / Founder / System).
    Одна плашка на уровень — кастомизируется админом в окне бейджей."""
    __tablename__ = "system_badge"

    level: int = Field(primary_key=True)               # 9, 10, 11
    name: str = Field(max_length=80)                    # Название плашки
    text_content: Optional[str] = None                  # Текст на плашке
    text_color: Optional[str] = Field(default="#ffffff")

    # === Визуальные настройки ===
    bg_type: str = Field(default="solid")              # solid | gradient
    bg_color: Optional[str] = None
    bg_gradient: Optional[str] = None
    icon_url: Optional[str] = None                     # иконка (например /role-icon.svg)

    border_color: Optional[str] = None
    border_width: Optional[int] = None
    border_style: Optional[str] = None
    border_glow: bool = Field(default=False)
    border_glow_intensity: Optional[int] = None

    animation_flags: Optional[str] = None             # JSON массив анимаций
    animation_speed: Optional[str] = None

    shadow_enabled: bool = Field(default=True)
    shadow_blur: Optional[int] = None
    shadow_offset_x: Optional[int] = None
    shadow_offset_y: Optional[int] = None
    shadow_color: Optional[str] = None
    inner_glow_enabled: bool = Field(default=False)
    inner_glow_intensity: Optional[int] = None
    specular_enabled: bool = Field(default=False)
    metallic_enabled: bool = Field(default=False)

    is_active: bool = Field(default=True)              # Активна ли плашка
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    updated_at: datetime = Field(default_factory=utcnow)


# ============================================================
# ✨ PRISME CHAT — система "выбора объекта как ключа доступа"
# ============================================================

class PrismeScene(SQLModel, table=True):
    """Единственная активная "картинка" (генератор объектов)."""
    __tablename__ = "prisme_scene"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(default="Prisme Grid", max_length=80)
    seed: str = Field(default="retro-1987")
    # Количество объектов, которое сгенерировано СЕЙЧАС (после расширений).
    object_count: int = Field(default=0)
    base_count: int = Field(default=0)          # стартовое кол-во объектов
    expansion_level: int = Field(default=0)      # сколько раз расширяли
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class PrismeObject(SQLModel, table=True):
    """Отдельный объект на картинке. Каждый — ключ доступа к своему чату."""
    __tablename__ = "prisme_object"

    id: Optional[int] = Field(default=None, primary_key=True)
    scene_id: int = Field(foreign_key="prisme_scene.id", index=True)
    slot: int = Field(default=0, index=True)        # порядковый номер на сетке
    kind: str = Field(default="rocket")             # тип (робот, ракета, ...)
    x: float = Field(default=0.0)
    y: float = Field(default=0.0)
    size: float = Field(default=48.0)
    rotation: float = Field(default=0.0)
    color: str = Field(default="#00F5FF")
    # Статус: free | occupied
    status: str = Field(default="free", index=True)
    added_at: int = Field(default=0)                # номер расширения (уровень)
    chat_id: Optional[int] = Field(default=None, foreign_key="chat.id")
    owner_id: Optional[int] = Field(default=None, foreign_key="user.id")
    occupied_at: Optional[datetime] = None
    # Доп. атрибуты (подсветка, палитра) — JSON-строка
    attrs: Optional[str] = Field(default=None)


class PrismeRequest(SQLModel, table=True):
    """Очередь ожидания: когда все объекты заняты."""
    __tablename__ = "prisme_request"

    id: Optional[int] = Field(default=None, primary_key=True)
    scene_id: int = Field(foreign_key="prisme_scene.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    message: Optional[str] = Field(default=None, max_length=500)
    # pending | granted | dismissed
    status: str = Field(default="pending", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[int] = Field(default=None, foreign_key="user.id")


class PrismeStat(SQLModel, table=True):
    """Счётчики для статистики админ-панели."""
    __tablename__ = "prisme_stat"

    id: Optional[int] = Field(default=None, primary_key=True)
    scene_id: int = Field(foreign_key="prisme_scene.id", index=True)
    key: str = Field(default="chats_created", index=True)   # chats_created | requests_total | assignments
    value: int = Field(default=0)


# ============================================================
# 👑 ПРЕМИУМ-ЮЗЕРНЕЙМЫ (@username) — продажа ников
# ============================================================

class PremiumUsername(SQLModel, table=True):
    """Премиум-юзернейм, который можно продать/купить.

    JSON-поля (price_history, analytics) хранятся строками для
    совместимости с SQLite/SQLModel (как в остальных моделях).
    """
    __tablename__ = "premium_usernames"

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(max_length=50, unique=True, index=True)

    # 📦 Статус продажи
    is_available: bool = Field(default=True)   # свободен для покупки
    price: Optional[int] = Field(default=None) # цена (в единицах currency)
    currency: str = Field(default="USD")       # USD | EUR | CREDITS
    category: Optional[str] = Field(default=None)  # short | vip | branded ...

    # Кто выставил (админ)
    created_by: Optional[int] = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)

    # Покупка
    purchased_by: Optional[int] = Field(default=None, foreign_key="user.id")
    purchased_at: Optional[datetime] = None
    purchase_price: Optional[int] = Field(default=None)   # цена продажи

    # История цен (JSON-строка: [{price, date, changed_by}])
    price_history: str = Field(default="[]")

    # Статус
    is_active: bool = Field(default=True)      # отключить может админ (soft-delete)
    is_reserved: bool = Field(default=False)   # зарезервирован для VIP
    reserved_for: Optional[int] = Field(default=None, foreign_key="user.id")
    reserved_until: Optional[datetime] = None

    # Метаданные
    views_count: int = Field(default=0)
    analytics: str = Field(default="{}")       # {views_by_day: {}, clicks: 0}


# ============================================================
# 📢 КАНАЛЫ (CHANNELS) — полностью изолированная система.
# Никаких FK на chat/chatmember/message. Только user.id.
# ============================================================

class Channel(SQLModel, table=True):
    __tablename__ = "channel"

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    title: str = Field(max_length=255)
    description: Optional[str] = Field(default=None, max_length=255)
    avatar_url: Optional[str] = None
    avatar_media_type: Optional[str] = None  # image | video | gif (для анимированных аватаров)
    # Уникальная кастомная ссылка (без @, храним в lowercase)
    custom_slug: str = Field(unique=True, index=True, max_length=32)
    is_public: bool = Field(default=True)
    # JSON: {"show_author_signature": bool, "silent_messages_by_default": bool,
    #         "show_history": bool, "reactions": {"enabled": bool, "emoji": [...]}}
    settings: str = Field(default="{}")
    # Комментарии включены/выключены на уровне канала
    comments_enabled: bool = Field(default=True)
    allow_requests: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)


class ChannelSubscriber(SQLModel, table=True):
    __tablename__ = "channel_subscriber"

    id: Optional[int] = Field(default=None, primary_key=True)
    channel_id: int = Field(foreign_key="channel.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    # owner | admin | subscriber
    role: str = Field(default="subscriber", max_length=20)
    joined_at: datetime = Field(default_factory=utcnow)
    muted_until: Optional[datetime] = None
    # 🔔 бейдж непрочитанных: посты новее этой даты считаются новыми
    last_seen_post_at: Optional[datetime] = None
    # 📌 личное закрепление канала пользователем (в списке чатов)
    pinned_at: Optional[datetime] = None
    # 🛡 Гранулярные права админа (JSON-массив строк, см. CHANNEL_PERMISSIONS)
    permissions: str = Field(default="[]")
    __table_args__ = (UniqueConstraint("channel_id", "user_id"),)


# ============================================================
# 🗂️ КАСТОМНЫЕ ПАПКИ ЧАТОВ ПОЛЬЗОВАТЕЛЯ
# Обычные юзеры могут группировать чаты (например "Универ", "Игры").
# Системная папка 📁 РАБОТА в эту таблицу не пишется — она определяется
# по Chat.system_folder == "work" у чатов пользователя.
# ============================================================

class UserChatFolder(SQLModel, table=True):
    """Папка чатов, созданная пользователем."""
    __tablename__ = "user_chat_folder"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    name: str = Field(max_length=40)
    # 🎨 Оформление: emoji-иконка и цвет
    icon: str = Field(default="📁", max_length=8)
    color: str = Field(default="#8b5cf6", max_length=20)
    order: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)


class ChatFolderAssign(SQLModel, table=True):
    """Привязка чата к папке пользователя."""
    __tablename__ = "chat_folder_assign"

    id: Optional[int] = Field(default=None, primary_key=True)
    folder_id: int = Field(foreign_key="user_chat_folder.id", index=True)
    chat_id: int = Field(foreign_key="chat.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    __table_args__ = (UniqueConstraint("folder_id", "chat_id"),)


# ============================================================
# 🎫 ЗАЯВКИ ОТДЕЛА (ОЧЕРЕДЬ ЗАДАЧ В РАБОЧЕМ ЧАТЕ)
# Распределение: Random + Level Priority (см. pick_ticket_assignee)
# ============================================================

class TeamTicket(SQLModel, table=True):
    """Заявка, прилетевшая в отдел. Назначается исполнителю из участников
    рабочего чата, у которых есть право can_handle_tasks."""
    __tablename__ = "team_ticket"

    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="rolecategory.id", index=True)
    chat_id: Optional[int] = Field(default=None, foreign_key="chat.id")
    title: str = Field(max_length=120)
    description: Optional[str] = None
    # open (не назначена) | assigned (в работе) | done (закрыта)
    status: str = Field(default="open", index=True, max_length=20)
    # Тип обращения: complaint (жалоба) | appeal (обращение) | other (другое)
    kind: str = Field(default="other", index=True, max_length=20)
    created_by: int = Field(foreign_key="user.id")
    assigned_to: Optional[int] = Field(default=None, foreign_key="user.id")
    # Иерархия исполнителя на момент назначения (junior/senior/deputy/head)
    assigned_hierarchy: Optional[str] = Field(default=None, max_length=20)
    assigned_at: Optional[datetime] = None
    closed_by: Optional[int] = Field(default=None, foreign_key="user.id")
    closed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class ChannelBadge(SQLModel, table=True):
    """🏷️ Префикс/плашка канала: сохранённая комбинация иконка+текст+цвет.
    Создаётся в админке, присваивается каналам (можно массово) и показывается
    в списках (список чатов / окно поиска публичных каналов / страница канала)."""
    __tablename__ = "channel_badge"

    id: Optional[int] = Field(default=None, primary_key=True)
    # ключ из списка заложенных иконок (check | music | star | crown | bolt | fire | ...)
    icon: str = Field(default="flag", max_length=40)
    # текст плашки — необязателен (можно только иконка)
    text: str = Field(default="", max_length=60)
    # цвет текста/иконки
    color: str = Field(default="#ffffff", max_length=20)
    # цвет плашки (hex)
    bg_color: str = Field(default="#8b5cf6", max_length=20)
    created_at: datetime = Field(default_factory=utcnow)


class ChannelBadgeAssign(SQLModel, table=True):
    """🔗 Назначение плашки каналу. Один канал → одна плашка (уникальность channel_id)."""
    __tablename__ = "channel_badge_assign"

    id: Optional[int] = Field(default=None, primary_key=True)
    badge_id: int = Field(foreign_key="channel_badge.id", index=True)
    channel_id: int = Field(foreign_key="channel.id", index=True)
    __table_args__ = (UniqueConstraint("channel_id"),)


class UserPrefix(SQLModel, table=True):
    """🏷️ Префикс пользователя: иконка в многоугольной плашке (без текста).
    Создаётся в админке (adminnew → Префиксы → Пользователи), выдаётся
    пользователям через раздел «Пользователи». Показывается в чатах,
    списке чатов, постах, профиле и т.д."""
    __tablename__ = "user_prefix"

    id: Optional[int] = Field(default=None, primary_key=True)
    # ключ из списка заложенных иконок (check | star | crown | bolt | fire | ...)
    icon: str = Field(default="star", max_length=40)
    # цвет иконки
    color: str = Field(default="#ffffff", max_length=20)
    # цвет плашки (hex)
    bg_color: str = Field(default="#8b5cf6", max_length=20)
    created_at: datetime = Field(default_factory=utcnow)


class UserPrefixAssign(SQLModel, table=True):
    """🔗 Назначение префикса пользователю. Один пользователь → один префикс."""
    __tablename__ = "user_prefix_assign"

    id: Optional[int] = Field(default=None, primary_key=True)
    prefix_id: int = Field(foreign_key="user_prefix.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    __table_args__ = (UniqueConstraint("user_id"),)


class ChannelBan(SQLModel, table=True):
    """Запрет повторного вступления + причина бана."""
    __tablename__ = "channel_ban"

    id: Optional[int] = Field(default=None, primary_key=True)
    channel_id: int = Field(foreign_key="channel.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    reason: Optional[str] = None
    banned_by: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)
    __table_args__ = (UniqueConstraint("channel_id", "user_id"),)


class ChannelPost(SQLModel, table=True):
    __tablename__ = "channel_post"

    id: Optional[int] = Field(default=None, primary_key=True)
    channel_id: int = Field(foreign_key="channel.id", index=True)
    author_id: int = Field(foreign_key="user.id", index=True)
    # text | poll | quiz
    post_type: str = Field(default="text", max_length=10)
    text: Optional[str] = Field(default=None, max_length=8000)
    # JSON-массив: [{"type": "image|video|file|audio|video_note|sticker|gif", "url": "...", "name": "..."}]
    media: str = Field(default="[]")
    # JSON: {question, options:[{text,count}], is_anonymous, is_quiz, correct_index, explanation, votes:{uid:idx}}
    poll: str = Field(default="{}")
    # JSON-агрегат реакций: {"emoji": {"count": n, "users": [id...]}}
    reactions: str = Field(default="{}")
    is_silent: bool = Field(default=False)
    is_pinned: bool = Field(default=False)
    pinned_at: Optional[datetime] = None
    views_count: int = Field(default=0)
    scheduled_at: Optional[datetime] = None
    is_published: bool = Field(default=True)
    # ✅ Ответ на другой пост (reply-цепочка админа в канале)
    reply_to_post_id: Optional[int] = Field(default=None, foreign_key="channel_post.id", index=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    edited_at: Optional[datetime] = None


class ChannelComment(SQLModel, table=True):
    __tablename__ = "channel_comment"

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="channel_post.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    # Ответ на другой комментарий (треды/ветки)
    parent_comment_id: Optional[int] = Field(default=None, foreign_key="channel_comment.id", index=True)
    text: str = Field(max_length=2000)
    media: str = Field(default="[]")
    # анонимный комментарий от имени канала
    as_channel: bool = Field(default=False)
    # закреплённый комментарий под постом (может быть только один)
    is_pinned: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow, index=True)
    edited_at: Optional[datetime] = None


class ChannelPostView(SQLModel, table=True):
    """Дедупликация просмотров: один user_id зачитывается один раз на пост."""
    __tablename__ = "channel_post_view"

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="channel_post.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    viewed_at: datetime = Field(default_factory=utcnow)
    __table_args__ = (UniqueConstraint("post_id", "user_id"),)


class ChannelSavedPost(SQLModel, table=True):
    """Сохранённые посты (Saved Messages) у подписчика."""
    __tablename__ = "channel_saved_post"

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="channel_post.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    saved_at: datetime = Field(default_factory=utcnow)
    __table_args__ = (UniqueConstraint("post_id", "user_id"),)


class ChannelPostReaction(SQLModel, table=True):
    """Реакция на пост — та же система, что MessageReaction в чатах (эмодзи + стикеры)."""
    __tablename__ = "channel_post_reaction"

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="channel_post.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    emoji: Optional[str] = Field(default=None, max_length=16)
    sticker_id: Optional[int] = Field(default=None, foreign_key="sticker.id")
    created_at: datetime = Field(default_factory=utcnow)
    __table_args__ = (UniqueConstraint("post_id", "user_id"),)


class ChannelInvite(SQLModel, table=True):
    """Инвайт-ссылка на канал."""
    __tablename__ = "channel_invite"

    id: Optional[int] = Field(default=None, primary_key=True)
    channel_id: int = Field(foreign_key="channel.id", index=True)
    token: str = Field(unique=True, index=True, max_length=64)
    created_by: int = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utcnow)
    is_active: bool = Field(default=True)
    # True = по инвайту можно войти без одобрения админа
    auto_approve: bool = Field(default=False)
    # ограничения: срок действия и кол-во использований
    expires_at: Optional[datetime] = None
    max_uses: Optional[int] = None
    uses: int = Field(default=0)


class ChannelInviteRequest(SQLModel, table=True):
    """Заявка на вступление (по кнопке subscribe или по инвайту)."""
    __tablename__ = "channel_invite_request"

    id: Optional[int] = Field(default=None, primary_key=True)
    channel_id: int = Field(foreign_key="channel.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    invite_token: Optional[str] = Field(default=None, max_length=64)
    # pending | approved | rejected
    status: str = Field(default="pending", max_length=20, index=True)
    created_at: datetime = Field(default_factory=utcnow)
    reviewed_by: Optional[int] = Field(default=None, foreign_key="user.id")
    resolved_at: Optional[datetime] = None
    __table_args__ = (UniqueConstraint("channel_id", "user_id"),)