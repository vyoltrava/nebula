# scan_missing.py
import ast
import re
import os
from pathlib import Path

OLD_MAIN = 'main_old_backup.py'
NEW_MAIN = 'main.py'  # или 'main_new.py' — поменяй если нужно
ROUTERS_DIR = 'routers'

def extract_from_file(filepath):
    """Извлекает из файла: функции, классы, роуты"""
    if not os.path.exists(filepath):
        print(f"⚠️  Файл не найден: {filepath}")
        return {'functions': set(), 'classes': set(), 'routes': set()}
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Функции и классы через AST (надёжно)
    functions = set()
    classes = set()
    try:
        tree = ast.parse(content)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                functions.add(node.name)
            elif isinstance(node, ast.ClassDef):
                classes.add(node.name)
    except SyntaxError as e:
        print(f"️  Ошибка парсинга {filepath}: {e}")
    
    # 2. Роуты через регулярки (декораторы)
    routes = set()
    route_pattern = r'@app\.(get|post|put|patch|delete|websocket)\s*\(\s*["\']([^"\']+)["\']'
    for match in re.finditer(route_pattern, content):
        method, path = match.groups()
        routes.add(f"{method.upper()} {path}")
    
    # Также ищем @router. (для роутеров)
    router_pattern = r'@router\.(get|post|put|patch|delete|websocket)\s*\(\s*["\']([^"\']+)["\']'
    for match in re.finditer(router_pattern, content):
        method, path = match.groups()
        routes.add(f"{method.upper()} {path}")
    
    return {
        'functions': functions,
        'classes': classes,
        'routes': routes
    }

def main():
    print("=" * 80)
    print("🔍 СКАНИРОВАНИЕ: ЧЕГО НЕ ХВАТАЕТ В НОВЫХ ФАЙЛАХ")
    print("=" * 80)
    
    # 1. Читаем старый main (ТОЛЬКО ЧТЕНИЕ)
    print(f"\n📖 Читаем {OLD_MAIN} (только чтение, файл НЕ трогаем)...")
    old_data = extract_from_file(OLD_MAIN)
    print(f"   ✅ Найдено: {len(old_data['functions'])} функций, "
          f"{len(old_data['classes'])} классов, "
          f"{len(old_data['routes'])} роутов")
    
    # 2. Читаем новый main
    print(f"\n📖 Читаем {NEW_MAIN}...")
    new_main_data = extract_from_file(NEW_MAIN)
    print(f"   ✅ Найдено: {len(new_main_data['functions'])} функций, "
          f"{len(new_main_data['classes'])} классов, "
          f"{len(new_main_data['routes'])} роутов")
    
    # 3. Читаем все роутеры
    print(f"\n Сканируем папку {ROUTERS_DIR}/...")
    routers_data = {'functions': set(), 'classes': set(), 'routes': set()}
    router_files = []
    
    if os.path.exists(ROUTERS_DIR):
        for filename in sorted(os.listdir(ROUTERS_DIR)):
            if filename.endswith('.py') and filename != '__init__.py':
                filepath = os.path.join(ROUTERS_DIR, filename)
                data = extract_from_file(filepath)
                routers_data['functions'].update(data['functions'])
                routers_data['classes'].update(data['classes'])
                routers_data['routes'].update(data['routes'])
                router_files.append(filename)
                print(f"   📄 {filename}: {len(data['functions'])} функций, "
                      f"{len(data['routes'])} роутов")
    else:
        print(f"   ⚠️  Папка {ROUTERS_DIR} не найдена!")
    
    # 4. Объединяем новые данные
    all_new_functions = new_main_data['functions'] | routers_data['functions']
    all_new_classes = new_main_data['classes'] | routers_data['classes']
    all_new_routes = new_main_data['routes'] | routers_data['routes']
    
    print(f"\n   📊 ВСЕГО в новых файлах: {len(all_new_functions)} функций, "
          f"{len(all_new_classes)} классов, {len(all_new_routes)} роутов")
    
    # 5. Находим недостающее
    missing_functions = old_data['functions'] - all_new_functions
    missing_classes = old_data['classes'] - all_new_classes
    missing_routes = old_data['routes'] - all_new_routes
    
    # Фильтруем системные/внутренние функции
    skip_funcs = {'__init__', '__main__', 'print_routes', 'startup'}
    missing_functions = {f for f in missing_functions if f not in skip_funcs and not f.startswith('_')}
    
    # 6. Выводим результаты
    print("\n" + "=" * 80)
    print("📋 РЕЗУЛЬТАТЫ СРАВНЕНИЯ")
    print("=" * 80)
    
    if missing_functions:
        print(f"\n❌ НЕДОСТАЮЩИЕ ФУНКЦИИ ({len(missing_functions)}):")
        print("-" * 80)
        for func in sorted(missing_functions):
            print(f"   • {func}()")
    else:
        print("\n✅ Все функции на месте!")
    
    if missing_classes:
        print(f"\n❌ НЕДОСТАЮЩИЕ КЛАССЫ ({len(missing_classes)}):")
        print("-" * 80)
        for cls in sorted(missing_classes):
            print(f"   • {cls}")
    else:
        print("\n✅ Все классы на месте!")
    
    if missing_routes:
        print(f"\n❌ НЕДОСТАЮЩИЕ РОУТЫ ({len(missing_routes)}):")
        print("-" * 80)
        for route in sorted(missing_routes):
            print(f"   • {route}")
    else:
        print("\n✅ Все роуты на месте!")
    
    # 7. Проверка критических функций
    print("\n" + "=" * 80)
    print("🔍 ПРОВЕРКА КРИТИЧЕСКИХ ФУНКЦИЙ")
    print("=" * 80)
    
    critical = [
        'get_current_user', 'get_optional_user', 'get_current_user_optional',
        'hash_password', 'check_password', 'create_token',
        'get_user_permissions', 'has_permission', 'get_user_level',
        'check_sanction_rights', 'protect_system_account',
        'user_out', 'resolve_user',
        'cascade_delete_post', 'cascade_delete_chat',
        '_update_last_seen_sync', '_track_view_sync',
        'ensure_user_has_keys', 'get_reply_preview',
        'build_reactions_map', 'reaction_limit_for',
        'theme_to_dict', 'serialize_chat_for_user',
        'extract_cloudinary_public_id', 'get_author_role',
        'extract_tags', 'extract_mentions',
        'get_client_ip', 'is_ip_blocked', 'log_action',
        'get_role_cached', 'invalidate_role_cache',
        'invalidate_ip_block_cache', 'invalidate_follow_cache',
        'require_staff', 'require_admin', 'require_founder', 'require_announcer',
        'can_moderate', 'max_level_for', 'check_hierarchy_or_403',
        'generate_code', 'send_password_reset_email',
    ]
    
    for func in critical:
        if func in all_new_functions:
            print(f"   ✅ {func}")
        else:
            print(f"   ❌ {func} — ОТСУТСТВУЕТ!")
    
    print("\n" + "=" * 80)
    print("📊 ИТОГО:")
    print(f"   Функций: {len(missing_functions)} потеряно")
    print(f"   Классов: {len(missing_classes)} потеряно")
    print(f"   Роутов: {len(missing_routes)} потеряно")
    print("=" * 80)

if __name__ == '__main__':
    main()