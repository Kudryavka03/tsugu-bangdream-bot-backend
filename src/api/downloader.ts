import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '@/logger';
const pendingDownloads = new Map<string, Promise<Buffer>>();
const errUrl: string[] = [];
const resDebug = false
const apiDebug = false
export const showDownloadLog = false
const workerPath = path.resolve(__dirname, "../readFileWorker.js");

import Piscina from 'piscina';



// 在低性能服务器上不应该使用Worker。Worker会使得receiveMessageOnPort阻塞主线程。别问我怎么知道的
const pool = new Piscina({ filename: workerPath,minThreads:4,maxThreads:4,execArgv:[] });
const readPool = new Piscina({ filename: workerPath,minThreads:4,maxThreads:4,execArgv:[] });



export async function download(url: string, directory?: string, fileName?: string, cacheTime = 0, isApiRequest = false): Promise<Buffer> {
  if (resDebug) console.trace()
  if (pendingDownloads.has(url)) {
    if(showDownloadLog) logger('download', `Duplicate request detected, waiting for ongoing download: ${url}`);// 重复的文件下载缓存
    return pendingDownloads.get(url)!;
  }
  const task = (async () => {
    await Promise.resolve();
  if (directory != undefined && fileName != undefined) {
    createDirIfNonExist(directory);
  }
  if (resDebug)console.trace()
  try {
    if (errUrl.includes(url)) {
      throw new Error("downloadFile: errUrl.includes(url)");
      
    }
    let eTag: string | undefined;
    const cacheFilePath = path.join(directory || '', `${fileName || ''}`);
    if (fileName && directory) {
        //var ts1 = Date.now()
        //const exists = await callWorker<boolean>('exist',cacheFilePath);
        const exists = await fileExists(cacheFilePath);
        //var ts2 = Date.now()
        //console.log("存在读取用时：" + (ts2-ts1))
        if (exists){
          if(showDownloadLog) logger('download',`Match Cache! ${url}`)
          if(resDebug) console.trace()
          var r = await loadFile(cacheFilePath)
          return  r
        }
      
    }
    const headers = eTag ? { 'If-None-Match': eTag } : {};
    let response;
    try {
      //logger('download',`Miss Cache! ${url}  is downloading...`)
  //console.trace()
      response = await axios.get(url, { headers, responseType: 'arraybuffer' });
    } catch (error) {
      if (error.response && error.response.status === 304) {
        //console.log(`ETag matches for "${url}". Using cached file.`);
        const cachedData = await loadFile(cacheFilePath);
        return cachedData;
      } else {
        throw error;
      }
    }

    const fileBuffer = Buffer.from(response.data, 'binary');
    /*
    const newETag = response.headers.etag;
    if (newETag && directory && fileName) {
      fs.writeFileSync(path.join(directory, `${fileName}.etag`), newETag);
    }
    */

    if (directory && fileName) {
      await fs.promises.writeFile(path.join(directory, fileName), fileBuffer);
      // fs.writeFileSync(path.join(directory, fileName), fileBuffer); // 写入文件
    }
    if(showDownloadLog) logger('download',`Download finish and cache for ${url}.`)
    //console.log(`Downloaded file from "${url}"`);
    return fileBuffer;
  } catch (e) {
    //pendingDownloads.delete(url);
    errUrl.push(url);
    if (url.includes('.png')) {
      throw e;
    } else {
      throw new Error(`Failed to download file from "${url}". Error: ${e.message}`);
    }
  }
  finally{
    const wasDeleted = pendingDownloads.delete(url); // 捕获返回值
    if (!wasDeleted) logger('download', `Delete Task Faild for ${url}? ${wasDeleted}!!!`); // 打印结果
  }
})();
pendingDownloads.set(url, task);
return task;
}


const memoryCache = new Map<string, any>();


export async function getJsonAndSave(url: string, directory?: string, fileName?: string, cacheTime = 0,isForceUseCache = true): Promise<any> { // 在调用档线，基础等API数据的时候检查缓存是否过期才使用缓存
 // if (url.includes('312')) throw new Error("模拟错误返回")
 if(showDownloadLog) logger('getJsonAndSave','Start Get API: '+url+' From:')
  if (apiDebug)console.trace()
  try {
    if (directory != undefined && fileName != undefined) {
      createDirIfNonExist(directory);
    }
    let eTag: string | undefined;
    const cacheFilePath = path.join(directory || '', `${fileName || ''}`);
    if (fileName && directory) {
      if (await fileExists(cacheFilePath)) {
        var isReadCache = false;  // 不读取缓存，做一系列的判断先
        // var isCheckIfUnExpired = false
        var isUnExpired = false
        if (isForceUseCache){// 如果要强制使用缓存
          isReadCache = true
      }
      else {
        const stat = await fs.promises.stat(cacheFilePath);
        const now = Date.now();
        if (now - stat.mtimeMs < cacheTime * 1000){ // 如果不是强制读取，且缓存没过期，则读取缓存
          isReadCache = true
        }
      }
        // 经过上述判断后，对于基础API，档线数据，玩家数据，则通过缓存判断是否需要使用缓存
        if (isReadCache) {
          //console.log(`Cache time for "${url}" has not expired. Using cached JSON data.`);
          if (memoryCache.has(cacheFilePath)) {
            const cached = memoryCache.get(cacheFilePath);
            return cached;
        }
          //const cachedData = await callWorker<string>('readJsonText', cacheFilePath);
          const cachedJson = loadJson(cacheFilePath);
          memoryCache.set(cacheFilePath, cachedJson);
          if(showDownloadLog) logger('getJsonAndSave','API: '+url + ` is Using Cache. Reason: isUnExpired: ${isUnExpired} isForceUseCache ${isForceUseCache} isReadCache ${isReadCache}`)
          return cachedJson;
        }
      }
    }
    const eTagFilePath = path.join(directory, `${fileName}.etag`);

    await fileExists(eTagFilePath)? eTag = await fs.promises.readFile(eTagFilePath,'utf-8') : undefined;

    const headers = eTag ? { 'If-None-Match': eTag } : {};
    let response;
    try {
      response = await axios.get(url, { headers, responseType: 'arraybuffer' });
    } catch (error) {
      if (error.response && error.response.status === 304) {
        //console.log(`ETag matches for "${url}". Using cached JSON data.`);
        if (memoryCache.has(cacheFilePath)) {
          const cached = memoryCache.get(cacheFilePath);
          return cached;
      }
        //const cachedData = await fs.promises.readFile(cacheFilePath, 'utf-8');
        //const cachedJson = callWorker<any>('readJson',cacheFilePath); //因为上一级函数就是await，因此这里不再需要await
        const cachedJson = loadJson(cacheFilePath);
        memoryCache.set(cacheFilePath, cachedJson);
        if(showDownloadLog) logger('getJsonAndSave','API: '+url + ' is using Cached data.')
        return cachedJson;
      } else {
        throw error;
      }
    }

    const fileBuffer = Buffer.from(response.data, 'binary');
    const fileContent = fileBuffer.toString('utf-8');
    const jsonObject = JSON.parse(fileContent);

    const newETag = response.headers.etag;
    if (newETag && directory && fileName) {
      await fs.promises.writeFile(path.join(directory, `${fileName}.etag`), newETag);
    }

    if (directory && fileName) {
      await fs.promises.writeFile(path.join(directory, fileName), fileContent);
    }

    //console.log(`Downloaded JSON data from "${url}"`);
    if(showDownloadLog) logger('getJsonAndSave','API: '+url + ' is Downloaded.')
    memoryCache.set(cacheFilePath, jsonObject);
    return jsonObject;
  } catch (e) {
    return Promise.reject(
      new Error(`Failed to download JSON data from "${url}". Error: ${e.message}`)
  );
  }
}


// 综合考虑还是用回之前的方案，1kb文件创建worker本身就是不小的开销了
async function loadJson(path) {
  const str = await pool.run(path,{name:'readJsonText'})
  var body = JSON.parse(str)
  return body
}

async function loadFile(p: string): Promise<Buffer> {
  return Buffer.from(await readPool.run(p,{name:'readFiles'}));
}

export async function fileExists(path: string): Promise<boolean> {
  try {
      await fs.promises.access(path); // 尝试访问文件
      return true;
  } catch {
      return false;
  }
}



async function createDirIfNonExist(filepath: string) {
  if (!await fileExists(filepath)) {
    try {
      await fs.promises.mkdir(filepath, { recursive: true });
    } catch (err) {}
  }
}