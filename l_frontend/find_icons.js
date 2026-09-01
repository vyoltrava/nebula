const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname);
const SKIP = ['node_modules', 'backup', '.next'];

const icons = [];

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.some(s => full.includes(s))) walk(full);
      continue;
    }
    if (!/\.(tsx|ts|js|jsx|json|html)$/.test(entry.name)) continue;

    let content;
    try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }

    if (
      content.includes('apple-touch-icon') ||
      content.includes('favicon') ||
      content.includes('maskable') ||
      content.includes('touch-icon')
    ) {
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (
          line.includes('apple-touch-icon') ||
          line.includes('favicon') ||
          line.includes('touch-icon') ||
          line.includes('maskable') ||
          line.includes('pwa/icon')
        ) {
          const rel = full.replace(/.*l_frontend[\\\/]/, '');
          icons.push(`${rel}:${i + 1}: ${line.trim().slice(0, 130)}`);
        }
      });
    }
  }
}

walk(ROOT);

if (icons.length === 0) {
  console.log('Иконки не найдены');
} else {
  icons.forEach(i => console.log(i));
  console.log('---Всего:', icons.length);
}