import { BestdoriapiPath, Bestdoriurl, configPath } from '@/config'
import { callAPIAndCacheResponse } from '@/api/getApi'
import { readJSON } from '@/types/utils'
import { readExcelFile } from '@/types/utils'
import { logger } from '@/logger'
import * as path from 'path'
import { getBandIcon } from './Band'
import { Server, getIcon, getServerByServerId } from './Server'
import { Attribute, attributeIconCache } from './Attribute'
import { parentPort, threadId,isMainThread  } from'worker_threads';
import { drawTopRateSpeedRank } from '@/view/cutoffEventTop'
import { getPresentEvent } from './Event'
import { Long } from 'mongodb'
import { piscina } from '@/WorkerPool';
if (!isMainThread && parentPort) {
    console.log = (...args) => {
      parentPort!.postMessage({
        type: 'log',
        threadId,
        args
      });
    };
  }

let mainAPI: object = {}//main对象,用于存放所有api数据,数据来源于Bestdori网站
export let TopRateSpeed = null
 let TopRateSpeedCacheTime
export let cardsCNfix, skillCNfix, areaItemFix, eventCharacterParameterBonusFix = {}, songNickname
export function setMainAPI(data) {
    if (data == null){
        logger('setMainAPI','setMainAPI try to set an null value,abort.')
        return
    } 
    for (const key in data) {
        mainAPI[key] = data[key];
    }
    logger('setMainAPI','Set apiData to Worker Successfully.')
}
export function setOtherFix(data) {
    //console.log(data)
    if (data == null){
        logger('setOtherFix','setOtherFix try to set an null value,abort.')
        return
    } 
    areaItemFix = data.areaItemFix
    skillCNfix = data.skillCNfix
    eventCharacterParameterBonusFix = data.eventCharacterParameterBonusFix
    songNickname = data.songNickname
    logger('setOtherFix','Set setOtherFix to Worker Successfully.')
}
var preCacheIconFlags = false
//加载mainAPI
export async function preCacheIcon() {
    if(!preCacheIconFlags){
        logger('mainAPI', 'PreCache Icon...');
        for(let i = 1;i<6;i++){
           getBandIcon(i)  // 用于缓存
        }
        getBandIcon(18)  // 用于缓存RAS
        getBandIcon(21)  // 用于缓存Morfonica
        getBandIcon(45)  // 用于缓存MyGO
    
        for (const key in Server) {
            const value = Number(key)
            if (!isNaN(value)) {
                getIcon(value as Server)
            }
        }
        let attributeList = ["cool", "happy", "pure", "powerful"];
        for(var attributeName of attributeList){
            if(attributeIconCache[attributeName] == undefined){
                new Attribute(attributeName).getIcon()
            }
        }
    }
    preCacheIconFlags = true
}
async function loadMainAPI(useCache: boolean = false) {
    if (!isMainThread){
        if(eventCharacterParameterBonusFix) eventCharacterParameterBonusFix = await readJSON(path.join(configPath, 'eventCharacterParameterBonusFix.json'))
        
        return
    } 
    logger('mainAPI', 'loading mainAPI...')
    const promiseAll = Object.keys(BestdoriapiPath).map(async (key) => {
        const maxRetry = 3
        if (useCache) {
            return mainAPI[key] = await callAPIAndCacheResponse(Bestdoriurl + BestdoriapiPath[key], 1 / 0,3,false);
        } else {
            try {
                return mainAPI[key] = await callAPIAndCacheResponse(Bestdoriurl + BestdoriapiPath[key],0,3,false);
            } catch (e) {
                logger('mainAPI', `load ${key} failed`)
            }
        }
    });

    await Promise.all(promiseAll);
    try { //能够实时更新而不重启清空缓存
        let songNicknameData = await readExcelFile(path.join(configPath, 'nickname_song.xlsx'))
        if(songNicknameData!=null) songNickname = songNicknameData  // 尽量避免定时更新api的时候无法查询到任何歌曲，
    }
    catch (e) {
        logger('mainAPI', '读取nickname_song.xlsx失败')
    }
    if (useCache) {
        cardsCNfix = await readJSON(path.join(configPath, 'cardsCNfix.json'))
        skillCNfix = await readJSON(path.join(configPath, 'skillsCNfix.json'))
        areaItemFix = await readJSON(path.join(configPath, 'areaItemFix.json'))
        eventCharacterParameterBonusFix = await readJSON(path.join(configPath, 'eventCharacterParameterBonusFix.json'))
    }
    for (var key in cardsCNfix) {
        mainAPI['cards'][key] = cardsCNfix[key]
    }
    for (var key in skillCNfix) {
        mainAPI['skills'][key] = skillCNfix[key]
    }
    for (var key in areaItemFix) {
        if (mainAPI['areaItems'][key] == undefined) {
            mainAPI['areaItems'][key] = areaItemFix[key]
        }
    }
    for (let i = 0; i < songNickname.length; i++) {
        const element = songNickname[i];
        if (mainAPI['songs'][element['Id'].toString()]) {
            mainAPI['songs'][element['Id'].toString()]['nickname'] = element['Nickname']
        }
    }
    //await preCacheIcon()
    if(isMainThread){
        await piscina.drawList.run({
        data: mainAPI,
    },{name:'setMainApiToWorker'})
    await piscina.drawList.run({
        data: {cardsCNfix, skillCNfix, areaItemFix, eventCharacterParameterBonusFix, songNickname},
    },{name:'setOtherFixToWorker'})

}  


    logger('mainAPI', 'mainAPI loaded')

}
//TopRateSpeedCacheTime = new Date().getTime()
logger('mainAPI', "initializing...")
loadMainAPI(true).then(() => {
    preCacheIcon()
    logger('mainAPI', "initializing done")
    loadMainAPI()
})



if (isMainThread) setInterval(loadMainAPI, 1000 * 60 * 5)//5分钟更新一次

export default mainAPI