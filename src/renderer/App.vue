<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import BaseMap from "./components/BaseMap.vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
let rectangle = null;

const minZoom = ref(5);
const maxZoom = ref(10);
const urlTemplate = ref(
  "https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}"
);
const isDownloading = ref(false);
const activeJob = ref(null);

// 进度统计
const completedTiles = ref(0);
const successCount = ref(0);
const failCount = ref(0);
const skipCount = ref(0);
const progressValue = ref(0);
const progressMax = ref(100);

onMounted(() => {
  // 设置事件监听
  window.electronAPI.onTileProgress(handleTileProgress);
  window.electronAPI.onJobCreated(handleJobCreated);
  window.electronAPI.onJobUpdate(handleJobUpdate);
});


function selectArea() {
  // 清除之前的选区
  if (rectangle) {
    map.removeLayer(rectangle);
  }

  // 开始绘制矩形
  rectangle = L.rectangle(
    [
      [40.0, 115.0],
      [39.5, 116.5],
    ],
    {
      color: "#ff7800",
      weight: 1,
      fillOpacity: 0.2,
    }
  ).addTo(map);

  map.fitBounds(rectangle.getBounds());
}

async function downloadTiles() {
  if (!rectangle) {
    alert("请先选择区域");
    return;
  }

  const bounds = rectangle.getBounds();
  isDownloading.value = true;

  try {
    const job = await window.electronAPI.downloadArea({
      bounds: [
        bounds.getSouthWest().lat,
        bounds.getSouthWest().lng,
        bounds.getNorthEast().lat,
        bounds.getNorthEast().lng,
      ],
      minZoom: minZoom.value,
      maxZoom: maxZoom.value,
      urlTemplate: urlTemplate.value,
    });
    console.log("🚀 ~ downloadTiles ~ job:", job);

    activeJob.value = {
      id: job.id,
      status: "queued",
      tiles: job.tiles,
    };

    // 重置计数器
    completedTiles.value = 0;
    successCount.value = 0;
    failCount.value = 0;
    skipCount.value = 0;
    progressMax.value = job.tiles?.length;
    progressValue.value = 0;
  } catch (error) {
    console.error("启动下载失败:", error);
    alert(`下载失败: ${error.message}`);
  } finally {
    isDownloading.value = false;
  }
}

function handleTileProgress(data) {
  if (!activeJob.value || activeJob.value.id !== data.jobId) return;

  completedTiles.value++;

  switch (data.status) {
    case "completed":
      successCount.value++;
      break;
    case "failed":
      failCount.value++;
      break;
    case "exists":
      skipCount.value++;
      break;
  }

  // 更新进度条
  progressValue.value = completedTiles.value;
}

function handleJobCreated(job) {
  if (job.id === activeJob.value?.id) {
    activeJob.value = job;
  }
}

function handleJobUpdate(update) {
  if (update.jobId === activeJob.value?.id) {
    activeJob.value.status = update.status;
    // 可以添加更详细的更新处理
  }
}
</script>
<template>
  <div class="container">
    <BaseMap />

    <div class="controls">
      <label
        >最小缩放:
        <input type="number" v-model.number="minZoom" min="0" max="20"
      /></label>
      <label
        >最大缩放:
        <input type="number" v-model.number="maxZoom" min="0" max="20"
      /></label>

      <div class="url-template">
        <label>瓦片URL模板:</label>
        <input
          v-model="urlTemplate"
          placeholder="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </div>

      <button @click="selectArea">选择区域</button>
      <button @click="downloadTiles" :disabled="isDownloading">开始下载</button>

      <div v-if="activeJob" class="job-status">
        <h3>下载状态: {{ activeJob.status }}</h3>
        <progress :value="progressValue" :max="progressMax"></progress>
        <div class="stats">
          <span>完成: {{ completedTiles }} / {{ totalTiles }}</span>
          <span>成功: {{ successCount }}</span>
          <span>失败: {{ failCount }}</span>
          <span>跳过: {{ skipCount }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.controls {
  padding: 15px;
  background: #f5f5f5;
  border-top: 1px solid #ddd;
}

.url-template {
  margin: 10px 0;
}

.url-template input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
}

.job-status {
  margin-top: 20px;
}

.stats {
  display: flex;
  gap: 15px;
  margin-top: 10px;
  font-size: 14px;
}
</style>
