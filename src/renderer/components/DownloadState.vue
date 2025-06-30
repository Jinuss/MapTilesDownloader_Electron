<script setup>
import { ELECTRON_APIS } from "@/Channel";




// 瓦片任务：总任务
const tileTask = ref({
  total: 0,
  tiles: [],
  jobId: null,
  status: "",
});

const workerTasks = ref({});

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

const taskInfo = ref({
  status: "",
});

onMounted(() => {
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
</script>
<template>
  <div class="panel">
    <h2>下载统计</h2>
    <div class="state">
      <div class="label">状态：{{ taskInfo.status }}</div>
    </div>
    <div class="count">
      <p>总计：{{ tileTask.total }}</p>
      <p>完成：{{ completed }}</p>
      <p>跳过：{{ tileTask.skip }}</p>
      <p>失败：{{ tileTask.fail }}</p>
    </div>
    <div class="progress-ring">
      <el-progress
        type="circle"
        :percentage="
          completed ? Math.floor((completed * 100) / tileTask.total) : 100
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
</template>
<style scoped>
.progress-ring {
  display: flex;
  justify-content: center;
  align-content: center;
  align-items: center;
  margin: 30px;
}
.panel {
  width: 380px;
  padding: 20px 10px;
  height: calc(100% - 40px);
  overflow-x: visible;
  overflow-y: auto;
}

h2 {
  border-left: 4px solid #20a0ff;
  padding-left: 10px;
  font-weight: 300;
  font-size: larger;
}

.stats {
  display: flex;
  gap: 15px;
  margin-top: 10px;
  font-size: 14px;
}

.count {
  display: flex;
  justify-content: space-around;
  margin: 6px 3px;
  font-size: small;
}

.state {
  margin: 20px 10px;
  font-weight: lighter;
}
</style>
