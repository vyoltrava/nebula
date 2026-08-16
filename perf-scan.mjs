// perf-scan.mjs
// Запуск: COOKIE="..." node perf-scan.mjs   (или TOKEN="..." node perf-scan.mjs)
const FRONTEND = 'https://trelod.vercel.app';
const API = 'https://nebula-gqm2.onrender.com';

const H = {};
if (process.env.COOKIE) H.Cookie = process.env.COOKIE;
if (process.env.TOKEN)  H.Authorization = `Bearer ${process.env.TOKEN}`;

// Все роуты из твоего app/ + динамические с тестовыми id
const PAGES = [
  '/', '/login', '/search', '/notifications', '/messages', '/messages/1',
  '/bookmarks', '/settings', '/rules', '/team', '/updates',
  '/user/1', '/post/1', '/tag/test',
  '/admin', '/admin/reports', '/admin/roles', '/admin/themes', '/admin/tech',
];

async function measure(url) {
  const t0 = performance.now();
  const res = await fetch(url, { headers: H, redirect: 'manual' });
  const ttfb = performance.now() - t0;          // когда пришли заголовки
  const body = await res.text();
  const total = performance.now() - t0;
  return { status: res.status, ttfb, total,
           server: res.headers.get('x-process-time') }; // если ставил middleware
}

const flag = ms => ms > 1000 ? '🔴' : ms > 400 ? '🟡' : '🟢';

function print(title, rows) {
  console.log('\n=== ' + title + ' ===');
  rows.sort((a, b) => b.ttfb - a.ttfb).forEach(r =>
    console.log(
      `${flag(r.ttfb)} ${r.name.padEnd(45)} ${r.status}` +
      `  ttfb=${Math.round(r.ttfb)}ms  total=${Math.round(r.total)}ms` +
      (r.server ? `  server=${r.server}` : '')
    ));
}

async function pass() {
  const pages = [], api = [];
  for (const p of PAGES)
    pages.push({ name: 'PAGE ' + p, ...(await measure(FRONTEND + p)) });

  // список всех GET-роутов бэкенда — автоматически из openapi
  let paths = ['/api/counts', '/api/feed', '/api/themes/settings'];
  try {
    const spec = await (await fetch(API + '/openapi.json')).json();
    const auto = Object.entries(spec.paths)
      .filter(([_, m]) => m.get)
      .map(([p]) => p.replaceAll(/\{[^}]+\}/g, '1'));
    if (auto.length) paths = auto;
  } catch {}
  for (const p of paths)
    api.push({ name: 'API  ' + p, ...(await measure(API + p)) });

  return { pages, api };
}

console.log('Проход 1 (холодный, будит Render)...');
const cold = await pass();
console.log('Проход 2 (тёплый, это правда)...');
const warm = await pass();

print('PAGES — ХОЛОДНО', cold.pages);
print('PAGES — ТЕПЛО',  warm.pages);
print('API — ХОЛОДНО',  cold.api);
print('API — ТЕПЛО',    warm.api);