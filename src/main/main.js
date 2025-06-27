// main.js
const { app, BrowserWindow, ipcMain, session, dialog, shell } = require('electron');

const path = require('path');
const TileService = require('../backend/TileService');

const isDev = require('electron-is-dev');
const defaultDownloadPath = app.getPath('downloads');

let mainWindow;
let tileService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets/map.png'), // 图标路径
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });


  if (isDev) {
    mainWindow.loadURL('http://localhost:3005');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

app.whenReady().then(() => {
  const userAgent = session.defaultSession.getUserAgent()
  console.log('useAgent', userAgent)
  // 创建主窗口
  createWindow();

  // 初始化瓦片服务
  tileService = new TileService(defaultDownloadPath);

  //
  tileService.on('progress', (progress) => {
    mainWindow.webContents.send('tile-job-progress', progress);
  });

  tileService.on('job-update', (update) => {
    mainWindow.webContents.send('tile-job-update', update);
  });

  tileService.on('job-failed', (error) => {
    mainWindow.webContents.send('tile-job-failed', error);
  });

  tileService.on('error', (error) => {
    console.error('瓦片服务错误:', error);
    mainWindow.webContents.send('tile-service-error', error);
  });

  // 监听线程任务分配
  tileService.on('worker-task-assigned', (workerTaskInfo) => {
    mainWindow.webContents.send('assigned-task-worker', workerTaskInfo)
  })
  // 监听线程任务进度
  tileService.on('chunk-progress', (progress) => {
    mainWindow.webContents.send('chunk-progress', progress);
  })

  // 监听任务信息更新
  tileService.on('update-task-info', (taskInfo) => {
    mainWindow.webContents.send('update-task-info', taskInfo);
  })

  // 设置IPC通信
  ipcMain.handle('download-area', async (event, options) => {
    try {
      const result = await tileService.createDownloadJob(options);
      return { success: true, result };
    } catch (error) {
      return { success: false, result: error };
    }
  });

  ipcMain.handle('get-queue-status', async () => {
    return {
      active: Object.values(tileService.workerPool).filter(w => w.busy).length,
      queued: tileService.downloadQueue.length
    };
  });


  // 处理打开文件夹请求
  ipcMain.handle('open-folder', (event, path) => {
    return shell.openPath(path)
  })

  // 处理选择文件夹请求
  ipcMain.handle('select-folder', async (event, path) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: path
    })
    return result.filePaths[0] || null
  })

  // 处理通知默认存储目录
  ipcMain.handle('get-default-folder', () => {
    return tileService.storageDir
  })


  // 处理应用关闭
  app.on('before-quit', () => {
    tileService.shutdown();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
});