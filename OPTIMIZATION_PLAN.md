# OPTIMIZATION_PLAN.md

Дата: 07.09.2026 · Стек: Next.js 16 (App Router) + FastAPI + SQLModel/PostgreSQL (SQLite в dev)

## 1. Анализ текущего состояния

### Frontend (`nebula/l_frontend`)
- 174 `.tsx` файлов в `app/` + `components/`, из них **157 с `'use client'`** — почти всё клиентское.
  Это SPA-подобная соцсеть с реалтаймом (WebSocket, чаты), поэтому полностью серверными страницы не станут,
  но листья (иконки, статические блоки, markdown-рендер) можно изолировать.
- **34 использования `<img>`** вместо `next/image`.
- `next.config.ts`: уже есть `images.remotePatterns`, `removeConsole`, security-заголовки, Cache-Control для `/_next/static`.
- **Нет**: `robots.txt`, `sitemap.xml`, `loading.tsx` ни в одном маршруте, bundle-analyzer, явных `formats` (WebP/AVIF) в images.
- Дубликаты в `package.json`: `@types/react ^18` при `react ^19` (несовпадение мажоров).
- В корне `l_frontend` валяются `.backup`-файлы страниц (замусоривают repo, не влияют на бандл).

### Backend (`nebula/backend`)
- `main.py` ~14 700 строк — монолит, но уже содержит: `GZipMiddleware`, `PerfMiddleware` (X-Process-Time, p95-статистика),
  slowapi rate-limiting, Sentry SDK, `/health` endpoint, immutable Cache-Control для uploads.
- `database.py`: пулинг настроен для PostgreSQL (pool_size=20, overflow=40, pre_ping). ✅
- Синхронный SQLModel-стек + `run_in_threadpool` — ок для FastAPI, узкое место не в I/O-модели, а в N+1
  (`user_prefix_out` и подобные делают отдельные SELECT на пользователя).
- Много `*.db` тестовых файлов и `_*.py` скриптов в корне бэкенда.

### Узкие места (приоритеты)
1. **N+1 запросы** в `user_out`/списках (prefix, role на каждого пользователя) — средний приоритет.
2. Отсутствие `loading.tsx` → нет мгновенного отклика при навигации — **low-hanging fruit**.
3. `<img>` → `next/image` (34 шт.) — экономия трафика через WebP/AVIF ресайз — **low-hanging fruit**.
4. Отсутствие robots/sitemap — SEO — **low-hanging fruit**.
5. Монолит `main.py` — архитектурный долг, выносить роутеры постепенно.

## 2. Чеклист задач

### ✅ Выполнено (low-hanging fruit)
- [x] `images.formats: ['image/avif', 'image/webp']` + `minimumCacheTTL` в next.config.ts
- [x] `@next/bundle-analyzer` (env-gated: `ANALYZE=true npm run build`)
- [x] `reactStrictMode`, `poweredByHeader: false`, `compress: true` в next.config.ts
- [x] `app/robots.ts` + `app/sitemap.ts` (SEO)
- [x] `app/loading.tsx` (глобальный streaming-fallback при навигации)
- [x] Open Graph + Twitter metadata в `layout.tsx`
- [x] Фикс `@types/react` → ^19 (убран конфликт с react 19)
- [x] Скрипт `analyze` в package.json
- [x] Фикс типов `analyserRef` под React 19 (GlobalPlayer/SineWaveform)
- [x] `PERFORMANCE_REPORT.md` (отчёт)
- [x] `React.memo` для карточки `Post` (лента не ререндерит соседние при обновлениях)
- [x] Web Vitals (`ReportWebVitals` в layout, шлём метрики в Sentry)
- [x] Стикеры в `MessageBubble` → `next/image` (фикс-размеры; WebP/AVIF+lazy赶上); медиа-картинки оставлены на `<img>` с `loading="lazy"`(эластичные размеры w-full+max-h несовместимы с image-fill)
- [x] Гигиена репо: удалены тест/бэкап-файлы из git (69 шт; `*.backup`, `_*.db`, `_*.py` мусор; `*.backup`+`*.db` добавлены в `.gitignore`)
- [x] Удалены мёртвые зависимости（−4）: `react-icons`, `qrcode.react`, `@upstash/ratelimit`, `@upstash/redis` — не импортировались во фронте（QR-код генерит Python-бэкенд,rate-limit серверный）→ node_modules легче,чистый bundle（package-lock синхронизирован）

### ⏳ Средний приоритет (следующие шаги)
- [ ] Перевод 34 `<img>` на `next/image` (начать с ленты постов и аватаров — самые частые)
- [ ] N+1 для списков: батчить `user_prefix_out`/`get_system_badge_for` (`batch_get_users` уже покрыл billet/role)
- [ ] Устранение N+1: батч-загрузка префиксов/ролей (`select(UserPrefixAssign).where(user_id.in_([...]))`)
- [ ] ETag/Last-Modified middleware для GET-эндпоинтов (304 Not Modified)
- [ ] `background tasks` для push-уведомлений и Cloudinary-загрузок
- [ ] Удалить `*.backup` файлы и тестовые `*.db` из репозитория

### ⏳ Высокий приоритет (архитектурные)
- [ ] Redis-кэш для «горячих» GET (лента, профиль, счётчики непрочитанного)
- [ ] Разбиение `main.py` на APIRouter-модули (auth, feed, chat, admin, channels)
- [ ] Тяжёлые клиентские компоненты (react-easy-crop, react-markdown, qrcode) → `next/dynamic`
- [ ] Lighthouse CI + Web Vitals (`useReportWebVitals`)

### Ограничения / допущения
- CDN (Cloudflare/CloudFront), HTTP/2 и nginx-сжатие — вне репозитория (инфраструктура), см. раздел 4 плана ниже.
- Бэкап перед изменениями: коммит в git до начала работ (текущий HEAD `199eb3a`).
