// scripts/release-desktop.mjs — выпуск обновления десктоп-приложения (analog release-apk.mjs).
//   npm run dist                → собирает release/trelod-Setup-<ver>.exe (electron-builder)
//   npm run release -- 1.3      → копирует exe в l_frontend/public/desktop/ + пишет update.json
//
// Дальше: git add -A && git commit -m "release 1.3" && git push — юзеры получат баннер.
import { copyFileSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = resolve(ROOT, "release");
const FE_PUBLIC_DESKTOP = resolve(ROOT, "..", "l_frontend", "public", "desktop");
const MANIFEST = join(FE_PUBLIC_DESKTOP, "update.json");

const version = process.argv[2] || process.env.npm_config_version;
if (!version || !/^\d+(\.\d+)*$/.test(version)) {
  console.error("❌ Укажи версию: npm run release -- 1.3");
  process.exit(1);
}

// Ищем свежесобранный установщик trelod-Setup-<ver>.exe в release/
let exeSrc = null;
try {
  const exact = join(RELEASE_DIR, `trelod-Setup-${version}.exe`);
  if (existsSync(exact)) {
    exeSrc = exact;
  } else {
    const candidates = readdirSync(RELEASE_DIR).filter((f) =>
      /^trelod-Setup-[\d.]+\.exe$/i.test(f)
    );
    // берём самый свежий по версии
    exeSrc = candidates.length ? join(RELEASE_DIR, candidates.sort().pop()) : null;
  }
} catch {
  exeSrc = null;
}

if (!exeSrc || !existsSync(exeSrc)) {
  console.error(`❌ Установщик не найден: ${join(RELEASE_DIR, `trelod-Setup-${version}.exe`)}`);
  console.error("   Сначала собери: cd desktop && npm run dist");
  process.exit(1);
}

const exeOut = join(FE_PUBLIC_DESKTOP, `trelod-Setup-${version}.exe`);
copyFileSync(exeSrc, exeOut);

const meta = (() => {
  try { return JSON.parse(readFileSync(MANIFEST, "utf8") || "{}"); }
  catch { return {}; }
})();
meta.version = version;
meta.url = `/desktop/trelod-Setup-${version}.exe`;
writeFileSync(MANIFEST, JSON.stringify(meta, null, 2) + "\n");

console.log(`✅ Десктоп v${version} скопирован в l_frontend/public/desktop/, update.json обновлён.`);
console.log("   Не забудь поднять version в desktop/package.json до " + version + ".");
console.log("   Дальше: git add -A && git commit -m \"release desktop " + version + "\" && git push");
