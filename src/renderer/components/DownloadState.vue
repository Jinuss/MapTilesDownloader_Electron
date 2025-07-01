<script setup>
import { ELECTRON_APIS } from "@/Channel";

const taskChannel = ref(null);

const props = defineProps({
  channel: {
    type: Object || null,
    default: null,
  },
});

const getChannel = () => {
  return taskChannel.value || {};
};

const taskInfo = ref({
  status: "",
  total: 0,
  completed: 0,
  skip: 0,
  fail: 0,
});

const initChannelListener = () => {
  const channel = getChannel();
  if (channel && channel.keyToListenEvent) {
    channel.keyToListenEvent(ELECTRON_APIS.ON_TASK_UPDATE, (data) => {
      taskInfo.value = { ...data, ...taskInfo.value };
    });
  }
};

watch(
  () => props.channel,
  (newChannel) => {
    taskChannel.value = newChannel;
    initChannelListener();
  },
  {
    immediate: true,
  }
);
</script>
<template>
  <div class="panel">
    <h2>下载统计</h2>
    <div class="state">
      <div class="label">状态：{{ taskInfo.status }}</div>
    </div>
    <div class="count">
      <p>总计：{{ taskInfo.total }}</p>
      <p>完成：{{ taskInfo.completed }}</p>
      <p>跳过：{{ taskInfo.skip }}</p>
      <p>失败：{{ taskInfo.fail }}</p>
    </div>
    <div class="progress-ring">
      <el-progress
        type="circle"
        :percentage="
          taskInfo.completed
            ? Math.floor((taskInfo.completed * 100) / taskInfo.total)
            : 0
        "
      />
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
