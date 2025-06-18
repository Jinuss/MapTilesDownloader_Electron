const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  downloadArea: (options) => ipcRenderer.invoke('download-area', options),
  onTileProgress: (callback) => ipcRenderer.on('progress', callback),
  onJobCreated: (callback) => ipcRenderer.on('tile-job-created', (event,data)=>{
    callback(data);
  }),
  onJobUpdate: (callback) => ipcRenderer.on('job-update', callback),
  getStoragePath: () => ipcRenderer.invoke('get-storage-path'),
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),
  selectFolder: () => ipcRenderer.invoke('select-folder')
});