# fix_push_model.py
import os
import glob
import re

print("🔍 Ищем файл с функцией push_subscribe...")

for filepath in glob.glob("routers/*.py"):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    if "def push_subscribe" in content:
        print(f"✅ Найдено в: {filepath}")
        
        # 1. Убираем PushSubscribeIn из импортов dependencies (если он там закрался)
        content = re.sub(r',\s*PushSubscribeIn', '', content)
        content = re.sub(r'PushSubscribeIn,\s*', '', content)
        
        # 2. Добавляем импорт BaseModel, если его нет
        if "from pydantic import BaseModel" not in content:
            content = "from pydantic import BaseModel\n" + content
            
        # 3. Готовим определение класса
        class_def = """
# 🔥 Локальное определение модели, чтобы избежать ForwardRef ошибок Pydantic
class PushSubscribeIn(BaseModel):
    endpoint: str
    p256dh: str
    auth: str

"""
        # 4. Вставляем класс сразу после router = APIRouter()
        match = re.search(r'(router = APIRouter\(\)[^\n]*\n)', content)
        if match and "class PushSubscribeIn" not in content:
            insert_pos = match.end()
            content = content[:insert_pos] + class_def + content[insert_pos:]
            
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"🚀 Исправлено: PushSubscribeIn теперь определён локально в {filepath}")
        elif "class PushSubscribeIn" in content:
            print("✅ Класс PushSubscribeIn уже определён локально, ничего не меняем.")
        else:
            print("⚠️ Не удалось найти место для вставки (router = APIRouter()).")
        break
else:
    print("❌ Файл с push_subscribe не найден в папке routers/")

print("\n💡 Теперь снова запусти: python test_openapi.py")