const axios = require("axios");

// 下载瓦片
async function downloadTile(url, log, maxRetries = 3, retryDelay = 1000) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 10000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; TileDownloader/1.0)",
          "Accept-Encoding": "gzip, deflate",
        },
      });

      return {
        status: "success",
        buffer: response.data,
      };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        log(`瓦片不存在: ${url}`, "warn");
        return { status: "not_found" };
      }

      retries++;
      if (retries < maxRetries) {
        log(
          `下载失败 (${url}), 重试 ${retries}/${maxRetries}: ${error.message}`,
          "warn",
        );
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * retries),
        );
      } else {
        log(`下载失败 (${url}) 达到最大重试次数: ${error.message}`, "error");
        return {
          status: "error",
          error: `下载失败: ${error.message}`,
        };
      }
    }
  }
}

module.exports = { downloadTile };
