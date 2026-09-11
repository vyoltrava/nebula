# dependencies.py
# ---------------------------------------------------------------------------
# Общий модуль зависимостей и хелперов для роутеров (routers/*.py).
#
# ИСТОЧНИК ИСТИНЫ — main.py: здесь находятся все вспомогательные функции
# (get_current_user / has_permission / user_out / hash_password / ...), модели,
# кэши и константы. Этот файл лишь ПЕРЕ-ЭКСПОРТИРУЕТ их, поэтому деление на
# роутеры не ломает единую точку определения.
#
# Почему нет циклического импорта:
#   * main.py определяет все хелперы/модели сверху;
#   * ПОДКЛЮЧЕНИЕ роутеров в main.py выполняется САМЫМ ПОСЛЕДНИМ блоком
#     (внизу файла). К этому моменту модуль main полностью исполнен, значит
#     `from main import ...` в this-модуле уже корректно всё достаёт.
# ---------------------------------------------------------------------------

from main import *  # noqa: F401,F403  (переэкспорт публичных имён из main)

# Явный переэкспорт приватных имён и неочевидных символов, которые
# роутеры запрашивают по имени (с `from dependencies import X`).
from main import (  # noqa: F401
    ALGORITHM,
    SECRET,
    UPLOAD_FOLDER,
    ChangePasswordIn,
    MarkReadingIn,
    PostOut,
    UpdateUserIn,
    _FOLLOW_CACHE_TTL,
    _POPULAR_TAGS_TTL,
    _follow_cache,
    _popular_tags_cache,
    _track_view_sync,
    _update_last_seen_sync,
    build_reactions_map,
    cascade_delete_post,
    check_hierarchy_or_403,
    check_password,
    check_sanction_rights,
    ensure_user_has_keys,
    extract_cloudinary_public_id,
    extract_mentions,
    extract_tags,
    get_author_role,
    get_client_ip,
    get_current_user,
    get_current_user_optional,
    get_optional_user,
    get_reply_preview,
    get_user_level,
    has_permission,
    hash_password,
    invalidate_follow_cache,
    invalidate_role_cache,
    limiter,
    log_action,
    manager,
    max_level_for,
    protect_system_account,
    reaction_limit_for,
    require_admin,
    require_announcer,
    require_staff,
    resolve_user,
    theme_to_dict,
    user_out,
)

# Транзитивные зависимости, необходимые роутерам, которые используют
# `from dependencies import *`.
from websocket_manager import manager  # noqa: F401
from database import get_session, engine  # noqa: F401
from models import *  # noqa: F401,F403
# ---------------------------------------------------------------------------
# Динамический __all__: чтобы `from dependencies import *` в роутерах получало
# ВСЕ имена (включая приватные хелперы/кэши из main и модели). Это убирает риск
# NameError в перенесённых эндпоинтах и не требует ручных списков импортов.
import main as _main_mod
for _n, _v in vars(_main_mod).items():
    if _n.startswith('_') and not _n.startswith('__'):
        globals().setdefault(_n, _v)
__all__ = [n for n in globals() if not n.startswith('__')]