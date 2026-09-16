# NEBULA — Полное описание проекта (для изучения навыков и мини-собеседований)

> Файл собран на основе реального исходного кода: `README.md`, `DOCUMENTATION.md`, `requirements.txt`, `package.json` и структуры репозитория. Используй его как шпаргалку: раздел 4 — «что я умею», раздел 6 — вопросы для самопроверки и мини-собеседований с ИИ.

---

## 1. Что это за проект

**Nebula** — анонимная социальная платформа (соцсеть + мессенджер) с E2E-шифрованием. Один продукт объединяет:

- социальную ленту (посты, лайки/дизлайки, «Эхо»-репосты, закладки, подписки, теги, Markdown);
- зашифрованный мессенджер (личные и групповые чаты, E2E-шифрование, WebRTC-звонки, видеозаметки, стикеры, реакции);
- форум предложений (треды, категории, статусы модерации) и блог обновлений;
- систему правил с версионированием;
- админ-панель (пользователи, роли, бейджи, темы, стикеры, репорты, статистика, логи, платежи);
- PWA (установка как приложение, оффлайн-кеш, Web Push);
- нативные обёртки: Android (Capacitor APK), iOS (Capacitor), Windows-десктоп (Electron, имя «trelod»);
- монетизацию: модуль платежей (продажа ролей/плашек).

Интерфейс — три «шелла» (Классика / Dock / Orbit) и 3 языка (ru, uk, en).

**Ключевые фичи приватности:**
- E2E-шифрование чатов: X25519 + AES (`@noble/ciphers`, `@noble/curves`), session key на чат; медиа шифруются клиентом до загрузки в Cloudinary.
- Регистрация без email (email опционален), 2FA (TOTP, `pyotp` + QR-коды).
- Модерация: репорты, варнинги, баны, `ActionLog`, `IPLog`, `IPBlock`.

---

## 2. Технологический стек

### 2.1 Backend (папка `backend/`)
- **Python + FastAPI** (fastapi 0.141, starlette, uvicorn) — всё приложение фактически в `main.py` (~446 КБ): ~233 REST-эндпоинта + WebSocket `/ws`, middleware, CORS, rate-limit (slowapi/limits).
- **БД:** SQLModel / SQLAlchemy 2.0 (PostgreSQL через psycopg2-binary на проде, SQLite локально), Alembic для миграций, 55 таблиц в `models.py` (User, Post, Chat, Message, Role, Badge, Theme, Payment*, Suggestion*, Prisme* и др.). Вспомогательный слой `prisma.py`, пул соединений в `database.py`.
- **Аутентификация:** JWT (PyJWT, python-jose), bcrypt + passlib, refresh-токены, 2FA (pyotp), QR (qrcode).
- **WebSocket:** `websocket_manager.py` — менеджер подключений, комнаты чатов, signaling для звонков, realtime-счётчики.
- **Web Push:** pywebpush + py-vapid, `push_service.py` (VAPID).
- **Медиа:** Cloudinary SDK (`cloudinary_config.py`), Pillow, imageio-ffmpeg (видеозаметки), OG-превью ссылок (`link_preview.py`, beautifulsoup4).
- **Платежи:** `payments.py`, `payment_providers.py`.
- **Прочее:** redis (кэш/лимиты), httpx (внешние API, TURN-креды Metered), sentry-sdk, structlog, python-dotenv, Faker (тест-данные), стресс-тест `stress_test.py`, тест signaling `test_call_signaling.py`.

### 2.2 Frontend (папка `l_frontend/` — каноническая копия)
- **Next.js 16 (App Router)** + **React 19** + **TypeScript 5**.
- **Tailwind CSS 4** (через `@tailwindcss/postcss`).
- **Криптография:** `@noble/ciphers`, `@noble/curves`, `@noble/hashes` — E2E-шифрование на клиенте (`lib/crypto.ts`).
- **UI:** lucide-react (иконки), @headlessui/react, react-easy-crop, react-markdown + remark-gfm + rehype-raw, isomorphic-dompurify (санитизация), next-themes, qrcode.react, html5-qrcode (2FA-сканер).
- **Инфраструктура lib/:** `auth.ts`, `crypto.ts`, `websocket.ts`, `webrtc.ts`, `push.ts`, `apiFetch.ts`, `stickers.tsx`, `pwa/*`, `i18n/{ru,uk,en}.ts`, `pwaIcons.ts`.
- **Хуки:** `useWebRTC`, `useWebSocket`, `useDraft`, `useLastReadPost`.
- **Компоненты (~70):** Post, Sidebar, MessageBubble, CallModal, RichEditor, CreatePost, EchoModal, PushSettings, ThemeProvider, Skeletons, LinkPreview, SmartImage, FeedTabs, RightPanel, ReportModal, VideoNoteRecorder и др.
- **Маршруты (app/):** bookmarks, messages/[id], notifications, post/[id], rules, search, settings, suggestions/*, tag/[name], updates, user/[id], support, team, stat, prism(e), admin/*, adminnew/*, login.
- **Тесты:** Vitest; анализ бандла: @next/bundle-analyzer.

### 2.3 Мобильные и десктоп
- **Android/iOS:** Capacitor (проекты `mobile/android`, `mobile/ios`), Gradle-сборка APK, смена иконки приложения через `activity-alias` + нативный плагин `AppIcon` (механизм Telegram).
- **Desktop:** Electron 33 + electron-builder 25 (NSIS-установщик .exe, `desktop/`), тихие обновления `/S`, мост `window.trelodDesktop`.
- **PWA:** манифесты по темам (`manifest-<theme>.json`), оффлайн-кеш, Web Push, 7 тем иконок, генерация иконок скриптом `scripts/generate-icons.mjs`.

### 2.4 Инфраструктура и деплой
- **Хостинг бэкенда:** Render (`render.yaml`), секреты TURN только в env бэкенда.
- **Фронтенд:** Vercel (`vercel.json`).
- **Обновления приложений:** APK и desktop-установщик деплоятся вместе с фронтом (`public/apk/update.json`, `public/desktop/update.json`); клиент проверяет версию при старте + по таймеру (APK — раз в 12 ч, desktop — каждую минуту).
- **WebRTC TURN:** Metered.ca — эфемерные креды через `GET /api/ice-servers` (JWT обязателен, кэш 4 мин, фолбэк на статические креды). Ключи никогда не попадают в клиентский бандл.
- **CI:** `.github` workflows; yarn (`yarnrc`).

### 2.5 Масштаб / метрики
- Backend: ~233 эндпоинта, 55 моделей БД.
- Frontend: ~70 компонентов, ~40 утилит/хуков, 3 языка, 3 шелла.

---

## 3. Архитектура и ключевые процессы

1. **Регистрация/вход:** `POST /api/register` → JWT; вход `/api/login` (+ `/api/login/2fa`) → access+refresh; бан проверяется на каждом запросе.
2. **Пост:** RichEditor → вложения (Cloudinary) → `POST /api/posts` → уведомления подписчикам → Web Push. Кеш постов `postCache.ts`, SmartImage.
3. **Чат:** создание → session key → шифрованный обмен по WS; медиа шифруются клиентом до загрузки.
4. **Звонок:** CallModal → signaling по WS (`call_initiate/accept/reject/end`, `call_offer/answer/ice_candidate` — сервер релеит в `websocket_endpoint`) → WebRTC P2P, ICE из `/api/ice-servers`. В CallModal — строка диагностики `ICE:<state> · H/S/R:<host/srflx/relay> · TURN:ON|OFF`.
5. **Модерация:** репорт → очередь админки → resolve/reject → варнинг/бан → запись в `ActionLog`.
6. **Поддержка:** SupportWidget → тикет → диалог с админом (`SupportTicket`).
7. **Realtime:** WebSocket для сообщений, уведомлений, счётчиков непрочитанного; синхронизация через React-контекст.

---

## 4. Карта навыков, которые демонстрирует проект

### Backend
- Python, FastAPI (REST + WebSocket в одном приложении), uvicorn.
- Проектирование реляционной схемы: 55 таблиц SQLModel/SQLAlchemy, связи, миграции Alembic.
- Аутентификация/авторизация: JWT, refresh-токены, 2FA (TOTP), bcrypt.
- Rate-limiting, middleware, CORS, обработка ошибок.
- WebSocket-менеджер с комнатами (realtime-чат + signaling).
- Интеграции сторонних API: Cloudinary, Metered (TURN), Web Push (VAPID), Sentry.
- Платёжный модуль (провайдеры, покупки ролей/плашек).
- Кэширование (redis, кэш TURN-кредов), нагрузочное тестирование (stress_test).

### Frontend
- Next.js 16 App Router, React 19, TypeScript.
- Клиентская криптография (X25519 + AES через noble-библиотеки) — редкий и сильный навык.
- WebRTC: RTCPeerConnection, ICE/TURN, диагностика соединения.
- WebSocket-клиент, автопереподключение, синхронизация состояния.
- PWA: манифесты, service worker, оффлайн, push-подписка.
- i18n (3 языка), темизация (анимированные темы + 3 шелла навигации).
- Оптимизация: кеширование постов, SmartImage, skeleton-загрузки, bundle-analyzer.
- Тестирование Vitest.

### Mobile / Desktop / DevOps
- Capacitor (Android + iOS сборки), нативные плагины, Gradle.
- Electron + electron-builder (NSIS), автообновления из своего CDN (static public/).
- Деплой: Render (backend) + Vercel (frontend), переменные окружения, секреты.
- Скрипты автоматизации релизов (`generate-icons.mjs`, `release-apk.mjs`, `release-desktop.mjs`).
- Git, работа с бэкапами и дедупликацией копий фронтенда.

---

## 5. Слабые места / зоны роста (честный разбор)
- **Монолит:** весь бэкенд в одном `main.py` (~446 КБ) — стоит освоить разбиение на модули/роутеры, DI, слои сервисов.
- **Тестов мало:** есть только тест signaling и стресс-тест; unit/integration покрытие фронтенда и бэкенда — зона роста (pytest, RTL).
- **Миграции:** есть Alembic, но также самописный `prisma.py` — стоит упорядочить один механизм.
- **Безопасность:** E2E реализован, но полезно уметь объяснить threat model, ротацию ключей, верификацию ключей собеседников (safety numbers).
- **CI/CD:** деплой через git push; можно добавить прогон тестов/линтера в CI.
- **Масштабирование:** один uvicorn-инстанс + in-memory WS-менеджер; для нескольких реплик нужен redis pub/sub / sticky sessions.

---

## 6. Как использовать файл для мини-собеседований с ИИ

Готовые промпты (копируй ИИ-собеседнику вместе с этим файлом):

1. **Общее интервью:** «Ты — senior-интервьюер. Проведи собеседование по этому проекту: задай по 3 вопроса на backend, frontend и архитектуру, дождись ответов, затем дай разбор с оценкой 1–10 по каждой области».
2. **FastAPI/Python:** «Задай 10 вопросов уровня middle по FastAPI, async, WebSocket и SQLAlchemy, основываясь на том, что в проекте используется».
3. **Frontend/React:** «Проведи техническое интервью по React 19, Next.js App Router, TypeScript и работе с WebSocket/WebRTC».
4. **Безопасность:** «Ты — security-инженер. Проведи секцию вопросов по E2E-шифрованию (X25519, AES, session keys), JWT, 2FA и PWA-безопасности».
5. **System design:** «Задай вопросы по масштабированию: как вынести WebSocket-менеджер на несколько инстансов, кэширование, rate-limiting».
6. **Рефакторинг:** «Предложи план разбиения main.py на модули (роутеры, сервисы, схемы) и оцени трудозатраты».

---

## 7. Быстрая шпаргалка (одной строкой)

Python/FastAPI · SQLModel/SQLAlchemy/PostgreSQL/Alembic · JWT/2FA/bcrypt · WebSocket · WebRTC+TURN(Metered) · Web Push/VAPID · Cloudinary · Redis · Sentry · Next.js 16/React 19/TS/Tailwind 4 · noble-crypto (X25519+AES E2E) · Vitest · PWA · Capacitor (Android/iOS) · Electron (Windows, trelod) · Render + Vercel · Git/CI.

## 8. Вопросы для самопроверки (по темам)

**Backend:** Почему WebSocket-менеджер не масштабируется горизонтально и как это исправить? Как устроен refresh-токен-флоу? Зачем кэш TURN-кредов на 4 минуты?
**Frontend:** Почему шифрование именно на клиенте и что видит сервер? Как устроено переподключение WS и восстановление состояния? Что даёт App Router против Pages Router?
**Безопасность:** Где хранится приватный ключ пользователя и что происходит при входе с нового устройства? Как защищён JWT (куда кладётся, TTL)? Почему `NEXT_PUBLIC_TURN_*` опасен?
**DevOps:** Как работает механизм автообновлений APK/desktop через `update.json`? Роли Render/Vercel в связке?
**Архитектура:** Как разбить монолит на модули? Какие таблицы БД связаны с платежами и как обеспечить идемпотентность оплаты?

---
*Составлено: 16.09.2026, по состоянию репозитория `c:\webvvv\nebula` (ветка master).*