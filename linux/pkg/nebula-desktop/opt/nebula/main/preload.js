const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nebulaDesktop, {
  version: () => {
    return require('electron').remote.app.getVersion();
  },
  checkUpdate: () => {
    return window.nebulaDesktop.checkUpdate();
  },
  downloadAndInstall: () => {
    return window.nebulaDesktop.downloadAndInstall();
  }
});