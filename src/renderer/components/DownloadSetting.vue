<script setup>
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { areaList } from "@/lib/areaCode";
import { useMapStore } from "@/stores";
import { ZOOM_MARKS, DOWNLOAD_LEVEL_MODES, ZOOM } from "@/const";
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

const tilesConfig = ref({
  currentAreaCode: [],
  zoom: ZOOM,
  mode: DOWNLOAD_LEVEL_MODES.SINGLE,
  storagePath: "",
});

// 瓦片任务：总任务
const tileTask = ref({
  total: 0,
  tiles: [],
  jobId: null,
  status: "",
});

const workerTasks = ref({});

const taskInfo = ref({
  status: "",
});

const getDefaultStorageDir = async () => {
  const dir = await window.electronAPI.getDefaultFolder();
  if (dir) {
    tilesConfig.value.storagePath = dir;
  }
};

onMounted(() => {
  getDefaultStorageDir();

  // 监听任务信息
  window.electronAPI?.onTaskInfoUpdate((data) => {
    console.log("🚀 ~ window.electronAPI?.onTaskInfoUpdate ~ data:", data);
    taskInfo.value = data;
  });
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

const checkDownloadConfig = () => {
  if (!geoJson.value) {
    return { message: "请选择区域", state: false };
  }
  const visibleLayers = mapStore.visibleLayerName;
  if (!visibleLayers.length) {
    return { message: "请先选择图层", state: false };
  }
  if (visibleLayers.length > 1) {
    return { message: "一次只能下载一种类型的底图", state: false };
  }
  if (!tilesConfig.value.storagePath) {
    return { message: "请先选择存储目录", state: false };
  }
  return { message: "校验通过", state: true };
};

const handleDownload = async () => {
  // 先校验下载配置
  const { state, message } = checkDownloadConfig();
  if (!state) {
    ElMessage.error(message);
    return;
  }

  // 校验通过，开始下载
  downloadTiles();
};

// 获取瓦片配置
const getTilesConfig = () => {
  const layer = getLayerByName(visibleLayers[0]);
  const { urlTemplate, subdomains } = getWrappedUrlByLayerType(
    layer.url,
    layer.type
  );
  const bound = L.geoJSON(geoJson.value).getBounds();

  const bounds = [
    bound.getSouthWest().lat,
    bound.getSouthWest().lng,
    bound.getNorthEast().lat,
    bound.getNorthEast().lng,
  ];

  return { bounds, urlTemplate, subdomains };
};

async function downloadTiles() {
  const { bounds, urlTemplate, subdomains } = getTilesConfig();
  const [minZoom, maxZoom] = tilesConfig.value.zoom;
  const { storagePath } = tilesConfig.value;
  try {
    let p = {
      bounds,
      minZoom,
      maxZoom,
      urlTemplate,
      subdomains,
      storagePath,
    };
    if (tilesConfig.value.mode == DOWNLOAD_LEVEL_MODES.SINGLE) {
      p.minZoom = p.maxZoom;
    }
    console.log("🚀 ~ downloadTiles ~ p:", p);

    const { success, result } = await window.electronAPI.downloadArea(p);

    console.log("🚀 ~ downloadTiles ~ job:", result);

    if (success) {
      tileTask.value = result;
    }
  } catch (error) {
    loading.value = false;
    console.error("启动下载失败:", error);
    alert(`下载失败: ${error.message}`);
  } finally {
  }
}

const cascaderProps = {
  children: "children",
  label: "chnName",
  value: "code",
  checkStrictly: true,
};
const areaRef = ref(null);

watch(
  () => areaCode.value,
  (newCode, oldCode) => {
    const result = getAreaFullPath(flatAreaList, newCode);
    tilesConfig.value.currentAreaCode = result;
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

const openFolder = async () => {
  const prePath = tilesConfig.value.storagePath || "";
  const path = await window.electronAPI.selectFolder(prePath);
  if (path) {
    tilesConfig.value.storagePath = path;
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
        v-model="tilesConfig.currentAreaCode"
        :options="areaList"
        :props="cascaderProps"
        @change="handleChangeCode"
        placeholder="请选择行政区划"
      />
    </div>
    <div class="form-item">
      <div class="form-item-header">
        <div class="step-number">2</div>
        <label for="">{{
          `缩放级别（${tilesConfig.zoom[0]} ~ ${tilesConfig.zoom[1]})`
        }}</label>
      </div>
      <el-slider
        v-model="tilesConfig.zoom"
        range
        show-stops
        :max="20"
        :min="1"
        :marks="ZOOM_MARKS"
      />
    </div>
    <div class="form-item">
      <div class="form-item-header">
        <div class="step-number">3</div>
        <label for="">下载级别设置</label>
      </div>
      <el-radio-group v-model="tilesConfig.mode" size="default">
        <el-radio
          :label="DOWNLOAD_LEVEL_MODES.SINGLE"
          :value="DOWNLOAD_LEVEL_MODES.SINGLE"
          >只下载最大级别</el-radio
        >
        <el-radio
          :label="DOWNLOAD_LEVEL_MODES.MULTI"
          :value="DOWNLOAD_LEVEL_MODES.MULTI"
          >下载最小到最大级别</el-radio
        >
      </el-radio-group>
    </div>
    <div class="form-item">
      <div class="form-item-header">
        <div class="step-number">4</div>
        <label for="">瓦片存储目录</label>
      </div>
      <div>
        <el-button id="selectBtn" @click="openFolder">选择目录</el-button>
        <p class="path" :title="tilesConfig.storagePath">
          {{ tilesConfig.storagePath }}
        </p>
      </div>
    </div>
    <div class="form-item">
      <el-button type="primary" @click="handleDownload">开始下载</el-button>
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
  margin-left: -8px;
}

.form-item {
  margin-left: 20px;
  margin-bottom: 35px;
  display: flex;
  flex-direction: column;
}

.form-item-header {
  margin-left: -20px;
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
</style>
