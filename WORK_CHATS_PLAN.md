# План: «Рабочие чаты» — изолированная подсистема (вариант B, ФИНАЛ)

> **Принцип: существующий чат-движок (Chat/ChatMember/Message, E2EE, звонки) НЕ трогаем вообще.**
> Рабочие чаты — свои таблицы, свои API (`/api/work/*`), свои WS-события. Без шифрования:
> обычный текст, WS, группа, встроенный бот.
> Единственная точка соприкосновения с текущей системой — список чатов: рабочие чаты
> появляются в системной папке «РАБОТА» (аддитивно, см. §6).

## 1. Модели (все новые, миграция `0018_work_chats.py`)

```
WorkChat                — рабочий чат отдела
  id, category_id FK rolecategory.id (unique — 1 чат на категорию роли)
  name (= имя категории), avatar_url, is_active: bool
  created_by FK user.id, created_at

WorkChatMember
  id, chat_id FK, user_id FK          (unique: chat_id+user_id)
  role: head | deputy | worker | novice          # 4 уровня из ТЗ
  joined_at, added_by FK
  on_shift: bool = False, shift_entered_at, shift_taken: int = 0   # round-robin
  handles: str = "[]"   # JSON: за какие разделы отвечает, "[]" = все

WorkChatMessage         — структура обычного сообщения, БЕЗ криптографии
  id, chat_id FK, sender_id FK nullable (null = бот)
  text, reply_to_id FK self nullable
  kind: text | system | ticket_card
  ticket_id FK workticket.id nullable   # связка карточки заявки
  created_at, edited_at
  index: (chat_id, id)

WorkTicket              — заявка, раздаваемая ботом
  id, chat_id FK, section: complaint|support|bug|chat
  title, description, priority: low|medium|high, source_url
  status: open | assigned | done
  assignee_id FK nullable, taken_at, closed_at, closed_by FK, created_at
  index: (chat_id, status)

WorkSectionConfig       — привязка разделов к чату + сложность по умолчанию
  id, chat_id FK, section (unique: chat_id+section)
  enabled: bool = True, default_priority: low|medium|high

WorkTicketRating        — оценка закрытой заявки автором (1..5)
  id, ticket_id FK unique, author_id FK, assignee_id FK, score: int, comment, created_at

WorkPromotionLog
  id, chat_id FK, user_id FK, from_role, to_role
  status: pending | executed | cancelled, planned_at, executed_at, decided_by FK

WorkStatDaily           — ежедневный снэпшот
  id, chat_id FK, date (unique: chat_id+date)
  tickets_total, tickets_closed, avg_response_sec, avg_rating, payload TEXT

WorkBot                 — бот-центр (расширяемый, типы как в TG/VK)
  id, name, type: worker | notify | poll | custom
  chat_id FK nullable, active: bool
  config TEXT(JSON), created_by FK, created_at

WorkBotTrigger
  id, bot_id FK, event: ticket_created|ticket_assigned|ticket_closed|rating_added|
                    member_joined|member_left|custom
  action TEXT(JSON), enabled: bool

WorkBotLog              — кто и когда запускал/менял + действия бота
  id, bot_id FK, actor_id FK nullable, action, details TEXT, created_at
```
Прогресс повышения — on-the-fly из `WorkTicketRating` + `WorkTicket`, кэш в Redis
(in-memory при FakeRedis).


## 2. Модуль `work_chats.py` (весь код подсистемы в одном файле, не раздуваем main.py)

- `ensure_work_chat(category_id)` — авто-создание чата для каждой категории с `is_staff=true`
  ролями (хук на создание категории в админке), name = имя категории.
- `add_member / remove_member / set_role` — участники только с staff-плашкой (поиск по ролям `is_staff`).
- Права ролей: head — вся статистика + назначение любых ролей кроме head (head — только глобальный
  админ); deputy — модерация чата + назначение worker/novice; worker/novice — исполнение.
- head/deputy НЕ участвуют в раздаче заявок (бот их пропускает).

## 3. Бот-распределитель `work_bot.py` (свой воркер на каждый чат)

- Каждый WorkChat имеет свой экземпляр бота (WorkBot type=worker, создаётся вместе с чатом).
- Бот слушает 4 источника: жалобы (`Report`), поддержка (`SupportTicket`), баги (`BugReport`),
  чаты (внутренние обращения) — забирает ТОЛЬКО разделы из `WorkSectionConfig(chat_id)`.
- Поступление заявки → `dispatch(chat_id, section, priority)`:
  1. кандидаты = участники с role=worker|novice, on_shift, handles содержит section (или "[]");
  2. novice — только priority=low;
  3. round-robin: `ORDER BY shift_taken ASC` (FIFO по счётчику), затем `shift_taken += 1`;
  4. нет воркеров → карточка-уведомление head (НЕ в очередь).
- Бот постит в чат `WorkChatMessage(kind=ticket_card)`: заголовок, описание, приоритет, ссылка
  + кнопка «Взять в работу» → `POST /api/work/tickets/{id}/take` (идемпотентная блокировка, WS `work_ticket_taken`).
- Очередь — Redis Stream `work:tickets` (consumer group per chat); без Redis — in-process asyncio-очередь
  за интерфейсом `TicketQueue` (в проекте Redis опционален, FakeRedis).
- Закрытие заявки → автору (в окне, где он создавал заявку) показывается оценка 1–5 →
  `POST /api/work/tickets/{id}/rate`.

## 4. Повышения (автоматика)

- Ежечасный job + пересчёт после каждой оценки: `closed ≥ 50` и `avg(score) ≥ 4.0` → следующая ступень:
  novice→worker, worker→deputy (только если позиция зам. свободна).
- За 3 дня: `WorkPromotionLog(status=pending, planned_at=+3d)` + уведомление head (WS + push).
- Head отменяет вручную; по planned_at job исполняет (role → to_role) и пишет `executed`.
- Прогресс в профиле сотрудника (/stat): «Осталось X ответов до повышения».

## 5. Статистика

- Daily-job (после полуночи UTC) пишет `WorkStatDaily`; живые значения за период досчитываются из
  `WorkTicket`/`WorkTicketRating`.
- `GET /api/work/stat/summary?chat&period=day|week|month&user` — таблица
  (Чат | Всего | Закрыто | Ср. время ответа | Ср. оценка | Загруженность).
- `GET /api/work/stat/members?...` — детализация (Сотрудник | Роль | Принято | Закрыто |
  Ср. время | Ср. оценка | Рейтинг), кликабельно из общей таблицы.
- Право `can_moderate_work_chats` (добавить в реестр ALL_PERMISSIONS/PERMISSION_LABELS, main.py:845):
  носитель видит только свои чаты (head/deputy); глобальный админ / manage_team_stats — все.

## 6. Интеграция со списком чатов (ЕДИНСТВЕННОЕ касание текущей системы)

- `GET /api/chats/folders` (main.py:5860) — аддитивно дополнить ответ системной папкой:
  `{ id: "work", name: "РАБОТА", system: true, chats: [...] }`, где chats — WorkChat'и,
  где юзер есть в WorkChatMember (лёгкая сериализация: name, avatar, last_message, unread).
  Существующие ветки кода не меняются — только append.
- Открытие рабочего чата: отдельная страница `app/messages/work/[id]/page.tsx`, переиспользует
  UI-компоненты MessageBubble/чат-шелл, но БЕЗ crypto-layer: сообщения — plain text,
  история `GET /api/work/chats/{id}/messages?before=`, отправка `POST .../messages`.
- Непрочитанные/счётчики папки «РАБОТА» — в общий WS-контекст как отдельные события `work_*`,
  существующие счётчики чатов не трогаем.

## 7. WS-события

Через существующий `websocket_manager.py` (`send_to_user` по участникам WorkChat — метод-хелпер
`broadcast_to_work_chat(chat_id, event, data)` в `work_chats.py`, комнаты чат-движка не используются):
`work_new_message`, `work_ticket_new`, `work_ticket_taken`, `work_ticket_closed`,
`work_ticket_rating`, `work_promotion_pending`, `work_promotion_executed`, `work_member_*`.

## 8. API (все `/api/work/*`, JWT + проверка роли/прав)

```
GET    /api/work/chats                          — мои рабочие чаты (+sections, members)
POST   /api/work/chats                          — создать вручную (глобальный админ)
PATCH  /api/work/chats/{id}                     — активен/закрыт, название
GET/POST   /api/work/chats/{id}/members         — список / добавить (только staff-юзеры, поиск GET /api/work/staff-search?q=)
DELETE     /api/work/chats/{id}/members/{uid}
PATCH      /api/work/chats/{id}/members/{uid}/role   — 4 уровня (правила §2)
PUT    /api/work/chats/{id}/sections            — привязка разделов + default_priority
GET    /api/work/chats/{id}/messages            — история (plain text)
POST   /api/work/chats/{id}/messages            — отправить
GET    /api/work/tickets?chat&status&mine       — очередь заявок
POST   /api/work/tickets/{id}/take | /close | /rate
GET    /api/work/stat/summary | /members | /promotions/progress
POST   /api/work/promotions/{id}/cancel         — отменить повышение (head)
GET/POST /api/admin/bots          PATCH|DELETE /api/admin/bots/{id}
GET      /api/admin/bots/{id}/logs
PUT      /api/admin/bots/{id}/triggers
POST     /api/admin/bots/{id}/toggle
```

## 9. Фронтенд

- `app/stat/page.tsx`: `TabMode` + `"departments" | "stats"`.
  - «Отделы» (`components/stat/DepartmentsTab.tsx`): карточки чатов (участники, разделы, статус,
    кнопка «Создать рабочий чат»), модалки участников/ролей/разделов, поиск staff-пользователей.
  - «Статистика» (`StatsTab.tsx`): таблицы + фильтры (чат/период/сотрудник), drill-down по сотруднику,
    бейдж «Осталось X ответов до повышения».
- Бот-центр: вкладка «Боты» в adminnew (`components/admin/section/BotsSection.tsx`): список ботов
  (тип, активен, привязка к чату, логи), создание (тип / привязка / триггеры).
- Окно отправки заявки: после закрытия — оценка 1–5 сотруднику.
- i18n: ключи в `lib/i18n/{ru,uk,en}.ts`.

## 10. Миграция, производительность, безопасность

- Alembic `0018_work_chats.py`: только CREATE TABLE (паттерн идемпотентного DDL из 0011 —
  работает на Postgres и SQLite). Ни одной ALTER существующих таблиц, кроме добавления
  `can_moderate_work_chats` в реестр прав (код, не БД).
- Индексы: `WorkTicket(chat_id, status)`, `WorkTicketRating(assignee_id)`, `WorkStatDaily(chat_id, date)`,
  `WorkChatMessage(chat_id, id)`.
- Диспетчер — background task в lifespan FastAPI (Render single-instance); боты изолированы:
  падение бота не влияет на чат-движок (try/except + WorkBotLog).
- Все действия админов → `log_action()`; действия ботов → `WorkBotLog`.

## 11. Этапы работ

1. Модели + миграция 0018 + скелет `work_chats.py` (создание чата, участники, роли).
2. Сообщения: WS-хелпер, история/отправка, страница `/messages/work/[id]`, папка «РАБОТА» в списке чатов.
3. Разделы + очередь + бот-распределитель (карточки, take/close) + хуки на 4 источника заявок.
4. Оценки + повышения + прогресс.
5. Статистика: снэпшоты, эндпоинты, вкладка «Статистика».
6. Бот-центр: WorkBot/Trigger/Log, вкладка «Боты», перевод бота отдела на WorkBot(type=worker).
7. Право `can_moderate_work_chats` во всех срезах + smoke-тесты каждого этапа.


  config TEXT(JSON), created_by FK, created_at

WorkBotTrigger
  id, bot_id FK, event: ticket_created|ticket_assigned|ticket_closed|rating_added|
                    member_joined|member_left|custom
  action TEXT(JSON), enabled: bool

WorkBotLog              — кто и когда запускал/менял + действия бота
  id, bot_id FK, actor_id FK nullable, action, details TEXT, created_at
```
Прогресс повышения — on-the-fly из `WorkTicketRating` + `WorkTicket`, кэш в Redis
(in-memory при FakeRedis).
