# scan_errors.py
import ast
import os
import sys
from pathlib import Path
from collections import defaultdict

# Папка с роутерами
ROUTERS_DIR = "routers"
DEPENDENCIES_FILE = "dependencies.py"

# Встроенные имена Python (не нужно импортировать)
BUILTINS = set(dir(__builtins__)) if isinstance(__builtins__, dict) else set(dir(__builtins__))

# Имена, которые точно есть в dependencies.py (из твоего монолита)
KNOWN_DEPENDENCIES = {
    # Кэши
    "_ip_block_cache", "_IP_BLOCK_CACHE_TTL",
    "_role_cache", "_ROLE_CACHE_TTL",
    "_popular_tags_cache", "_POPULAR_TAGS_TTL",
    "_follow_cache", "_FOLLOW_CACHE_TTL",
    
    # Функции авторизации
    "get_current_user", "get_optional_user", "require_staff", "require_admin",
    "require_founder", "require_announcer",
    "get_user_permissions", "has_permission", "get_user_level",
    "check_hierarchy_or_403", "protect_system_account", "check_sanction_rights",
    "user_out", "resolve_user",
    
    # Утилиты
    "get_client_ip", "log_action", "is_ip_blocked",
    "hash_password", "check_password", "create_token",
    "extract_cloudinary_public_id", "extract_tags", "extract_mentions",
    "get_author_role",
    
    # Каскадное удаление
    "cascade_delete_post", "cascade_delete_chat",
    
    # Инвалидация кэшей
    "invalidate_role_cache", "invalidate_ip_block_cache", "invalidate_follow_cache",
    
    # Константы
    "SECRET", "ALGORITHM", "UPLOAD_FOLDER",
    "ALLOWED_IMAGE_EXT", "ALLOWED_AUDIO_EXT", "ALLOWED_VIDEO_EXT",
    "ALL_PERMISSIONS", "MODERATOR_PERMISSIONS",
    
    # Лимитер
    "limiter",
    
    # Менеджер вебсокетов
    "manager",
    
    # Функции для E2EE
    "ensure_user_has_keys", "reaction_limit_for", "build_reactions_map",
    "get_reply_preview", "theme_to_dict", "_strip_roles_sections",
    "_update_last_seen_sync", "_track_view_sync",
    
    # Сервисы
    "send_push", "get_vapid",
    
    # Модели (если импортируются из models)
    "User", "Post", "Like", "Follow", "Notification", "Tag", "PostTag",
    "Role", "Chat", "ChatMember", "Message", "Report", "UserKey",
    "ChatSessionKey", "IPLog", "IPBlock", "ActionLog", "Bookmark",
    "SiteRules", "PostView", "Update", "UpdateRead", "PushSubscription",
    "StickerPack", "Sticker", "MessageReaction", "Theme", "SystemSetting",
    "RoleCategory", "Warning", "LastReadPost", "SupportTicket", "SupportMessage",
    "BugReport",
}

def get_imports_from_file(filepath: str) -> set:
    """Парсит файл и возвращает все импортированные имена"""
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            tree = ast.parse(f.read())
        except SyntaxError as e:
            print(f"⚠️ Синтаксическая ошибка в {filepath}: {e}")
            return set()
    
    imports = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.asname if alias.asname else alias.name)
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                imports.add(alias.asname if alias.asname else alias.name)
    return imports

def get_defined_names(filepath: str) -> set:
    """Парсит файл и возвращает все имена, определенные в нем (функции, классы, переменные)"""
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            tree = ast.parse(f.read())
        except SyntaxError:
            return set()
    
    defined = set()
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            defined.add(node.name)
        elif isinstance(node, ast.ClassDef):
            defined.add(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    defined.add(target.id)
    return defined

def get_used_names(filepath: str) -> set:
    """Парсит файл и возвращает все имена, которые используются в теле функций"""
    with open(filepath, "r", encoding="utf-8") as f:
        try:
            tree = ast.parse(f.read())
        except SyntaxError:
            return set()
    
    used = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            used.add(node.id)
        elif isinstance(node, ast.Attribute):
            # Для случаев типа obj.attr - берем только obj
            if isinstance(node.value, ast.Name):
                used.add(node.value.id)
    return used

def scan_router(filepath: str) -> list:
    """Сканирует один файл роутера и возвращает список недостающих импортов"""
    imports = get_imports_from_file(filepath)
    defined = get_defined_names(filepath)
    used = get_used_names(filepath)
    
    # Все доступные имена = импорты + определенные в файле + встроенные + известные зависимости
    available = imports | defined | BUILTINS | KNOWN_DEPENDENCIES
    
    # Находим недостающие
    missing = []
    for name in sorted(used):
        if name not in available and not name.startswith("_"):
            # Проверяем, не является ли это атрибутом (например, datetime.now)
            # Если имя содержит точку, пропускаем
            if "." not in name:
                missing.append(name)
    
    return missing

def main():
    print("🔍 Сканируем все роутеры на недостающие импорты...\n")
    
    if not os.path.exists(ROUTERS_DIR):
        print(f"❌ Папка {ROUTERS_DIR} не найдена!")
        return
    
    all_issues = defaultdict(list)
    
    for filename in sorted(os.listdir(ROUTERS_DIR)):
        if filename.endswith(".py") and filename != "__init__.py":
            filepath = os.path.join(ROUTERS_DIR, filename)
            missing = scan_router(filepath)
            if missing:
                all_issues[filename] = missing
                print(f"❌ {filename}:")
                for name in missing:
                    print(f"   - {name}")
                print()
    
    if not all_issues:
        print("🎉 Все роутеры проверены! Недостающих импортов не найдено.")
        print("✅ Можешь запускать сервер!")
    else:
        print("=" * 60)
        print(f" НАЙДЕНО ПРОБЛЕМ В {len(all_issues)} ФАЙЛАХ\n")
        print("💡 ЧТО ДЕЛАТЬ:")
        print("1. Открой каждый файл из списка выше")
        print("2. Добавь недостающие импорты в начало файла:")
        print("   from dependencies import <имя1>, <имя2>, ...")
        print("3. Запусти снова python scan_errors.py для проверки")
        print("\n📝 Или запусти скрипт fix_all_imports.py (если создашь его)")

if __name__ == "__main__":
    main()