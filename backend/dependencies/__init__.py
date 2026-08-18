"""
Пакет зависимостей FastAPI
"""

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
