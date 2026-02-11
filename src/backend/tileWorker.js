const { parentPort, workerData } = require("worker_threads");
const path = require("path");
const {
  generateTileUrl,
  formatMilliseconds,
  fileExists,
  saveTile,
} = require("./Utils.js");
const { MESSAGE_TYPE } = require("./const.js");
const { downloadTile } = require("./api.js");

// 获取存储目录和workerId
const storageDir = workerData?.storageDir;
const workerId = workerData?.workerId || 0;

// 发送日志函数
function log(message, level = "info") {
  if (parentPort) {
    parentPort.postMessage({
      type: MESSAGE_TYPE.WORKER_LOG,
      workerId,
      level,
      message,
      timestamp: Date.now(),
    });
  }
}

// 消息处理
parentPort.on("message", async (msg) => {
  if (msg.type !== MESSAGE_TYPE.WORKER_CHUNK_DOWNLOAD) return;

  const { tiles = [], urlTemplate, subdomains, storagePath } = msg;
  const startTime = Date.now();
  const tileLength = tiles.length;

  log(`开始线程任务 ${workerId}: ${tileLength} 个瓦片`, "info");

  // 定义消息结构：非日志类
  let messageData = {
    workerId, // 线程id
    type: "", // 消息类型
    status: "", //描述
    chunkSize: tileLength, // 分配瓦片的大小
    completed: 0, //下载成功
    fail: 0, // 下载失败
    skip: 0, // 跳过
  };

  try {
    // 报告任务开始
    for (let i = 0; i < tileLength; i++) {
      const tile = tiles[i];
      const { z, x, y } = tile;

      // 生成瓦片路径
      const lastPath = storagePath || storageDir;
      const tileDir = path.join(lastPath, `${z}/${x}`);
      const tilePath = path.join(tileDir, `${y}.png`);

      // 检查瓦片是否已存在
      if (await fileExists(tilePath)) {
        log(`瓦片已存在: ${tilePath}`, "warn");
        messageData.skip++;
        continue;
      }

      // 生成URL
      const tileUrl = generateTileUrl(urlTemplate, subdomains, z, x, y);

      // 下载瓦片
      const result = await downloadTile(tileUrl);

      if (result.status === "success") {
        // 保存瓦片
        const saveResult = await saveTile(tilePath, result.buffer, log);
        if (saveResult) {
          messageData.completed++;
        } else {
          messageData.fail++;
        }
      } else if (result.status === "not_found") {
        log(`瓦片找不到: ${tilePath}`, "warn");
        messageData.skip++;
      } else {
        log(`瓦片下载失败: ${tilePath}`, "error");
        messageData.fail++;
      }
      // 报告进度
      if (i % 10 === 0 || i === tileLength - 1) {
        messageData.type = MESSAGE_TYPE.WORKER_PROGRESS;
        messageData.status = `线程任务${workerId}下载中`;
        parentPort.postMessage(messageData);
      }
      // 避免内存溢出
      if (i % 100 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    }

    // 任务完成
    log(
      `线程任务 ${workerId} 完成: ${messageData.completed} 下载, ${messageData.skip} 跳过, ${messageData.fail} 失败`,
      "info",
    );

    messageData.type = MESSAGE_TYPE.WORKER_COMPLETED;
    messageData.status = `线程任务${workerId}完成`;
    messageData.endTime = Date.now();
    messageData.duration = formatMilliseconds(Date.now() - startTime);

    parentPort.postMessage(messageData);
  } catch (error) {
    // 任务失败
    log(`线程任务 ${workerId} 失败: ${error.message}`, "error");
    messageData.type = MESSAGE_TYPE.WORKER_ERROR;
    messageData.status = `线程${workerId}失败`;
    parentPort.postMessage(messageData);
  } finally {
  }
});
