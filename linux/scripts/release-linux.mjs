#!/usr/bin/env node

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_DIR = join(ROOT, "release");
const ICON_PATH = resolve(ROOT, "..", "l_frontend", "public", "pwa", "icon-512.png");

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
if (!existsSync(ICON_PATH)) missing.push("Trelod icon (l_frontend/public/pwa/icon-512.png)");
if (missing.length > 0) {
  console.error(`Linux build artifacts are missing from ${RELEASE_DIR}:`);
  for (const filename of missing) console.error(`  - ${filename}`);
  console.error("Build them first with: npm run dist");
  process.exit(1);
}

const uploadDir = mkdtempSync(join(tmpdir(), "trelod-linux-release-"));
try {
  const uploads = [
    [join(RELEASE_DIR, artifacts[0]), join(uploadDir, "trelod.AppImage")],
    [join(RELEASE_DIR, artifacts[1]), join(uploadDir, "trelod.deb")],
    [ICON_PATH, join(uploadDir, "trelod-icon.png")],
  ];
  for (const [source, destination] of uploads) copyFileSync(source, destination);

  execFileSync("gh", [
    "release", "create", `v${version}`,
    ...uploads.map(([, destination]) => destination),
    "--repo", "vyoltrava/nebula",
    "--title", `Trelod Linux ${version}`,
    "--generate-notes",
  ], { stdio: "inherit" });
} finally {
  rmSync(uploadDir, { recursive: true, force: true });
}

console.log(`Linux ${version} release uploaded to GitHub.`);
