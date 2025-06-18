import { ROOT_CODE, TDT_LAYERS, BASE_MAP_TILES_URL, TDT_TOKEN } from '@/const/index'

export function flattenTree(tree, childrenKey = 'children') {
    const result = [];

    // 使用栈来实现非递归的深度优先搜索
    const stack = [...tree];

    while (stack.length > 0) {
        // 弹出栈顶元素
        const node = stack.pop();

        // 将当前节点添加到结果数组
        result.push(node);

        // 如果当前节点有子节点，则将子节点逆序压入栈中
        // 逆序是为了保持原有的遍历顺序
        if (node[childrenKey] && Array.isArray(node[childrenKey]) && node[childrenKey].length > 0) {
            stack.push(...node[childrenKey].reverse());
        }
    }

    return result;
}


export const getAreaFullPath = (list, code) => {
    if (code == ROOT_CODE) {
        return [code]
    }

    let root = list.find(item => item.code == ROOT_CODE);
    let result = [];
    let tmp = {}, pid = '';
    while (root.id != pid) {
        if (!pid) {
            tmp = list.find(item => item.code == code);
            pid = tmp.pid;
        } else {
            tmp = list.find(item => item.id == pid);
        }
        pid = tmp.pid
        result.unshift(tmp.code);
    }
    result.unshift(ROOT_CODE)

    return result;
}

export const getLayerByName = (name) => {
    return [...BASE_MAP_TILES_URL, ...TDT_LAYERS].find(item => item.layerName === name)
}

export const getWrappedUrlByLayerType = (url,layerType) => {
    if (layerType == 'tdt') {
        url = `http://t{s}.tianditu.gov.cn/DataServer?T=${url}&x={x}&y={y}&l={z}&tk=${TDT_TOKEN}`
        return { urlTemplate: url, subdomains: "01234567" };
    }
    return { urlTemplate: url, subdomains: "abc" };
}