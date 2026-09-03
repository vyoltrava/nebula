# Nebula

## Структура проекта

| Папка | Назначение |
|---|---|
| `backend/` | FastAPI-бэкенд (WebSocket `/ws` + REST `/api/*`) |
| `l_frontend/` | ✅ **КАНОНИЧЕСКИЙ фронтенд** (Next.js). Единственная рабочая копия |
| `_backup/frontend`, `_backup/loc_frontend` | 🗄 Замороженные дубликаты старого фронтенда |

**Почему `l_frontend`:** по git-истории только она получала коммиты после 2024-08-24
(`fix&` от 2026-08-25); `frontend` и `loc_frontend` — идентичные снимки от 2026-08-24.
Дубликаты перемещены в `_backup/` 2026-08-25. Вернуть: `Move-Item _backup\frontend .`

## Сигналинг звонков (WebRTC)

Протокол ретранслируется сервером в `websocket_endpoint` (`backend/main.py`):

| Клиент шлёт `{type}` | Сервер рассылает событие | Кому |
|---|---|---|
| `call_initiate` | `call_incoming` (адресату) + `call_initiated` (инициатору, содержит сгенерированный сервером `call_id`) | |
| `call_accept` | `call_accepted` | инициатору |
| `call_reject` | `call_rejected` | инициатору |
| `call_end` | `call_ended` | собеседнику |
| `call_offer` / `call_answer` / `call_ice_candidate` | одноимённые события | собеседнику |

Дополнительно: `GET /api/ice-servers` — выдаёт клиенту iceServers для RTCPeerConnection.

## TURN для звонков через интернет

Ключи Metered.ca задаются **ТОЛЬКО на бэкенде** (Render → Environment) и никогда не попадают в клиентский бандл:

| Переменная на Render | Назначение |
|---|---|
| `METERED_API_KEY` | secretKey из dashboard.metered.live → эфемерные креды через API (приоритет). Эндпоинт: `https://vts.metered.live/api/v1/turn/credentials?apiKey=<secretKey>` |
| `METERED_USERNAME` / `METERED_PASSWORD` | статические креды — фолбэк, если API недоступен |
| `METERED_DOMAIN` | опц.: subdomain `*.metered.live` (по умолчанию `nebula`) |
| `METERED_TURN_HOST` | опц.: хост для статического фолбэка (по умолчанию `relay.metered.ca`) |

Эндпоинт выдачи: `GET /api/ice-servers` (JWT обязателен, кэш 4 минуты, таймаут Metered API 6 сек с фолбэком на статику).
Фронтенд: `useWebRTC.refreshIceServers()` дергает его перед каждым `initiateCall`/`acceptCall`.
Проверка: dev-консоль печатает `🧊 [WEBRTC] RTC config iceServers:` — там должны быть `turn:`-URL'ы.
Легаси-вариант `NEXT_PUBLIC_TURN_*` во фронтенде сохранён как резервный путь (небезопасен: ключи видны в бандле).

## Смена иконки приложения (как в Telegram)

- **PWA:** в Настройки → Внешний вид → «Иконка приложения» выбор из 7 тем. Меняются favicon, apple-touch-icon и `<link rel="manifest">` → `manifest-<theme>.json`. Установленный на Android WebAPK подхватит иконку, когда Chrome перепроверит манифест.
- **APK (Android):** иконки всех тем зашиты в билд (mipmaps `ic_launcher_<theme>`); переключение лаунчер-иконки — через `activity-alias` + нативный плагин `AppIcon` (`PackageManager.setComponentEnabledSetting`, механизм самого Telegram).
- Генерация: `node scripts/generate-icons.mjs` (все темы PWA) и `node scripts/generate-icons.mjs --android-theme=indigo` (+ mipmaps APK). Темы задаются в `THEMES` в скрипте и синхронно в `lib/pwaIcons.ts`.

## Обновления APK (GitHub Releases)

1. Собери APK и опубликуй GitHub Release: тег = версия (например `v1.1.0`), ассет — `app-release.apk`.
2. На Render (фронтенд env) задай:
   - `NEXT_PUBLIC_GITHUB_APK_REPO` — `owner/repo` с релизами (напр. `vyoltrava/trelod-app`);
   - `NEXT_PUBLIC_APP_VERSION` — версия текущего собранного APK (напр. `1.1.0`);
   - опц. `NEXT_PUBLIC_APK_ASSET_NAME` — имя ассета (по умолчанию `app-release.apk`).
3. Приложение (Capacitor-натива) проверяет последний релиз при старте и каждые 12 часов; если версия новее — показывает баннер «Доступно обновление» с кнопкой «Скачать APK» (стандартный sideload через браузер). В браузере/PWA проверка отключена.

### Индикаторы звонка в UI (CallModal)

Во время «Соединение...» под статусом выводится строка диагностики:
`ICE:<state> · H/S/R:<host/srflx/relay> · TURN:ON|OFF [err:N]`

- `TURN:OFF` → бэкенд отдал пустой iceServers ⇒ на Render НЕ заданы `METERED_*`;
- `TURN:ON`, но `R=0` после сбора кандидатов ⇒ TURN задан, но недоступен из вашей сети (DPI/провайдер);
- при `ICE:failed` появляется красная плашка с человекочитаемой причиной;
- консоль дублирует детали: `🧊 ICE candidate: <type>/<proto>`, `💧 ICE state: ...`.

## Тест сигналинга

```
cd backend
.\venv\Scripts\python.exe test_call_signaling.py --setup   # создать тестовую БД и юзеров
.\venv\Scripts\python.exe test_call_signaling.py --run     # прогнать полный сценарий звонка (нужен запущенный сервер)
```
