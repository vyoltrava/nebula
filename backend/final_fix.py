# final_fix.py
import os

print("🔧 Применяем финальные исправления импортов...\n")

# 1. Чиним routers/posts.py (нужны BackgroundTasks и manager)
posts_file = "routers/posts.py"
if os.path.exists(posts_file):
    with open(posts_file, "r", encoding="utf-8") as f:
        content = f.read()
    
    needs_fix = False
    
    # Добавляем BackgroundTasks
    if "BackgroundTasks" not in content:
        if "from fastapi import APIRouter" in content:
            content = content.replace("from fastapi import APIRouter", "from fastapi import APIRouter, BackgroundTasks")
        else:
            content = "from fastapi import BackgroundTasks\n" + content
        needs_fix = True
        
    # Добавляем manager
    if "manager" not in content and "from dependencies import" in content:
        content = content.replace("from dependencies import", "from dependencies import manager, ", 1)
        needs_fix = True
        
    if needs_fix:
        with open(posts_file, "w", encoding="utf-8") as f:
            f.write(content)
        print("✅ routers/posts.py исправлен (добавлены BackgroundTasks и manager)")
    else:
        print("⏭️ routers/posts.py уже в порядке")

# 2. Ищем и чиним файл, где лежит mark_update_read (обычно updates.py или misc.py)
target_file = None
if os.path.exists("routers"):
    for fname in os.listdir("routers"):
        if fname.endswith(".py") and fname != "__init__.py":
            path = os.path.join("routers", fname)
            with open(path, "r", encoding="utf-8") as f:
                if "def mark_update_read" in f.read():
                    target_file = path
                    break

if target_file:
    with open(target_file, "r", encoding="utf-8") as f:
        content = f.read()
    
    if "UpdateRead" not in content:
        if "from models import" in content:
            content = content.replace("from models import", "from models import UpdateRead, ", 1)
        else:
            content = "from models import UpdateRead\n" + content
        
        with open(target_file, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✅ {os.path.basename(target_file)} исправлен (добавлен UpdateRead)")
    else:
        print(f"⏭️ {os.path.basename(target_file)} уже в порядке")
else:
    print("⚠️ Не удалось найти файл с функцией mark_update_read")

print("\n🚀 ГОТОВО! Теперь выполни в терминале:")
print("git add .")
print("git commit -m 'Fix: add missing BackgroundTasks, manager, and UpdateRead imports'")
print("git push origin main")