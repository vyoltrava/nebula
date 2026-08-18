# fix_imports.py
import os
import glob

ROUTERS_DIR = "app_split/routers"

print("🔧 Фиксим импорты в роутерах...")
for filepath in glob.glob(os.path.join(ROUTERS_DIR, "*.py")):
    if filepath.endswith("__init__.py"):
        continue
        
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        
    # Меняем прямой импорт на абсолютный через пакет app_split
    content = content.replace("from dependencies import", "from app_split.dependencies import")
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  ✅ {os.path.basename(filepath)}")

print("\n🎉 Готово! Запускай снова python check_split.py")