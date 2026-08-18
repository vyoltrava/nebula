# fix_500_errors.py
import os
import glob

print("🔧 Чиним импорты для эндпоинтов с 500 ошибкой...\n")

# 1. Чиним posts.py (BackgroundTasks, manager, Like, PostView)
posts_file = "routers/posts.py"
if os.path.exists(posts_file):
    with open(posts_file, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Добавляем BackgroundTasks в fastapi импорт
    if "BackgroundTasks" not in content:
        content = content.replace(
            "from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile, Header, Query",
            "from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile, Header, Query, BackgroundTasks"
        )
    
    # Явно добавляем manager, Like, PostView, если их нет
    missing_models = []
    for model in ["Like", "PostView"]:
        if model not in content:
            missing_models.append(model)
            
    if missing_models:
        if "from models import" in content:
            content = content.replace("from models import", f"from models import {', '.join(missing_models)}, ")
        else:
            content = f"from models import {', '.join(missing_models)}\n" + content
            
    if "manager" not in content and "from dependencies import" in content:
        content = content.replace("from dependencies import", "from dependencies import manager, ")

    with open(posts_file, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ routers/posts.py исправлен")

# 2. Чиним файл с обновлениями (updates.py или misc.py)
# Ищем файл, где есть mark_update_read
target_file = None
for filepath in glob.glob("routers/*.py"):
    with open(filepath, "r", encoding="utf-8") as f:
        if "def mark_update_read" in f.read():
            target_file = filepath
            break

if target_file:
    with open(target_file, "r", encoding="utf-8") as f:
        content = f.read()
    
    if "UpdateRead" not in content:
        if "from models import" in content:
            content = content.replace("from models import", "from models import UpdateRead, ")
        else:
            content = "from models import UpdateRead\n" + content
            
        with open(target_file, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✅ {target_file} исправлен (добавлен UpdateRead)")
else:
    print("⚠️ Не удалось найти файл с mark_update_read")

print("\n🚀 Готово! Теперь закоммить и запушь.")