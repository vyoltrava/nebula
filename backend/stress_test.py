"""
Стресс-тест для ПРОДАКШЕНА (Render + Vercel)
"""
import asyncio
import json
import time
from typing import List
import httpx
import websockets
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich import box

console = Console()

# ==================== НАСТРОЙКИ ПРОДАКШЕНА ====================
# Твой бэкенд на Render
BACKEND_URL = "https://nebula-qqm2.onrender.com"

# Твой WebSocket на Render (обычно https меняется на wss, путь проверь в main.py)
# Если вебсокеты висят на корнем, то просто wss://nebula-qqm2.onrender.com
WS_URL = "wss://nebula-qqm2.onrender.com/ws" 

# Пути к эндпоинтам (если у тебя есть префикс /api, добавь его сюда)
API_PREFIX = "/api" 

# НАГРУЗКА (для бесплатного Render ставь маленькие числа, иначе он уснет или выдаст 502)
CONCURRENT_USERS = 3       # Одновременных "юзеров"
REQUESTS_PER_ENDPOINT = 10 # Запросов на каждый эндпоинт
WS_CONNECTIONS = 5         # WebSocket подключений
# ============================================================

class TestResult:
    def __init__(self, name: str):
        self.name = name
        self.requests: List[float] = []
        self.errors: List[str] = []
        self.first_error: str = ""
        
    def add_success(self, duration: float): self.requests.append(duration)
    def add_error(self, error: str): 
        if not self.first_error: self.first_error = error
        self.errors.append(error)
        
    @property
    def avg_time(self) -> float: return sum(self.requests) / len(self.requests) if self.requests else 0
    @property
    def success_rate(self) -> float:
        total = len(self.requests) + len(self.errors)
        return (len(self.requests) / total * 100) if total > 0 else 0

async def get_test_tokens() -> List[str]:
    console.print("\n🔐 [bold cyan]Пытаемся залогинить тестового юзера на Render...[/]")
    tokens = []
    
    # Пробуем стандартные пути логина
    login_paths = [f"{API_PREFIX}/auth/login", f"{API_PREFIX}/login", "/auth/login", "/login"]
    
    async with httpx.AsyncClient() as client:
        for path in login_paths:
            try:
                response = await client.post(
                    f"{BACKEND_URL}{path}",
                    json={"username": "lt_testuser1", "password": "password123"},
                    timeout=10.0 # На Render ответ может идти дольше
                )
                if response.status_code == 200:
                    data = response.json()
                    token = data.get("access_token") or data.get("token")
                    if token:
                        tokens.append(token)
                        console.print(f"[green]✅ Успешный логин через: {path}[/]")
                        break
            except Exception as e:
                pass
                
    if not tokens:
        console.print("[yellow]⚠️  Не удалось получить токен. Тесты пойдут без авторизации (жди 401, если эндпоинты закрыты).[/]")
    return tokens

async def test_endpoint(client: httpx.AsyncClient, method: str, endpoint: str, result: TestResult, token: str = None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    full_url = f"{BACKEND_URL}{endpoint}"
    
    start = time.perf_counter()
    try:
        if method == "GET":
            response = await client.get(full_url, headers=headers, timeout=15.0)
        
        duration = time.perf_counter() - start
        
        if response.status_code < 400:
            result.add_success(duration)
        else:
            result.add_error(f"HTTP {response.status_code}")
    except Exception as e:
        result.add_error(f"{type(e).__name__}")

async def run_http_tests(tokens: List[str]):
    console.print("\n🚀 [bold cyan]Бьем по эндпоинтам на Render...[/]")
    results = {}
    
    endpoints = [
        ("GET", f"{API_PREFIX}/posts?limit=20", "Лента (20)"),
        ("GET", f"{API_PREFIX}/chats", "Список чатов"),
        ("GET", f"{API_PREFIX}/search?q=test", "Поиск"),
    ]
    
    async with httpx.AsyncClient() as client:
        for method, endpoint, name in endpoints:
            result = TestResult(name)
            results[name] = result
            
            tasks = []
            for i in range(REQUESTS_PER_ENDPOINT):
                token = tokens[i % len(tokens)] if tokens else None
                tasks.append(test_endpoint(client, method, endpoint, result, token))
            
            await asyncio.gather(*tasks)
            
            if result.first_error:
                console.print(f"[red]⚠️  {name}: Первая ошибка -> {result.first_error}[/]")
    return results

async def run_websocket_tests():
    console.print("\n🔌 [bold cyan]Тестим WebSocket (wss://)...[/]")
    result = TestResult("WebSocket")
    
    async def connect_ws(i: int):
        start = time.perf_counter()
        try:
            # close_timeout важен, чтобы не висло
            async with websockets.connect(WS_URL, close_timeout=2) as ws:
                await ws.send(json.dumps({"type": "ping", "id": i}))
                try:
                    await asyncio.wait_for(ws.recv(), timeout=3.0)
                except asyncio.TimeoutError:
                    pass # Сервер может не отвечать на пинг, это норм
                
                duration = time.perf_counter() - start
                result.add_success(duration)
                await asyncio.sleep(1) # Держим соединение
        except Exception as e:
            result.add_error(f"{type(e).__name__}")

    tasks = [connect_ws(i) for i in range(WS_CONNECTIONS)]
    await asyncio.gather(*tasks)
    return result

def print_report(http_results, ws_result):
    console.print("\n" + "="*70)
    console.print("[bold green]📊 РЕЗУЛЬТАТЫ (ПРОДАКШЕН)[/]")
    console.print("="*70 + "\n")
    
    table = Table(title="HTTP Endpoints", box=box.ROUNDED)
    table.add_column("Эндпоинт", style="cyan")
    table.add_column("Успех", justify="right", style="green")
    table.add_column("Ошибки", justify="right", style="red")
    table.add_column("Среднее (мс)", justify="right", style="yellow")
    table.add_column("Статус", justify="center")
    
    for name, result in http_results.items():
        status = "✅" if result.success_rate > 90 else "❌"
        table.add_row(
            name, f"{len(result.requests)}", f"{len(result.errors)}", 
            f"{result.avg_time * 1000:.0f}", status
        )
    console.print(table)
    
    console.print(f"\nWebSocket: {len(ws_result.requests)} из {WS_CONNECTIONS} успешно. Ошибки: {len(ws_result.errors)}")
    if ws_result.errors:
        console.print(f"[red]Первая ошибка WS: {ws_result.first_error}[/]")
    console.print("="*70)

async def main():
    console.print(f"\n[bold magenta]🔥 СТРЕСС-ТЕСТ ПРОДАКШЕНА 🔥[/]")
    console.print(f"Бэкенд: {BACKEND_URL}")
    
    tokens = await get_test_tokens()
    http_results = await run_http_tests(tokens)
    ws_result = await run_websocket_tests()
    
    print_report(http_results, ws_result)

if __name__ == "__main__":
    asyncio.run(main())