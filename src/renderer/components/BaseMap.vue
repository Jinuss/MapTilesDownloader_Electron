<script setup>
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "@/lib/leaflet-tdt.js";
import "leaflet-draw";
import { BASE_MAP_TILES_URL, TDT_TOKEN, TDT_LAYERS } from "@/const";
import { useMapStore } from "@/stores";
import axios from "axios";
import { storeToRefs } from "pinia";
import { areaList } from "@/lib/areaCode";
import { flattenTree } from "@/util/index";
import BackIcon from "@/components/BackIcon.vue";

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
const initLayers = (myMap) => {
  const gdLayer = L.tileLayer(BASE_MAP_TILES_URL[0].url, {
    noWrap: true,
  });
  gdLayer.addTo(myMap);
  const defaultLayerName = BASE_MAP_TILES_URL[0].layerName;
  const overlayLayers = {
    [defaultLayerName]: gdLayer,
  };
  mapStore.changeVisibleLayers(defaultLayerName, true);

  TDT_LAYERS.forEach((element) => {
    const { url, layerName } = element;
    overlayLayers[layerName] = L.tileLayer.tdtTileLayer(url, TDT_TOKEN);
  });
  L.control.layers([], overlayLayers, { autoZIndex: false }).addTo(myMap);

  myMap.on("overlayadd", function (e) {
    console.log("🚀 ~ e:", e);
    mapStore.changeVisibleLayers(e.name, true);
  });
  myMap.on("overlayremove", function (e) {
    console.log("🚀 ~ e:", e);
    mapStore.changeVisibleLayers(e.name, false);
  });
};
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
      style: (feature) => ({
        color: "#ff7800", // 线和多边形的边框颜色
        weight: 2, // 线宽
        dashArray: "10", // 虚线样式
        fillColor: "#38f", // 多边形填充颜色
        fillOpacity: 0.1, // 多边形填充透明度
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

  mapStore.$patch({
    geoJson: geojsonData,
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
      this._div.innerHTML = `<div style="display:flex;"><h4 style="margin-right:15px;">地名：${props.name}</h4> <h4>adcode：${props.adcode}</h4></div>`;
    } else {
      this._div.innerHTML = `<h4>鼠标移入地图试试✌</h4>`;
    }
  };
  HoverInfo.addTo(map);
};

const initResetControl = () => {
  const resetControl = L.control({
    position: "topleft",
  });

  resetControl.onAdd = function (map) {
    const container = L.DomUtil.create(
      "div",
      "leaflet-bar leaflet-control resetControl"
    );
    container.innerHTML = "&#x21bb;"; // 右箭头字符
    container.onclick = function () {
      map.fitBounds(geoJsonLayer.getBounds());
    };
    return container;
  };
  resetControl.addTo(map);
};
onMounted(() => {
  map = L.map(mapRef.value).setView([39.9, 116.4], 10);
  initMouseHover();
  initResetControl();
  initLayers(map);

  L.control.scale({ imperial: false }).addTo(map);

  mapStore.$patch({ map });
  getGeoJSON();
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
