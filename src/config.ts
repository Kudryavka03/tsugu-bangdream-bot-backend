import * as path from 'path';
import { Server } from '@/types/Server';
import { logger } from './logger';

export const projectRoot: string = path.resolve(path.dirname(__dirname));
export const assetsRootPath: string = path.join(projectRoot, '/assets');
export const configPath: string = path.join(projectRoot, '/config');
export const fuzzySearchPath = path.join(configPath, '/fuzzy_search_settings.json');
export const carKeywordPath = path.join(configPath, '/car_keyword.json');
export const cacheRootPath: string = path.join(projectRoot, '/cache');

export const BestdoriapiPath = { //Bestdori网站的列表api路径
    'cards': '/api/cards/all.5.json',
    'characters': '/api/characters/main.3.json',
    'bands': '/api/bands/main.1.json',
    'singer': '/api/bands/all.1.json',
    'skills': '/api/skills/all.10.json',
    'costumes': '/api/costumes/all.5.json',
    'events': '/api/events/all.6.json',
    'degrees': '/api/degrees/all.3.json',
    'gacha': '/api/gacha/all.5.json',
    'songs': '/api/songs/all.7.json',
    'meta': '/api/songs/meta/all.5.json',
    'loginCampaigns': '/api/loginCampaigns/all.5.json',
    'miracleTicketExchanges': '/api/miracleTicketExchanges/all.5.json',
    'comics': '/api/comics/all.5.json',
    'areaItems': '/api/areaItems/main.5.json',
    'rates': '/api/tracker/rates.json',
    'items': '/api/misc/itemtexts.2.json',
    'stamps': '/api/stamps/all.2.json',
    'deco': '/api/deco/pins.all.3.json'
}
export const bindingPlayerPromptWaitingTime: number = 5 * 60 * 10000
var prod = false
export const Bestdoriurl: string = prod?'https://bestdori.com':'https://bestdori.com'; //Bestdori网站的url，BD跟车站应该都是在香港的，部署在香港访问更快。原URL https://bestdori.com
export const BandoriStationurl: string = 'https://api.bandoristation.com/'; //BandoriStation网站的url
export const HHWX_Url: string = 'https://hhwx.org'; //HHWX网站的url
export const StarFx_Url: string = 'https://grp-speed-backend.starfreedomx.top'; //StarFx网站的url
export const cutoffDataSourcePriority = ['HHWX','Bestdori','StarFX' ]
export var preferredCutoffDataSourceName = 'HHWX'
export var USE_HHWX_SOURCE_PREFER = preferredCutoffDataSourceName == 'HHWX'
export const extraUrl: string = 'http://127.0.0.1'; //其他功能实现

const enableAutoTrackerDataSourceSwitch = true
const trackerAutoSwitchThreshold:number = 5     // 设定数据源自动切换门限，当存在5次数据源更新不及时的情况，自动切换数据源，加快访问速度
var trackerAutoSwitchFlags:number = 0
var trackerAutoSwitchSourceName = preferredCutoffDataSourceName
export function getPreferredCutoffDataSourceName(){
    return preferredCutoffDataSourceName
}
export function getCutoffDataSourcePreferenceOrder(availableSourceNames: string[] = cutoffDataSourcePriority){
    if (!availableSourceNames || availableSourceNames.length == 0) return []
    const preferred = availableSourceNames.includes(preferredCutoffDataSourceName) ? preferredCutoffDataSourceName : availableSourceNames[0]
    return [preferred, ...availableSourceNames.filter(sourceName => sourceName != preferred)]
}
export function getNextCutoffDataSourceName(sourceName: string = preferredCutoffDataSourceName, availableSourceNames: string[] = cutoffDataSourcePriority){
    if (!availableSourceNames || availableSourceNames.length == 0) return sourceName
    const currentIndex = availableSourceNames.indexOf(sourceName)
    if (currentIndex < 0) return availableSourceNames[0]
    return availableSourceNames[(currentIndex + 1) % availableSourceNames.length]
}
export function setPreferredCutoffDataSourceName(sourceName: string){
    preferredCutoffDataSourceName = sourceName
    USE_HHWX_SOURCE_PREFER = preferredCutoffDataSourceName == 'HHWX'
    trackerAutoSwitchSourceName = preferredCutoffDataSourceName
}
export function reportDataSourceProblem(sourceName: string = preferredCutoffDataSourceName, availableSourceNames: string[] = cutoffDataSourcePriority){
    if(enableAutoTrackerDataSourceSwitch){
        if (sourceName != preferredCutoffDataSourceName) return
        if (trackerAutoSwitchSourceName != sourceName){
            trackerAutoSwitchSourceName = sourceName
            trackerAutoSwitchFlags = 0
        }
        if(++trackerAutoSwitchFlags > trackerAutoSwitchThreshold-1){
            const nextSourceName = getNextCutoffDataSourceName(sourceName, availableSourceNames)
            logger('config.ts/reportDataSourceProblem',`Tracker data source ${sourceName} has repeated problems, switch preferred source to ${nextSourceName}`)
            setPreferredCutoffDataSourceName(nextSourceName)
            trackerAutoSwitchFlags = 0
        }
    }
}
export function clearDataSourceProblem(sourceName: string = preferredCutoffDataSourceName){
    if (sourceName != trackerAutoSwitchSourceName) return
    trackerAutoSwitchFlags = 0
}


export const globalDefaultServer: Array<Server> = [Server.cn,Server.jp]//默认服务器列表
export const globalServerPriority: Array<Server> = [Server.cn, Server.jp, Server.tw, Server.en, Server.kr]//默认服务器优先级

export const serverNameFullList = [
    '日服',
    '国际服',
    '台服',
    '国服',
    '韩服'
]

export const tierListOfServer = {
    'jp': [20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000, 30000, 50000],
    'tw': [100, 500],
    'en': [50, 100, 300, 500, 1000, 2000, 2500],
    'kr': [100],
    'cn': [20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 1500, 2000, 3000, 4000, 5000, 10000, 20000, 30000, 50000]
}

/** 国服月榜档线（HHWX），供 mycx / mlsycx / mycxall 使用 */
export const cnMonthlyTierList = [1, 10, 20, 30, 40, 50, 100, 200, 300, 500, 1000, 2000, 3000, 4000]

export const statusName = {
    'not_start': '未开始',
    'in_progress': '进行中',
    'ended': '已结束'
}
export function switchDataSource(){
    setPreferredCutoffDataSourceName(getNextCutoffDataSourceName())
    return 'Cutoff data source: ' + preferredCutoffDataSourceName
}

