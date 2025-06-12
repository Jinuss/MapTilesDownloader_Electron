<script setup>
import backIcon from "@/assets/back.svg";
import { useMapStore } from "@/stores";
import { storeToRefs } from "pinia";
import { ROOT_CODE } from "@/const";
import { areaList } from "@/lib/areaCode";
import { flattenTree } from "@/util/index";

const flatAreaList = flattenTree(areaList);
const mapStore = useMapStore();

const { areaCode } = storeToRefs(mapStore);

const backPre = () => {
  const current = flatAreaList.find((item) => item.code == areaCode.value);
  const parentCode = flatAreaList.find((item) => item.id == current.pid).code;
  mapStore.$patch({ areaCode: parentCode });
};
</script>
<template>
  <div class="back_container" v-show="areaCode !== ROOT_CODE" @click="backPre">
    <img :src="backIcon" alt="" />
    <span>返回上一级</span>
  </div>
</template>
<style scoped>
.back_container {
  background: #fff;
  position: absolute;
  z-index: 1000;
  margin-top: 10px;
  left: 150px;
  padding: 3px 8px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 2px;
  box-shadow: 1px 2px 1px #eee;
  cursor: pointer;
}
img {
  height: 20px;
  width: 20px;
  margin-right: 12px;
}
</style>
