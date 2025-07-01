const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');
const { generateTileUrl, formatMilliseconds } = require('./Utils.js');
const { MESSAGE_TYPE } = require('./const.js');


// 获取存储目录和workerId
const storageDir = workerData?.storageDir;
const workerId = workerData?.workerId || 0;

// 文件缓存
const fileCache = new Map();

// 发送日志函数
function log(message, level = 'info') {
  if (parentPort) {
    parentPort.postMessage({
      type: MESSAGE_TYPE.WORKER_LOG,
      workerId,
      level,
      message,
      timestamp: Date.now()
    });
  }
}

// 检查文件是否存在
async function fileExists(filePath) {
  if (fileCache.has(filePath)) {
    return fileCache.get(filePath);
  }

  const exists = await fs.pathExists(filePath);
  fileCache.set(filePath, exists);
  return exists;
}


// 下载瓦片
async function downloadTile(url, maxRetries = 3, retryDelay = 1000) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TileDownloader/1.0)',
          'Accept-Encoding': 'gzip, deflate'
        }
      });

      return {
        status: 'success',
        buffer: response.data
      };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log(`瓦片不存在: ${url}`, 'warn');
        return { status: 'not_found' };
      }

      retries++;
      if (retries < maxRetries) {
        log(`下载失败 (${url}), 重试 ${retries}/${maxRetries}: ${error.message}`, 'warn');
        await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
      } else {
        log(`下载失败 (${url}) 达到最大重试次数: ${error.message}`, 'error');
        return {
          status: 'error',
          error: `下载失败: ${error.message}`
        };
      }
    }
  }
}

// 保存瓦片
async function saveTile(filePath, buffer) {
  try {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, buffer);
    fileCache.set(filePath, true);

    return true;
  } catch (error) {
    log(`保存瓦片失败: ${filePath}: ${error.message}`, 'error');
    return false;
  }
}



// 消息处理
parentPort.on('message', async (msg) => {
  if (msg.type !== 'download-chunk') return;

  const { jobId, tiles = [], urlTemplate, subdomains, storagePath } = msg;
  const startTime = Date.now();
  const totalTiles = tiles.length;

  log(`开始线程任务 ${workerId}: ${totalTiles} 个瓦片`, 'info');

  // 定义消息结构：非日志类
  let messageData = {
    jobId, // 任务Id
    workerId, // 线程id
    type: "",// 消息类型
    status: "",//描述
    // tiles, // 分配的瓦片
    chunkSize: totalTiles,// 分配瓦片的大小
    completed: 0, //下载成功
    fail: 0, // 下载失败
    skip: 0, // 跳过
  }

  try {
    // 报告任务开始
    messageData.type = MESSAGE_TYPE.WORKER_PROGRESS;
    messageData.status = `线程任务${(workerId + 1)}开始`;

    parentPort.postMessage(messageData);

    for (let i = 0; i < totalTiles; i++) {
      const tile = tiles[i];
      const { z, x, y } = tile;

      // 生成瓦片路径
      const lastPath = storagePath || storageDir;
      const tileDir = path.join(lastPath, `${z}/${x}`);
      const tilePath = path.join(tileDir, `${y}.png`);

      // 检查瓦片是否已存在
      if (await fileExists(tilePath)) {
        log(`瓦片已存在: ${tilePath}`, 'warn')
        messageData.skip++;
        continue;
      }

      // 生成URL
      const tileUrl = generateTileUrl(urlTemplate, subdomains, z, x, y);

      // 下载瓦片
      const result = await downloadTile(tileUrl);

      if (result.status === 'success') {
        // 保存瓦片
        const saveResult = await saveTile(tilePath, result.buffer);
        if (saveResult) {
          messageData.completed++;
        } else {
          messageData.fail++;
        }
      } else if (result.status === 'not_found') {
        log(`瓦片找不到: ${tilePath}`, 'warn')
        messageData.skip++;
      } else {
        messageData.fail++;
      }
      // 报告进度
      if (i % 10 === 0 || i === totalTiles - 1) {
        messageData.type = MESSAGE_TYPE.WORKER_PROGRESS;
        messageData.status = `线程任务${(workerId + 1)}下载${z}/${x}/${y}中`;
        parentPort.postMessage(messageData);
      }
      // 避免内存溢出
      if (i % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    // 任务完成
    log(`线程任务 ${(workerId + 1)} 完成: ${messageData.completed} 下载, ${messageData.skip} 跳过, ${messageData.fail} 失败`, 'info');

    messageData.type = MESSAGE_TYPE.WORKER_COMPLETED;
    messageData.status = `线程任务${(workerId + 1)}完成`;
    messageData.endTime = Date.now();
    messageData.duration = formatMilliseconds(Date.now() - startTime)

    parentPort.postMessage(messageData);
  } catch (error) {
    // 任务失败
    log(`任务 ${jobId} 失败: ${error.message}`, 'error');
    messageData.type = MESSAGE_TYPE.WORKER_ERROR;
    messageData.status = `线程${(workerId + 1)}失败`;
    parentPort.postMessage(messageData);
  } finally {
    // 清理资源
    fileCache.clear();
  }
});

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
  log(`未处理的Rejection: ${reason}`, 'error');
  if (parentPort) {
    parentPort.postMessage({
      type: MESSAGE_TYPE.WORKER_ERROR,
      error: `未处理的Rejection: ${reason}`
    });
  }
});

process.on('uncaughtException', (error) => {
  log(`未捕获的异常: ${error.message}\n${error.stack}`, 'error');
  if (parentPort) {
    parentPort.postMessage({
      type: MESSAGE_TYPE.WORKER_ERROR,
      error: `未捕获的异常: ${error.message}`
    });
  }
  // 进程可能不稳定，退出
  process.exit(1);
});