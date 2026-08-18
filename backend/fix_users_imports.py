# fix_users_imports.py
import os

filepath = "routers/users.py"
if os.path.exists(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Если кэша ещё нет в импортах, добавляем его в самый верх файла
    if "_follow_cache" not in content:
        new_import = "from dependencies import _follow_cache, _FOLLOW_CACHE_TTL, invalidate_follow_cache\n"
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_import + content)
        print("✅ Импорты в routers/users.py добавлены!")
    else:
        print("️ Всё уже есть, ничего не меняем.")
else:
    print(f"⚠️ Файл {filepath} не найден.")