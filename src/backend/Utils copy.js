// 计算瓦片个数
function calculateTiles(options) {
    // console.log("🚀 ~ TileService ~ calculateTiles ~ options:", options)
    const { bounds, minZoom, maxZoom } = options;
    const [south, west, north, east] = bounds;

    // 确保在有效范围内
    const clampedSouth = Math.max(-85.0511, Math.min(85.0511, south));
    const clampedNorth = Math.max(-85.0511, Math.min(85.0511, north));
    const clampedWest = (west % 360 + 360) % 360;
    const clampedEast = (east % 360 + 360) % 360;

    const tiles = [];

    // 计算每个缩放级别的瓦片
    for (let z = minZoom; z <= maxZoom; z++) {
        // 计算该缩放级别的缩放比例
        const scale = Math.pow(2, z);

        // 计算经度方向的瓦片范围
        let tileMinX = Math.floor((clampedWest + 180) / 360 * scale);
        let tileMaxX = Math.floor((clampedEast + 180) / 360 * scale);

        // 处理跨越日期变更线的情况
        if (tileMinX > tileMaxX) {
            tileMaxX += scale;
        }

        // 计算纬度方向的瓦片范围
        // 使用墨卡托投影公式
        const rad = (deg) => deg * Math.PI / 180;
        const tileMinY = Math.floor(
            (1 - Math.log(Math.tan(rad(clampedNorth)) + 1 / Math.cos(rad(clampedNorth))) / Math.PI
            ) / 2 * scale);

        const tileMaxY = Math.floor(
            (1 - Math.log(Math.tan(rad(clampedSouth)) + 1 / Math.cos(rad(clampedSouth))) / Math.PI
            ) / 2 * scale);

        // 确保在有效范围内
        const maxTile = scale - 1;
        const minX = Math.max(0, Math.min(tileMinX, maxTile));
        const maxX = Math.min(maxTile, Math.max(tileMinX, tileMaxX));
        const minY = Math.max(0, Math.min(tileMinY, tileMaxY));
        const maxY = Math.min(maxTile, Math.max(tileMinY, tileMaxY));

        // 生成该缩放级别的所有瓦片
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                // 对于跨越日期变更线的瓦片做调整
                const actualX = x % scale;
                tiles.push({ z, x: actualX, y });
            }
        }
    }

    console.log(`计算瓦片: 层级 ${minZoom}-${maxZoom}, 总数: ${tiles.length}`);
    return tiles;
}

module.exports = { calculateTiles }