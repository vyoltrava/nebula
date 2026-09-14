// main/preload.js — мост между изолированным рендером (frontend) и главным процессом.
// Экспонирует window.trelodDesktop. Frontend видит это в lib/appUpdate.ts и
// использует для версии + автообновления (аналог нативного плагина AppUpdate в APK).
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trelodDesktop', {
  // Маркер нативного десктоп-приложения (frontend по нему включает автообновление).
  isDesktop: true,
  platform: process.platform,

  // Версия установленного приложения (из package.json / NSIS).
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  // Свежая версия + ссылка на установщик из /desktop/update.json.
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),

  // Скачать новый установщик и запустить его (тихо).
  downloadAndInstall: (url) => ipcRenderer.invoke('app:download-and-install', url),

  // Открыть внешнюю ссылку в системном браузере.
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // Прогресс скачивания установщика: cb({received, total}).
  onUpdateProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },

  // Главный процесс сам нашёл новую версию — мгновенный сигнал на показать баннер.
  // cb({ available, latestVersion, currentVersion, installerUrl }).
  onUpdateAvailable: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('update:available', listener);
    return () => ipcRenderer.removeListener('update:available', listener);
  },
});
