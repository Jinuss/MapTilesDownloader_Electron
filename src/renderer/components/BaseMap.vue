<script setup>
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
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
          opacity: 0.01,
          fillOpacity: 0.02,
        });
      },
      style: (feature) => ({
        color: "#3388ff", // 线和多边形的边框颜色
        weight: 2, // 线宽
        opacity: 0.2,
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

const initDrawControl = () => {
  // 初始化绘制控件
  const drawnItems = new L.FeatureGroup(); // 存储绘制的图形
  map.addLayer(drawnItems);

  const drawControl = new L.Control.Draw({
    edit: {
      featureGroup: drawnItems,
    },
  });
  map.addControl(drawControl);

  // 监听绘制完成事件
  map.on("draw:created", (e) => {
    const layer = e.layer;
    drawnItems.addLayer(layer);

    // 获取多边形坐标和面积
    if (e.layerType === "polygon") {
      const coordinates = layer.getLatLngs()[0]; // 坐标数组 [[lat, lng], ...]
      const area = L.GeometryUtil.geodesicArea(coordinates); // 计算面积（平方米）

      // 更新状态（存储坐标和面积）
      // setPolygons((prev) => [
      //   ...prev,
      //   {
      //     id: Date.now(), // 唯一标识
      //     coordinates,
      //     area: area.toFixed(2), // 保留两位小数
      //   },
      // ]);

      // 可选：在地图上显示面积标签
      const areaLabel = L.divIcon({
        className: "polygon-area-label",
        html: `<div style="background: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">${area.toFixed(
          2
        )}㎡</div>`,
        iconSize: [80, 24],
        iconAnchor: [40, 12], // 标签居中
      });
      L.marker(layer.getBounds().getCenter(), { icon: areaLabel }).addTo(map);
    }
  });
};
onMounted(() => {
  map = L.map(mapRef.value).setView([39.9, 116.4], 10);
  L.control.scale({ imperial: false }).addTo(map);
  L.tileLayer(BASE_MAP_TILES_URL[0], {}).addTo(map);
  mapStore.$patch({ map });
  getGeoJSON();
  initDrawControl()
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
