<script setup>
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BASE_MAP_TILES_URL } from "@/const";
import { useMapStore } from "@/stores";

const mapStore = useMapStore();
const mapRef = ref(null);

onMounted(() => {
  const map = L.map(mapRef.value).setView([39.9, 116.4], 10);
  L.tileLayer(BASE_MAP_TILES_URL[0]).addTo(map);
  mapStore.$patch({ map });
});
</script>

<template>
  <div class="map_container" ref="mapRef"></div>
</template>
<style scoped>
.map_container {
  width: 100%;
  height: 100%;
}
</style>
