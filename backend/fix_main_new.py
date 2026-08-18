# fix_main_new.py
import os

filepath = "app_split/main_new.py"
if os.path.exists(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Исправляем импорты, добавляя префикс app_split
    content = content.replace("from routers.", "from app_split.routers.")
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ Импорты в app_split/main_new.py исправлены!")
else:
    print("⚠️ Файл app_split/main_new.py не найден.")