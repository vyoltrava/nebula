# cleanup.py
import os

# Полный список всех временных скриптов, которые мы создавали
temp_files = [
    "split_monolith.py",
    "check_split.py",
    "fix_imports.py",
    "fix_root_imports.py",
    "fix_main_new.py",
    "fix_missing_imports.py",
    "fix_chats_serialize.py",
    "fix_users_cache.py",
    "fix_users_imports.py",
    "scan_errors.py",
    "smart_fix_imports.py",
    "final_fix.py",
    "fix_500_errors.py",
    "fix_syntax.py",
    "fix_track_view.py",
    "test_render.py",
    "test_all_endpoints.py",
    "test_openapi.py",
    "fix_push_model.py",
    "fix_reply_preview.py"
]

print("🧹 Начинаю уборку временных файлов...\n")

deleted_count = 0
for filename in temp_files:
    if os.path.exists(filename):
        os.remove(filename)
        print(f"🗑️ Удалён: {filename}")
        deleted_count += 1
    else:
        print(f"⏭️ Пропущен (уже удалён или не создавался): {filename}")

print(f"\n✅ Готово! Удалено {deleted_count} временных файлов.")
print("🚀 Теперь в папке остался только чистый код проекта.")