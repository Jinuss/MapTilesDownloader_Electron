const path = require("path");
const fs = require("fs-extra");
const { Worker } = require("worker_threads");
const EventEmitter = require("events");
const os = require("os");
const { calculateTiles, sumStatsFast } = require("./Utils.js");
const Logger = require("./log.js");
const { MESSAGE_TYPE } = require("./const.js");

class TileService extends EventEmitter {
  constructor(defaultDownloadPath) {
    super();

    this.logger = new Logger({
      logPath: defaultDownloadPath,
      fileName: "log.txt",
    });

    // 解决核心错误：使用传入的用户数据路径
    this.storageDir = path.join(defaultDownloadPath, "");

    // 确保存储目录存在
    fs.ensureDirSync(this.storageDir);

    this.logger.info(`瓦片默认存储目录: ${this.storageDir}`);
    this.workerPool = {};

    this.maxConcurrency = os.cpus().length; // 根据CPU核心数设置并发数

    this.activeJobs = new Map();

    // 创建 worker 源文件路径
    this.workerScriptPath = path.join(__dirname, "tileWorker.js");

    // 全局线程进度
    this.workerData = {};

    // 初始化工作线程池
    this.initWorkerPool();
  }

  async initWorkerPool() {
    try {
      // 确保工作线程脚本存在
      if (!fs.existsSync(this.workerScriptPath)) {
        throw new Error(`工作线程脚本不存在: ${this.workerScriptPath}`);
      }

      this.logger.info(
        `正在初始化工作线程池 (${this.maxConcurrency} workers)...`,
      );

      for (let i = 0; i < this.maxConcurrency; i++) {
        const worker = new Worker(this.workerScriptPath, {
          workerData: {
            storageDir: this.storageDir,
            workerId: i,
          },
        });

        worker.on("message", (msg) => this.handleWorkerMessage(msg, i));
        worker.on("error", (err) => this.handleWorkerError(err, i));
        worker.on("exit", (code) => this.handleWorkerExit(code, i));

        this.workerPool[i] = {
          worker,
          busy: false,
          id: i,
          lastActivity: Date.now(),
          currentJobId: null,
        };

        this.workerData[i] = {
          workerId: i,
          completed: 0,
          fail: 0,
          skip: 0,
        };
      }

      this.logger.info(`工作线程池初始化成功`);
    } catch (error) {
      this.logger.error("初始化工作线程池失败:", error);
    }
  }

  handleWorkerMessage(msg, workerId) {
    if (!msg || !msg.type) return;

    try {
      const { type, message } = msg;
      // 日志类
      if (type === MESSAGE_TYPE.WORKER_LOG) {
        this.logger[msg.level || "info"](message);
      } else if (type === MESSAGE_TYPE.WORKER_PROGRESS) {
        this.updateWorkerProgress({ ...msg });
      }
    } catch (error) {
      this.logger.error(`处理工作线程 ${workerId} 消息失败:`, error);
      this.emit("error", {
        type: "message",
        workerId,
        error: error.message,
        rawMessage: msg,
      });
    }
  }

  updateWorkerProgress(workerData) {
    const { workerId, completed, fail, skip } = workerData;
    this.workerData[workerId] = {
      ...this.workerData[workerId],
      workerId,
      fail,
      skip,
      completed,
    };
    this.emit("update-worker-progress", sumStatsFast(this.workerData));
  }

  handleWorkerError(err, workerId) {
    this.logger.error(`工作线程 ${workerId} 错误:`, err);
    this.emit("error", {
      type: "worker",
      workerId,
      error: err.message,
    });

    // 重启工作线程
    this.restartWorker(workerId);
  }

  handleWorkerExit(code, workerId) {
    if (code !== 0) {
      this.logger.error(`工作线程 ${workerId} 异常退出 (代码 ${code})`);
      this.emit("error", {
        type: "exit",
        workerId,
        code,
      });
    } else {
      this.logger.info(`工作线程 ${workerId} 正常退出`);
    }
  }

  // 创建下载任务
  getTiles(options) {
    return new Promise(async (resolve, reject) => {
      try {
        const jobId = `job-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        let taskInfo = {
          jobId,
          type: "task",
          status: "",
          tiles: [],
          total: 0,
        };
        // 计算瓦片
        this.logger.info("开始计算瓦片");
        const resp = await calculateTiles(options);
        this.logger.info(`完成瓦片计算，共计${resp.data.length}个瓦片`);
        taskInfo.tiles = resp.data;
        taskInfo.status = "完成瓦片计算";
        taskInfo.total = resp.data.length;
        resolve(taskInfo);
        const jobInfo = {
          total: taskInfo.total,
          completed: 0,
          fail: 0,
          skip: 0,
          jobId,
          tiles: taskInfo.tiles,
          status: "开始下载任务",
          tasksAssigned: 0, // 已分配的任务数
          tasksCompleted: 0, // 已完成的任务数
          allocatedTiles: 0, // 已分配的瓦片数
          perWorkerChunkSize: 0, // 每个工作线程分配的子集大小
          options,
        };

        // 开始下载任务
        setTimeout(() => {
          this.activeJobs.set(jobId, jobInfo);
          this.updateUI(jobInfo);
          this.startTask(jobInfo);
        }, 0);

        return;
      } catch (error) {
        reject(error);
      }
    });
  }

  updateUI(jobInfo) {
    this.emit("update-task", jobInfo);
  }

  startTask(jobInfo) {
    // 计算每个工作线程的瓦片分配大小
    this.calculateJobDistribution(jobInfo);
    // 分发任务
    this.processJob(jobInfo);
  }

  // 计算作业如何分配到各工作线程
  calculateJobDistribution(jobInfo) {
    jobInfo.status = "计算每个线程处理瓦片大小";
    jobInfo.perWorkerChunkSize = Math.max(
      1,
      Math.ceil(jobInfo.total / this.maxConcurrency),
    );

    // 重置状态计数
    jobInfo.tasksAssigned = 0;
    jobInfo.tasksCompleted = 0;
    jobInfo.allocatedTiles = 0;

    this.logger.info(
      `[${jobInfo.jobId}] 作业分配: ${this.maxConcurrency} 工作线程, 每线程处理 ${jobInfo.perWorkerChunkSize} 瓦片`,
    );
    this.updateUI(jobInfo);
  }

  // 处理单个作业-分发给多个工作线程
  processJob(jobInfo) {
    // 更新作业状态
    jobInfo.status = "开始分发任务";
    this.updateUI(jobInfo);
    // 尽可能分配瓦片给空闲工作线程
    this.assignTilesToWorker(jobInfo);
  }

  assignTilesToWorker(jobInfo) {
    while (
      jobInfo.allocatedTiles < jobInfo.total &&
      this.hasAvailableWorker()
    ) {
      const workerId = this.getAvailableWorkerId();
      // 没有空闲结束分配
      if (workerId === null) break;
      // 计算要分配的瓦片范围
      const startIndex = jobInfo.allocatedTiles;
      const endIndex = Math.min(
        jobInfo.allocatedTiles + jobInfo.perWorkerChunkSize,
        jobInfo.total,
      );

      // 截取瓦片子集
      const tileChunk = jobInfo.tiles.slice(startIndex, endIndex);
      const chunkSize = endIndex - startIndex;

      // 分配任务给工作线程
      this.assignTileChunkToWorker(jobInfo, workerId, tileChunk, chunkSize);

      // 更新分配状态
      jobInfo.allocatedTiles = endIndex;
      jobInfo.tasksAssigned++;

      this.logger.info(
        `分配${startIndex}~${endIndex}瓦片给工作线程${workerId}，共计${chunkSize}个瓦片`,
      );
    }

    // 如果没有分配完所有瓦片，等待空闲工作线程
    if (jobInfo.allocatedTiles < jobInfo.total) {
      this.logger.info(
        `[${jobInfo.jobId}] 等待空闲工作线程 (已分配 ${jobInfo.allocatedTiles}/${jobInfo.total})`,
      );
    } else {
      this.logger.info(`[${jobInfo.jobId}] 所有瓦片已分配到工作线程`);
    }
  }

  // 分配瓦片子集给特定工作线程
  assignTileChunkToWorker(jobInfo, workerId, tileChunk, chunkSize) {
    if (!this.workerPool[workerId]) {
      this.logger.error(`工作线程 ${workerId} 不存在，无法分配任务`);
      return;
    }

    try {
      // 标记工作线程为忙碌状态
      this.workerPool[workerId].busy = true;
      this.workerPool[workerId].currentJobId = jobInfo.jobId;
      this.workerPool[workerId].lastActivity = Date.now();

      // 更新任务状态
      const workInfo = {
        jobId: jobInfo.jobId,
        workerId,
        startTime: Date.now(),
        chunkSize,
        completed: 0,
      };
      this.workerData[workerId] = {
        ...this.workerData[workerId],
        ...workInfo,
      };

      // 发送任务信息给工作线程
      this.workerPool[workerId].worker.postMessage({
        type: MESSAGE_TYPE.WORKER_CHUNK_DOWNLOAD,
        jobId: jobInfo.jobId,
        workerId,
        tiles: tileChunk,
        storageDir: this.storageDir,
        urlTemplate: jobInfo.options.urlTemplate,
        subdomains: jobInfo.options.subdomains,
        storagePath: jobInfo.options.storagePath,
      });
    } catch (error) {
      this.logger.error(`给工作线程 ${workerId} 分配任务失败:`, error);
      this.workerPool[workerId].busy = false;
      this.workerPool[workerId].currentJobId = null;
    }
  }

  hasAvailableWorker() {
    return Object.values(this.workerPool).some((worker) => !worker.busy);
  }

  getAvailableWorkerId() {
    for (const worker of Object.values(this.workerPool)) {
      if (!worker.busy) return worker.id;
    }
    return null;
  }

  // 安全关闭所有工作线程
  shutdown() {
    this.logger.info("关闭瓦片服务...");

    // 终止所有工作线程
    Object.values(this.workerPool).forEach((worker) => {
      try {
        if (worker.worker) {
          worker.worker.terminate();
          this.logger.info(`工作线程 ${worker.id} 已终止`);
        }
      } catch (error) {
        this.logger.error(`终止工作线程 ${worker.id} 失败:`, error);
      }
    });

    this.logger.info("瓦片服务已关闭");
  }
}

module.exports = TileService;
