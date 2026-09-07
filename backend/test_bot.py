# ============================================================
# 🤖 ПРИМЕР РЕАЛЬНОГО БОТА (эхо-бот) для Bot API соцсети.
#
# Запуск:
#   set BOT_API=http://localhost:8000      # адрес API соцсети
#   set BOT_TOKEN=2:HHaNf...              # токен бота ("id:секрет")
#   python test_bot.py
#
# Что умеет:
#   /start  — приветствие
#   /help   — справка
#   /whoami — информация о боте (getMe)
#   любое другое сообщение — эхо-ответ
# ============================================================
import os
import sys
import time

import httpx

BASE_URL = os.getenv("BOT_API", "http://localhost:8000").rstrip("/")
TOKEN = os.getenv("BOT_TOKEN", "2:HHaNfVBDL8H-C8HGBKJzu9sdf7Ha9ZbhrXO_2r6gDVc")


def api(method: str, **params) -> dict:
    """Вызвать /bot{TOKEN}/{method}."""
    url = f"{BASE_URL}/bot{TOKEN}/{method}"
    r = httpx.post(url, json=params, timeout=60)
    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(f"{method} -> error {data.get('error_code')}: {data.get('description')}")
    return data["result"]


def handle_update(upd: dict, api_fn=None) -> None:
    """Обработать одно обновление: сообщение боту.
    api_fn — callable(method, **params) → результат; по умолчанию боевой `api`."""
    if api_fn is None:
        api_fn = api
    msg = upd.get("message", {})
    chat_id = msg.get("chat", {}).get("id")
    text = (msg.get("text") or "").strip()
    command = (upd.get("command") or "").strip()
    if not chat_id:
        return

    if not text and not command:
        return  # не текст (медиа) — игнорируем в примере

    cmd = command.lstrip("/") or text.lstrip("/").split()[0].lower() if command or text.startswith("/") else ""
    low = text.lower()

    if cmd == "start":
        reply = "Привет! Это тестовый эхо-бот 🤖.\nНапиши мне что-нибудь — отвечу тем же.\n/help — справка, /whoami — кто я."
    elif cmd == "help":
        reply = "/start — приветствие\n/help — справка\n/whoami — инфо о боте\nВсё остальное — эхо."
    elif cmd == "whoami":
        me = api_fn("getMe")
        reply = f"Я бот @{me['username']} ({me['first_name']}), id={me['id']}."
    else:
        reply = f"Вы сказали: «{text}»"

    api_fn("sendMessage", chat_id=chat_id, text=reply)
    print(f"  -> [{chat_id}] {reply}")


def main() -> None:
    me = api("getMe")
    print(f"🤖 Бот подключён: @{me.get('username')} ({me.get('first_name')}), id={me.get('id')}")
    print(f"   long polling на {BASE_URL}  (Ctrl+C — выход)\n")
    offset = 0
    while True:
        try:
            updates = api("getUpdates", offset=offset, timeout=30, limit=100)
        except RuntimeError as e:
            print("getUpdates ошибка:", e)
            time.sleep(5)
            continue
        for upd in updates:
            offset = max(offset, upd["update_id"] + 1)
            print(f"#update {upd['update_id']}")
            try:
                handle_update(upd)
            except RuntimeError as e:
                print("  !", e)
        time.sleep(0.2)  # небольшая пауза между опросами


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nБот остановлен.")
        sys.exit(0)