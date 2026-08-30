// scripts/generate-icons.mjs
// Генерирует все PNG-иконки PWA из public/logo-icon.svg (самостоятельный скрипт на sharp).
// Запуск:  node scripts/generate-icons.mjs
// Результат: public/pwa/icon-<size>.png и public/pwa/maskable-<size>.png
import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGO = readFileSync(resolve(ROOT, "public/logo-icon.svg"), "utf8");
const OUT_DIR = resolve(ROOT, "public/pwa");

// Брендовый цвет темы (совпадает с theme-color в layout.tsx)
const BG = "#6366f1";
const BG_DARK = "#171717";

// Размеры, требуемые для manifest + iOS + maskable
const SIZES = [72, 96, 128, 144, 152, 180, 192, 384, 512];

// Видимое содержимое логотипа (кроме <svg ...> обёртки)
const INNER = LOGO.replace(/<svg[^>]*>/i, "").replace(/<\/svg>/i, "").trim();

// Приблизительный bbox содержимого логотипа (из path'ов): ширина ~739 из 1000
const CONTENT_FRACTION = 0.74;

/**
 * Рендерит иконку: фоновая плашка + логотип в безопасной зоне.
 * @param {number} size   размер квадрата (px)
 * @param {number} frac   доля иконки, которую занимает логотип (0..1)
 * @param {string} bg     цвет фона
 * @param {boolean} rounded скруглить углы (для "any" purpose на iOS-like)
 * @returns {Promise<Buffer>}
 */
async function render(size, frac, bg, rounded = false) {
  const viewBoxScale = frac / CONTENT_FRACTION; // масштаб всего viewBox 1000
  const k = (size / 1000) * viewBoxScale; // scale() для group
  const o = (size - 1000 * k) / 2; // translate для центрирования

  const rx = rounded ? size * 0.18 : 0;
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${bg}"/>
  <g transform="translate(${o} ${o}) scale(${k})">${INNER}</g>
</svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  for (const size of SIZES) {
    // "any" — скруглённая плашка для обычных браузеров/папки приложения
    await sharp(await render(size, 0.6, BG, true)).toFile(
      resolve(OUT_DIR, `icon-${size}.png`)
    );
    // "maskable" — full-bleed, логотип в безопасной зоне (внутри 80%)
    await sharp(await render(size, 0.5, BG, false)).toFile(
      resolve(OUT_DIR, `maskable-${size}.png`)
    );
  }

  // Apple touch icon (iOS): скруглённая плашка 180x180
  await sharp(await render(180, 0.6, BG, true)).toFile(
    resolve(ROOT, "public/apple-touch-icon.png")
  );

  // Splash / dark favicon для тёмной темы (не обязательно, но приятно)
  await sharp(await render(512, 0.6, BG_DARK, true)).toFile(
    resolve(OUT_DIR, "icon-dark-512.png")
  );

  // favicon.ico на основе 32x32 PNG (favicon можно хранить как .png, но оставляем .ico)
  const icoPng = await sharp(await render(32, 0.7, BG, true)).toFile(
    resolve(OUT_DIR, "favicon-32.png")
  );
  void icoPng;

  console.log(`✅ Иконки сгенерированы в ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});