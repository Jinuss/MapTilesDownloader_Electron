<script setup>
import { storeToRefs } from "pinia";
import { useDownloadStore } from "@/stores";
import DownloadSetting from "./DownloadSetting.vue";
import DownloadState from "./DownloadState.vue";
import { DOWNLOAD_STATE } from "@/const/common";
import { TaskChannel } from "@/Channel";

const downloadStore = useDownloadStore();

const { state } = storeToRefs(downloadStore);

const currentState = ref("");
watch(
  () => state.value,
  (newState) => {
    currentState.value = newState;
  },
  {
    immediate: true,
  }
);

const channel = ref(null);

const initChannel = () => {
  if (!channel.value) {
    channel.value = new TaskChannel();
  }
};
onMounted(() => {
  initChannel();
});
</script>
<template>
  <DownloadSetting
    v-show="currentState == DOWNLOAD_STATE.PREPARE"
    :channel="channel"
  />
  <DownloadState
    v-show="currentState == DOWNLOAD_STATE.DOWNLOADING"
    :channel="channel"
  />
</template>
<style scoped></style>
