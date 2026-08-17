const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onFolderOpened: (callback) => {
    ipcRenderer.on('folder-opened', (event, folderPath) => callback(folderPath));
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});