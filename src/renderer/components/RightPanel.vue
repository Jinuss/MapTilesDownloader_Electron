<script setup>
import { storeToRefs } from "pinia";
import { useDownloadStore } from "@/stores";
import DownloadSetting from "./DownloadSetting.vue";
import DownloadState from "./DownloadState.vue";
import { DOWNLOAD_STATE } from "@/const/common";

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
</script>
<template>
  <DownloadSetting v-show="currentState == DOWNLOAD_STATE.PREPARE" />
  <DownloadState v-show="currentState == DOWNLOAD_STATE.DOWNLOADING" />
</template>
<style scoped></style>
