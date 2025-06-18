import { defineStore } from "pinia";
import { ROOT_CODE, TDT_LAYERS, BASE_MAP_TILES_URL } from '@/const/index'



export const useMapStore = defineStore('map', {
    state: () => ({ map: null, areaCode: ROOT_CODE, geoJson: null, visibleLayerName: [] }),
    actions: {
        getLayerByName(name) {
            return [BASE_MAP_TILES_URL, TDT_LAYERS].find(item => item.layerName === name)
        },
        changeVisibleLayers(name, visible) {
            if (visible) {
                this.visibleLayerName.push(name);
            } else {
                this.visibleLayerName = this.visibleLayerName.filter(item => item !== name);
            }
        }
    }
})