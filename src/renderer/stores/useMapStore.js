import { defineStore } from "pinia";

export const useMapStore = defineStore('map', {
    state: () => ({ map: null, areaCode: 100000 }),
})