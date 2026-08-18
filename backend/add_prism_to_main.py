#!/usr/bin/env python3
"""
Автоматически добавляет prism.py в main.py, если его там нет
"""

import os
import re
from pathlib import Path

def add_prism_to_main():
    print("=" * 60)
    print("🔧 ДОБАВЛЕНИЕ PRISM.PY В MAIN.PY")
    print("=" * 60)
    print()
    
    # 1. Находим main.py
    main_files = ['main.py', 'main_new.py']
    main_file = None
    
    for f in main_files:
        if os.path.exists(f):
            main_file = f
            break
    
    if not main_file:
        print("❌ main.py не найден!")
        print("   Ищу...")
        # Ищем любой main*.py
        for f in os.listdir('.'):
            if f.startswith('main') and f.endswith('.py'):
                main_file = f
                break
        
        if not main_file:
            print("❌ Не найден ни один main файл!")
            return
    
    print(f"📖 Читаем {main_file}...")
    
    with open(main_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 2. Проверяем, есть ли уже prism
    if 'from routers import prism' in content:
        print("✅ prism уже импортирован в main.py")
        
        # Проверяем подключение
        if 'app.include_router(prism.router)' in content:
            print("✅ prism уже подключён")
            return
        else:
            print("⚠️ prism импортирован, но НЕ подключён!")
            # Добавляем подключение
            lines = content.split('\n')
            
            # Ищем место для вставки
            insert_pos = None
            for i, line in enumerate(lines):
                if 'app.include_router' in line:
                    insert_pos = i + 1
                    break
            
            if insert_pos is None:
                # Ищем перед websocket
                for i, line in enumerate(lines):
                    if '@app.websocket' in line or 'websocket_endpoint' in line:
                        insert_pos = i
                        break
                
                if insert_pos is None:
                    insert_pos = len(lines) - 1
            
            lines.insert(insert_pos, 'app.include_router(prism.router)')
            
            with open(main_file, 'w', encoding='utf-8') as f:
                f.write('\n'.join(lines))
            
            print("✅ prism подключён!")
            return
    
    # 3. Добавляем импорт
    print("⚠️ prism НЕ импортирован в main.py")
    
    lines = content.split('\n')
    
    # Ищем секцию импортов роутеров
    insert_pos = None
    
    # Сначала ищем существующую строку "from routers import"
    for i, line in enumerate(lines):
        if 'from routers import' in line:
            # Добавляем prism в существующий импорт
            if 'prism' not in line:
                lines[i] = line.rstrip().rstrip(',') + ', prism'
                print(f"   Добавлен prism в существующий импорт")
                insert_pos = i
            else:
                print("   prism уже есть в импорте")
                insert_pos = i
            break
    
    # Если нет строки "from routers import", создаём новую
    if insert_pos is None:
        # Ищем место для вставки (после других импортов)
        for i, line in enumerate(lines):
            if line.strip().startswith('from ') or line.strip().startswith('import '):
                continue
            if line.strip() and not line.strip().startswith('#'):
                insert_pos = i
                break
        
        if insert_pos is None:
            insert_pos = len(lines) - 1
        
        lines.insert(insert_pos, 'from routers import prism')
        print(f"   Создан новый импорт: from routers import prism")
    
    # 4. Добавляем подключение
    # Проверяем, есть ли уже подключение
    has_include = False
    for line in lines:
        if 'app.include_router(prism.router)' in line:
            has_include = True
            break
    
    if not has_include:
        # Ищем место для вставки подключения
        include_pos = None
        
        for i, line in enumerate(lines):
            if 'app.include_router' in line:
                include_pos = i + 1
                break
        
        if include_pos is None:
            # Ищем перед websocket
            for i, line in enumerate(lines):
                if '@app.websocket' in line or 'websocket_endpoint' in line:
                    include_pos = i
                    break
            
            if include_pos is None:
                include_pos = len(lines) - 1
        
        lines.insert(include_pos, 'app.include_router(prism.router)')
        print(f"   Добавлено подключение: app.include_router(prism.router)")
    
    # 5. Сохраняем
    with open(main_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    
    print()
    print("=" * 60)
    print(f"✅ ГОТОВО! prism добавлен в {main_file}")
    print("=" * 60)
    print()
    print("📝 Проверьте файл и перезапустите сервер:")
    print(f"   uvicorn {main_file.replace('.py', '')}:app --reload")

if __name__ == "__main__":
    add_prism_to_main()