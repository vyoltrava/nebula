# fix_imports_flat.py
import os
import glob

print("🔧 Убираем префикс app_split. из всех импортов...")

# 1. Фиксим main.py
if os.path.exists("main.py"):
    with open("main.py", "r", encoding="utf-8") as f:
        content = f.read()
    content = content.replace("from app_split.dependencies import", "from dependencies import")
    content = content.replace("from app_split.routers.", "from routers.")
    with open("main.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ main.py")

# 2. Фиксим все роутеры
for filepath in glob.glob("routers/*.py"):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    content = content.replace("from app_split.dependencies import", "from dependencies import")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"✅ {filepath}")

print("\n🎉 Готово! Теперь пушь и деплой.")