// 定义electronAPI
export const ELECTRON_APIS = {
    GET_DEFAULT_FOLDER: "getDefaultFolder",// 获取默认目录
    SELECT_FOLDER: "selectFolder",// 打开目录选择器
    GET_TILES: "calculateTiles", // 获取瓦片
}

export class TaskChannel {
    constructor() {
        this.taskInfo = null;
    }
    checkCurrentEnvironment() {
        return !!window.electronAPI
    }
    getElectronAPIs() {
        if (!this.checkCurrentEnvironment()) {
            throw new Error('非Electron环境，无法调用Electron API')
        }
        return window.electronAPI
    }
    async keyToEvent(key, p) {
        const apis = this.getElectronAPIs()
        if (apis[key]) {
            const resp = await apis[key](p)
            return resp
        } else {
            throw new Error(`未定义Electron API- ${key}`)
        }
    }
}