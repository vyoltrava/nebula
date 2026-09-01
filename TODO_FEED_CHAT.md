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
