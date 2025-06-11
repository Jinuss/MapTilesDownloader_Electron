<script setup>
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { areaList } from "@/lib/areaCode";
import { useMapStore } from "@/stores";
import { BASE_MAP_TILES_URL } from "@/const";
import { storeToRefs } from "pinia";

console.log("🚀 ~ areaList:", areaList);
const mapStore = useMapStore();
const { areaCode } = storeToRefs(mapStore);
const zoom = ref([6, 12]);
const rangType = ref("1");
let rectangle = null;

const minZoom = ref(5);
const maxZoom = ref(10);
const urlTemplate = ref(BASE_MAP_TILES_URL[0]);
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
  if (window.electronAPI) {
    window.electronAPI.onTileProgress(handleTileProgress);
    window.electronAPI.onJobCreated(handleJobCreated);
    window.electronAPI.onJobUpdate(handleJobUpdate);
  }
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
      fillOpacity: 0.05,
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

const cascaderProps = {
  expandTrigger: "hover",
  children: "children",
  label: "chnName",
  value: "code",
  checkStrictly: true,
};
const areaRef = ref(null);
const getAreaCode = ref([areaCode.value]);
console.log("🚀 ~ getAreaCode:", getAreaCode.value);

const handleChangeCode = (value) => {
  const code = value[value.length - 1];
  console.log("🚀 ~ handleChangeCode ~ value:", value, code);

  mapStore.$patch({
    areaCode: code,
  });

  areaRef.value?.togglePopperVisible();
};
</script>
<template>
  <div class="controls">
    <div class="form-item">
      <label for="">缩放级别</label>
      <el-slider v-model="zoom" range show-stops :max="20" :min="0" />
    </div>

    <div class="form-item">
      <label>瓦片URL模板</label>
      <el-select v-model="urlTemplate" placeholder="请选择瓦片模版">
        <el-option
          v-for="item in BASE_MAP_TILES_URL"
          :key="item"
          :label="item"
          :value="item"
        >
        </el-option>
      </el-select>
    </div>

    <div class="form-item">
      <label for="">选择区域方式</label>
      <el-radio-group v-model="rangType">
        <el-radio value="1">行政区划</el-radio>
        <el-radio value="2">绘制</el-radio>
      </el-radio-group>
    </div>

    <div class="form-item">
      <label for="">选择行政区划</label>
      <el-cascader
        ref="areaRef"
        v-model="getAreaCode"
        :options="areaList"
        :props="cascaderProps"
        @change="handleChangeCode"
        placeholder="请选择行政区划"
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
</template>
<style scoped>
.controls {
  width: 400px;
  padding: 15px;
  background: #fff;
}

.el-slider {
  margin-top: 0;
  margin-left: 12px;
}

.form-item {
  margin-bottom: 15px;
  display: flex;
  flex-direction: column;
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
