import { BestdoriapiPath, Bestdoriurl, configPath } from '@/config'
import { callAPIAndCacheResponse } from '@/api/getApi'
import { readJSON } from '@/types/utils'
import { readExcelFile } from '@/types/utils'
import { logger } from '@/logger'
import * as path from 'path'
import { getBandIcon } from './Band'
import { Server, getIcon } from './Server'
import { Attribute, attributeIconCache } from './Attribute'

const mainAPI: object = {}//main对象,用于存放所有api数据,数据来源于Bestdori网站

export let cardsCNfix, skillCNfix, areaItemFix, eventCharacterParameterBonusFix, songNickname
//加载mainAPI
async function loadMainAPI(useCache: boolean = false) {
    logger('mainAPI', 'loading mainAPI...')
    const promiseAll = Object.keys(BestdoriapiPath).map(async (key) => {
        const maxRetry = 3
        if (useCache) {
            return mainAPI[key] = await callAPIAndCacheResponse(Bestdoriurl + BestdoriapiPath[key], 1 / 0);
        } else {
            try {
                return mainAPI[key] = await callAPIAndCacheResponse(Bestdoriurl + BestdoriapiPath[key]);
            } catch (e) {
                logger('mainAPI', `load ${key} failed`)
            }
        }
    });

    await Promise.all(promiseAll);
    if (useCache) {
        cardsCNfix = await readJSON(path.join(configPath, 'cardsCNfix.json'))
        skillCNfix = await readJSON(path.join(configPath, 'skillsCNfix.json'))
        areaItemFix = await readJSON(path.join(configPath, 'areaItemFix.json'))
        eventCharacterParameterBonusFix = await readJSON(path.join(configPath, 'eventCharacterParameterBonusFix.json'))
        try {
            songNickname = await readExcelFile(path.join(configPath, 'nickname_song.xlsx'))
        }
        catch (e) {
            logger('mainAPI', '读取nickname_song.xlsx失败')
        }
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
    logger('mainAPI', 'PreCache Icon...');
    for(let i = 1;i<6;i++){
       await getBandIcon(i)  // 用于缓存
    }
    await getBandIcon(28)  // 用于缓存RAS
    await getBandIcon(21)  // 用于缓存Morfonica
    await getBandIcon(45)  // 用于缓存MyGO

    for (const key in Server) {
        const value = Number(key)
        if (!isNaN(value)) {
            await getIcon(value as Server)
        }
    }
    let attributeList = ["cool", "happy", "pure", "powerful"];
    for(var attributeName of attributeList){
        if(attributeIconCache[attributeName] == undefined){
            await new Attribute(attributeName).getIcon()
        }
    }

    logger('mainAPI', 'mainAPI loaded')

}

logger('mainAPI', "initializing...")
loadMainAPI(true).then(() => {
    logger('mainAPI', "initializing done")
    loadMainAPI()
})



setInterval(loadMainAPI, 1000 * 60 * 5)//5分钟更新一次

export default mainAPI