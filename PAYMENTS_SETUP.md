# 💳 Платёжная система (продажа плашек/ролей)

Модульный «платёжный слой»: оплату можно включить для **любой роли** через админку, без привязки к конкретной роли.

## Архитектура

| Слой | Файл | Что делает |
|---|---|---|
| Модели | `backend/models.py` | `PaymentRole`, `PaymentPurchase` (создаются автоматически при старте `init_db`) |
| Провайдеры | `backend/payment_providers.py` | `create_payment()` — фабрика; сейчас `manual` и `stripe` (REST, без SDK) |
| API | `backend/payments.py` | Роутер `/api/payments/*`, подключён в конце `main.py` |
| Админка | `l_frontend/app/adminnew/payments/page.tsx` | Toggle оплаты для ролей, цена/период/фичи, превью, вкл/выкл системы |
| Магазин | `l_frontend/components/payments/PaymentShop.tsx` | Карточки плашек + модалка покупки (в настройках профиля) |

## API

| Метод | Путь | Доступ | Описание |
|---|---|---|---|
| GET | `/api/payments/system/status` | публичный | вкл/выкл системы |
| POST | `/api/payments/system/status` | admin | вкл/выкл системы |
| GET/POST | `/api/payments/roles`, `/roles/toggle`, `/roles/save` | admin | управление платёжными ролями |
| GET | `/api/payments/available` | пользователь | активные плашки, которых нет у юзера |
| GET | `/api/payments/my` | пользователь | история покупок |
| POST | `/api/payments/create` | пользователь | создать платёж → `{url}` (Stripe Checkout) |
| POST | `/api/payments/webhook/stripe` | Stripe | подтверждение оплаты → авто-присвоение роли |
| POST | `/api/payments/manual-confirm/{id}` | admin | подтвердить «manual» платёж |
| POST | `/api/payments/refund/{id}` | admin | возврат → роль забирается, откат на предыдущую |
| GET | `/api/payments/stats` | admin | выручка, покупатели, активные подписки |

## Env (Render → backend)

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
FRONTEND_URL=https://<ваш-vercel-домен>   # для success/cancel URL
```

Webhook в Stripe Dashboard → `https://<render-domain>/api/payments/webhook/stripe`
(события: `checkout.session.completed`, `payment_intent.succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`).

## Как это работает

1. Админ: `/adminnew/payments` → иконка 💳 → выбрать роль → toggle → цена/период/фичи → Сохранить.
2. Пользователь: Настройки → Профиль → блок «Доступные плашки» → Купить → Stripe Checkout.
3. После оплаты webhook ставит `purchase.status=success`, вычисляет `expires_at` (30/365 дней для подписок) и присваивает `user.role_id` (предыдущая роль сохраняется в `metadata.previous_role_id` для отката).
4. Возврат/неуплата подписки → роль откатывается.

## Тестирование

- Без ключей Stripe выберите провайдер **«Ручная обработка»**: платёж висит `pending`, админ жмёт подтверждение через `POST /api/payments/manual-confirm/{id}` (в `/api/payments/stats` → recent видно id).
- Stripe test-карта: `4242 4242 4242 4242`, любой срок/CVC.
- Проверка отката: `POST /api/payments/refund/{id}` → роль вернулась к предыдущей.

## Заметки о хостинге (Vercel + Render)

- Backend на Render: вебхуки Stripe ходят напрямую на Render-домен — CORS не нужен (сервер-сервер).
- `FRONTEND_URL` на Render должен указывать на Vercel-домен, иначе success_url будет localhost.
- Vercel (frontend) — только статика/SSR, секретные ключи Stripe только в переменных Render.
- SQLite на Render: таблицы создаются автоматически через `SQLModel.metadata.create_all` при старте.
