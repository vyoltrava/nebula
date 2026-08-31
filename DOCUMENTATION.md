# NEBULA — Техническое задание / Коммерческое предложение

> Документ подготовлен на основе анализа реального исходного кода проекта. Все описанные функции реализованы, кроме случаев с явной пометкой «в планах» / «не реализовано».

---

## 1. О проекте

### 1.1 Название
**Nebula** — анонимная социальная платформа (соцсеть + мессенджер) с E2E-шифрованием.

### 1.2 Краткое описание
Nebula — полнофункциональная веб-платформа, объединяющая в одном продукте:
- социальную ленту (посты, лайки, эхо-репосты, закладки, подписки, теги);
- зашифрованный мессенджер (личные и групповые чаты, E2E-шифрование, WebRTC-звонки, видеозаметки, стикеры, реакции);
- форум предложений (треды, категории, статусы модерации) и блог обновлений;
- систему правил с версионированием;
- развитую админ-панель (пользователи, роли, бейджи, темы, стикеры, репорты, статистика, логи, платежи);
- PWA: устанавливается как приложение, оффлайн-кеш, Web Push.

Интерфейс имеет три «шелла» (режима): **Классика**, **Dock** и **Orbit** (орбитальная навигация, 2 уровня), переключаются пользователем на лету.

### 1.3 Целевая аудитория
- Сообщества, для которых важна приватность: анонимное общение, E2E-чаты, шифрованные медиа.
- Блогеры и создатели контента — Markdown-посты, теги, изображения, видеозаметки.
- Владельцы онлайн-сообществ — модерация, кастомные роли, система бейджей, монетизация (продажа ролей/плашек).

### 1.4 Ключевая ценность
| Ценность | Реализация в коде |
|---|---|
| Приватность сообщений | E2E-шифрование чатов (X25519 + AES, `@noble/ciphers/curves`), шифрованные медиа, session keys на чат |
| Анонимность | Регистрация без email (email опционален) |
| Полный цикл соцсети | Лента, подписки, бейджи, уведомления, PWA с push |
| Гибкая кастомизация | Анимированные темы (aurora/gradient/liquid/neon), 3 шелла, кастомные плашки, стикеры |
| Готовая монетизация | Модуль платежей (`payments.py`) — продажа ролей/плашек |
| Модерация | Репорты, варнинги, баны, журналирование (`ActionLog`, `IPLog`, `IPBlock`) |

---

## 2. Полный функционал (по разделам)

### 2.1 Home — главная лента
**Назначение:** основной контент-хаб — просмотр и публикация постов.

**Функционал:**
- Лента с подгрузкой и скелетонами (`Skeletons.tsx`); табы «все / подписки» (`FeedTabs.tsx`, `/api/posts`, `/api/posts/following`).
- Создание поста (`CreatePost.tsx`, `RichEditor.tsx`): Markdown-редактор с тулбаром, изображения (Cloudinary), теги, черновики (`Draft`, `useDraft.ts`), видеозаметки (`VideoNoteRecorder.tsx`, `/api/video-note`).
- Взаимодействие (`Post.tsx`): лайк/дизлайк, «Эхо» — репост с комментарием (`EchoModal.tsx`), репост, закладка, ответы (`/api/posts/{id}/replies`), счётчик просмотров (`PostView`), метка «прочитано» (`LastReadPost`), удаление своего поста, репорт (`ReportModal.tsx`).
- Страницы: `/post/[id]`, `/tag/[name]`, `/user/[id]`; возврат к последней прочитанной позиции ленты (`LastReadPost`).
- Превью ссылок (`LinkPreview.tsx` + `link_preview.py`), Markdown с GFM и санитизацией (DOMPurify).
- Поиск по постам/пользователям/тегам `/search` (`/api/search`).
- Рекомендуемые пользователи в правой панели (`RightPanel.tsx`).

**Взаимодействие:** уведомления о лайках/ответах/подписках; закладки → Bookmarks; теги → страницы тегов; автор → профиль.

**Особенности:** кеш постов (`postCache.ts`), `SmartImage` для изображений.

### 2.2 Bookmarks — закладки
**Назначение:** личная коллекция сохранённых постов.
- Добавление/снятие из ленты (`/api/posts/{id}/bookmark`), список `/bookmarks` (`/api/bookmarks`), переход к посту.
- Поиск, папки, фильтры внутри закладок — **не реализовано (в планах)**; сейчас плоский список с удалением.

### 2.3 Community — сообщество
**Назначение:** блог обновлений платформы + форум предложений. Табы: `CommunityTabs.tsx`.

**Таб «Обновления» (блог):**
- Лента официальных обновлений (`Update`, `/api/updates`).
- Прочитанность: индивидуально (`UpdateRead`, `/api/updates/{id}/read`) и «прочитать всё».
- Публикация/удаление обновлений — права админа.

**Таб «Предложения» (форум):**
- Категории (`SuggestionCategory`), треды (`SuggestionThread`, `/suggestions/thread/[id]`), комментарии.
- Статусы тредов: закрепление, закрытие, смена статуса и префикса.
- Админ-модерация: перемещение тредов, управление префиксами (`/api/admin/suggestion-prefixes`).

### 2.4 Rules — правила
**Назначение:** публичные правила платформы.
- Отображение (`SiteRules`, `/api/rules`): страница `/rules` + модальное окно `RulesModal.tsx` при первом входе (онбординг через `AuthGuard`).
- Редактирование — админ (`PUT /api/rules`).
- Полная история версий правил в UI — **в планах** (версионирование хранится в модели).

### 2.5 Settings — настройки
**Назначение:** управление аккаунтом. `/settings` (+ тема `/nebula-settings`).
- **Профиль:** display name (история ников `NickHistory`), bio, аватар с кроппером (`AvatarCropper`), обложка профиля, выбор бейджа (`BadgeSelector`), кастомная плашка (`/api/me/custom-badge`).
- **Уведомления:** Web Push (`PushSettings.tsx`, VAPID, subscribe/unsubscribe), live-text (`LiveTextSettings.tsx` — показ/трансляция набора текста).
- **Приватность:** настройки live-text, prism-anchor (`/api/users/me/prism-anchor`).
- **Внешний вид:** светлая/тёмная тема (`next-themes`), анимированные фоны (`/api/themes`), выбор шелла интерфейса (`ShellSwitcherGate`, переключение без перезагрузки), язык (ru / uk / en, `LanguageSwitcher`).
- **Безопасность:** смена пароля, **2FA TOTP** (setup/activate/disable, резервные коды, QR), «выйти со всех устройств» (`token_version`), разрешения устройств (`DevicePermissionsSection`).
- **Аккаунт:** мультиаккаунт (`AccountSwitcher.tsx`).

### 2.6 Messages — мессенджер
**Назначение:** real-time чаты с шифрованием. `/messages`, `/messages/[id]`.
- Список чатов + счётчик непрочитанных (`UnreadCountsContext`, `/api/chats/unread-count`).
- Личные и **групповые** чаты: создание (`CreateGroupModal`), участники, настройки, аватар, удаление.
- **E2E-шифрование:** session keys на чат, шифрованные медиа (`EncryptedMediaPlayer`), «секретные» чаты (`/api/chats/secret`), чат «Избранное».
- **Real-time:** WebSocket `/ws`, typing-индикатор, live-text (видимость набора символов).
- **Сообщения:** отправка, редактирование, удаление, пересылка, ответы, реакции, стикеры, закрепление (сообщений и чатов), медиа-галерея чата, свайпы (`useSwipe`).
- **Вложения:** изображения, зашифрованные медиа, **видеозаметки** (запись с камеры/микрофона), аудиоплеер (`GlobalPlayer`).
- **Звонки:** аудио/видеозвонки WebRTC (`CallModal`, `useWebRTC.ts`, signaling через WS, ICE `/api/ice-servers`).
- **Prism-чаты** — доступ по «объекту-ключу» (`/api/chats/prism`).

### 2.7 Notifications — уведомления
**Назначение:** единый центр событий. `/notifications`.
- Типы (`Notification`): лайк, дизлайк, ответ, эхо, подписка, системные.
- Список, счётчик непрочитанных, отметка одного / всех прочитанных.
- **Web Push** в фоне (`push_service.py`, pywebpush + VAPID, сервис-воркер).
- In-app push через WebSocket — мгновенная доставка.
- Бейджи-счётчики в сайдбаре (`UnreadCountsContext`).
- **Интерактив:** клик ведёт к посту/профилю/чату-источнику.

### 2.8 Admin Panel — ⛔ НЕ ТРОГАТЬ (только для админов)
> Разделы `/admin/*` и `/adminnew/*` — исключительно для администраторов. API защищено server-side (`is_admin`). Ниже — описание для владельца проекта.

| Модуль | Возможности |
|---|---|
| Пользователи | список, бан/разбан, варнинги, назначение модератора, сброс 2FA, удаление аватара, удаление всех постов |
| Роли | CRUD ролей и категорий, порядок, назначение, `RoleHistory` |
| Бейджи | стоковые, системные (по уровню), кастомные плашки (иконка/фон), шаблоны, выдача/отзыв/продление |
| Репорты | очередь жалоб, resolve/reject |
| Чаты | просмотр любых чатов и сообщений |
| Стикеры | CRUD стикерпаков и стикеров, сортировка |
| Темы | CRUD анимированных тем, уровни доступа (`min_level`), вкл/выкл |
| Тех. раздел | логи (`ActionLog`, `IPLog`), IP-блокировки, статистика (`/api/admin/stats/*`), `/debug/perf` |
| Платежи | продажа ролей (`PaymentRole`, `PaymentPurchase`) |
| Suggestions | модерация форума предложений, префиксы |
| Bugs / Support | баг-трекинг, тикеты поддержки |
| Prisme | сцены-ключи доступа, объекты, статистика |

---

## 3. Техническая часть

### 3.1 Стек технологий

**Frontend (`l_frontend/`)**
| Технология | Назначение |
|---|---|
| Next.js 16 (App Router) + React 19 + TypeScript 5 | фреймворк, роутинг |
| Tailwind CSS 4 | стили, темы |
| @noble/ciphers, curves, hashes | E2E-шифрование на клиенте |
| react-markdown + remark-gfm + rehype-raw, isomorphic-dompurify | Markdown + санитизация |
| react-easy-crop, qrcode.react, lucide-react, headlessui | кроп, QR 2FA, иконки, UI-примитивы |
| next-themes | светлая/тёмная тема |
| @upstash/ratelimit, @upstash/redis | rate-limit интеграция |
| Vitest, ESLint | тесты, линт |

**Backend (`backend/`)**
| Технология | Назначение |
|---|---|
| FastAPI 0.141 + Uvicorn | REST API + WebSocket `/ws` |
| SQLModel / SQLAlchemy 2 | ORM |
| PostgreSQL (psycopg2) / SQLite fallback | БД, Alembic-миграции |
| JWT (PyJWT, python-jose) + passlib/bcrypt | аутентификация, refresh-токены |
| pyotp | 2FA TOTP |
| pywebpush, http_ece, py-vapid | Web Push |
| Redis + slowapi | rate limiting |
| Cloudinary | хранение медиа |
| aiohttp + BeautifulSoup | превью ссылок |
| Sentry, structlog | мониторинг, структурированные логи |
| WebSockets + WebRTC signaling | звонки, real-time |
| Pillow, qrcode, Faker | изображения, QR, тестовые данные |

### 3.2 Архитектура
- **Клиент-сервер:** Next.js SPA (клиентские компоненты) ↔ FastAPI REST + одно WebSocket-соединение (`/ws`) для сообщений, typing, уведомлений, signaling звонков, online-счётчика.
- **State management:** React Context (`WebSocketProvider`, `UnreadCountsContext`, `CallContext`, `LanguageProvider`, `ThemeProvider`) + in-memory кеши (`authCache`, `postCache`, `followCache`).
- **Кеширование:** пул БД (pool_size 20 + overflow 40, `pool_pre_ping`), клиентские кеши, PWA-кеш, оффлайн-очередь отправки (`pwa/syncQueue.ts`).
- **Производительность:** `performance.py` + `/debug/perf`, `stress_test.py`, скелетоны загрузки, `SmartImage`, heartbeat/reconnect WS (`ConnectionStatus`).
- **i18n:** собственный провайдер, словари ru/uk/en (`lib/i18n`).
- **PWA:** сервис-воркер, install-prompt, Web Push, версионирование (`/api/pwa/version`).

### 3.3 Роли пользователей
| Роль | Механика | Права |
|---|---|---|
| Гость | без JWT | просмотр публичного контента, регистрация/логин (вкл. 2FA) |
| Пользователь | `User` | посты, лайки, закладки, чаты, звонки, бейджи, покупки ролей |
| Модератор | `is_moderator` | работа с репортами и контентом в рамках выданных прав |
| Админ | `is_admin` | полный доступ: админ-панель, роли, баны, темы, стикеры, логи, платежи |
| Кастомные роли | `Role`, `RoleCategory`, `role_id` | иерархия ролей, продажа (`PaymentRole`) |
| Спец-флаги | `is_trelod`, `is_banned` | бан перекрывается `BanOverlay` на всё приложение |

Дополнительно — гранулярные права: `PermissionGate`, `/api/permissions`, `/api/admin/permission-tabs` (можно выдавать отдельные админ-возможности не-админам).

### 3.4 Безопасность
**Реализовано:** bcrypt-хеши паролей; JWT + refresh; `token_version` (logout-all); 2FA TOTP с хешированными резервными кодами; E2E-шифрование чатов и медиа (ключи не покидают клиентов); rate limiting (slowapi, Redis-ready); CORS только доверенный origin; DOMPurify-санитизация; валидация (`validators.py`), лимиты загрузки (`uploadRules.ts`); журналирование (`ActionLog`, `IPLog`, `IPBlock`); Sentry.

**В планах:** Redis-based rate-limit для multi-instance; email-верификация и email-уведомления (поле `email_verified` в модели есть, отправка не развита).

---

## 4. Дополнительно

### 4.1 Схема навигации
```
Sidebar (Классика / Dock / Orbit — 3 шелла)
├── Home (/)                → посты, CreatePost, поиск, теги, /post/[id], /tag/[name]
├── Bookmarks (/bookmarks)  → посты из ленты
├── Community (/updates, /suggestions) → блог + форум
├── Rules (/rules)
├── Messages (/messages/[id]) ↔ Notifications (счётчики), Calls (WebRTC)
├── Notifications (/notifications) → посты / профили / чаты
├── Settings (/settings)    → профиль, 2FA, push, темы, язык, шелл
└── Admin Panel (/admin/*)  → модерация и статистика
Прочее: /user/[id], /search, /support, /team, /stat, /prism, /prisme/[id], /login
```
Счётчики непрочитанного (чаты, уведомления, обновления) синхронизируются через контекст + WebSocket. Ctrl-орбита доступна только в режиме «Orbit 2».

### 4.2 Основные бизнес-процессы
1. **Регистрация:** `POST /api/register` → JWT → (опц.) принятие правил (`RulesModal`), 2FA, email, push-подписка.
2. **Вход:** `/api/login` (+ `/api/login/2fa`) → access+refresh; бан проверяется на каждом запросе.
3. **Создание поста:** RichEditor → вложения (Cloudinary) → `POST /api/posts` → уведомления подписчикам → push.
4. **Модерация:** репорт пользователя → очередь в админке → resolve/reject → варнинг/бан → запись в `ActionLog`.
5. **Чат:** создание → session key → шифрованный обмен по WS; медиа шифруются клиентом до загрузки в Cloudinary.
6. **Звонок:** `CallModal` → signaling по WS → WebRTC P2P (ICE из `/api/ice-servers`).
7. **Поддержка:** `SupportWidget` → тикет → диалог с админом (`SupportTicket`).

### 4.3 Планы по развитию
- Поиск, фильтры и папки в закладках.
- Email-верификация и email-уведомления.
- Витрина платных бейджей/ролей (модель `PaymentPurchase` есть, витрина — в планах).
- Развитие Prisme (сцены-ключи доступа) — статистика и очередь уже реализованы.
- Нативные мобильные приложения на базе существующего PWA.

---

## 5. Состав проекта (файлы и роль)

### Backend (`nebula/backend/`)
| Файл | Роль |
|---|---|
| `main.py` (~446 КБ) | всё приложение: ~233 REST-эндпоинта, WS, middleware, CORS, rate-limit, аутентификация, admin |
| `models.py` | 55 SQLModel-таблиц (User, Post, Chat, Message, Role, Badge, Theme, Payment*, Suggestion*, Prisme* и др.) |
| `database.py` | engine (PostgreSQL/SQLite), пул соединений, `init_db` |
| `prisma.py` | вспомогательный слой данных/миграций |
| `websocket_manager.py` | менеджер WS-подключений, комнаты чатов |
| `push_service.py` | Web Push (VAPID) |
| `payments.py`, `payment_providers.py` | продажа ролей/плашек |
| `link_preview.py` | OG-превью ссылок |
| `cloudinary_config.py` | медиа-хранилище |
| `validators.py`, `performance.py` | валидация, профилирование |
| `stress_test.py`, `test_call_signaling.py` | нагрузочный тест, тесты signaling |

### Frontend (`nebula/l_frontend/`)
| Каталог/файл | Роль |
|---|---|
| `app/` | маршруты: `bookmarks`, `messages/[id]`, `notifications`, `post/[id]`, `rules`, `search`, `settings`, `suggestions/*`, `tag/[name]`, `updates`, `user/[id]`, `support`, `team`, `stat`, `prism(e)`, `admin/*`, `adminnew/*`, `login` |
| `components/` (70 файлов) | UI: `Post.tsx`, `Sidebar.tsx` (навигация/шеллы), `MessageBubble`, `CallModal`, `RichEditor`, `CreatePost`, `EchoModal`, `PushSettings`, `ThemeProvider`, `Skeletons` и др. |
| `lib/` | инфраструктура: `auth.ts`, `crypto.ts` (E2E), `websocket.ts`, `webrtc.ts`, `push.ts`, `apiFetch.ts`, `stickers.tsx`, `pwa/*`, `i18n/{ru,uk,en}.ts` |
| `src/hooks/` | `useWebRTC` (звонки), `useDraft`, `useLastReadPost`, `useWebSocket` |
| `themes/` | темы оформления (в т.ч. iOS-тема `themes/ios`) |

### Метрики
- Backend: ~233 эндпоинта, 55 моделей БД.
- Frontend: 70 компонентов, ~40 утилит/хуков, 3 языка интерфейса, 3 шелла.

---
*Документ по состоянию кода на 31.08.2026. Файл: `nebula/DOCUMENTATION.md`.*
