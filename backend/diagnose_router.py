#!/usr/bin/env python3
"""
Диагностика структуры роутеров.
Сравнивает старый main_old_backup.py с новой структурой.
"""

import os
import re
import ast
from pathlib import Path
from typing import Dict, List, Set, Tuple
from collections import defaultdict
import json

# ============================================================
# НАСТРОЙКИ
# ============================================================

OLD_MAIN = "main_old_backup.py"  # или "main.py" если не переименован
ROUTERS_DIR = "routers"
NEW_MAIN = "main_new.py"  # или "main.py"

# ============================================================
# ПАРСЕР ЭНДПОИНТОВ ИЗ ФАЙЛА
# ============================================================

def extract_endpoints_from_file(filepath: str) -> Dict[str, Dict]:
    """
    Извлекает все эндпоинты из файла.
    Возвращает: {route_name: {method, path, line, function_name, async}}
    """
    if not os.path.exists(filepath):
        print(f"❌ Файл {filepath} не найден!")
        return {}
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    endpoints = {}
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Ищем декораторы эндпоинтов
        if '@' in line and any(x in line for x in ['app.get', 'app.post', 'app.put', 'app.delete', 'app.patch', 'app.head', 'app.options']):
            # Определяем метод
            method = None
            path = None
            
            # app.get("/path") или app.get("/path", ...)
            match = re.search(r'app\.(get|post|put|delete|patch|head|options)\s*\(\s*["\']([^"\']+)["\']', line)
            if match:
                method = match.group(1)
                path = match.group(2)
            else:
                # Может быть несколько строк
                full_deco = line
                j = i + 1
                while j < len(lines) and not ('def ' in lines[j] or 'async def ' in lines[j]):
                    full_deco += ' ' + lines[j].strip()
                    j += 1
                match = re.search(r'app\.(get|post|put|delete|patch|head|options)\s*\(\s*["\']([^"\']+)["\']', full_deco)
                if match:
                    method = match.group(1)
                    path = match.group(2)
                else:
                    i += 1
                    continue
            
            # Ищем функцию
            func_line = None
            func_name = None
            is_async = False
            start_idx = i
            
            j = i + 1
            while j < len(lines):
                if 'def ' in lines[j] or 'async def ' in lines[j]:
                    func_line = lines[j]
                    func_name = re.search(r'(?:async\s+)?def\s+(\w+)\s*\(', func_line)
                    if func_name:
                        func_name = func_name.group(1)
                    is_async = 'async def' in func_line
                    break
                j += 1
            
            if not func_name:
                i += 1
                continue
            
            # Собираем тело функции до следующего декоратора
            body_lines = []
            j = j + 1
            indent = len(func_line) - len(func_line.lstrip())
            while j < len(lines):
                if lines[j].strip().startswith('@'):
                    break
                if lines[j].strip().startswith('def '):
                    break
                if lines[j].strip().startswith('async def '):
                    break
                if lines[j].strip() and not lines[j].startswith(' ' * indent):
                    if not lines[j].strip().startswith('#'):
                        break
                body_lines.append(lines[j])
                j += 1
            
            # Ключ для идентификации
            key = f"{method.upper()} {path}"
            
            endpoints[key] = {
                'method': method.upper(),
                'path': path,
                'function_name': func_name,
                'is_async': is_async,
                'line_start': i,
                'line_end': j - 1,
                'decorator': line.strip(),
                'function_def': func_line.strip() if func_line else '',
                'body': body_lines,
                'full_text': '\n'.join([line] + ([func_line] if func_line else []) + body_lines),
                'file': filepath
            }
            i = j
        else:
            i += 1
    
    return endpoints

# ============================================================
# ПОИСК ЭНДПОИНТОВ ВО ВСЕХ ФАЙЛАХ РОУТЕРОВ
# ============================================================

def extract_endpoints_from_router_file(filepath: str) -> Dict[str, Dict]:
    """Извлекает эндпоинты из файла роутера (с router.get, router.post)"""
    if not os.path.exists(filepath):
        return {}
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    endpoints = {}
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Ищем декораторы с router.
        if '@' in line and any(x in line for x in ['router.get', 'router.post', 'router.put', 'router.delete', 'router.patch']):
            method = None
            path = None
            
            match = re.search(r'router\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']', line)
            if match:
                method = match.group(1)
                path = match.group(2)
            else:
                full_deco = line
                j = i + 1
                while j < len(lines) and not ('def ' in lines[j] or 'async def ' in lines[j]):
                    full_deco += ' ' + lines[j].strip()
                    j += 1
                match = re.search(r'router\.(get|post|put|delete|patch)\s*\(\s*["\']([^"\']+)["\']', full_deco)
                if match:
                    method = match.group(1)
                    path = match.group(2)
                else:
                    i += 1
                    continue
            
            # Ищем функцию
            func_name = None
            is_async = False
            
            j = i + 1
            while j < len(lines):
                if 'def ' in lines[j] or 'async def ' in lines[j]:
                    func_name = re.search(r'(?:async\s+)?def\s+(\w+)\s*\(', lines[j])
                    if func_name:
                        func_name = func_name.group(1)
                    is_async = 'async def' in lines[j]
                    break
                j += 1
            
            if not func_name:
                i += 1
                continue
            
            key = f"{method.upper()} {path}"
            
            endpoints[key] = {
                'method': method.upper(),
                'path': path,
                'function_name': func_name,
                'is_async': is_async,
                'file': filepath,
                'full_text': '\n'.join(lines[i:j+5])
            }
            i = j
        else:
            i += 1
    
    return endpoints

# ============================================================
# ОСНОВНАЯ ДИАГНОСТИКА
# ============================================================

def diagnose():
    print("=" * 60)
    print("🔍 ДИАГНОСТИКА СТРУКТУРЫ РОУТЕРОВ")
    print("=" * 60)
    print()
    
    # 1. Проверяем наличие файлов
    if not os.path.exists(OLD_MAIN):
        print(f"❌ Старый main не найден: {OLD_MAIN}")
        print("   Использую поиск...")
        # Ищем main_old_backup или main.py
        possible = ['main_old_backup.py', 'main_old.py', 'main_backup.py', 'main.py']
        found = None
        for p in possible:
            if os.path.exists(p):
                found = p
                break
        if found:
            old_main = found
            print(f"   ✅ Найден: {found}")
        else:
            print("   ❌ Не найден ни один main файл!")
            return
    else:
        old_main = OLD_MAIN
    
    # 2. Извлекаем эндпоинты из старого main
    print(f"\n📖 Читаем {old_main}...")
    old_endpoints = extract_endpoints_from_file(old_main)
    print(f"   Найдено эндпоинтов: {len(old_endpoints)}")
    
    # 3. Извлекаем эндпоинты из всех роутеров
    print(f"\n📁 Сканируем папку {ROUTERS_DIR}/...")
    router_endpoints = {}
    router_files = []
    
    if os.path.exists(ROUTERS_DIR):
        for f in os.listdir(ROUTERS_DIR):
            if f.endswith('.py') and f != '__init__.py':
                filepath = os.path.join(ROUTERS_DIR, f)
                router_files.append(filepath)
                eps = extract_endpoints_from_router_file(filepath)
                router_endpoints.update(eps)
                print(f"   {f}: {len(eps)} эндпоинтов")
    
    print(f"\n📊 Всего в роутерах: {len(router_endpoints)} эндпоинтов")
    
    # 4. Сравнение
    print("\n" + "=" * 60)
    print("📊 СРАВНЕНИЕ")
    print("=" * 60)
    
    old_keys = set(old_endpoints.keys())
    router_keys = set(router_endpoints.keys())
    
    # Находим потерянные эндпоинты
    missing = old_keys - router_keys
    extra = router_keys - old_keys
    
    # Находим совпадающие (для проверки)
    common = old_keys & router_keys
    
    print(f"\n✅ Совпадают: {len(common)} эндпоинтов")
    print(f"❌ Потеряны (есть в старом, нет в роутерах): {len(missing)}")
    print(f"⚠️ Лишние (есть в роутерах, нет в старом): {len(extra)}")
    
    # 5. Детальный анализ потерянных
    if missing:
        print("\n" + "=" * 60)
        print("❌ ПОТЕРЯННЫЕ ЭНДПОИНТЫ (нужно добавить)")
        print("=" * 60)
        
        # Группируем по категориям
        by_category = defaultdict(list)
        
        for key in sorted(missing):
            ep = old_endpoints[key]
            # Определяем категорию
            category = 'other'
            for cat, config in ROUTER_CATEGORIES.items():
                for prefix in config.get('prefixes', []):
                    if ep['path'].startswith(prefix):
                        category = cat
                        break
                if category != 'other':
                    break
            
            by_category[category].append(ep)
            print(f"\n🔸 {key}")
            print(f"   Функция: {ep['function_name']}")
            print(f"   Async: {ep['is_async']}")
            print(f"   Строка: {ep['line_start']}")
            if ep['body']:
                preview = ' '.join(ep['body'][:2])[:100]
                print(f"   Код: {preview}...")
        
        # Показываем статистику по категориям
        print("\n📊 Потерянные по категориям:")
        for cat, eps in sorted(by_category.items()):
            print(f"   {cat}: {len(eps)}")
    else:
        print("\n🎉 Нет потерянных эндпоинтов!")
    
    # 6. Детальный анализ лишних
    if extra:
        print("\n" + "=" * 60)
        print("⚠️ ЛИШНИЕ ЭНДПОИНТЫ (есть в роутерах, нет в старом)")
        print("=" * 60)
        
        for key in sorted(extra):
            ep = router_endpoints[key]
            print(f"\n🔸 {key}")
            print(f"   Файл: {ep['file']}")
            print(f"   Функция: {ep['function_name']}")
    else:
        print("\n🎉 Нет лишних эндпоинтов!")
    
    # 7. Проверка дубликатов в роутерах
    print("\n" + "=" * 60)
    print("🔍 ПРОВЕРКА ДУБЛИКАТОВ В РОУТЕРАХ")
    print("=" * 60)
    
    # Собираем все эндпоинты с указанием файла
    all_router_eps = {}
    for filepath in router_files:
        eps = extract_endpoints_from_router_file(filepath)
        for key, ep in eps.items():
            if key in all_router_eps:
                print(f"\n⚠️ ДУБЛИКАТ: {key}")
                print(f"   Найден в: {ep['file']} и {all_router_eps[key]['file']}")
            else:
                all_router_eps[key] = ep
    
    # 8. Проверка импортов в роутерах
    print("\n" + "=" * 60)
    print("🔍 ПРОВЕРКА ИМПОРТОВ")
    print("=" * 60)
    
    # Проверяем, что в каждом роутере есть нужные импорты
    for filepath in router_files:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        filename = os.path.basename(filepath)
        
        # Проверяем наличие imports
        if 'from models_imports import' not in content:
            print(f"⚠️ {filename}: отсутствует импорт models_imports")
        
        if 'from database import get_session' not in content:
            print(f"⚠️ {filename}: отсутствует импорт get_session")
        
        if 'from routers.utils import' not in content:
            print(f"⚠️ {filename}: отсутствует импорт utils")
        
        # Проверяем создание router
        if 'router = APIRouter' not in content:
            print(f"⚠️ {filename}: отсутствует router = APIRouter()")
    
    # 9. Проверка main.py
    print("\n" + "=" * 60)
    print("🔍 ПРОВЕРКА MAIN.PY")
    print("=" * 60)
    
    if os.path.exists(NEW_MAIN):
        with open(NEW_MAIN, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Проверяем, что все роутеры импортированы
        router_names = [os.path.splitext(f)[0] for f in os.listdir(ROUTERS_DIR) 
                       if f.endswith('.py') and f != '__init__.py']
        
        for name in router_names:
            if f'from routers import {name}' not in content:
                print(f"⚠️ В main.py отсутствует импорт: {name}")
            
            if f'app.include_router({name}.router)' not in content:
                print(f"⚠️ В main.py отсутствует подключение: {name}")
    
    # 10. Итог
    print("\n" + "=" * 60)
    print("📊 ИТОГОВАЯ СТАТИСТИКА")
    print("=" * 60)
    
    print(f"\n📁 Файлы:")
    print(f"   Старый main: {old_main} ({len(old_endpoints)} эндпоинтов)")
    print(f"   Роутеры: {len(router_files)} файлов ({len(router_endpoints)} эндпоинтов)")
    
    # Оценка
    if missing:
        print(f"\n⚠️ НУЖНО ДОБАВИТЬ {len(missing)} ПОТЕРЯННЫХ ЭНДПОИНТОВ")
        print("\n📝 Чтобы добавить потерянные эндпоинты, запустите скрипт fix_missing_endpoints.py")
    elif extra:
        print(f"\n⚠️ ЕСТЬ {len(extra)} ЛИШНИХ ЭНДПОИНТОВ (возможно, это новые)")
    else:
        print("\n🎉 ВСЕ ЭНДПОИНТЫ НА МЕСТЕ! Отличная работа!")
    
    # Сохраняем результат для следующего скрипта
    result = {
        'missing': {k: old_endpoints[k] for k in missing},
        'extra': {k: router_endpoints[k] for k in extra},
        'common': len(common),
        'router_files': router_files,
        'old_main': old_main
    }
    
    with open('diagnose_result.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, default=str)
    
    print(f"\n💾 Результат сохранён в diagnose_result.json")

# ============================================================
# КАТЕГОРИИ (для группировки)
# ============================================================

ROUTER_CATEGORIES = {
    "auth": {
        "patterns": ["register", "login", "logout", "2fa", "password", "email", "me"],
        "prefixes": ["/api/register", "/api/login", "/api/2fa", "/api/me", "/api/auth"]
    },
    "users": {
        "patterns": ["users", "follow", "search", "team", "permissions"],
        "prefixes": ["/api/users", "/api/search", "/api/team", "/api/permissions"]
    },
    "posts": {
        "patterns": ["posts", "like", "bookmark", "tags", "replies", "echo", "views", "counts"],
        "prefixes": ["/api/posts", "/api/bookmarks", "/api/tags", "/api/counts"]
    },
    "chats": {
        "patterns": ["chats", "messages", "typing", "live-text", "reactions", "stickers", "secret", "session-key", "keys", "media"],
        "prefixes": ["/api/chats", "/api/messages", "/api/sticker-packs", "/api/keys", "/api/media"]
    },
    "admin": {
        "patterns": ["admin", "staff", "roles", "ip-block", "logs", "stats", "bugs", "reports"],
        "prefixes": ["/api/admin", "/api/stats", "/api/roles", "/api/reports", "/api/bugs"]
    },
    "support": {
        "patterns": ["support", "tickets"],
        "prefixes": ["/api/support"]
    },
    "updates": {
        "patterns": ["updates", "update"],
        "prefixes": ["/api/updates"]
    },
    "themes": {
        "patterns": ["themes"],
        "prefixes": ["/api/themes"]
    },
    "push": {
        "patterns": ["push", "vapid", "subscribe"],
        "prefixes": ["/api/push"]
    },
}

# ============================================================
# ЗАПУСК
# ============================================================

if __name__ == "__main__":
    diagnose()