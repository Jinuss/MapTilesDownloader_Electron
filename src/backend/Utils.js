// 计算瓦片
async function calculateTiles(options) {
    return new Promise((resolve, reject) => {
        try {
            const { bounds, minZoom, maxZoom } = options;
            const [south, west, north, east] = bounds;

            // 确保纬度在有效范围内 [-85.0511, 85.0511]
            const clampedSouth = Math.max(-85.0511, Math.min(85.0511, south));
            const clampedNorth = Math.max(-85.0511, Math.min(85.0511, north));

            // 规范化经度到 [0, 360) 范围
            let clampedWest = ((west % 360) + 360) % 360;
            let clampedEast = ((east % 360) + 360) % 360;

            // 如果东经小于西经，说明跨越日期变更线
            const crossesDateLine = clampedEast < clampedWest;
            if (crossesDateLine) {
                clampedEast += 360;
            }

            const tiles = [];
            const latRanges = {};

            // 为每个缩放级别预先计算纬度范围
            for (let z = minZoom; z <= maxZoom; z++) {
                const scale = 1 << z; // 等同于 Math.pow(2, z)

                // 修正: 使用正确的墨卡托投影公式
                const toTileY = (lat) => {
                    const sinLatitude = Math.sin(lat * Math.PI / 180);
                    const y = 0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI);
                    return Math.max(0, Math.min(scale - 1, Math.floor(y * scale)));
                };

                const yMin = toTileY(clampedNorth);
                const yMax = toTileY(clampedSouth);
                latRanges[z] = { yMin, yMax, scale };
            }

            // 计算经度范围并处理日期变更线
            for (let z = minZoom; z <= maxZoom; z++) {
                const { yMin, yMax, scale } = latRanges[z];

                // 计算经度范围的瓦片索引
                const toTileX = (lon) => Math.floor(((lon % 360) + 360) % 360 * scale / 360);

                // 1. 处理正常情况（不跨越日期变更线）
                if (!crossesDateLine) {
                    const xMin = toTileX(clampedWest);
                    const xMax = toTileX(clampedEast);

                    for (let x = xMin; x <= xMax; x++) {
                        const wrappedX = x % scale;
                        for (let y = yMin; y <= yMax; y++) {
                            tiles.push({ z, x: wrappedX, y });
                        }
                    }
                }
                // 2. 处理跨越日期变更线的情况
                else {
                    const xMin1 = toTileX(clampedWest);
                    const xMax1 = scale - 1;  // 从西到360度

                    const xMin2 = 0;
                    const xMax2 = toTileX(clampedEast);  // 从0度到东

                    // 第一段: 西到360度
                    for (let x = xMin1; x <= xMax1; x++) {
                        const wrappedX = x % scale;
                        for (let y = yMin; y <= yMax; y++) {
                            tiles.push({ z, x: wrappedX, y });
                        }
                    }

                    // 第二段: 0度到东
                    for (let x = xMin2; x <= xMax2; x++) {
                        const wrappedX = x % scale;
                        for (let y = yMin; y <= yMax; y++) {
                            tiles.push({ z, x: wrappedX, y });
                        }
                    }
                }
            }

            console.log(`计算瓦片: 层级 ${minZoom}-${maxZoom}, 总数: ${tiles.length}`);
            resolve({ state: "success", data: tiles })
        } catch (e) {
            console.log("🚀 ~ return new Promise ~ e:", e)
            reject({ state: 'error', message: "计算瓦片错误" })
        }
    })
}

// 生成瓦片URL
function generateTileUrl(template, domains, z, x, y) {
    let url = template;

    // 处理子域轮询
    if (template.includes('{s}')) {
        const subdomains = domains ? domains.split('') : ['a', 'b', 'c'];
        const subdomain = subdomains[Math.floor(Math.random() * subdomains.length)];
        url = url.replace('{s}', subdomain);
    }

    // 替换变量
    url = url
        .replace(/\{z\}/g, z)
        .replace(/\{x\}/g, x)
        .replace(/\{y\}/g, y)
        .replace(/\{-y\}/g, (Math.pow(2, z) - 1 - y));

    return url;
}

// 格式化时间
function formatMilliseconds(ms) {
    // 计算各个时间单位
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    // 获取剩余时间
    const remainingSeconds = seconds % 60;
    const remainingMinutes = minutes % 60;

    // 格式化为两位数
    const formattedHours = hours.toString().padStart(2, '0');
    const formattedMinutes = remainingMinutes.toString().padStart(2, '0');
    const formattedSeconds = remainingSeconds.toString().padStart(2, '0');

    return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
}

module.exports = { calculateTiles, generateTileUrl, formatMilliseconds };