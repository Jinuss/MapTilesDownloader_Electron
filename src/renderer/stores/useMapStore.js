import { defineStore } from "pinia";
import {ROOT_CODE} from '@/const/index'


export const useMapStore = defineStore('map', {
    state: () => ({ map: null, areaCode: '100000' }),
})