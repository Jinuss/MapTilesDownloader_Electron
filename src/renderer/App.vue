<script setup>
import Panel from "./components/Panel.vue";
import BaseMap from "./components/BaseMap.vue";
</script>
<template>
  <div class="container">
    <BaseMap />
    <Panel />
  </div>
</template>
<style scoped>
.container {
  display: flex;
  flex-direction: row;
  height: 100vh;
}
</style>
