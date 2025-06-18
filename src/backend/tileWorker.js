const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs-extra');
const axios = require('axios');

// 获取存储目录和workerId
const storageDir = workerData?.storageDir;
const workerId = workerData?.workerId || 0;

// 文件缓存
const fileCache = new Map();

// 发送日志函数
function log(message, level = 'info') {
  if (parentPort) {
    parentPort.postMessage({
      type: 'log',
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

// 生成瓦片URL
function generateTileUrl(template, domains, z, x, y) {
  let url = template;

  // 处理子域轮询
  if (template.includes('{s}')) {
    const subdomains = domains ? domains.split('') : ['a', 'b', 'c'];
    const subdomain = subdomains[Math.floor(Math.random() * subdomains.length)];
    url = url.replace('{s}', subdomain);
  }

  // 替换变量
  url = url
    .replace(/\{z\}/g, z)
    .replace(/\{x\}/g, x)
    .replace(/\{y\}/g, y)
    .replace(/\{-y\}/g, (Math.pow(2, z) - 1 - y));

  return url;
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
function formatMilliseconds(ms) {
  // 计算各个时间单位
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  // 获取剩余时间
  const remainingSeconds = seconds % 60;
  const remainingMinutes = minutes % 60;

  // 格式化为两位数
  const formattedHours = hours.toString().padStart(2, '0');
  const formattedMinutes = remainingMinutes.toString().padStart(2, '0');
  const formattedSeconds = remainingSeconds.toString().padStart(2, '0');

  return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}
// 消息处理
parentPort.on('message', async (msg) => {
  if (msg.type !== 'download-chunk') return;

  const { jobId, tiles = [], urlTemplate, subdomains, storagePath } = msg;
  const startTime = Date.now();
  const totalTiles = tiles.length;

  log(`开始任务 ${jobId}: ${totalTiles} 个瓦片`, 'info');

  let downloadedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  try {
    // 报告任务开始
    parentPort.postMessage({
      type: 'progress',
      jobId,
      workerId,
      status: `线程任务${(workerId + 1)}开始`,
      chunkSize: totalTiles,
      completed: 0,
      errors: 0
    });

    for (let i = 0; i < totalTiles; i++) {
      const tile = tiles[i];
      const { z, x, y } = tile;

      // 生成瓦片路径
      const lastPath = storagePath || storageDir;
      const tileDir = path.join(lastPath, `${z}/${x}`);
      const tilePath = path.join(tileDir, `${y}.png`);

      // 检查瓦片是否已存在
      if (await fileExists(tilePath)) {
        skippedCount++;
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
          downloadedCount++;
        } else {
          errorCount++;
        }
      } else if (result.status === 'not_found') {
        skippedCount++;
      } else {
        errorCount++;
      }
      // 报告进度
      if (i % 10 === 0 || i === totalTiles - 1) {
        parentPort.postMessage({
          type: 'progress',
          jobId,
          workerId,
          z, x, y,
          status: `线程任务${(workerId + 1)}下载${z, x, y}中`,
          index: i,
          chunkSize: totalTiles,
          completed: downloadedCount,
          skipped: skippedCount,
          errors: errorCount
        });
      }
      // 避免内存溢出
      if (i % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    // 任务完成
    log(`线程任务 ${(workerId + 1)} 完成: ${downloadedCount} 下载, ${skippedCount} 跳过, ${errorCount} 失败`, 'info');

    parentPort.postMessage({
      type: 'chunk-completed',
      jobId,
      workerId,
      status: `${(workerId + 1)}完成`,
      completed: downloadedCount,
      skippedCount,
      errorCount,
      startTime,
      endTime: Date.now(),
      duration: formatMilliseconds(Date.now() - startTime)
    });
  } catch (error) {
    // 任务失败
    log(`任务 ${jobId} 失败: ${error.message}`, 'error');

    parentPort.postMessage({
      type: 'error',
      jobId,
      status: `线程${(workerId + 1)}失败`,
      workerId,
      error: error.message,
      completed: downloadedCount,
      skippedCount,
      errorCount
    });
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
      type: 'error',
      error: `未处理的Rejection: ${reason}`
    });
  }
});

process.on('uncaughtException', (error) => {
  log(`未捕获的异常: ${error.message}\n${error.stack}`, 'error');
  if (parentPort) {
    parentPort.postMessage({
      type: 'error',
      error: `未捕获的异常: ${error.message}`
    });
  }
  // 进程可能不稳定，退出
  process.exit(1);
});