# routers/__init__.py
"""
Инициализация пакета роутеров
"""

# Экспортируем всё, что нужно для main.py
from .auth import (
    SECRET,
    ALGORITHM,
    get_current_user,
    get_optional_user,
    require_staff,
    require_admin,
    require_founder,
    require_announcer,
    require_support_staff,
    get_client_ip,
    is_ip_blocked,
    create_token,
    limiter,
    _update_last_seen,
    hash_password,
    check_password,
    ensure_user_has_keys,
    log_action,
    user_out,
    generate_code,
    send_password_reset_email,
)

# Роутеры
from .admin import router as admin_router
from .auth import router as auth_router
from .chats import router as chats_router
from .misc import router as misc_router
from .notifications import router as notifications_router
from .permissions import router as permissions_router
from .posts import router as posts_router
from .reports import router as reports_router
from .search import router as search_router
from .support import router as support_router
from .themes import router as themes_router
from .updates import router as updates_router
from .users import router as users_router