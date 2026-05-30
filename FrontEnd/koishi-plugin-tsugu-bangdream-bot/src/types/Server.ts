// @ts-nocheck
import * as config_1 from "../config";
//服务器列表，因为有TW而不适用country
export const serverList = [0, 1, 2, 3, 4];
import * as config_2 from "../config";
export enum Server {
    jp = 0,
    en = 1,
    tw = 2,
    cn = 3,
    kr = 4,
}
export function getServerByName(name) {
    // 根据服务器名获取对应服务器
    let server;
    server = Server[name];
    if (server == undefined) {
        for (let i = 0; i < config_1.serverNameFullList.length; i++) {
            if (name == config_1.serverNameFullList[i]) {
                server = i;
                break;
            }
        }
    }
    return server;
}
export function getServerByPriority(content, displayedServerList = config_1.globalDefaultServer) {
    const serverPriority = [...new Set([...displayedServerList, ...config_2.globalServerPriority])];
    for (let i = 0; i < serverPriority.length; i++) {
        const tempServer = serverPriority[i];
        if (content[tempServer] != null) {
            return tempServer;
        }
    }
    return undefined;
}
export function isServer(server) {
    if (typeof server == 'number') {
        server = Server[server];
    }
    else {
        return false;
    }
    return Object.keys(Server).includes(server);
}
export function isServerList(serverList) {
    let result = true;
    for (let i = 0; i < serverList.length; i++) {
        const element = serverList[i];
        if (!isServer(element)) {
            result = false;
            break;
        }
    }
    return result;
}
