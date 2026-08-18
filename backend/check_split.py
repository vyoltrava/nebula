# check_split.py
import sys
import os
import importlib

TARGET_DIR = "app_split" 

def check_imports():
    print(f"🔍 Сканируем папку {TARGET_DIR}...\n")
    errors = []
    
    # Добавляем корень проекта в sys.path
    sys.path.insert(0, os.path.abspath('.'))
    
    # Создаем __init__.py, чтобы Python считал папки пакетами
    for root, dirs, files in os.walk(TARGET_DIR):
        init_path = os.path.join(root, "__init__.py")
        if not os.path.exists(init_path):
            open(init_path, 'w').close()
    
    # 1. Проверяем dependencies.py
    dep_path = os.path.join(TARGET_DIR, "dependencies.py")
    if os.path.exists(dep_path):
        try:
            importlib.import_module(f"{TARGET_DIR}.dependencies")
            print(f"✅ {TARGET_DIR}.dependencies.py - синтаксис и импорты ОК")
        except Exception as e:
            errors.append(f"❌ {TARGET_DIR}.dependencies.py:\n   {type(e).__name__}: {e}\n")

    # 2. Проверяем все роутеры
    routers_dir = os.path.join(TARGET_DIR, "routers")
    if not os.path.exists(routers_dir):
        print(f"⚠️ Папка {routers_dir} не найдена!")
        return

    for filename in sorted(os.listdir(routers_dir)):
        if filename.endswith(".py") and filename != "__init__.py":
            module_name = f"{TARGET_DIR}.routers.{filename[:-3]}"
            try:
                mod = importlib.import_module(module_name)
                if not hasattr(mod, "router"):
                    errors.append(f"⚠️ {module_name}: В файле нет переменной 'router = APIRouter()'")
                else:
                    print(f"✅ {module_name} - импортирован успешно")
            except NameError as e:
                errors.append(f"❌ {module_name} (NameError):\n   Не найдена переменная: {e}\n")
            except ImportError as e:
                errors.append(f"❌ {module_name} (ImportError):\n   {e}\n")
            except Exception as e:
                errors.append(f"❌ {module_name} ({type(e).__name__}):\n   {e}\n")

    print("\n" + "="*50)
    if errors:
        print(f"🚨 НАЙДЕНО ОШИБОК: {len(errors)}\n")
        for err in errors:
            print(err)
        print("💡 КАК ЧИНИТЬ:")
        print("1. NameError — допиши импорт переменной в начало файла или в dependencies.py")
        print("2. ImportError — проверь, что файлы models.py, database.py лежат в корне (рядом с app_split)")
    else:
        print("🎉 ВСЕ ФАЙЛЫ УСПЕШНО ИМПОРТИРОВАНЫ! Ошибок нет.")
        print(f"🚀 Можешь запускать: uvicorn {TARGET_DIR}.main_new:app --reload")

if __name__ == "__main__":
    check_imports()