<script setup>
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { BASE_MAP_TILES_URL } from "@/const";
import { useMapStore } from "@/stores";
import axios from "axios";
import { storeToRefs } from "pinia";

const mapStore = useMapStore();

const { areaCode } = storeToRefs(mapStore);
const mapRef = ref(null);

let map = null,
  geoJsonLayer = null;

watch(
  () => mapStore.areaCode,
  (newCode, oldCode) => {
    console.log("🚀 ~ newCode, oldCode:", newCode, oldCode);
    if (map) {
      getGeoJSON();
    }
  }
);
const getGeoJSON = async () => {
  if (!areaCode.value) return;
  const { data: geojsonData } = await axios.get(
    `https://geo.datav.aliyun.com/areas_v3/bound/geojson?code=${areaCode.value}`
  );
  console.log("🚀 ~ getGeoJSON ~ resp:", geojsonData);

  if (!geoJsonLayer) {
    geoJsonLayer = L.geoJSON(geojsonData, {
      pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
          // 使用圆形标记代替默认标记
          radius: 8,
          fillColor: "#ff7800",
          color: "#000",
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8,
        });
      },
      style: (feature) => ({
        color: "#3388ff", // 线和多边形的边框颜色
        weight: 2, // 线宽
        opacity: 0.8,
      }),
      onEachFeature: (feature, layer) => {
        // 添加弹出窗口
        if (feature.properties && feature.properties.name) {
          const popupContent = `<b>${feature.properties.name}</b>`;
          if (feature.properties.population) {
            popupContent += `<br>人口: ${feature.properties.population.toLocaleString()}`;
          }
          layer.bindPopup(popupContent);

          // 鼠标悬停效果
          layer.on({
            mouseover: (e) => layer.setStyle({ fillColor: "red" }),
            mouseout: (e) => geoJsonLayer.resetStyle(layer),
          });
        }
      },
    }).addTo(map);
  } else {
    geoJsonLayer.clearLayers();
    geoJsonLayer.addData(geojsonData);
  }

  map.fitBounds(geoJsonLayer.getBounds());
};

onMounted(() => {
  map = L.map(mapRef.value).setView([39.9, 116.4], 10);
  L.control.scale({ imperial: false }).addTo(map);
  L.tileLayer(BASE_MAP_TILES_URL[0],{}).addTo(map);
  mapStore.$patch({ map });
  getGeoJSON();
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
