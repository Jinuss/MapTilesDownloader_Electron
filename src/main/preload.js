const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  //下载
  downloadArea: (options) => ipcRenderer.invoke('download-area', options),

  //监听线程任务分配
  onWorkerTaskAssigned: (callback) => ipcRenderer.on('assigned-task-worker', (event, data) => {
    callback(data)
  }),
  // 监听线程任务进度
  onWorkerTaskProgress: (callback) => ipcRenderer.on('chunk-progress', (event, data) => {
    callback(data)
  }),
  // 监听任务信息更新
  onTaskInfoUpdate: (callback) => ipcRenderer.on('update-task-info', (event, data) => {
    callback(data)
  }),

  // 任务进度
  onJobProgress: (callback) => ipcRenderer.on('tile-job-progress', (event, data) => {
    callback(data)
  }),

  // 任务创建
  onJobCreated: (callback) => ipcRenderer.on('tile-job-created', (event, data) => {
    callback(data);
  }),

  // 任务更新
  onJobUpdate: (callback) => ipcRenderer.on('tile-job-update', (event, data) => callback(data)),


  // 打开目录
  openFolder: (path) => ipcRenderer.invoke('open-folder', path),

  // 选择目录
  selectFolder: (path) => ipcRenderer.invoke('select-folder', path),

  // 获取默认下载目录
  getDefaultFolder: () => ipcRenderer.invoke('get-default-folder'),

  //计算瓦片
  calculateTiles: (options) => ipcRenderer.invoke('calculate-tiles', options),
});