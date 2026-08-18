# fix_users_cache.py
import os

filepath = "routers/users.py"

if os.path.exists(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Если кэша ещё нет в импортах, добавляем его
    if "_follow_cache" not in content:
        lines = content.split("\n")
        import_added = False
        
        # Ищем существующий импорт из dependencies и дополняем его
        for i, line in enumerate(lines):
            if line.startswith("from dependencies import"):
                # Убираем возможную закрывающую скобку или добавляем через запятую
                clean_line = line.rstrip()
                if clean_line.endswith(")"):
                    clean_line = clean_line[:-1] + ", _follow_cache, _FOLLOW_CACHE_TTL, invalidate_follow_cache)"
                else:
                    clean_line += ", _follow_cache, _FOLLOW_CACHE_TTL, invalidate_follow_cache"
                lines[i] = clean_line
                import_added = True
                break
        
        # Если импорта из dependencies не нашли, создаем новый
        if not import_added:
            insert_idx = 0
            for i, line in enumerate(lines):
                if line.startswith("from ") or line.startswith("import "):
                    insert_idx = i + 1
            lines.insert(insert_idx, "from dependencies import _follow_cache, _FOLLOW_CACHE_TTL, invalidate_follow_cache")
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
        print("✅ Добавлены _follow_cache и связанные переменные в routers/users.py")
    else:
        print("✅ _follow_cache уже присутствует в routers/users.py")
else:
    print(f"⚠️ Файл {filepath} не найден. Проверь, что ты в папке backend.")