# fix_users_cache.py
import os

filepath = "routers/users.py"

if os.path.exists(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Проверяем, есть ли уже импорт _follow_cache
    if "_follow_cache" not in content:
        # Находим место для вставки импорта (после последнего import/from)
        lines = content.split("\n")
        insert_idx = 0
        
        # Ищем последнюю строку с импортом
        for i, line in enumerate(lines):
            if line.startswith("from ") or line.startswith("import "):
                insert_idx = i + 1
        
        # Вставляем импорт
        lines.insert(insert_idx, "from dependencies import _follow_cache, _FOLLOW_CACHE_TTL, invalidate_follow_cache")
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        
        print("✅ Добавлен импорт _follow_cache в routers/users.py")
    else:
        print("✅ _follow_cache уже импортирован")
else:
    print(f"️ Файл {filepath} не найден")