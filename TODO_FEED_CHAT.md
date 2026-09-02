# TODO — чат с постами (лента) / отказ от prism-шифрования

Статус на 2026-09-01. Здесь собрано, что уже сделано и что осталось доделать,
чтобы можно было вернуться к работе без повторного исследования кода.

## ✅ Сделано (работает, проверено smoke-тестом)

### Бэкенд (backend/main.py, backend/models.py)
- Модели `ChatPost`, `ChatPostComment`, `ChatInvite`; в `Chat` добавлены
  `invite_token`, `who_can_post`, `who_can_comment` ("members" | "admins").
  Миграция колонок для существующей БД уже выполнена (nebula.db).
- API ленты: GET/POST `/api/chats/{id}/posts` (пагинация offset/limit),
  PATCH/DELETE `/api/chats/posts/{id}`.
- API комментариев: GET/POST `/api/chats/posts/{post_id}/comments`
  (вложенные ответы через `parent_id`, дерево `_build_comment_tree`),
  DELETE `/api/chats/comments/{id}`.
- Приглашения: POST `/api/chats/{id}/invite`, GET `/api/invite/{token}`
  (без авторизации), POST `/api/invite/{token}/join`, DELETE `/api/chats/{id}/invite`.
- Приватность: PATCH `/api/chats/{id}/settings` (who_can_post / who_can_comment /
  name / avatar_url).
- Медиа для постов: POST `/api/media/upload` (Cloudinary, до 10 МБ).
- WebSocket: `new_chat_post`, `chat_post_edited`, `chat_post_deleted`,
  `new_chat_comment`, `chat_comment_deleted`, `chat_settings_updated`
  (везде передаётся `session` в `manager.broadcast_to_chat`).
- `is_prism`-чаты сериализуются как групповые (`serialize_chat_for_user`),
  поле `is_prism` наружу больше не отдаётся → старые prism-чаты открываются
  как обычные группы и попадают в ленту.
- Удаление чата (`cascade_delete_chat`) чистит посты/комментарии/инвайты.

### Фиксы удалений (найдены smoke-тестом)
- БАГ: `cascade_delete_post` вызывался без `await` в
  `cancel_repost` (DELETE /api/posts/{id}/repost) и в resolve_report —
  репосты/цитаты фактически не удалялись. Исправлено: везде `await`.
- Удаление постов с реакциями нового типа (PostReaction) работает —
  cascade чистит `postreaction` (проверено 200 OK).

### Фронтенд (l_frontend)
- `components/ChatPostFeed.tsx` — лента постов (пагинация, realtime WS,
  медиа, ссылки, комментарии в модалке, вложенные ответы, collapse,
  кнопка приглашения).
- `components/ChatPostCard.tsx`, `components/ChatCommentNode.tsx`.
- `app/messages/[id]/page.tsx` — ранний return `<ChatPostFeed/>` для
  групповых чатов (после всех хуков — правила хуков не нарушены).
- `app/invite/[token]/page.tsx` — страница приглашения (вступить/открыть чат).
- `components/GroupSettingsModal.tsx` — селекты приватности
  (кто может постить/комментировать) → PATCH /settings.
- i18n (ru/en/uk): ключи `messages.writePost`, `postPlaceholder`,
  `commentPlaceholder`, `commentsTitle`, `group`, `members2`,
  `adminsOnlyPost`, `allMembersPost`.
- NebulaSidebar: кнопка "PRISM Link" убрана; `openCreatePrism` → заглушка
  (`openCreateGroup`); messages/page.tsx: `?create=prism` и событие
  `nebula-create: prism` открывают создание группы; кнопка PRISM Link в меню
  создания удалена.

## ✅ Группы vs каналы (сделано 2026-09-02)

- В `Chat` добавлено поле `chat_type`: `"dm"` | `"group"` (переписка
  сообщениями) | `"channel"` (лента постов). Self-heal при старте добавляет
  колонку и выполняет бэкфорс: старые `is_group`-чаты → `channel`,
  у каналов `who_can_post = 'admins'` по умолчанию.
- `POST /api/chats/group` создаёт группу переписки (`chat_type="group"`,
  сообщения), `POST /api/chats/channel` — канал (`chat_type="channel"`,
  `who_can_post="admins"`, подписчики опциональны, лог `create_channel`).
- Сериализация чата отдаёт `chat_type` и `is_channel`.
- Защита: в канале обычные сообщения запрещены (403), в группе посты
  в ленту запрещены (403). Проверено smoke-тестом.
- Фикс найденного бага: `UnboundLocalError: is_encrypted_chat` в
  `send_message_v2` — текстовые сообщения падали с 500.
- Фронтенд: `CreateGroupModal` получил `mode: "group" | "channel"`
  (иконка Megaphone/амбeр для канала, подписчики опциональны,
  endpoint выбирается по режиму). В меню создания `/messages` и в
  NebulaSidebar (ПК-кнопки + мобильная орбита) — отдельные кнопки
  «Создать группу» и «Создать канал». Событие `nebula-create: channel`
  и `?create=channel` открывают создание канала.
- `app/messages/[id]/page.tsx`: лента `ChatPostFeed` рендерится только
  для каналов (`chatInfo.is_channel`); группы открываются как обычный чат.
- i18n ru/en/uk: `messages.createChannel`.
- UX композера ленты: при `who_can_post === "admins"` у обычных участников
  композер скрыт, показывается «Только админы пишут» (пункт 3 из TODO).

## ✅ Каналы/группы: настройки, инвайты, приватность (2026-09-02)

- **Канал: посты от имени канала** — аватар/имя канала, не автора (как в ТГ).
  Новая настройка `show_author` (тумблер «Показывать автора поста» в
  настройках канала) — показывает имя автора поста.
- **Новые посты снизу** — лента разворачивается в хронологический порядок,
  WS-посты аппендятся вниз с автоскроллом.
- **Иконка форматирования** в канале — `Type`, как в обычных чатах.
- **GroupSettingsModal переписан** — вкладки: Канал/Группа (название, аватар,
  кто постит/комментирует/добавляет участников, показ автора), Ссылки
  (создание с названием и сроком действия, список, копирование, отзыв),
  Участники (поиск и добавление, назначение админов, кик), Удаление
  (опасная зона — кнопка удаления чата).
- **Бэкенд**: новые поля `Chat.show_author`, `Chat.can_add_members`
  (приватность: кто может добавлять участников), `ChatInvite.name`,
  `ChatInvite.expires_at` (временные ссылки). Новые эндпоинты:
  GET/POST `/api/chats/{id}/invites`, DELETE `/api/chats/{id}/invites/{id}`,
  PATCH `/api/chats/{id}/members/{uid}/role` (назначение админов, owner
  защищён). Проверено smoke-тестом (9/9 OK).
- **Групповые чаты: «пропали старые сообщения»** — добавлена подгрузка
  старых сообщений при скролле вверх (курсорная пагинация с сохранением
  позиции скролла; раньше грузились только последние 50 без дозагрузки).

## ✅ Канал = пузыри и композер как в обычных чатах (2026-09-02)

- Список постов канала больше не `ChatPostCard` (ленточные карточки), а
  обычные **`MessageBubble`** — те же пузыри, что в DM/группах: свои —
  фиолетовые справа, чужие — серые слева с аватаром и именем, время и
  галочки, markdown/ссылки, медиа через `getMediaClasses`. Кнопка
  комментариев — чип под пузырём. Удаление — через меню (три точки) для
  автора/админа.
- Композер полностью повторяет одиночные чаты: кнопка **«+»** с
  выпадающим меню (файл / ссылка / форматирование), **RichEditor WYSIWYG**
  (markdown, упоминания-хоткеи), **полоса вложений** с превью и удалением,
  плашка ссылки, кнопка отправки. Enter — отправить.
- Починена прикрепление медиа: файл грузится на Cloudinary сразу при
  выборе (превью в композере), при отправке URL уже в стейте — нет гонки
  состояний как раньше (картинка не прикреплялась).
- Скоролл в конец после загрузки; ширина постов теперь во всю колонку
  (убран `max-w-[640px]` из ChatPostCard).

## ✅ Фикс деплоя Postgres (2026-09-02, UndefinedColumn chat.chat_type)

- Причина: на Postgres ошибка абортирует транзакцию. В self-heal (startup)
  и в миграции 0007 все ALTER'ы шли в одной транзакции — первый сбой
  (DuplicateColumn invite_token) молча отменял все последующие команды,
  включая ADD COLUMN chat_type → все SELECT chat падали с UndefinedColumn.
- Исправлено: каждый ALTER теперь в отдельной транзакции (engine.begin),
  при ошибке — rollback. В 0007 добавлен rollback в `_safe`.
- Бэкфорс переписан диалект-независимо: `WHERE is_group AND ...` вместо
  `is_group = 1` (на Postgres `boolean = integer` — ошибка).
- Новая миграция `0008_chat_type` (идемпотентно: ADD COLUMN chat_type
  DEFAULT 'dm' + бэкфорс is_group-чатов в channel).
- Урок №2: в миграциях НЕЛЬЗЯ вызывать `conn.rollback()` (сносит транзакцию
  alembic → "Online migration expected to match one row ... 0 found") и
  `conn.commit()` (штамп версии уезжает на миграцию назад). Ожидаемые ошибки
  (duplicate column) устранены проверкой через `sqlalchemy.inspect` — миграции
  не выполняют заведомо падающий DDL. Проверено: upgrade с version='0006'
  корректно доходит до '0008_chat_type', повторный запуск — no-op.

## ⏳ Осталось доделать (заглушки)

1. **Prism-фронтенд не вычищен** (не ломает, но мёртвый код):
   `lib/prismCrypto.ts`, `lib/prismPuzzle.ts`, `lib/prismStorage.ts`,
   `lib/prismAvatar.ts`, `components/PrismPuzzleEnter.tsx`,
   страницы `app/prism/[id]`, `app/prisme/[id]`, `app/prisme`,
   блок PrismModal в `app/messages/page.tsx` (состояния showPrismModal,
   prismSearch*, isCreatingPrism, initiatePrism, confirmPrismKey и JSX модалки),
   бэкенд-хвосты: `user.prism_anchor`, `/api/chats/{id}/prism-*` удалены,
   но модели `UserKey`, `ChatSessionKey`, `PrismeScene/Object/Request/Stat`
   и роутер `prisma.py` (Prisme-картинка) ещё живы.
2. **Иконки/бейджи prism в списке чатов** — остатки `chat.is_prism` в
   `app/messages/page.tsx` (строки ~529-625) сейчас недостижимы (is_prism не
   отдаётся), можно удалить.
3. **UX композера**: при `who_can_post === "admins"` поле ввода остаётся
   активным у обычных участников — сервер отклонит (403), но лучше скрывать
   композер и показывать «Только админы могут публиковать».
4. **Отзыв приглашения** — бэкенд DELETE `/api/chats/{id}/invite` есть,
   кнопки в UI нет.
5. **Telegram-фарш (по запросу)**: закрепление постов в ленте, реакции на
   посты фида, черновики постов, счётчик просмотров, «канал»-режим
   (только админы) по умолчанию, публичная ссылка без токена.
6. **unread для ленты**: `unread_count` в списке чатов считается по Message —
   для фид-чатов стоит считать по постам/комментариям.
7. **Проверка маршрутов** (check_routes.py удалён) — при необходимости
   повторить: `python -c "import main; [print(r.path) for r in main.app.routes]"`.
8. **Переводы**: старые ключи `prismConfirm`, `prismCreateError`, блок `prism.*`
   в i18n-словарях больше не используются — можно удалить (не мешают).

## Как проверять
- Бэкенд: `cd nebula/backend && python -c "import main"` — должен пройти без ошибок.
- Фронт: `cd nebula/l_frontend && npx tsc --noEmit` — 0 ошибок.
- Smoke удалений: скрипт из истории (TestClient на копии nebula.db):
  регистрация 2 юзеров → пост → реакции → репост/цитата → удаления →
  группа → feed-пост/комментарий → удаления → prism-чаты.
