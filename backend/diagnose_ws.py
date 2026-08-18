#!/usr/bin/env python3
"""
Диагностика проблем с WebSocket в новой структуре
"""

import os
import re

def diagnose_ws():
    print("=" * 60)
    print("🔍 ДИАГНОСТИКА WEBSOCKET")
    print("=" * 60)
    print()

    # 1. Проверяем main.py
    print("📖 Проверяем main.py...")
    
    if not os.path.exists('main.py'):
        print("❌ main.py не найден!")
        return
    
    with open('main.py', 'r', encoding='utf-8') as f:
        content = f.read()
    
    issues = []
    
    # Проверяем импорт manager
    if 'from websocket_manager import manager' not in content:
        issues.append("❌ Нет импорта manager из websocket_manager")
    else:
        print("   ✅ manager импортирован")
    
    # Проверяем импорт get_current_user
    if 'from dependencies import get_current_user' not in content and 'from dependencies.auth import get_current_user' not in content:
        issues.append("❌ Нет импорта get_current_user из dependencies")
    else:
        print("   ✅ get_current_user импортирован")
    
    # Проверяем импорт SECRET
    if 'SECRET' not in content or 'ALGORITHM' not in content:
        issues.append("❌ Нет импорта SECRET или ALGORITHM")
    else:
        print("   ✅ SECRET и ALGORITHM импортированы")
    
    # Проверяем _update_last_seen_sync
    if '_update_last_seen_sync' not in content:
        issues.append("❌ Нет функции _update_last_seen_sync")
    else:
        print("   ✅ _update_last_seen_sync определена")
    
    # Проверяем WebSocket эндпоинт
    if '@app.websocket("/ws")' not in content:
        issues.append("❌ Нет WebSocket эндпоинта")
    else:
        print("   ✅ WebSocket эндпоинт найден")
    
    print()
    
    # 2. Проверяем websocket_manager.py
    print("📖 Проверяем websocket_manager.py...")
    
    if os.path.exists('websocket_manager.py'):
        with open('websocket_manager.py', 'r', encoding='utf-8') as f:
            ws_content = f.read()
        
        # Проверяем, что manager - это экземпляр класса
        if 'manager = ConnectionManager()' in ws_content or 'class ConnectionManager' in ws_content:
            print("   ✅ ConnectionManager определён корректно")
        else:
            issues.append("❌ websocket_manager.py не содержит ConnectionManager")
    else:
        issues.append("❌ websocket_manager.py не найден!")
    
    print()
    
    # 3. Проверяем dependencies/auth.py
    print("📖 Проверяем dependencies/auth.py...")
    
    if os.path.exists('dependencies/auth.py'):
        with open('dependencies/auth.py', 'r', encoding='utf-8') as f:
            auth_content = f.read()
        
        # Проверяем, что SECRET определён
        if 'SECRET' in auth_content:
            print("   ✅ SECRET определён")
        else:
            issues.append("❌ В dependencies/auth.py нет SECRET")
        
        # Проверяем get_current_user
        if 'def get_current_user' in auth_content:
            print("   ✅ get_current_user определён")
        else:
            issues.append("❌ В dependencies/auth.py нет get_current_user")
    else:
        issues.append("❌ dependencies/auth.py не найден!")
    
    print()
    
    # 4. Проверяем, нет ли ошибок в логах сервера
    print("📖 Проверяем возможные ошибки...")
    
    # Проверяем, что нет циклических импортов
    if 'from routers import' in content and 'from dependencies import' in content:
        # Проверяем, не импортирует ли dependencies из routers
        if os.path.exists('dependencies/auth.py'):
            with open('dependencies/auth.py', 'r', encoding='utf-8') as f:
                auth_content = f.read()
            if 'from routers' in auth_content:
                issues.append("⚠️ dependencies/auth.py импортирует из routers - может быть циклическая зависимость!")
    
    print()
    
    # 5. Итог
    print("=" * 60)
    print("📊 ИТОГ")
    print("=" * 60)
    
    if issues:
        print("\n❌ НАЙДЕНЫ ПРОБЛЕМЫ:")
        for issue in issues:
            print(f"   {issue}")
        print("\n🔧 Исправьте проблемы и перезапустите сервер")
    else:
        print("\n🎉 ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ!")
        print("   Если WebSocket всё ещё не работает, проверьте:")
        print("   1. Не запущен ли старый сервер на том же порту")
        print("   2. Нет ли ошибок в консоли сервера при подключении")
        print("   3. Проверьте путь к WebSocket в фронтенде")

if __name__ == "__main__":
    diagnose_ws()