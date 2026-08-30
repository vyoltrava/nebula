# PWA Setup & Upgrade — trelod / Nebula (FastAPI + Next.js)

Этот документ описывает готовую конфигурацию PWA (уже внедрена в репозиторий),
как её разворачивать, что проверять и как чинить частые проблемы.

Архитектура:
- **Frontend**: Next.js 16 (App Router), `l_frontend/`
- **Backend**: FastAPI, `backend/`
- **Service Worker**: ручная реализация (`public/sw.js`), без workbox — меньше зависимостей и полный контроль. Код написан в ES5, чтобы работать на старых браузерах.

---

## 1. Что было сделано (аудит + апгрейд)

### Было:
- `app/manifest.json` ссылался на `/icon-192.png`, `/icon-512.png` — **файлов не было** (битые иконки).
- `layout.tsx` ссылался на `/site.webmanifest` — **файла не было**.
- `public/sw.js` — простой Network-First, без precache-стратегий, фоновой синхронизации и offline.html.
- `PWARegister` — голый `register()` без обработки обновлений.
- `InstallPrompt` — без поддержки iOS и события `appinstalled`.

### Стало:
1. **Иконки** — `scripts/generate-icons.mjs` (sharp) генерирует 9 размеров `any` + 9 `maskable` в `public/pwa/`, плюс `apple-touch-icon.png` и `favicon-32.png`.
2. **Манифест** — `public/manifest.json` (все размеры, maskable, категории, description, lang/dir, shortcuts, related_applications, display_override). Ссылка в `layout.tsx` исправлена на `/manifest.json`.
3. **Service Worker** — `public/sw.js` v2:
   - Navigation → Network First, fallback `offline.html`
   - API GET → Network First, fallback кэш
   - Статика Next.js / шрифты / изображения → Cache First
   - Остальной контент → Stale While Revalidate
   - Precache критических файлов при install
   - Фоновая синхронизация мутаций (POST/PUT) через IndexedDB + Background Sync
   - Периодический sync (где поддерживается)
   - Push-уведомления + click-to-open
   - Умное обновление: skipWaiting + сообщение `SW_UPDATED` клиентам
4. **Offline-страница** — `public/offline.html` (брендированная, авто-переподключение).
5. **Компоненты**:
   - `PWARegister.tsx` — регистрация + баннер «Доступна новая версия» + мягкая перезагрузка.
   - `InstallPrompt.tsx` — нативная установка + iOS-подсказка «На экран „Домой“» + `appinstalled`.
   - `ConnectionStatus.tsx` — индикатор офлайн/синхронизация.
6. **Утилиты** — `lib/pwa/{register,cache,syncQueue,index}.ts`:
   - регистрация с жизненным циклом и периодическим sync,
   - работа с кэшами (очистка/просмотр),
   - очередь мутаций `queueableFetch` (подключена в `lib/api.ts`).
7. **Заголовки** — `next.config.ts`: CSP, Cache-Control для `/sw.js` (no-cache), `/manifest.json`, `/pwa/*` (immutable), `/_next/static/*` (immutable). FastAPI `backend/main.py`: PWA-мидлварь (безопасность + Cache-Control для uploads/API) и эндпоинт `/api/pwa/version`.

---

## 2. Развертывание

### Шаг 0 — сгенерировать иконки (при изменении логотипа)
```bash
cd l_frontend
npm i          # удостоверьтесь, что sharp установлен
node scripts/generate-icons.mjs
```

### Шаг 1 — фронтенд
```bash
cd l_frontend
npm install
npm run build
npm start       # или деплой на Vercel/Render через next start
```

### Шаг 2 — бэкенд
```bash
cd backend
python -m venv venv            # если ещё нет
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
# На проде — gunicorn + uvicorn workers за реверс-прокси (Caddy/Nginx)
```

### Шаг 3 — HTTPS (обязательно для PWA)
PWA работает только через **HTTPS** (кроме `localhost`). На проде:
- Vercel/Render дают HTTPS автоматически.
- На своём сервере — Caddy (авто Let's Encrypt) или Nginx + certbot.
- Убедитесь, что `Strict-Transport-Security` отдаётся (добавлен в `next.config.ts`).

### Шаг 4 — переменные окружения
| Переменная | Где | Зачем |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | frontend `.env.local` | адрес API (без трейлинг-слеша) |
| `FRONTEND_URL` | backend | CORS origin |
| `VAPID_PRIVATE_PEM`, `VAPID_PUBLIC_B64` | backend (env на сервере) | push-уведомления (иначе ключи сохраняются в `vapid_keys.json`) |

---

## 3. Проверка внедрённых пунктов

- [ ] Манифест по пути `/manifest.json` (все иконки существуют в `public/pwa/`).
- [ ] SW `/sw.js` отдаётся с `Cache-Control: no-cache` и `Service-Worker-Allowed: /`.
- [ ] `offline.html` в precache — при первом заходе кладётся в кэш.
- [ ] Стратегии: статика/картинки Cache-First, навигация/API Network-First, контент SWR.
- [ ] Мутации API (через `apiFetch`) помечаются `X-Nebula-Queueable: 1` → очередь при офлайне.
- [ ] Баннер обновления появляется при новой версии SW.
- [ ] iOS-подсказка установки (только Safari, раз в 14 дней).
- [ ] Заголовки: CSP, Cache-Control для `/pwa/*`, `/_next/static/*`.
- [ ] Backend: `/api/pwa/version`, мидлварь безопасности, Cache-Control для `/uploads/*`.

---

## 4. Чеклист тестирования

### Браузеры
- [ ] Chrome / Edge (Android + Windows/macOS)
- [ ] Firefox
- [ ] Safari (iOS + macOS)

### Установка
- [ ] Показывается кастомная кнопка «Установить приложение» (не нативный попап).
- [ ] На iOS появляется подсказка «На экран „Домой“».
- [ ] После установки — `display-mode: standalone`, собственный экран целиком.

### Offline
- [ ] Сценарий 1: открыли ленту → выключили сеть → перезагрузили → лента из кэша.
- [ ] Сценарий 2: нет сети, открыли новый URL → показывается `offline.html`.
- [ ] Сценарий 3: отправка в офлайне → запрос в очереди → при восстановлении сети синхронизируется (проверить в Network).
- [ ] Индикатор статуса появляется и исчезает.

### Обновление SW
- [ ] Выложили новую версию → на старых вкладках появился баннер.
- [ ] «Обновить сейчас» → skipWaiting → перезагрузка → новая версия активна.
- [ ] Старые кэши удаляются (проверить в Application → Cache Storage).

### Push
- [ ] Подписка создаётся, `send_push` отправляет, клик по уведомлению открывает нужный URL.
- [ ] Мёртвые подписки (HTTP 410) чистятся бэкендом.

### Производительность (DevTools → Network, throttling Slow 3G)
- [ ] Первая загрузка < 2–3 c (критический CSS инлайн из коробки React Server Components).
- [ ] Повторные визиты мгновенные (Cache-First).
- [ ] Lighthouse PWA ≥ 90 (см. раздел 5).

---

## 5. Lighthouse PWA score

1. Build + старт на проде: `npm run build && npm start`.
2. Откройте https://ваш-домен.
3. DevTools → Lighthouse → категория **PWA**.
4. Проверки:
   - **Installable**: valid manifest + SW с fetch-обработчиком → уже есть.
   - **PWA Optimized**: HTTPS, viewport, theme-color → уже есть.

Замечания:
- `apple-mobile-web-app-capable` выставляется через `appleWebApp.capable` в `layout.tsx`.
- Если Lighthouse ругается на отсутствие `screenshots` — заполните `"screenshots"` в `manifest.json` (для промо в Play Store).

---

## 6. Troubleshooting

### PWA не устанавливается
- Нет HTTPS → включите HTTPS.
- Битая иконка → перегенерируйте `node scripts/generate-icons.mjs`.
- Манифест не подтягивается → проверьте `/manifest.json` (должен быть в `public`) и ссылку в layout.
- `beforeinstallprompt` не срабатывает → Chrome требует: HTTPS + валидный манифест + SW + «pwa whisper» (несколько визитов). Откройте второй раз.

### SW не обновляется
- Проверьте Cache-Control для `/sw.js`: должен быть `no-cache`.
- Увеличьте `VERSION` в `public/sw.js` — браузер увидит другой байт и поставит новую версию.
- DevTools → Application → Service Workers → **Update** / **Unregister** + перезагрузка.

### Offline не работает
- Первый визит должен быть онлайн (precache делает при install).
- `offline.html` обязан быть в `PRECACHE_URLS` в `public/sw.js`.
- Cross-origin запросы SW не перехватывает — это нормально.

### Очередь мутаций не отправляется
- Заголовок `X-Nebula-Queueable: 1` добавляется только через `apiFetch`/`queueableFetch`.
- Background Sync не во всех браузерах; где его нет, SW отправит очередь при событии навигации/`online`.
- Проверьте IndexedDB `nebula-sync/sync-queue` (Application → IndexedDB).

### CSP ломает картинки/скрипты
- Текущий CSP разрешает `img-src 'self' data: blob: https:`, `connect-src 'self' ws: wss: https:`.
- Подключаете внешнюю аналитику/шрифты/кдн → добавьте их источники в `next.config.ts` (CSP).

### Заголовки не видны в dev
- `next.config.ts` применяет `headers()` только в production (`if (isDev) return []`).

---

## 7. Структура PWA-файлов

```
l_frontend/
├─ public/
│  ├─ manifest.json            # полный манифест
│  ├─ sw.js                    # service worker v2
│  ├─ offline.html             # offline-страница
│  ├─ pwa/                     # сгенерированные иконки
│  └─ apple-touch-icon.png
├─ scripts/generate-icons.mjs  # генератор иконок (sharp)
├─ lib/pwa/
│  ├─ register.ts              # регистрация + жизненный цикл + периодический sync
│  ├─ cache.ts                 # работа с кэшами
│  ├─ syncQueue.ts             # очередь мутаций (клиент)
│  └─ index.ts
├─ components/
│  ├─ PWARegister.tsx          # регистрация + баннер обновления
│  ├─ InstallPrompt.tsx        # установка + iOS
│  └─ ConnectionStatus.tsx     # индикатор сети
└─ next.config.ts              # CSP, Cache-Control, Service-Worker-Allowed
backend/
└─ main.py                     # PWA-мидлварь + /api/pwa/version
```

---

## 8. Ключевые решения и ограничения

- **Нет workbox**: ручной SW — меньше кода, ES5, полный контроль, ноль NPM-зависимостей в рантайме SW.
- **Периодический и Background Sync** работают только в Chromium; остальные браузеры идут по событию `online` / повторной навигации.
- **Очередь мутаций** интегрирована в `lib/api.ts#apiFetch`. Если есть среда с прямым `fetch` для POST/PUT — оберните через `queueableFetch`.
- **HTTP/2 Server Push** в Next.js отсутствует; вместо него — immutable-кэши + SW Cache-First (эффект близкий, без накладных расходов Push).
- **Next/image**: инфраструктура завязана на произвольные внешние URL (Cloudinary/uploads), поэтому используется лёгкий `SmartImage` (`loading=lazy`, `decoding=async`). Для полностью своих ассетов можно перейти на `next/image` + `remotePatterns`.