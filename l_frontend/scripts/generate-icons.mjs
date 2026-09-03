// scripts/generate-icons.mjs
// Генерирует PNG-иконки из ГОТОВЫХ SVG-исходников в public/balik/.
// Ничего не перерисовывает — просто конвертирует SVG как есть в PNG-копии.
//
// Источники:
//   stok.svg            → стандартные PWA-иконки (public/pwa/*) + apple-touch-icon
//   white/ukraina/inversiya.svg → public/pwa/icons/<id>/* + android ic_launcher_<id>
//
// Запуск:  node scripts/generate-icons.mjs [--android]
import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BALIK = resolve(ROOT, "public", "balik");
const OUT_DIR = resolve(ROOT, "public/pwa");
const ANDROID_RES = resolve(ROOT, "..", "mobile/android/app/src/main/res");

// Стандартная иконка + готовые варианты (id файла в balik)
const VARIANTS = ["stok", "white", "ukraina", "inversiya"];

// Стандартные размеры PWA (корневые)
const SIZES = [72, 96, 128, 144, 152, 180, 192, 384, 512];
// Размеры для вариантов (в своих папках)
const VARIANT_SIZES = [192, 512];

const ANDROID_DENSITIES = [
  { dir: "mipmap-mdpi", size: 48 },
  { dir: "mipmap-hdpi", size: 72 },
  { dir: "mipmap-xhdpi", size: 96 },
  { dir: "mipmap-xxhdpi", size: 144 },
  { dir: "mipmap-xxxhdpi", size: 192 },
];

async function renderPng(svg, size) {
  return sharp(Buffer.from(svg)).resize(size, size, { fit: "contain" }).png().toBuffer();
}

/** Круглая (для roundIcon): рендер + круговая маска. */
async function renderRound(svg, size) {
  const base = await renderPng(svg, size);
  const r = size / 2;
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${r}" cy="${r}" r="${r}" fill="white"/></svg>`
  );
  return sharp(base).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

async function main() {
  const svgCache = {};
  for (const id of VARIANTS) {
    const f = resolve(BALIK, `${id}.svg`);
    if (!existsSync(f)) {
      console.error(`❌ Не найден ${f}`);
      process.exit(1);
    }
    svgCache[id] = readFileSync(f, "utf8");
  }

  // --- 1) СТАНДАРТНАЯ (stok) в корень public/pwa/ ---
  const stok = svgCache.stok;
  for (const size of SIZES) {
    await sharp(await renderPng(stok, size)).toFile(resolve(OUT_DIR, `icon-${size}.png`));
    await sharp(await renderPng(stok, size)).toFile(resolve(OUT_DIR, `maskable-${size}.png`));
  }
  // favicon + apple-touch-icon — В цвета stok.svg
  await sharp(await renderPng(stok, 32)).toFile(resolve(OUT_DIR, "favicon-32.png"));
  await sharp(await renderPng(stok, 180)).toFile(resolve(ROOT, "public/apple-touch-icon.png"));
  console.log("  ✅ стандартная (stok) в корень PWA");

  // --- 2) ВАРИАНТЫ в свои папки public/pwa/icons/<id>/ ---
  for (const id of ["white", "ukraina", "inversiya"]) {
    const dir = resolve(OUT_DIR, "icons", id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const svg = svgCache[id];
    for (const size of VARIANT_SIZES) {
      await sharp(await renderPng(svg, size)).toFile(resolve(dir, `icon-${size}.png`));
      await sharp(await renderPng(svg, size)).toFile(resolve(dir, `maskable-${size}.png`));
    }
    await sharp(await renderPng(svg, 180)).toFile(resolve(dir, "apple-touch-icon.png"));
    await sharp(await renderPng(svg, 32)).toFile(resolve(dir, "favicon-32.png"));
    console.log(`  ✅ ${id}`);
  }

  // --- 3) ANDROID mipmaps (--android) ---
  if (process.argv.includes("--android")) {
    for (const { dir, size } of ANDROID_DENSITIES) {
      const outDir = resolve(ANDROID_RES, dir);
      if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
      // стандартная лаунчер-иконка из stok
      await sharp(await renderPng(stok, size)).toFile(resolve(outDir, "ic_launcher.png"));
      await sharp(await renderRound(stok, size)).toFile(resolve(outDir, "ic_launcher_round.png"));
      // варианты
      for (const id of ["white", "ukraina", "inversiya"]) {
        await sharp(await renderPng(svgCache[id], size)).toFile(resolve(outDir, `ic_launcher_${id}.png`));
        await sharp(await renderRound(svgCache[id], size)).toFile(resolve(outDir, `ic_launcher_${id}_round.png`));
      }
    }
    console.log("  ✅ Android mipmaps (stok + white/ukraina/inversiya)");
  }

  console.log("✅ Готово");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
