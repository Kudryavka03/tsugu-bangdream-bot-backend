import { getJsonAndSave } from '@/api/downloader';
import { getCacheDirectory, getFileNameFromUrl } from '@/api/utils';
import { logger } from '@/logger';
import * as path from 'path';

async function callAPIAndCacheResponse(url: string, cacheTime: number = 0, retryCount: number = 3,isForceUseCache = true,rtLevel=1): Promise<object> {
  const cacheDir = getCacheDirectory(url);
  const fileName = getFileNameFromUrl(url);
  // rtLevel：规定API的实时性。不同的等级将会被赋予不同的实时性。
  // 0级：可以返回缓存数据，但是必须得在后台进行更新，确保下一次返回的数据是最新的 | 1级：要求返回服务器上的最新数据。例如个人信息，tracker数据等，默认为1. 0级可以加快event/歌曲的出图速度
  // 当isForceUseCache为true的时候，rtLevel将会被无视
  for (let attempt = 0; attempt < retryCount; attempt++) {
    
    try {
      //const cacheFilePath = path.join(cacheDir || '', `${fileName || ''}`);
      if (isForceUseCache){
        //console.log('isForceUseCache:',isForceUseCache)
        const data = await getJsonAndSave(url, cacheDir, fileName, cacheTime,isForceUseCache);
        return data
      }
      var apiData = null;
      if (rtLevel == 0 || rtLevel){
        if(rtLevel == 0){
          logger('callAPIAndCacheResponse','rtLevel is 0. Return Cache Data First then update data on background to Speed Up')
          apiData = await getJsonAndSave(url, cacheDir, fileName, 0,true);
          if (isFinite(cacheTime)) getJsonAndSave(url, cacheDir, fileName, 300, false)
            .catch(err => {
              logger(
                'callAPIAndCacheResponse',
                `Background cache update failed for ${url}: ${err?.stack || err}`
              );
            });   // 设置5分钟的缓冲区，防止新文件在短时间内重新获取。如果是读取缓存的则不再重新获取
          return apiData
        }
        if(rtLevel == 1){
          apiData = await getJsonAndSave(url, cacheDir, fileName, cacheTime,false);
          return apiData
        }
      }
      const data = await getJsonAndSave(url, cacheDir, fileName, cacheTime,isForceUseCache);  // 如果不强制读取缓存但又没有规定实时性。虽然不太可能发生，但是保底。
      return data;
    } catch (e) {
      logger(`API`, `Failed to get JSON from "${url}" on attempt ${attempt + 1}. Error: ${e.message}`);
      if (e.message.includes('404')){ // 找不到就是找不到，不需要重试了。如果是访问上限，错误码不会是404
        throw new Error(`Failed to get JSON from "${url}" Server returned 404 err code`);
      }
      if (attempt === retryCount - 1) {
        throw new Error(`Failed to get JSON from "${url}" after ${retryCount} attempts`);
        //throw e; // Rethrow the error if all retries fail
      }
      //等待3秒后重试
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  throw new Error(`Failed to get JSON from "${url}" after ${retryCount} attempts`);
}

export { callAPIAndCacheResponse };
