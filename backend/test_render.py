# test_render.py
import requests
import json
import sys
import uuid
from urllib.parse import urljoin

# ТВОЙ RENDER URL (поменяй если другой)
BASE_URL = "https://nebula-qqm2.onrender.com"

def register_and_login(session: requests.Session):
    """Регистрирует тестового юзера и получает токен"""
    print("🔐 Регистрируем тестового юзера...")
    
    # Генерируем случайный username локально через стандартный uuid
    random_suffix = uuid.uuid4().hex[:8]
    username = f"testbot_{random_suffix}"
    
    reg_data = {
        "username": username,
        "display_name": "Test Bot",
        "password": "testpass123"
    }
    
    try:
        resp = session.post(f"{BASE_URL}/api/register", json=reg_data, timeout=10)
        if resp.status_code != 200:
            print(f"⚠️ Регистрация не удалась: {resp.status_code} - {resp.text}")
            return None
        
        token = resp.json().get("token")
        print(f"✅ Зарегистрирован: {username}")
        print(f"   Токен: {token[:20]}...")
        return token
    except Exception as e:
        print(f"❌ Ошибка при регистрации: {e}")
        return None

def get_openapi_schema():
    """Скачивает OpenAPI схему со всеми эндпоинтами"""
    print("📡 Скачиваем OpenAPI схему...")
    try:
        resp = requests.get(f"{BASE_URL}/openapi.json", timeout=10)
        if resp.status_code != 200:
            print(f"❌ Не удалось получить схему: {resp.status_code}")
            print(f"💬 Текст ошибки от сервера:\n{resp.text}") # <-- ДОБАВИЛИ ЭТУ СТРОКУ
            sys.exit(1)
        return resp.json()
    except Exception as e:
        print(f"❌ Ошибка при скачивании схемы: {e}")
        sys.exit(1)

def test_endpoints(token: str):
    """Проходит по всем GET эндпоинтам и проверяет ошибки"""
    schema = get_openapi_schema()
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    print("\n🔍 Тестируем эндпоинты...\n")
    
    errors = []
    successes = []
    skipped = []
    
    paths = schema.get("paths", {})
    
    for path, methods in sorted(paths.items()):
        if "get" not in methods:
            continue
        
        # Пропускаем служебные
        if path in ["/docs", "/openapi.json", "/health"]:
            continue
        
        url = f"{BASE_URL}{path}"
        test_url = url
        
        # Заменяем параметры пути на тестовые значения
        for param in methods["get"].get("parameters", []):
            param_name = param["name"]
            if param["in"] == "path":
                if "id" in param_name.lower():
                    test_url = test_url.replace(f"{{{param_name}}}", "1")
                else:
                    test_url = test_url.replace(f"{{{param_name}}}", "test")
        
        try:
            resp = requests.get(test_url, headers=headers, timeout=5)
            
            if resp.status_code == 500:
                errors.append({
                    "path": path,
                    "url": test_url,
                    "status": resp.status_code,
                    "error": resp.text[:200]
                })
                print(f"❌ {path} -> 500")
            elif resp.status_code in [200, 201, 204]:
                successes.append(path)
                print(f"✅ {path} -> {resp.status_code}")
            elif resp.status_code == 404:
                skipped.append(path)
                print(f"⏭️ {path} -> 404 (нормально, нет данных)")
            elif resp.status_code == 401:
                skipped.append(path)
                print(f"🔒 {path} -> 401 (нужны доп. права)")
            else:
                skipped.append(path)
                print(f"⏭️ {path} -> {resp.status_code}")
                
        except Exception as e:
            errors.append({
                "path": path,
                "url": test_url,
                "error": str(e)
            })
            print(f"💥 {path} -> ОШИБКА: {e}")
    
    print("\n" + "="*60)
    print(f"📊 РЕЗУЛЬТАТЫ:")
    print(f"✅ Успешно: {len(successes)}")
    print(f"⏭️ Пропущено: {len(skipped)}")
    print(f"❌ Ошибок 500: {len(errors)}")
    
    if errors:
        print("\n🚨 СПИСОК ОШИБОК:")
        for err in errors:
            print(f"\n  ❌ {err['path']}")
            print(f"     URL: {err['url']}")
            if 'error' in err:
                print(f"     Ошибка: {err['error'][:150]}")
    
    return errors

def main():
    print(f"🚀 Тестирование API: {BASE_URL}\n")
    
    session = requests.Session()
    
    # 1. Регистрируемся и получаем токен
    token = register_and_login(session)
    if not token:
        print("❌ Не удалось получить токен. Выход.")
        sys.exit(1)
    
    # 2. Тестируем все эндпоинты
    errors = test_endpoints(token)
    
    # 3. Сохраняем отчёт
    if errors:
        with open("test_errors.json", "w", encoding="utf-8") as f:
            json.dump(errors, f, ensure_ascii=False, indent=2)
        print(f"\n💾 Отчёт сохранён в test_errors.json")
    
    print("\n🏁 Тестирование завершено!")

if __name__ == "__main__":
    main()