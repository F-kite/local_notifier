const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  showNotification: (data) => ipcRenderer.invoke('show-notification', data),
  writeLog: (level, message) => ipcRenderer.invoke('write-log', { level, message }),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
  getLogPath: () => ipcRenderer.invoke('get-log-path'),
});
