// @ts-nocheck
import * as Server_1 from "../types/Server";
export async function updateUser(session, update) {
    if (!isPartialTsuguUser(update)) {
        throw new Error('参数错误');
    }
    if (update['userPlayerList'] != undefined) {
        throw new Error('不允许直接修改绑定信息');
    }
    for (const key in update) {
        session.user.tsugu[key] = update[key];
    }
}
export async function updateUserPlayerList(session, bindingAction, tsuguUserServer, verifyed) {
    const user = session.user.tsugu;
    let userPlayerList = user['userPlayerList'];
    const index = userPlayerList.findIndex((item) => item.playerId == tsuguUserServer.playerId);
    if (bindingAction == 'bind') {
        if (index != -1) {
            throw new Error('该 player 已经绑定');
        }
        if (verifyed) {
            userPlayerList.push(tsuguUserServer);
        }
    }
    else {
        if (index == -1) {
            throw new Error('该 player 未绑定');
        }
        if (verifyed) {
            userPlayerList.splice(index, 1);
        }
    }
}
// 判断tsuguUser函数 (in key of tsuguUser)
export function isPartialTsuguUser(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    if ('userId' in obj && typeof obj.userId !== 'string') {
        return false;
    }
    if ('platform' in obj && typeof obj.platform !== 'string') {
        return false;
    }
    if ('mainServer' in obj && !(0, Server_1.isServer)(obj.mainServer)) {
        return false;
    }
    if ('displayedServerList' in obj && !(0, Server_1.isServerList)(obj.displayedServerList)) {
        return false;
    }
    if ('shareRoomNumber' in obj && typeof obj.shareRoomNumber !== 'boolean') {
        return false;
    }
    if ('userPlayerList' in obj) {
        if (!Array.isArray(obj.userPlayerList)) {
            return false;
        }
        for (const item of obj.userPlayerList) {
            if (!isUserPlayerInList(item)) {
                return false;
            }
        }
    }
    // 如果所有存在的属性都通过了检查，则返回 true
    return true;
}
export function isUserPlayerInList(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    if (typeof obj.playerId !== 'number') {
        return false;
    }
    if (!(0, Server_1.isServer)(obj.server)) {
        return false;
    }
    return true;
}
export function getUserPlayerByUser(tsuguUser, server, index) {
    server ?? (server = tsuguUser.mainServer);
    const userPlayerList = tsuguUser.userPlayerList;
    const userPlayerIndex = index ?? tsuguUser.userPlayerIndex;
    //如果用户未绑定角色
    if (userPlayerList.length == 0) {
        throw new Error('用户未绑定player');
    }
    //如果index存在，直接返回
    if (index != undefined) {
        return userPlayerList[index];
    }
    //如果index的player在主服务器上，直接返回
    if (tsuguUser.userPlayerList[userPlayerIndex].server == server) {
        return userPlayerList[userPlayerIndex];
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
