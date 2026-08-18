# fix_missing_imports.py
import os

# Словарь: файл -> список импортов, которые нужно добавить
FIXES = {
    "app_split/routers/chats.py": [
        "from app_split.dependencies import _update_last_seen_sync"
    ],
    "app_split/routers/posts.py": [
        "from app_split.dependencies import _popular_tags_cache, _POPULAR_TAGS_TTL"
    ]
}

for filepath, imports in FIXES.items():
    if os.path.exists(filepath):
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
        
        # Проверяем, нет ли уже этого импорта
        needs_fix = False
        for imp in imports:
            if imp not in content:
                needs_fix = True
                break
        
        if needs_fix:
            # Находим место после всех импортов, чтобы вставить новые
            lines = content.split("\n")
            insert_idx = 0
            for i, line in enumerate(lines):
                if line.startswith("from ") or line.startswith("import "):
                    insert_idx = i + 1
            
            # Вставляем импорты
            for imp in reversed(imports):
                lines.insert(insert_idx, imp)
            
            with open(filepath, "w", encoding="utf-8") as f:
                f.write("\n".join(lines))
            print(f"✅ Добавлены импорты в {filepath}")
        else:
            print(f"⏭️ {filepath} уже содержит нужные импорты")
    else:
        print(f"⚠️ Файл не найден: {filepath}")

print("\n🚀 Готово! Теперь закоммить и запушь изменения:")
print("git add .")
print("git commit -m 'Fix: add missing imports for _update_last_seen_sync and _popular_tags_cache'")
print("git push origin main")