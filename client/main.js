const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

const store = new Store({
  defaults: {
    serverUrl: 'http://localhost:3000',
    jwt: null,
    username: null,
    userToken: null,
    minimizeToTray: true,
    autoStart: false,
    soundEnabled: true,
  },
});

// Error log file — in app root (portable) or userData (installed)
const logPath = app.isPackaged
  ? path.join(path.dirname(app.getPath('exe')), 'error.log')
  : path.join(__dirname, 'error.log');

function writeLog(level, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;
  try {
    fs.appendFileSync(logPath, line, 'utf-8');
  } catch {}
}

// Catch uncaught errors
process.on('uncaughtException', (err) => {
  writeLog('ERROR', `Uncaught: ${err.stack || err.message}`);
});
process.on('unhandledRejection', (reason) => {
  writeLog('ERROR', `Unhandled rejection: ${reason}`);
});

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 600,
    minHeight: 450,
    title: 'Local Notifier',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    if (store.get('minimizeToTray') && !app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Local Notifier');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Открыть', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Выход', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow.show());
}

function updateAutoStart() {
  app.setLoginItemSettings({
    openAtLogin: store.get('autoStart'),
    path: app.getPath('exe'),
  });
}

// IPC
ipcMain.handle('get-settings', () => ({
  serverUrl: store.get('serverUrl'),
  jwt: store.get('jwt'),
  username: store.get('username'),
  userToken: store.get('userToken'),
  minimizeToTray: store.get('minimizeToTray'),
  autoStart: store.get('autoStart'),
  soundEnabled: store.get('soundEnabled'),
}));

ipcMain.handle('save-settings', (_, settings) => {
  for (const [key, value] of Object.entries(settings)) {
    store.set(key, value);
  }
  if ('autoStart' in settings) updateAutoStart();
  return true;
});

ipcMain.handle('show-notification', (_, { title, body }) => {
  const notification = new Notification({
    title: title || 'Local Notifier',
    body: body || '',
    silent: !store.get('soundEnabled'),
  });
  notification.show();
  notification.on('click', () => mainWindow.show());
  return true;
});

ipcMain.handle('write-log', (_, { level, message }) => {
  writeLog(level, message);
  return true;
});

ipcMain.handle('open-log-file', () => {
  shell.openPath(logPath);
  return true;
});

ipcMain.handle('get-log-path', () => logPath);

app.whenReady().then(() => {
  createWindow();
  createTray();
  updateAutoStart();
  writeLog('INFO', 'Application started');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
