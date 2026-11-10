const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trelodDesktop', {
  version: () => {
    return require('electron').remote.app.getVersion();
  },
  checkUpdate: () => {
    return window.trelodDesktop.checkUpdate();
  },
  downloadAndInstall: () => {
    return window.trelodDesktop.downloadAndInstall();
  }
});