# test_all_endpoints.py
import ast
import os
import glob
import re
import requests
import json
import uuid
import sys
from urllib.parse import urlencode

# ТВОЙ RENDER URL
BASE_URL = "https://nebula-qqm2.onrender.com"

# Словарь: какие path-параметры во что подставлять
PATH_PARAM_VALUES = {
    "id": "1",
    "post_id": "1",
    "chat_id": "1",
    "user_id": "1",
    "identifier": "1",
    "username": "admin",
    "report_id": "1",
    "notif_id": "1",
    "bug_id": "1",
    "theme_id": "1",
    "update_id": "1",
    "role_id": "1",
    "cat_id": "1",
    "pack_id": "1",
    "sticker_id": "1",
    "message_id": "1",
    "warning_id": "1",
    "block_id": "1",
    "tag_name": "test",
    "filename": "test.jpg",
}

def extract_routes_from_file(filepath):
    """Парсит файл роутера и возвращает список (method, url, func_name)"""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    routes = []
    # Ищем все @router.get("/..."), @router.post("/...") и т.д.
    pattern = re.compile(
        r'@router\.(get|post|put|patch|delete|websocket)\s*\(\s*["\']([^"\']+)["\']',
        re.MULTILINE
    )
    for match in pattern.finditer(content):
        method = match.group(1).upper()
        url = match.group(2)
        routes.append((method, url))
    return routes

def replace_path_params(url):
    """Заменяет {param} на тестовые значения"""
    def replacer(match):
        param = match.group(1)
        return PATH_PARAM_VALUES.get(param, "1")
    return re.sub(r'\{(\w+)\}', replacer, url)

def register_user(session):
    """Регистрирует тестового юзера"""
    username = f"testbot_{uuid.uuid4().hex[:8]}"
    data = {
        "username": username,
        "display_name": "Test Bot",
        "password": "testpass123"
    }
    resp = session.post(f"{BASE_URL}/api/register", json=data, timeout=10)
    if resp.status_code != 200:
        print(f"❌ Регистрация не удалась: {resp.status_code} {resp.text}")
        return None
    token = resp.json().get("token")
    print(f"✅ Зарегистрирован: {username}")
    return token

def test_endpoint(session, method, url, token, headers):
    """Тестирует один эндпоинт"""
    test_url = f"{BASE_URL}{url}"
    
    try:
        if method == "GET":
            resp = session.get(test_url, headers=headers, timeout=5)
        elif method == "POST":
            resp = session.post(test_url, headers=headers, timeout=5, json={})
        elif method == "PUT":
            resp = session.put(test_url, headers=headers, timeout=5, json={})
        elif method == "PATCH":
            resp = session.patch(test_url, headers=headers, timeout=5, json={})
        elif method == "DELETE":
            resp = session.delete(test_url, headers=headers, timeout=5)
        else:
            return None
        
        return {
            "method": method,
            "url": url,
            "status": resp.status_code,
            "body": resp.text[:300] if resp.status_code == 500 else ""
        }
    except Exception as e:
        return {
            "method": method,
            "url": url,
            "status": 0,
            "error": str(e)
        }

def main():
    print(f"🚀 Тестирование API: {BASE_URL}\n")
    
    # 1. Собираем все роуты из файлов
    print(" Сканируем роутеры...")
    all_routes = []
    for filepath in glob.glob("routers/*.py"):
        routes = extract_routes_from_file(filepath)
        filename = os.path.basename(filepath)
        for method, url in routes:
            all_routes.append({
                "file": filename,
                "method": method,
                "url": url,
                "test_url": replace_path_params(url)
            })
    
    print(f"   Найдено {len(all_routes)} эндпоинтов\n")
    
    # 2. Регистрируемся
    session = requests.Session()
    token = register_user(session)
    if not token:
        print("❌ Не удалось получить токен")
        sys.exit(1)
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # 3. Тестируем каждый эндпоинт
    print("\n🧪 Тестируем эндпоинты...\n")
    
    errors_500 = []
    errors_other = []
    successes = []
    skipped = []
    
    for route in all_routes:
        result = test_endpoint(session, route["method"], route["test_url"], token, headers)
        if not result:
            continue
        
        status = result["status"]
        url = route["test_url"]
        method = route["method"]
        
        if status == 500:
            errors_500.append(result)
            print(f"❌ {method} {url} → 500")
        elif status in (200, 201, 204):
            successes.append(url)
            print(f"✅ {method} {url} → {status}")
        elif status == 401:
            skipped.append(url)
            print(f"🔒 {method} {url} → 401")
        elif status == 404:
            skipped.append(url)
            print(f"⏭️  {method} {url} → 404")
        elif status == 403:
            skipped.append(url)
            print(f"️  {method} {url} → 403")
        elif status == 400:
            skipped.append(url)
            print(f"⚠️  {method} {url} → 400")
        elif status == 405:
            skipped.append(url)
            print(f"🚫 {method} {url} → 405")
        else:
            errors_other.append(result)
            print(f"❓ {method} {url} → {status}")
    
    # 4. Выводим отчёт
    print("\n" + "="*70)
    print(f"📊 РЕЗУЛЬТАТЫ:")
    print(f"   ✅ Успешно: {len(successes)}")
    print(f"   ⏭️  Пропущено (404/401/403/400): {len(skipped)}")
    print(f"   ❌ Ошибок 500: {len(errors_500)}")
    print(f"    Других ошибок: {len(errors_other)}")
    
    if errors_500:
        print("\n" + "="*70)
        print("🚨 СПИСОК 500 ОШИБОК (нужно чинить):")
        print("="*70)
        for i, err in enumerate(errors_500, 1):
            print(f"\n  {i}. {err['method']} {err['url']}")
            if err.get('body'):
                # Пытаемся вытащить детальную ошибку из JSON
                try:
                    data = json.loads(err['body'])
                    detail = data.get('detail', err['body'])
                except:
                    detail = err['body']
                print(f"     Ошибка: {detail[:200]}")
    
    # 5. Сохраняем отчёт
    report = {
        "successes": len(successes),
        "skipped": len(skipped),
        "errors_500": len(errors_500),
        "errors_other": len(errors_other),
        "failed_endpoints": [
            {"method": e["method"], "url": e["url"], "error": e.get("body", e.get("error", ""))}
            for e in errors_500
        ]
    }
    
    with open("test_report.json", "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 Отчёт сохранён в test_report.json")
    print(f"\n Тестирование завершено!")

if __name__ == "__main__":
    main()