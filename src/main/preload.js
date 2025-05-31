const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  downloadArea: (options) => ipcRenderer.invoke('download-area', options),
  onTileProgress: (callback) => ipcRenderer.on('tile-progress', callback),
  onJobCreated: (callback) => ipcRenderer.on('job-created', callback),
  onJobUpdate: (callback) => ipcRenderer.on('job-update', callback),
  getStoragePath: () => ipcRenderer.invoke('get-storage-path')
});