#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = join(ROOT, "release");
const PUBLIC_DESKTOP_DIR = resolve(ROOT, "..", "l_frontend", "public", "desktop");

const version = process.argv[2];
if (!version || !/^\d+(\.\d+)*$/.test(version)) {
  console.error("Usage: npm run release -- <version>");
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
if (packageJson.version !== version) {
  console.error(`Requested version ${version} does not match linux/package.json (${packageJson.version}).`);
  process.exit(1);
}

const artifacts = [
  `trelod-${version}.AppImage`,
  `trelod-${version}.deb`,
];
const missing = artifacts.filter((filename) => !existsSync(join(RELEASE_DIR, filename)));
if (missing.length > 0) {
  console.error(`Linux build artifacts are missing from ${RELEASE_DIR}:`);
  for (const filename of missing) console.error(`  - ${filename}`);
  console.error("Build them first with: npm run dist");
  process.exit(1);
}

mkdirSync(PUBLIC_DESKTOP_DIR, { recursive: true });
for (const filename of artifacts) {
  copyFileSync(join(RELEASE_DIR, filename), join(PUBLIC_DESKTOP_DIR, filename));
}
copyFileSync(
  join(RELEASE_DIR, `trelod-${version}.AppImage`),
  join(PUBLIC_DESKTOP_DIR, "trelod.AppImage")
);

console.log(`Linux ${version} installers copied to ${PUBLIC_DESKTOP_DIR}.`);
console.log("The download page serves the AppImage as /desktop/trelod.AppImage.");
