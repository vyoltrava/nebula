# trelod Desktop (Windows)

Полноценное **десктоп-приложение Windows с установщиком** — аналог APK для Android
(там Capacitor, здесь Electron). Название приложения — **trelod**. Не PWA: ставится
`.exe`-установщиком (NSIS), имеет свою иконку в системе, одиночный экземпляр, системные
уведомления и **автообновление «как у APK»**: спрашивает `/desktop/update.json`, качает
новый установщик и ставит его.

## Архитектура

- `main/index.js` — главный процесс: окно (BrowserWindow) открывает продакшен-фронтенд
  (тот же URL, что в `mobile/capacitor.config.ts`), автообновление, внешние ссылки.
- `main/preload.js` — мост `window.trelodDesktop` (версия / checkUpdate / downloadAndInstall).
- Фронтенд (`l_frontend/lib/appUpdate.ts`) сам определяет десктоп по `trelodDesktop.isDesktop`
  и через него получает версию + ставит обновление; баннер «Обновить сейчас» уже общий с APK.

## Быстрый старт (dev)

```bash
cd desktop
npm install
npm run dev                    # откроет окно с https://trelod.vercel.app
# или локальный фронтенд:
#   $env:NEBULA_APP_URL="http://localhost:3000"; npm run dev
```

## Сборка установщика

```bash
cd desktop
npm install
npm run dist                   # → release/trelod-Setup-<version>.exe (NSIS-мастер)
```

Требования: Node 18+; сборка Windows-установщика — на Windows (или Wine на Linux).
**Логотип/иконка берутся из `l_frontend/public/` — единый источник в git, дублей нет:**
`public/pwa/icon-512.png` задаётся как `win.icon` (electron-builder) и как иконка окна
(dev-режим). В упакованном приложении окно использует иконку `.exe`.

## Выпуск обновления (как у APK)

Собранный установщик деплоится вместе с фронтом, чтобы юзеры получали баннер:

```bash
cd desktop
npm run dist
npm run release -- 1.3          # скопирует exe в l_frontend/public/desktop/
                                # и пропишет версию в l_frontend/public/desktop/update.json
cd .. && git add -A && git commit -m "release desktop 1.3" && git push
```

Приложение сравнивает свою версию с `update.json` **каждую минуту** (фоновый поллер в
главном процессе, а также при запуске и фокусе окна) и сразу показывает баннер
«Обновить сейчас»: установщик скачивается и запускается тихо (`/S`), приложение
перезапускается после установки. Тот же механизм, что и у APK, — общий баннер.

**Ссылка для установки с нуля:** `https://твой-домен/desktop/trelod-Setup-<version>.exe`.

## Настройки

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `NEBULA_APP_URL` | какой фронтенд грузить в окне | `https://trelod.vercel.app` |
| `NEBULA_UPDATE_MANIFEST` | переопределить манифест обновлений | `<APP_URL>/desktop/update.json` |

## Версии

`version` задаётся в `package.json`, попадает в установщик и в `update.json` (release-скрипт).
