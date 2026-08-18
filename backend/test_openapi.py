# test_openapi.py
import sys
import os
import traceback

# Добавляем текущую директорию в пути поиска модулей
sys.path.insert(0, os.path.abspath('.'))

print("🔍 Пытаемся импортировать приложение и сгенерировать OpenAPI схему...\n")

try:
    # Импортируем app из main.py
    from main import app
    print("✅ main.py успешно импортирован")
    
    # Пытаемся сгенерировать схему (это то, что делает FastAPI при запросе /openapi.json)
    print("⚙️  Генерируем OpenAPI схему...")
    schema = app.openapi()
    
    print(f"🎉 УСПЕХ! Схема сгенерирована. Найдено {len(schema.get('paths', {}))} эндпоинтов.")
    print("⚠️  Если схема генерируется локально, но падает на Render, значит проблема в различии версий Python или переменных окружения.")
    
except Exception as e:
    print("\n" + "="*70)
    print("❌ НАЙДЕНА ПРИЧИНА ОШИБКИ 500 НА /openapi.json:")
    print("="*70)
    traceback.print_exc()
    print("\n💡 Скопируй этот вывод (особенно последние строки с именем файла и номером строки) и скинь мне. Мы точно узнаем, где проблема!")