// main/index.js — главный процесс trelod Desktop (Windows).
// Это «оболочка» над продакшен-фронтендом (как Capacitor для Android APK):
// Electron-окно открывает ту же базу, что и мобильное приложение, а нативный
// слой даёт установщик (NSIS), уведомления и автообновление «как у APK».
'use strict';

const {
  app, BrowserWindow, ipcMain, shell,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');

// ---------------------------------------------------------------- настройки
// URL продакшен-фронтенда (тот же, что в mobile/capacitor.config.ts).
// Для локальной отладки задай:  NEBULA_APP_URL=http://localhost:3000
const APP_URL = process.env.NEBULA_APP_URL || 'https://trelod.vercel.app';

// Манифест обновлений, задеплоенный вместе с фронтом (l_frontend/public/desktop/update.json).
const UPDATE_MANIFEST =
  process.env.NEBULA_UPDATE_MANIFEST ||
  (() => {
    try {
      return new URL('/desktop/update.json', APP_URL).href;
    } catch {
      return 'https://trelod.vercel.app/desktop/update.json';
    }
  })();

const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут на скачивание установщика

let mainWindow = null;

/**
 * Иконка окна — логотип из l_frontend/public/ (единый источник в git, дублей нет).
 * В упакованном приложении (asar) этого файла нет — Windows использует иконку .exe,
 * которая задаётся через win.icon в electron-builder.yml (тоже из public).
 */
function windowIconPath() {
  const p = path.join(__dirname, '..', '..', 'l_frontend', 'public', 'pwa', 'icon-512.png');
  return fs.existsSync(p) ? p : undefined;
}
/** Сравнение версий вида 1.2.3: -1 / 0 / 1 */
function compareVersions(a, b) {
  const pa = String(a || '0').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/** HTTP(S)-GET ответ (JSON из update.json). */
function get(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'TrelodDesktop/' + app.getVersion() } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => req.destroy(new Error('Timeout')));
  });
}

/** Качает HTTP(S)-URL в файл, следуя редиректам (Vercel/CloudFront). */
function downloadFile(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http;
    const file = fs.createWriteStream(dest);
    const req = mod.get(url, { headers: { 'User-Agent': 'TrelodDesktop/' + app.getVersion() } }, (res) => {
      // Редиректы
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        const next = new URL(res.headers.location, url).href;
        if (redirectsLeft <= 0) return reject(new Error('Слишком много редиректов'));
        return downloadFile(next, dest, redirectsLeft - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      res.on('data', (chunk) => {
        received += chunk.length;
        sendToRenderer('update:progress', { received, total });
      });
      res.pipe(file);
    });
    req.on('error', (e) => { file.destroy(); reject(e); });
    req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => req.destroy(new Error('Timeout')));
    file.on('finish', () => file.close(() => resolve(dest)));
    file.on('error', (e) => { req.destroy(); reject(e); });
  });
}

/** Запустить NSIS-установщик втихую и закрыть текущее приложение. */
function runInstaller(exePath) {
  // /S — тихая установка NSIS. Установщик сам поднимет приложение по завершении.
  const child = spawn(exePath, ['/S'], { detached: true, stdio: 'ignore' });
  child.unref();
  // Даём установщику пару секунд на старт, затем выходим из текущей копии.
  setTimeout(() => app.quit(), 1200);
  return 'Установщик запущен. Приложение закроется и перезапустится после установки.';
}


// ---------------------------------------------------------------- IPC (preload)
ipcMain.handle('app:get-version', () => app.getVersion());

// Внутренняя проверка обновления (общая для IPC и фонового поллера).
async function checkUpdateInternal() {
  const empty = { available: false, latestVersion: '', currentVersion: app.getVersion(), installerUrl: null };
  try {
    const res = await get(UPDATE_MANIFEST);
    if (res.status !== 200) return empty;
    const meta = JSON.parse(res.body);
    if (!meta?.version || !meta?.url) return empty;
    const installerUrl = new URL(meta.url, APP_URL).href;
    return {
      available: compareVersions(String(meta.version), app.getVersion()) > 0,
      latestVersion: String(meta.version),
      currentVersion: app.getVersion(),
      installerUrl,
    };
  } catch (e) {
    return { ...empty, error: e?.message || String(e) };
  }
}

ipcMain.handle('app:check-update', () => checkUpdateInternal());

ipcMain.handle('app:download-and-install', async (_e, url) => {
  try {
    if (!url) throw new Error('Нет ссылки на установщик');
    const dest = path.join(os.tmpdir(), `trelod-setup-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.exe`);
    await downloadFile(url, dest);
    const message = runInstaller(dest);
    return { ok: true, message };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle('shell:open-external', async (_e, url) => {
  if (typeof url !== 'string' || !/^https?:/i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});


// ---------------------------------------------------------------- фоновые проверки обновления
// Каждую минуту опрашиваем сервер (update.json). Как только появилась версия новее
// текущей — сразу шлём рендеру событие → баннер «Обновить сейчас» появляется без
// перезапуска. Это и есть «кнопка сразу после деплоя».
let lastNotifiedVersion = null;
const UPDATE_POLL_MS = 60 * 1000;

async function pollAndNotifyUpdate() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const info = await checkUpdateInternal().catch(() => null);
  if (info && info.available && info.installerUrl && info.latestVersion !== lastNotifiedVersion) {
    lastNotifiedVersion = info.latestVersion;
    sendToRenderer('update:available', info);
  }
}


// ---------------------------------------------------------------- окно
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#18181b',
    autoHideMenuBar: true,
    icon: windowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.setTitle('trelod');
  mainWindow.loadURL(APP_URL);

  // Внешние ссылки (target=_blank / window.open) — в системный браузер, не внутри окна.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Клик по ссылке с уходом на другой домен → системный браузер.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const localDev = APP_URL.startsWith('http://localhost') || APP_URL.startsWith('http://127.0.0.1');
    if (url.startsWith(APP_URL) || localDev) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---------------------------------------------------------------- жизнь приложения
// Один экземпляр: повторный запуск → фокус существующего окна.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Всегда обрабатывать window.open в веб-контенте как внешний браузер.
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('app.trelod.desktop');
    createWindow();

    // Фоновая проверка обновлений: сразу после старта, далее каждую минуту,
    // плюс при фокусе окна — чтобы баннер о новой версии появлялся мгновенно.
    pollAndNotifyUpdate();
    const updaterTimer = setInterval(pollAndNotifyUpdate, UPDATE_POLL_MS);
    mainWindow.on('focus', pollAndNotifyUpdate);
    app.on('will-quit', () => clearInterval(updaterTimer));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

