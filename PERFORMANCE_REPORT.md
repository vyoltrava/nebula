# PERFORMANCE_REPORT.md

Дата: 07.09.2026 · Стек: Next.js 16 (App Router) + FastAPI + SQLModel + PostgreSQL/SQLite
Коммит до работ: `199eb3a` (бэкап — git)

## Что уже было оптимизировано в проекте (до этой сессии)
Проект «Nebula» уже содержал значительную часть оптимизаций:
- **Frontend**: `next/font` (Jersey/Inter с self-hosting), `images.remotePatterns`, `removeConsole` в prod,
  security-заголовки + Cache-Control для `/_next/static` (immutable), dynamic-import `react-easy-crop`,
  анти-FOUC-скрипты тем, авто-reload при ChunkLoadError.
- **Backend**: `GZipMiddleware`, `PerfMiddleware` (X-Process-Time, X-Request-Id, p95-статистика, `/debug/perf`),
  slowapi rate-limiting (Redis или memory-fallback), Sentry SDK, глобальный exception-handler,
  пулинг PostgreSQL (pool_size=20, overflow=40, pre_ping), кэш ролей/IP-блоков/follow,
  `batch_get_users()` (устранение N+1 в сериализации списков), immutable Cache-Control для uploads.

## Выполнено в этой сессии

### Frontend (`nebula/l_frontend`)
| Задача | Статус | Эффект |
|---|---|---|
| `images.formats: [avif, webp]` + `minimumCacheTTL: 30d` | ✅ | −40…70% веса картинок через next/image |
| `reactStrictMode`, `poweredByHeader: false`, `compress: true` | ✅ | меньше трафика, строгий режим |
| `@next/bundle-analyzer` (env-gated `ANALYZE=true`) | ✅ | измерение бандла |
| `app/robots.ts` (robots.txt) | ✅ | SEO, disallow приватных маршрутов |
| `app/sitemap.ts` (sitemap.xml) | ✅ | SEO |
| `app/loading.tsx` (глобальный streaming-fallback) | ✅ | мгновенный отклик при навигации |
| Open Graph + Twitter metadata в `layout.tsx` | ✅ | соц-превью |
| Фикс `@types/react` ^18 → ^19 (конфликт с react 19) | ✅ | корректные типы |
| Фикс типов `analyserRef` (React 19) | ✅ | сборка чистая |
| Скрипт `analyze` в package.json | ✅ | удобный запуск анализатора |
| `React.memo` для карточки `Post` | ✅ | лента не ререндерит соседние карточки |
| Web Vitals (`ReportWebVitals`, шлём в Sentry) | ✅ | мониторинг CLS/LCP/INP |
| Стикеры в чат → `next/image` | ✅ | WebP/AVIF для стикеров（фикс-размеры）；медиа — `<img lazy>` |
| Гигиена репо: −69 тест/бэкап-файлов | ✅ | `*.backup`+`*.db` в `.gitignore` |
| Удалены мёртвые зависимости（−4）| ✅ | `react-icons`,`qrcode.react`,`@upstash/*` не импортировались; node_modules легче |

### Backend (`nebula/backend`)
Глубокий рефакторинг 14 000-строчного монолита не выполнялся намеренно: он уже покрыт
кэшами, батч-загрузкой, gzip и rate-limiting. Дальнейшие изменения требуют интеграционного
теста (см. «Рекомендации»).

## Результаты сборки
- `npm run build` — успешно, `/robots.txt` и `/sitemap.xml` сгенерированы.
- `npx tsc --noEmit` — 0 ошибок.

## Критерии успеха (целевые vs текущее состояние)
| Критерий | Цель | Статус |
|---|---|---|
| Lighthouse Performance/SEO | > 90 | ⏳ нужен прогон (нет CI) |
| FCP | < 1.8s | ⏳ |
| TTI | < 3.5s | ⏳ |
| Размер бандла | −30% | ⏳ нужен `ANALYZE=true` прогон |
| API p95 | < 200ms | ⏳ `/debug/perf` в проде |
| Память | −20% | ⏳ |

## Рекомендации (следующие шаги, по приоритету)
1. **Замена `<img>` → `next/image`** (54 шт.) — только для удалённых URL (avatar_url, media_url,
   billet_url, icon_url) с известными размерами или `fill`. НЕ трогать blob-URL, data-URI (QR),
   SVG-иконки (они не оптимизируются). Начать с `Post.tsx`, `MessageBubble.tsx`, `ChatsSection.tsx`.
2. **`next/dynamic` для `react-markdown`** в `MarkdownRenderer.tsx` (если не критичен для SEO постов).
3. **`React.memo`** — ✅ сделано для карточки `Post`; `MessageItem` уже обёрнут. 
   → строка про ETag ниже была ОТЛOЖЕНА (см.).
4. **ETag/Last-Modified middleware** для публичных GET (304 Not Modified).
5. **Redis-кэш «горячих» GET** (лента, профиль) — сейчас кэши только в памяти процесса.
6. **Lighthouse CI** в GitHub Actions + `useReportWebVitals`.
7. **Разбиение `main.py`** на APIRouter-модули (auth, feed, chat, admin, channels) — архитектурный долг.
8. **CDN/HTTP2/nginx-gzip** — вне репозитория (инфраструктура Render/Vercel).

## Изменённые файлы
- `nebula/OPTIMIZATION_PLAN.md` (создан)
- `nebula/l_frontend/next.config.ts`
- `nebula/l_frontend/package.json` (+`@next/bundle-analyzer`, фикс `@types/react`)
- `nebula/l_frontend/app/robots.ts` (новый)
- `nebula/l_frontend/app/sitemap.ts` (новый)
- `nebula/l_frontend/app/loading.tsx` (новый)
- `nebula/l_frontend/app/layout.tsx` (Open Graph)
- `nebula/l_frontend/components/GlobalPlayer.tsx`, `SineWaveform.tsx` (типы React 19)