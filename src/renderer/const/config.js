// 地图底图瓦片地址
export const BASE_MAP_TILES_URL = [
    { url: "https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}", layerName: "高德电子底图", type: "gd" }]

export const TDT_TOKEN = "d083e4cf30bfc438ef93436c10c2c20a"

export const TDT_LAYERS = [
    {
        layerName: "影像底图",
        type: 'tdt',
        url: "img_w"
    },
    {
        layerName: "影像注记",
        type: 'tdt',
        url: "cia_w"
    },
    {
        layerName: "影像英文注记",
        type: 'tdt',
        url: "eia_w"
    },
    {
        layerName: "电子底图",
        type: 'tdt',
        url: "vec_w"
    },
    {
        layerName: "电子注记",
        type: 'tdt',
        url: "cva_w"
    },
    {
        layerName: "电子英文注记",
        type: 'tdt',
        url: "eva_w"
    },

    {
        layerName: "地形底图",
        type: 'tdt',
        url: "ter_w"
    },
    {
        layerName: "地形注记",
        type: 'tdt',
        url: "cta_w"
    },
    {
        layerName: "全球境界",
        url: "ibo_w",
        type: 'tdt',
    }
] 