<script setup>
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { areaList } from "@/lib/areaCode";
import { useMapStore } from "@/stores";
import { BASE_MAP_TILES_URL } from "@/const";
import { storeToRefs } from "pinia";
import {
  flattenTree,
  getAreaFullPath,
  getLayerByName,
  getWrappedUrlByLayerType,
} from "@/util/index";
import { ElMessage } from "element-plus";

const flatAreaList = flattenTree(areaList);

const mapStore = useMapStore();
const { areaCode, geoJson } = storeToRefs(mapStore);

const zoom = ref([1, 10]);
const downloadMode = ref("single");
const isDownloading = ref(false);

// 瓦片任务：总任务
const tileTask = ref({
  total: 0,
  tiles: [],
  jobId: null,
  status: "",
});

const workerTasks = ref({});

const activeJob = ref({});

const completed = ref(0);

watch(
  () => workerTasks.value,
  (object) => {
    let count = 0;
    for (const key in object) {
      count += object[key]?.completed;
    }
    completed.value = count;
  }
);

onMounted(() => {
  // 监听线程任务分配
  window.electronAPI?.onWorkerTaskAssigned((data) => {
    console.log("🚀 ~ window.electronAPI?.onWorkerTaskAssigned ~ data:", data);
    const { workerId } = data;
    workerTasks.value = {
      ...workerTasks.value,
      [workerId]: { ...data, name: `子任务${workerId + 1}` },
    };
  });
  // 监听线程任务进度
  window.electronAPI?.onWorkerTaskProgress((data) => {
    console.log("🚀 ~ window.electronAPI?.onWorkerTaskProgress ~ data:", data);
    const { workerId } = data;
    workerTasks.value = {
      ...workerTasks.value,
      [workerId]: { ...workerTasks.value[workerId], ...data },
    };
  });
});

async function downloadTiles() {
  if (!geoJson.value) {
    ElMessage.error("请先选择区域");
    return;
  }
  const visibleLayers = mapStore.visibleLayerName;
  if (!visibleLayers.length) {
    ElMessage.error("请先选择图层");
    return;
  }
  if (visibleLayers.length > 1) {
    ElMessage.error("一次只能下载一种类型的底图");
    return;
  }
  if (!storagePath.value) {
    ElMessage.error("请先选择存储目录");
    return;
  }

  const layer = getLayerByName(visibleLayers[0]);
  const { urlTemplate, subdomains } = getWrappedUrlByLayerType(
    layer.url,
    layer.type
  );
  const bounds = L.geoJSON(geoJson.value).getBounds();
  isDownloading.value = true;

  try {
    let p = {
      bounds: [
        bounds.getSouthWest().lat,
        bounds.getSouthWest().lng,
        bounds.getNorthEast().lat,
        bounds.getNorthEast().lng,
      ],
      minZoom: zoom.value[0],
      maxZoom: zoom.value[1],
      urlTemplate: urlTemplate,
      subdomains,
      storagePath: storagePath.value,
    };
    if (downloadMode.value == "single") {
      p.minZoom = p.maxZoom;
    }
    console.log("🚀 ~ downloadTiles ~ p:", p);

    // return;
    const { success, result } = await window.electronAPI.downloadArea(p);

    console.log("🚀 ~ downloadTiles ~ job:", result);

    if (success) {
      tileTask.value = result;
    }
  } catch (error) {
    console.error("启动下载失败:", error);
    alert(`下载失败: ${error.message}`);
  } finally {
    isDownloading.value = false;
  }
}

const cascaderProps = {
  children: "children",
  label: "chnName",
  value: "code",
  checkStrictly: true,
};
const areaRef = ref(null);

const getAreaCode = ref([]);

watch(
  () => areaCode.value,
  (newCode, oldCode) => {
    const result = getAreaFullPath(flatAreaList, newCode);
    getAreaCode.value = result;
  },
  { immediate: true }
);

const handleChangeCode = (value) => {
  const code = value[value.length - 1];

  mapStore.$patch({
    areaCode: code,
  });

  areaRef.value?.togglePopperVisible();
};
const marks = ref({
  1: "Min",
  10: "10",
  20: "Max",
});

const storagePath = ref("");
const openFolder = async () => {
  const path = await window.electronAPI.selectFolder();
  if (path) {
    storagePath.value = path;
  }
};
</script>
<template>
  <div class="controls">
    <div class="form-item">
      <div class="form-item-header">
        <div class="step-number">1</div>
        <label for="">行政区划</label>
      </div>
      <el-cascader
        ref="areaRef"
        v-model="getAreaCode"
        :options="areaList"
        :props="cascaderProps"
        @change="handleChangeCode"
        placeholder="请选择行政区划"
      />
    </div>
    <div class="form-item">
      <div class="form-item-header">
        <div class="step-number">2</div>
        <label for="">{{ `缩放级别（${zoom[0]} ~ ${zoom[1]})` }}</label>
      </div>
      <el-slider
        v-model="zoom"
        range
        show-stops
        :max="20"
        :min="1"
        :marks="marks"
      />
    </div>
    <div class="form-item">
      <div class="form-item-header">
        <div class="step-number">3</div>
        <label for="">级别设置模式</label>
      </div>
      <el-radio-group v-model="downloadMode" size="medium">
        <el-radio label="single" value="single">下载最大</el-radio>
        <el-radio label="multi" value="multi">下载多级别</el-radio>
      </el-radio-group>
    </div>
    <div class="form-item">
      <div class="form-item-header">
        <div class="step-number">4</div>
        <label for="">瓦片存储目录</label>
      </div>
      <div>
        <el-button id="selectBtn" @click="openFolder">选择目录</el-button>
        <p class="path">{{ storagePath }}</p>
      </div>
    </div>
    <div class="form-item">
      <el-button type="primary" @click="downloadTiles" :disabled="isDownloading"
        >开始下载</el-button
      >
    </div>
    <div class="job-status">
      <h3>状态: {{ tileTask.status }}</h3>
      <div>
        <p>总计：{{ tileTask.total }}</p>
        <p>已下载：{{ completed }}</p>
      </div>
      <div class="progress-ring">
        <el-progress
          type="circle"
          :percentage="
            activeJob.total
              ? Math.floor((completed * 100) / activeJob.total)
              : 100
          "
        />
      </div>
      <div>
        <div class="worker-task" v-for="task in workerTasks">
          <p>{{ task?.name }} {{ task?.completed }}/{{ task?.chunkSize }}</p>
          <el-progress
            :percentage="Math.floor((task?.completed * 100) / task?.chunkSize)"
          ></el-progress>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.progress-ring {
  display: flex;
  justify-content: center;
  align-content: center;
  align-items: center;
}
.path {
  border-bottom: 1px solid #ccc;
  margin: 6px 2px;
  white-space: nowrap; /* 文本不换行 */
  overflow: hidden; /* 隐藏溢出内容 */
  text-overflow: ellipsis; /* 显示省略号 */
}
.controls {
  width: 380px;
  position: absolute;
  right: 0;
  top: 0;
  padding: 20px 20px 20px 30px;
  height: calc(100% - 40px);
  overflow-x: visible;
  overflow-y: auto;
}

.step-number {
  font-weight: 600;
  font-size: 20px;
  background: #322631;
  width: 35px;
  height: 35px;
  text-align: center;
  border-radius: 50%;
  color: white;
  position: relative;
  left: -20px;
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.el-slider {
  margin-top: 0;
}

label {
  margin-bottom: 4px;
  font-weight: 500;
  font-size: 20px;
}

.form-item {
  margin-left: 20px;
  margin-bottom: 25px;
  display: flex;
  flex-direction: column;
}

.form-item-header {
  margin-left: -20px;
  display: flex;
  align-items: center;
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
