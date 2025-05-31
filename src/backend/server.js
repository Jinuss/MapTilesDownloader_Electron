const fs = require('fs-extra')
const path = require('path')
const axios = require('axios')
const { ipcMain } = require('electron')

class TileService {
    constructor() {
        this.downloaded = 0
        this.total = 0
        this.isDownloading = false
        this.window = null
        this.tilesDir = path.join(app.getPath('userData'), 'tiles')
    }

    setWindow(window) {
        this.window = window
    }

    async downloadTiles(params) {
        this.downloaded = 0;
        this.total = params.tiles.length
        this.isDownloading = true

        const concurrency = 5
        const batches = []

        for (let i = 0; i < this.total; i += concurrency) {
            batches.push(params.tiles.slice(i, i + concurrency))
        }

        for (const batch of batches) {
            await Promise.all(batch.map(tile => this.downloadTile(tile, params.urlTemplate)))
            this.downloaded += batch.length
            this.updateProgress()
            if (!this.isDownloading) break
        }

        this.isDownloading = false

        return { success: true, downloaded: this.downloaded }
    }

    async downloadTile(tile, urlTemplate) {
        const { z, x, y } = tile
        const url = urlTemplate.replace(`{z}`, z).replace(`{x}`, x).replace(`{y}`, y).replace(`{s}`, this.getSubdomain(tile))
        const tilePath = path.join(this.tilesDir, `${z}/${x}/${y}.png`)

        try {
            if (await fs.pathExists(tilePath)) {
                return { status: 'exists', tile }
            }
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 })
            await fs.ensureDir(path.dirname(tilePath))
            await fs.writeFile(tilePath, response.data)
            return { status: 'success', tile }
        } catch (error) {
            console.error(`下载失败：${url}`, error.message)
            return { status: 'failed', error: error.message, tile }
        }
    }

    getSubdomain(tile) {
        const subdomains = [`a`, `b`, `c`]
        return subdomains[(tile.x + tile.y) % subdomains.length]
    }

    updateProgress() {
        if (this.window) {
            this.window.webContents.send('progress-update', { downloaded: this.downloaded, total: this.total, percent: Math.round((this.downloaded / this.total) * 100) })
        }
    }

    getProgress() {
        return { downloaded: this.downloaded, total: this.total, percent: Math.round((this.downloaded / this.total) * 100) }
    }

    startServer() {
        fs.ensureDirSync(this.tilesDir)
    }
    stopServer() {
        this.isDownloading = false
    }
}

module.exports = new TileService()