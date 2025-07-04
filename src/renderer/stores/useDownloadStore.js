import { defineStore } from "pinia";
import { DOWNLOAD_STATE } from "../const/common";


export const useDownloadStore = defineStore('download', {
    state: () => ({
        state: DOWNLOAD_STATE.PREPARE,
        downloadParams: {},//下载瓦片参数配置
    }),
    actions: {
        reset() {
            this.state = DOWNLOAD_STATE.PREPARE
        },
        start() {
            this.state = DOWNLOAD_STATE.DOWNLOADING
        }
    }
})