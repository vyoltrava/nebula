const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function windowIconPath() {
  const iconPaths = [
    path.join(process.resourcesPath, 'public', 'pwa', 'icon-512.png'),
    path.join(__dirname, '..', 'public', 'pwa', 'icon-512.png'),
    path.join(__dirname, '..', '..', 'l_frontend', 'public', 'pwa', 'icon-512.png')
  ];

  return iconPaths.find((iconPath) => fs.existsSync(iconPath));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      zoomFactor: 1
    },
    show: false,
    title: 'trelod',
    icon: windowIconPath()
  });

  const startUrl = process.env.NEBULA_APP_URL || 'https://trelod.vercel.app';
  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  app.setName('trelod');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});