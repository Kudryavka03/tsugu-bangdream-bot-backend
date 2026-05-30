// @ts-nocheck
import axios_1 from "axios";
import * as koishi_1 from "koishi";
export const remoteDBLogger = new koishi_1.Logger('tsugu-remoteDB');
const statusCodeList = [200, 409, 422];
function parseError(e) {
    //如果404，且报错原因为user api is not available，则说明是本地数据库未开启
    if (e.response?.status == 404 && e.response?.data?.data == '错误: 服务器未启用数据库') {
        return {
            status: 'fail',
            data: '错误: 远程服务器未启用数据库'
        };
    }
    remoteDBLogger.error(e.response);
    return {
        status: 'fail',
        data: e.response?.data?.data || '错误: 远程服务器未知错误\n或无法连接至服务器'
    };
}
export async function getRemoteDBUserData(RemoteDBUrl, platform, userId) {
    try {
        const postPath = '/user/getUserData';
        const postData = { platform, userId };
        remoteDBLogger.info(`${RemoteDBUrl}${postPath}`, postData);
        const result = await axios_1.post(`${RemoteDBUrl}${postPath}`, postData);
        if (!statusCodeList.includes(result.status)) {
            throw new Error();
        }
        return result.data;
    }
    catch (e) {
        return parseError(e);
    }
}
export async function changeUserData(RemoteDBUrl, platform, userId, update) {
    try {
        const postPath = '/user/changeUserData';
        const postData = { platform, userId, update };
        remoteDBLogger.info(`${RemoteDBUrl}${postPath}`, postData);
        const result = await axios_1.post(`${RemoteDBUrl}${postPath}`, postData);
        if (!statusCodeList.includes(result.status)) {
            throw new Error();
        }
        return result.data;
    }
    catch (e) {
        return parseError(e);
    }
}
export async function bindPlayerRequest(RemoteDBUrl, platform, userId) {
    try {
        const postPath = '/user/bindPlayerRequest';
        const postData = { platform, userId };
        remoteDBLogger.info(`${RemoteDBUrl}${postPath}`, postData);
        const result = await axios_1.post(`${RemoteDBUrl}${postPath}`, postData);
        if (!statusCodeList.includes(result.status)) {
            throw new Error();
        }
        return result.data;
    }
    catch (e) {
        return parseError(e);
    }
}
export async function bindPlayerVerify(RemoteDBUrl, platform, userId, server, playerId, bindingAction) {
    try {
        const postPath = '/user/bindPlayerVerification';
        const postData = { platform, userId, server, playerId, bindingAction };
        remoteDBLogger.info(`${RemoteDBUrl}${postPath}`, postData);
        const result = await axios_1.post(`${RemoteDBUrl}${postPath}`, postData);
        if (!statusCodeList.includes(result.status)) {
            throw new Error();
        }
        return result.data;
    }
    catch (e) {
        return parseError(e);
    }
}
