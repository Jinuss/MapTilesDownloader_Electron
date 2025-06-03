// main.js
const { app, BrowserWindow, ipcMain,session } = require('electron');
const path = require('path');
const TileService = require('../backend/TileService');

const isDev = require('electron-is-dev');
const userDataPath = app.getPath('userData');

let mainWindow;
let tileService;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
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
  tileService = new TileService(userDataPath);

  // 将服务事件转发到渲染进程
  tileService.on('job-created', (job) => {
    mainWindow.webContents.send('tile-job-created', job);
  });

  tileService.on('progress', (progress) => {
    mainWindow.webContents.send('tile-progress', progress);
  });

  tileService.on('job-completed', (result) => {
    mainWindow.webContents.send('tile-job-completed', result);
  });

  tileService.on('job-update', (update) => {
    mainWindow.webContents.send('tile-job-update', update);
  });

  tileService.on('job-failed', (error) => {
    mainWindow.webContents.send('tile-job-failed', error);
  });

  tileService.on('queue-update', (queue) => {
    mainWindow.webContents.send('tile-queue-update', queue);
  });

  tileService.on('error', (error) => {
    console.error('瓦片服务错误:', error);
    mainWindow.webContents.send('tile-service-error', error);
  });

  // 设置IPC通信
  ipcMain.handle('download-area', async (event, options) => {
    try {
      const result = await tileService.downloadArea(options);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-queue-status', async () => {
    return {
      active: Object.values(tileService.workerPool).filter(w => w.busy).length,
      queued: tileService.downloadQueue.length
    };
  });

  // 处理应用关闭
  app.on('before-quit', () => {
    tileService.shutdown();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
});