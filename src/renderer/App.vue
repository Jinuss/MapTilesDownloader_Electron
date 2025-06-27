<script setup>
import Panel from "./components/RightPanel.vue";
import BaseMap from "./components/BaseMap.vue";
</script>
<template>
  <div class="container">
    <div class="container_left">
      <BaseMap />
    </div>
    <Panel />
  </div>
</template>
<style scoped>
.container {
  display: flex;
  flex-direction: row;
  height: 100vh;
}
.container_left {
  width: calc(100% - 400px);
  position: relative;
}
</style>
