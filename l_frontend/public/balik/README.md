# Папка для исходной иконки приложения.

Положи сюда файл **`stok.svg`** — стандартную иконку (тот же вид, что и основная
иконка приложения). Из неё скрипт `scripts/generate-icons.mjs` делает 3 варианта:

- `white` — символ `#3D1F6D`, фон `#ECE7D8`
- `ukraina` — символ `#0057B8`, фон `#FFD700`
- `inversiya` — фон `#8B5CF6`, символ `#171717`

Фон всегда квадрат с углами `rx=20` (в единицах viewBox `stok.svg`).

Запуск:
```bash
node scripts/generate-icons.mjs            # PWA-иконки (public/pwa/icons/<id>/)
node scripts/generate-icons.mjs --android  # + mipmaps для APK
```