// scripts/release-apk.mjs
// Выпуск обновления APK. Использование:
//   node scripts/release-apk.mjs 1.3
// Что делает:
//   1) копирует свежесобранный APK (mobile/android/.../app-release.apk) в public/apk/
//   2) обновляет версию в public/apk/update.json
// Дальше: git add -A && git commit -m "release 1.3" && git push — юзеры получат баннер.
import { copyFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APK_SRC = resolve(ROOT, "..", "mobile/android/app/build/outputs/apk/release/app-release.apk");
const APK_OUT = resolve(ROOT, "public/apk/app-release.apk");
const MANIFEST = resolve(ROOT, "public/apk/update.json");

const version = process.argv[2];
if (!version || !/^\d+(\.\d+)*$/.test(version)) {
  console.error("❌ Укажи версию: node scripts/release-apk.mjs 1.3");
  process.exit(1);
}
if (!existsSync(APK_SRC)) {
  console.error(`❌ APK не найден: ${APK_SRC}`);
  console.error("   Сначала собери: cd mobile/android && gradlew.bat assembleRelease");
  process.exit(1);
}

copyFileSync(APK_SRC, APK_OUT);
const meta = JSON.parse(readFileSync(MANIFEST, "utf8"));
meta.version = version;
writeFileSync(MANIFEST, JSON.stringify(meta, null, 2) + "\n");

console.log(`✅ APK v${version} скопирован в public/apk/, update.json обновлён.`);
console.log(`   Не забудь поднять versionName/versionCode в mobile/android/app/build.gradle до ${version}/+.`);
console.log("   Дальше: git add -A && git commit -m \"release " + version + "\" && git push");