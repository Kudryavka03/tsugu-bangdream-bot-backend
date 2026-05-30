// @ts-nocheck
import * as path from "path";
export const projectRoot = path.resolve(path.dirname(__dirname));
export const assetsRootPath = path.join(projectRoot, '/assets');
export const configPath = path.join(projectRoot, '/config');
export const carKeywordPath = path.join(configPath, '/car_keyword.json');
export const cacheRootPath = path.join(projectRoot, '/cache');
export const bindingPlayerPromptWaitingTime = 5 * 60 * 10000; //绑定玩家的等待时间
export const Bestdoriurl = 'https://bestdori.com'; //Bestdori网站的url
export const BandoriStationurl = 'https://api.bandoristation.com/'; //BandoriStation网站的url
export enum Server {
    jp = 0,
    en = 1,
    tw = 2,
    cn = 3,
    kr = 4,
}
export const globalDefaultServer = [Server.cn, Server.jp]; //默认服务器列表
export const globalServerPriority = [Server.cn, Server.jp, Server.tw, Server.en, Server.kr]; //默认服务器优先级
export const serverNameFullList = [
    '日服',
    '国际服',
    '台服',
    '国服',
    '韩服'
];
export const tierListOfServer = {
    'jp': [20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000, 30000, 50000],
    'tw': [100, 500],
    'en': [50, 100, 300, 500, 1000, 2000, 2500],
    'kr': [100],
    'cn': [20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 4000, 5000, 10000, 20000, 30000, 50000]
};

export interface tsuguUser {
    userId: string;
    platform: string;
    mainServer: Server;
    displayedServerList: Server[];
    shareRoomNumber: boolean;
    userPlayerIndex: number;
    userPlayerList: userPlayerInList[];
}

export interface userPlayerInList {
    playerId: number;
    server: Server;
}

export interface Channel {
    tsuguGacha: boolean;
}

export interface Config {
    useEasyBG: boolean;
    compress: boolean;
    bandoriStationToken: string;
    backendUrl: string;
    RemoteDBSwitch: boolean;
    RemoteDBUrl: string;
    reply: boolean;
    at: boolean;
}

export function getUserPlayerByUser(tsuguUser, server) {
    server ?? (server = tsuguUser.mainServer);
    const userPlayerList = tsuguUser.userPlayerList;
    //如果用户未绑定角色
    if (userPlayerList.length == 0) {
        throw new Error('用户未绑定player');
    }
    //如果index的player在主服务器上，直接返回
    if (tsuguUser.userPlayerList[tsuguUser.userPlayerIndex].server == server) {
        return userPlayerList[tsuguUser.userPlayerIndex];
    }
    //如果index的player不在主服务器上，遍历查找第一个在主服务器上的player
    for (let i = 0; i < userPlayerList.length; i++) {
        const userPlayerInList = userPlayerList[i];
        if (userPlayerInList.server == server) {
            return userPlayerInList;
        }
    }
    //如果没有在主服务器上的player
    throw new Error('用户在对应服务器上未绑定player');
}
