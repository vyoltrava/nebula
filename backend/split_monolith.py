# split_monolith.py
import re
import os
from pathlib import Path

SOURCE_FILE = "main.py"  # <-- ТВОЙ МОНОЛИТ (поменяй если называется иначе)
OUTPUT_DIR = "app_split"

# Маппинг: ключевые слова в URL -> имя файла роутера
ROUTE_MAP = [
    (r"/api/auth|/register|/login|/2fa|/password-reset|/me/email", "auth"),
    (r"/api/me|/api/users|/api/follow|/api/subscribers", "users"),
    (r"/api/posts|/api/video-note|/api/tags", "posts"),
    (r"/api/chats|/api/messages|/api/stickers|/ws", "chats"),
    (r"/api/admin", "admin"),
    (r"/api/reports", "reports"),
    (r"/api/search", "search"),
    (r"/api/notifications|/api/push|/api/counts", "notifications"),
    (r"/api/support|/api/bugs", "support"),
    (r"/api/themes", "themes"),
    (r"/api/updates", "updates"),
    (r"/api/permissions|/api/roles", "permissions"),
]

def classify_route(url: str) -> str:
    for pattern, name in ROUTE_MAP:
        if re.search(pattern, url):
            return name
    return "misc"

def extract_routes(source_code: str):
    """Находит все @app.xxx блоки и возвращает dict: category -> list of code blocks"""
    routes = {}
    
    # Паттерн: @app.get("/url") или @app.post("/url") и т.д. + весь код до следующего @app или конца
    # Берём декоратор + сигнатуру + тело функции
    pattern = re.compile(
        r'(@app\.(?:get|post|put|delete|patch|websocket)\s*\(\s*["\']([^"\']+)["\'][^)]*\)\s*'
        r'(?:@\w+[^\n]*\n)*'  # дополнительные декораторы типа @limiter.limit
        r'(?:async\s+)?def\s+\w+\s*\([^)]*\)[^:]*:.*?)(?=\n@app\.|\n# ={10,}|\Z)',
        re.DOTALL
    )
    
    for match in pattern.finditer(source_code):
        block = match.group(1).strip()
        url = match.group(2)
        category = classify_route(url)
        
        if category not in routes:
            routes[category] = []
        routes[category].append(block)
    
    return routes

def extract_helpers(source_code: str):
    """Вытаскивает всё что НЕ является @app роутом (функции, классы, переменные)"""
    # Удаляем все @app блоки
    cleaned = re.sub(
        r'@app\.(?:get|post|put|delete|patch|websocket)\s*\([^)]*\)\s*'
        r'(?:@\w+[^\n]*\n)*'
        r'(?:async\s+)?def\s+\w+\s*\([^)]*\)[^:]*:.*?(?=\n@app\.|\n# ={10,}|\Z)',
        '', source_code, flags=re.DOTALL
    )
    return cleaned.strip()

def generate_router_file(category: str, blocks: list) -> str:
    header = f'''# app_split/routers/{category}.py
# Сгенерировано автоматически. Проверь импорты!

from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile, Header, Query
from sqlmodel import Session, select, delete, func
from typing import Optional, List
from datetime import datetime, timezone
import json, os

from database import get_session
from models import *
from dependencies import *

router = APIRouter()

'''
    # Заменяем @app. на @router.
    processed_blocks = []
    for block in blocks:
        block = block.replace("@app.", "@router.")
        processed_blocks.append(block)
    
    return header + "\n\n\n".join(processed_blocks) + "\n"

def main():
    print("🔨 Читаю монолит...")
    source = Path(SOURCE_FILE).read_text(encoding="utf-8")
    
    print("🔍 Ищу роуты...")
    routes = extract_routes(source)
    
    print("📦 Вытаскиваю хелперы/зависимости...")
    helpers = extract_helpers(source)
    
    # Создаём структуру
    os.makedirs(f"{OUTPUT_DIR}/routers", exist_ok=True)
    
    # Пишем зависимости
    Path(f"{OUTPUT_DIR}/dependencies.py").write_text(
        f"# Всё что не является роутом (функции, кэши, утилиты)\n# ПРОВЕРЬ ИМПОРТЫ ВРУЧНУЮ!\n\n{helpers}\n",
        encoding="utf-8"
    )
    print(f"✅ {OUTPUT_DIR}/dependencies.py ({len(helpers)} символов)")
    
    # Пишем роутеры
    total_routes = 0
    for category, blocks in sorted(routes.items()):
        content = generate_router_file(category, blocks)
        path = f"{OUTPUT_DIR}/routers/{category}.py"
        Path(path).write_text(content, encoding="utf-8")
        total_routes += len(blocks)
        print(f"✅ {path} ({len(blocks)} эндпоинтов)")
    
    # Пишем __init__.py для routers
    init_content = "# Автогенерация\n"
    for category in sorted(routes.keys()):
        init_content += f"from .{category} import router as {category}_router\n"
    Path(f"{OUTPUT_DIR}/routers/__init__.py").write_text(init_content, encoding="utf-8")
    
    # Пишем новый main.py (ТОЛЬКО подключение роутеров, старый не трогаем)
    new_main = f'''# {OUTPUT_DIR}/main_new.py
# Скопируй это В КОНЕЦ своего старого main.py
# Или замени старый main.py этим файлом после проверки

from fastapi import FastAPI
from database import init_db

# Импортируем все роутеры
'''
    for category in sorted(routes.keys()):
        new_main += f"from routers.{category} import router as {category}_router\n"
    
    new_main += '''
app = FastAPI(title="Nebula API")

# Подключаем роутеры
'''
    for category in sorted(routes.keys()):
        new_main += f"app.include_router({category}_router)\n"
    
    new_main += '''
@app.on_event("startup")
def startup():
    init_db()
    # Сюда перенеси свои SQL миграции из старого main.py
'''
    
    Path(f"{OUTPUT_DIR}/main_new.py").write_text(new_main, encoding="utf-8")
    print(f"✅ {OUTPUT_DIR}/main_new.py")
    
    print(f"\n🎉 ГОТОВО! Всего распихано {total_routes} эндпоинтов по {len(routes)} файлам.")
    print(f"📁 Всё лежит в папке '{OUTPUT_DIR}/'")
    print(f"\n⚠️  ЧТО ДЕЛАТЬ ДАЛЬШЕ:")
    print(f"1. Открой {OUTPUT_DIR}/dependencies.py — там ВСЁ кроме роутов. Проверь импорты.")
    print(f"2. Открой каждый файл в {OUTPUT_DIR}/routers/ — проверь что импорты подтянулись.")
    print(f"3. Старый main.py НЕ ТРОНУТ. Когда будешь готов — замени его на main_new.py")
    print(f"4. Запусти: uvicorn app_split.main_new:app --reload")

if __name__ == "__main__":
    main()