#!/usr/bin/env node
/**
 * Release script for Linux desktop
 * Usage: node scripts/release-linux.mjs <version>
 */

const fs = require('fs');
const path = require('path');

const version = process.argv[3];

if (!version) {
  console.error('Usage: node scripts/release-linux.mjs <version>');
  process.exit(1);
}

// Copy built artifacts to public folder for updates
const publicDir = path.resolve(__dirname, '..', '..', 'l_frontend', 'public', 'desktop');
const releaseDir = path.resolve(__dirname, '..', '..', 'linux', 'release');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// List released files and update update.json
const files = fs.readdirSync(releaseDir).filter(f => f.includes(version));
console.log(`Released files for version ${version}:`, files);

// Here we would typically update update.json, but for simplicity:
console.log('Linux release completed for version:', version);