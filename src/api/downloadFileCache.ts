import { downloadFile } from '@/api/downloadFile'
import { assetErrorImageBuffer } from "@/image/utils";
const cache: Map<string, Buffer> = new Map();
const MAX_CACHE_SIZE = 15;  // 设置最大缓存量
const ENABLE_CACHE = true; // 是否启用缓存

async function downloadFileCache(url: string,IgnoreErr = true): Promise<Buffer> {
    if (cache.has(url)) {
        // 如果已经有缓存，则直接返回缓存数据
        //console.log(`已有缓存:${url}`)
        return cache.get(url)!;
    }
    // 下载文件
    // const data = await downloadFile(url,IgnoreErr)
    // 将下载的文件缓存起来
    const data = await downloadFile(url,IgnoreErr)
    //const bufferData = Buffer.from(data)//console.log(data)
    if (data.equals(assetErrorImageBuffer)){
        return data;
    }
    if (cache.size >= MAX_CACHE_SIZE) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    if (ENABLE_CACHE) {
        cache.set(url, data);
    }
    return data;
}

export { downloadFileCache }
