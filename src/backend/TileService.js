const path = require('path');
const fs = require('fs-extra');
const { Worker } = require('worker_threads');
const EventEmitter = require('events');
const os = require('os');

class TileService extends EventEmitter {
  constructor(userDataPath) {
    super();

    // 解决核心错误：使用传入的用户数据路径
    this.storageDir = path.join(userDataPath, 'tiles');

    // 确保存储目录存在
    fs.ensureDirSync(this.storageDir);
    console.log(`瓦片存储目录: ${this.storageDir}`);

    this.workerPool = {};
    this.downloadQueue = [];
    this.activeDownloads = 0;
    this.maxConcurrency = os.cpus().length; // 根据CPU核心数设置并发数

    // 解决序列化问题 - 存储Promise回调
    this.promiseCallbacks = new Map(); // Map<jobId, {resolve, reject}>

    // 创建 worker 源文件路径
    this.workerScriptPath = path.join(__dirname, 'tileWorker.js');

    // 初始化工作线程池
    this.initWorkerPool();
  }

  async initWorkerPool() {
    try {
      // 确保工作线程脚本存在
      if (!fs.existsSync(this.workerScriptPath)) {
        throw new Error(`工作线程脚本不存在: ${this.workerScriptPath}`);
      }

      console.log(`正在初始化工作线程池 (${this.maxConcurrency} workers)...`);

      for (let i = 0; i < this.maxConcurrency; i++) {
        const worker = new Worker(this.workerScriptPath, {
          workerData: {
            storageDir: this.storageDir,
            workerId: i
          }
        });

        worker.on('message', (msg) => this.handleWorkerMessage(msg, i));
        worker.on('error', (err) => this.handleWorkerError(err, i));
        worker.on('exit', (code) => this.handleWorkerExit(code, i));

        this.workerPool[i] = {
          worker,
          busy: false,
          id: i,
          lastActivity: Date.now(),
          currentJobId: null
        };
      }

      console.log(`工作线程池初始化成功`);
    } catch (error) {
      console.error('初始化工作线程池失败:', error);
      this.emit('error', { type: 'init', error: error.message });
    }
  }

  handleWorkerMessage(msg, workerId) {
    if (!msg || !msg.type) return;

    try {
      if (msg.type === 'progress') {
        // 转发进度更新
        this.emit('progress', {
          ...msg,
          workerId
        });
      }

      if (msg.type === 'completed') {
        this.workerPool[workerId].busy = false;
        this.workerPool[workerId].lastActivity = Date.now();
        const jobId = this.workerPool[workerId].currentJobId;
        this.workerPool[workerId].currentJobId = null;

        // 处理任务完成回调
        if (this.promiseCallbacks.has(jobId)) {
          const { resolve } = this.promiseCallbacks.get(jobId);
          this.promiseCallbacks.delete(jobId);

          // 发送完成通知
          this.emit('job-completed', {
            jobId,
            duration: Date.now() - msg.startTime,
            downloadedCount: msg.downloadedCount,
            skippedCount: msg.skippedCount,
            errorCount: msg.errorCount
          });

          // 解析Promise
          resolve({
            jobId,
            ...msg
          });
        }

        this.processQueue();
      }

      if (msg.type === 'error') {
        const jobId = this.workerPool[workerId].currentJobId;
        this.workerPool[workerId].busy = false;
        this.workerPool[workerId].currentJobId = null;

        // 处理任务失败回调
        if (this.promiseCallbacks.has(jobId)) {
          const { reject } = this.promiseCallbacks.get(jobId);
          this.promiseCallbacks.delete(jobId);

          // 发送失败通知
          this.emit('job-failed', {
            jobId,
            error: msg.error
          });

          // 拒绝Promise
          reject(new Error(msg.error));
        }

        this.processQueue();
      }
    } catch (error) {
      console.error(`处理工作线程 ${workerId} 消息失败:`, error);
      this.emit('error', {
        type: 'message',
        workerId,
        error: error.message,
        rawMessage: msg
      });
    }
  }

  handleWorkerError(err, workerId) {
    console.error(`工作线程 ${workerId} 错误:`, err);
    this.emit('error', {
      type: 'worker',
      workerId,
      error: err.message
    });

    // 重启工作线程
    this.restartWorker(workerId);
  }

  handleWorkerExit(code, workerId) {
    if (code !== 0) {
      console.error(`工作线程 ${workerId} 异常退出 (代码 ${code})`);
      this.emit('error', {
        type: 'exit',
        workerId,
        code
      });

      // 重启工作线程
      this.restartWorker(workerId);
    } else {
      console.log(`工作线程 ${workerId} 正常退出`);
    }
  }

  restartWorker(workerId) {
    try {
      console.log(`重启工作线程 ${workerId}...`);

      // 终止旧工作线程
      if (this.workerPool[workerId]?.worker) {
        this.workerPool[workerId].worker.terminate();
      }

      // 创建新工作线程
      const worker = new Worker(this.workerScriptPath, {
        workerData: {
          storageDir: this.storageDir,
          workerId
        }
      });

      worker.on('message', (msg) => this.handleWorkerMessage(msg, workerId));
      worker.on('error', (err) => this.handleWorkerError(err, workerId));
      worker.on('exit', (code) => this.handleWorkerExit(code, workerId));

      this.workerPool[workerId] = {
        worker,
        busy: false,
        id: workerId,
        lastActivity: Date.now(),
        currentJobId: null
      };

      console.log(`工作线程 ${workerId} 已重启`);

      // 检查是否有任务需要恢复
      if (this.workerPool[workerId].currentJobId) {
        this.recoverJob(workerId, this.workerPool[workerId].currentJobId);
      } else {
        this.processQueue();
      }
    } catch (error) {
      console.error(`重启工作线程 ${workerId} 失败:`, error);
      this.emit('error', {
        type: 'restart',
        workerId,
        error: error.message
      });
    }
  }

  downloadArea(options) {
    return new Promise((resolve, reject) => {
      try {
        const jobId = `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // 计算瓦片
        const tiles = this.calculateTiles(options);

        const jobInfo = {
          jobId,
          options,
          status: 'queued',
          tiles,
          tileCount: tiles.length,
          startTime: Date.now(),
          progress: 0,
          downloaded: 0,
          errors: 0
        };

        // 存储Promise回调以备后用
        this.promiseCallbacks.set(jobId, { resolve, reject });

        this.emit('job-created', jobInfo);

        this.downloadQueue.push(jobInfo);
        this.processQueue();
      } catch (error) {
        reject(error);
      }
    });
  }

  processQueue() {
    try {
      while (this.downloadQueue.length > 0 && this.hasAvailableWorker()) {
        const workerId = this.getAvailableWorkerId();
        if (workerId === null) break;

        const job = this.downloadQueue.shift();
        this.assignToWorker(job, workerId);
      }

      // 更新队列状态
      const queueInfo = {
        active: Object.values(this.workerPool).filter(w => w.busy).length,
        queued: this.downloadQueue.length,
        workers: this.maxConcurrency
      };

      this.emit('queue-update', queueInfo);
    } catch (error) {
      console.error('处理队列失败:', error);
      this.emit('error', {
        type: 'queue',
        error: error.message
      });
    }
  }

  assignToWorker(job, workerId) {
    if (!this.workerPool[workerId]) {
      console.error(`工作线程 ${workerId} 不存在，无法分配任务`);
      // 拒绝任务Promise
      if (this.promiseCallbacks.has(job.jobId)) {
        const { reject } = this.promiseCallbacks.get(job.jobId);
        this.promiseCallbacks.delete(job.jobId);
        reject(new Error(`工作线程 ${workerId} 不可用`));
      }
      return;
    }

    try {
      this.workerPool[workerId].busy = true;
      this.workerPool[workerId].jobId = job.jobId;
      this.workerPool[workerId].currentJobId = job.jobId;
      this.workerPool[workerId].lastActivity = Date.now();

      job.status = 'processing';
      job.workerId = workerId;

      this.emit('job-update', {
        jobId: job.jobId,
        status: 'processing',
        workerId,
        startTime: job.startTime
      });

      // 发送作业给工作线程 - 确保只传递可序列化数据
      this.workerPool[workerId].worker.postMessage({
        type: 'start-download',
        jobId: job.jobId,
        workerId,
        tiles: job.tiles,
        storageDir: this.storageDir,
        urlTemplate: job.options.urlTemplate
      });
    } catch (error) {
      console.error(`给工作线程 ${workerId} 分配任务失败:`, error);
      this.workerPool[workerId].busy = false;
      this.workerPool[workerId].currentJobId = null;

      // 拒绝任务Promise
      if (this.promiseCallbacks.has(job.jobId)) {
        const { reject } = this.promiseCallbacks.get(job.jobId);
        this.promiseCallbacks.delete(job.jobId);
        reject(error);
      }
    }
  }

  // 计算瓦片请求
  calculateTileRequests(bounds, currentZoom) {
    const requests = [];
    const zoomRange = [
      Math.max(0, currentZoom - 2),
      Math.min(18, currentZoom + 2),
    ];

    for (let z = zoomRange[0]; z <= zoomRange[1]; z++) {
      const topLeft = map.project(bounds.getNorthWest(), z);
      const bottomRight = map.project(bounds.getSouthEast(), z);

      const minX = Math.floor(topLeft.x / 256);
      const maxX = Math.floor(bottomRight.x / 256);
      const minY = Math.floor(topLeft.y / 256);
      const maxY = Math.floor(bottomRight.y / 256);

      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          requests.push({ z, x, y });
        }
      }
    }

    return requests;
  }
  calculateTiles(options) {
    console.log("🚀 ~ TileService ~ calculateTiles ~ options:", options)
    const { bounds, minZoom, maxZoom } = options;


    const [south, west, north, east] = bounds;

    // 确保在有效范围内
    const clampedSouth = Math.max(-85.0511, Math.min(85.0511, south));
    const clampedNorth = Math.max(-85.0511, Math.min(85.0511, north));
    const clampedWest = (west % 360 + 360) % 360;
    const clampedEast = (east % 360 + 360) % 360;

    const tiles = [];

    // 计算每个缩放级别的瓦片
    for (let z = minZoom; z <= maxZoom; z++) {
      // 计算该缩放级别的缩放比例
      const scale = Math.pow(2, z);

      // 计算经度方向的瓦片范围
      let tileMinX = Math.floor((clampedWest + 180) / 360 * scale);
      let tileMaxX = Math.floor((clampedEast + 180) / 360 * scale);

      // 处理跨越日期变更线的情况
      if (tileMinX > tileMaxX) {
        tileMaxX += scale;
      }

      // 计算纬度方向的瓦片范围
      // 使用墨卡托投影公式
      const rad = (deg) => deg * Math.PI / 180;
      const tileMinY = Math.floor(
        (1 - Math.log(Math.tan(rad(clampedNorth)) + 1 / Math.cos(rad(clampedNorth))) / Math.PI
        ) / 2 * scale);

      const tileMaxY = Math.floor(
        (1 - Math.log(Math.tan(rad(clampedSouth)) + 1 / Math.cos(rad(clampedSouth))) / Math.PI
        ) / 2 * scale);

      // 确保在有效范围内
      const maxTile = scale - 1;
      const minX = Math.max(0, Math.min(tileMinX, maxTile));
      const maxX = Math.min(maxTile, Math.max(tileMinX, tileMaxX));
      const minY = Math.max(0, Math.min(tileMinY, tileMaxY));
      const maxY = Math.min(maxTile, Math.max(tileMinY, tileMaxY));

      // 生成该缩放级别的所有瓦片
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          // 对于跨越日期变更线的瓦片做调整
          const actualX = x % scale;
          tiles.push({ z, x: actualX, y });
        }
      }
    }

    console.log(`计算瓦片: 层级 ${minZoom}-${maxZoom}, 总数: ${tiles.length}`);
    return tiles;
  }

  hasAvailableWorker() {
    return Object.values(this.workerPool).some(worker => !worker.busy);
  }

  getAvailableWorkerId() {
    for (const worker of Object.values(this.workerPool)) {
      if (!worker.busy) return worker.id;
    }
    return null;
  }

  // 安全关闭所有工作线程
  shutdown() {
    console.log('关闭瓦片服务...');

    // 清空队列
    this.downloadQueue.forEach(job => {
      if (this.promiseCallbacks.has(job.jobId)) {
        const { reject } = this.promiseCallbacks.get(job.jobId);
        reject(new Error('服务已关闭'));
        this.promiseCallbacks.delete(job.jobId);
      }
    });

    this.downloadQueue = [];
    this.emit('queue-update', {
      active: 0,
      queued: 0,
      workers: 0
    });

    // 终止所有工作线程
    Object.values(this.workerPool).forEach(worker => {
      try {
        if (worker.worker) {
          worker.worker.terminate();
          console.log(`工作线程 ${worker.id} 已终止`);
        }
      } catch (error) {
        console.error(`终止工作线程 ${worker.id} 失败:`, error);
      }
    });

    // 清除所有未完成的Promise回调
    this.promiseCallbacks.forEach(({ reject }) => {
      reject(new Error('服务已关闭'));
    });
    this.promiseCallbacks.clear();

    console.log('瓦片服务已关闭');
  }
}

module.exports = TileService;