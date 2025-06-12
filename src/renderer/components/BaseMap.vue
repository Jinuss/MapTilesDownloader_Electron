<script setup>
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css"
import "leaflet-draw";
import { BASE_MAP_TILES_URL } from "@/const";
import { useMapStore } from "@/stores";
import axios from "axios";
import { storeToRefs } from "pinia";
import { areaList } from "@/lib/areaCode";
import { flattenTree } from "@/util/index";
import BackIcon from '@/components/BackIcon.vue'

const flatAreaList = flattenTree(areaList);
const mapStore = useMapStore();

const { areaCode } = storeToRefs(mapStore);
const mapRef = ref(null);

let map = null,
  geoJsonLayer = null;

watch(
  () => mapStore.areaCode,
  (newCode, oldCode) => {
    if (map) {
      getGeoJSON();
    }
  }
);

const getGeoJSON = async () => {
  if (!areaCode.value) return;
  let code = `${areaCode.value}`;
  let area = flatAreaList.find((item) => item.code == areaCode.value);
  if (area && area.level < 6) {
    code = `${areaCode.value}_full`;
  }
  const { data: geojsonData } = await axios.get(
    `https://geo.datav.aliyun.com/areas_v3/bound/geojson?code=${code}`
  );

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
        color: "#ff7800", // 线和多边形的边框颜色
        weight: 2, // 线宽
        dashArray: "10", // 虚线样式
        fillColor: "#38f", // 多边形填充颜色
        fillOpacity: 0.2, // 多边形填充透明度
        opacity: 1,
      }),
      onEachFeature: (feature, layer) => {
        // 添加弹出窗口
        if (feature.properties && feature.properties.name) {
          // 鼠标悬停效果
          layer.on({
            mouseover: (e) => {
              layer.setStyle({ fillColor: "green" });
              layer.bringToFront();
              if (HoverInfo) {
                HoverInfo.update(feature.properties);
              }
            },
            mouseout: (e) => {
              geoJsonLayer.resetStyle(layer);
              HoverInfo.update();
            },
            click: (e) => {
              map.fitBounds(layer.getBounds());
              if (areaCode.value !== feature.properties.adcode) {
                mapStore.$patch({ areaCode: feature.properties.adcode });
              }
            },
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

let HoverInfo = null;
const initMouseHover = () => {
  HoverInfo = L.control({ position: "topright" });
  HoverInfo.onAdd = function (map) {
    this._div = L.DomUtil.create("div", "info"); // 创建一个div元素
    this.update(); // 初始化
    return this._div;
  };

  HoverInfo.update = function (props) {
    if (props) {
      this._div.innerHTML = `<h4>地名：${props.name}</h4><h4>adcode：${props.adcode}</h4>`;
    } else {
      this._div.innerHTML = `<h4>鼠标移入地图试试✌</h4>`;
    }
  };
  HoverInfo.addTo(map);
};
onMounted(() => {
  map = L.map(mapRef.value).setView([39.9, 116.4], 10);
  L.control.scale({ imperial: false }).addTo(map);
  L.tileLayer(BASE_MAP_TILES_URL[0], {}).addTo(map);
  mapStore.$patch({ map });
  getGeoJSON();
  initDrawControl();
  initMouseHover();
});
</script>

<template>
  <div class="map_container" ref="mapRef">
    <BackIcon />
  </div>
</template>
<style scoped>
.map_container {
  width: 100%;
  height: 100%;
}
</style>
