#!/usr/bin/env python3
"""
Исправляет ошибки в main.py:
1. Убирает дублирование prism_router
2. Исправляет импорты
3. Добавляет недостающие подключения
"""

import os
import re

def fix_main():
    print("=" * 60)
    print("🔧 ИСПРАВЛЕНИЕ MAIN.PY")
    print("=" * 60)
    print()
    
    main_file = "main.py"
    
    if not os.path.exists(main_file):
        print(f"❌ {main_file} не найден!")
        return
    
    print(f"📖 Читаем {main_file}...")
    
    with open(main_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    changes = []
    
    # ============================================================
    # 1. ИСПРАВЛЯЕМ ИМПОРТЫ
    # ============================================================
    print("\n📝 Исправляем импорты...")
    
    # Ищем неправильный импорт
    fixed_imports = []
    in_deps_import = False
    deps_import_lines = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Если видим неправильный импорт
        if 'from routers import prism' in line and 'from dependencies import' in lines[i-1] if i > 0 else False:
            # Это неправильный импорт внутри dependencies
            # Удаляем эту строку и добавляем правильный импорт отдельно
            print(f"   ⚠️ Найден неправильный импорт в строке {i+1}: {line.strip()}")
            lines[i] = ''  # Очищаем строку
            changes.append(f"Удалён неправильный импорт: {line.strip()}")
            i += 1
            continue
        
        i += 1
    
    # Удаляем пустые строки которые могли появиться
    lines = [line for line in lines if line.strip() or not line.strip()]
    
    # Добавляем правильный импорт prism, если его нет
    has_prism_import = False
    for line in lines:
        if 'from routers import prism' in line or 'from routers.prism import' in line:
            has_prism_import = True
            break
    
    if not has_prism_import:
        # Ищем место для вставки после других импортов routers
        insert_pos = None
        for i, line in enumerate(lines):
            if 'from routers.' in line and 'import' in line:
                insert_pos = i + 1
            if 'from routers import' in line:
                insert_pos = i + 1
        
        if insert_pos is None:
            insert_pos = 20  # Примерно после всех импортов
        
        lines.insert(insert_pos, 'from routers import prism')
        print(f"   ✅ Добавлен импорт: from routers import prism")
        changes.append("Добавлен импорт prism")
    
    # ============================================================
    # 2. УБИРАЕМ ДУБЛИРОВАНИЕ prism_router
    # ============================================================
    print("\n📝 Исправляем дублирование...")
    
    # Находим все подключения prism_router
    prism_lines = []
    for i, line in enumerate(lines):
        if 'app.include_router(prism.router)' in line or 'app.include_router(prism_router)' in line:
            prism_lines.append(i)
    
    # Если найдено больше 1 подключения - оставляем только первое
    if len(prism_lines) > 1:
        print(f"   ⚠️ Найдено {len(prism_lines)} подключений prism_router")
        # Оставляем только первое, удаляем остальные
        for idx in reversed(prism_lines[1:]):
            print(f"   Удаляем дубликат в строке {idx+1}: {lines[idx].strip()}")
            lines[idx] = ''  # Очищаем строку
            changes.append(f"Удалён дубликат подключения prism_router")
    
    # Приводим к единому формату
    for i, line in enumerate(lines):
        if 'app.include_router(prism_router)' in line:
            lines[i] = line.replace('prism_router', 'prism.router')
            print(f"   🔄 Исправлен формат: app.include_router(prism.router)")
            changes.append("Исправлен формат подключения prism")
            break
    
    # ============================================================
    # 3. ПРОВЕРЯЕМ ВСЕ ПОДКЛЮЧЕНИЯ
    # ============================================================
    print("\n📝 Проверяем все подключения...")
    
    # Список всех роутеров, которые должны быть
    expected_routers = [
        ('admin_router', 'admin'),
        ('auth_router', 'auth'),
        ('chats_router', 'chats'),
        ('misc_router', 'misc'),
        ('notifications_router', 'notifications'),
        ('permissions_router', 'permissions'),
        ('posts_router', 'posts'),
        ('reports_router', 'reports'),
        ('search_router', 'search'),
        ('support_router', 'support'),
        ('themes_router', 'themes'),
        ('updates_router', 'updates'),
        ('users_router', 'users'),
        ('prism_router', 'prism'),
    ]
    
    for router_var, router_name in expected_routers:
        found = False
        for line in lines:
            if f'app.include_router({router_var})' in line or f'app.include_router({router_name}.router)' in line:
                found = True
                break
        
        if not found:
            print(f"   ⚠️ Отсутствует подключение: {router_name}")
            # Добавляем подключение
            insert_pos = None
            for i, line in enumerate(lines):
                if 'app.include_router' in line:
                    insert_pos = i + 1
                    break
            
            if insert_pos is None:
                insert_pos = len(lines) - 1
            
            # Определяем правильный формат
            if router_var.endswith('_router'):
                lines.insert(insert_pos, f'app.include_router({router_var})')
                print(f"   ✅ Добавлено подключение: {router_var}")
            else:
                lines.insert(insert_pos, f'app.include_router({router_name}.router)')
                print(f"   ✅ Добавлено подключение: {router_name}.router")
    
    # ============================================================
    # 4. УДАЛЯЕМ ПУСТЫЕ СТРОКИ
    # ============================================================
    # Удаляем множественные пустые строки
    cleaned_lines = []
    prev_empty = False
    
    for line in lines:
        if not line.strip():
            if not prev_empty:
                cleaned_lines.append('')
                prev_empty = True
        else:
            cleaned_lines.append(line)
            prev_empty = False
    
    lines = cleaned_lines
    
    # ============================================================
    # 5. СОХРАНЯЕМ
    # ============================================================
    print("\n💾 Сохраняем изменения...")
    
    with open(main_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    
    # ============================================================
    # 6. ИТОГ
    # ============================================================
    print("\n" + "=" * 60)
    print("✅ ГОТОВО!")
    print("=" * 60)
    
    if changes:
        print("\n📝 Внесённые изменения:")
        for change in changes:
            print(f"   • {change}")
    else:
        print("\n📝 Изменений не потребовалось")
    
    print("\n🚀 Теперь можно запускать сервер:")
    print("   uvicorn main:app --reload")
    
    # Проверяем финальный результат
    with open(main_file, 'r', encoding='utf-8') as f:
        final_content = f.read()
    
    # Проверяем, что нет дубликатов
    prism_count = final_content.count('app.include_router(prism.router)')
    if prism_count > 1:
        print(f"\n⚠️ ВНИМАНИЕ! Всё ещё найдено {prism_count} подключений prism.router")
        print("   Проверьте файл вручную и удалите лишние")
    
    print("\n📋 Проверьте что в main.py есть:")
    print("   1. from routers import prism")
    print("   2. app.include_router(prism.router) (только один раз!)")

if __name__ == "__main__":
    fix_main()