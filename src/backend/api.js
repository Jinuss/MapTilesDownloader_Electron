const axios = require("axios");

// 下载瓦片
async function downloadTile(url, maxRetries = 3, retryDelay = 1000) {
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
        return { status: "not_found" };
      }

      retries++;
      if (retries < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * retries),
        );
      } else {
        return {
          status: "error",
          error: `下载失败: ${error.message}`,
        };
      }
    }
  }
}

module.exports = { downloadTile };
