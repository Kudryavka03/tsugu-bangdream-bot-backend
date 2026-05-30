// @ts-nocheck
import * as Room_1 from "../types/Room";
import * as getReplyFromBackend_1 from "../api/getReplyFromBackend";
import axios from "axios";
export async function commandRoomList(config, keyWord) {
    let tempRoomList = [];
    //如果从远程服务器获取
    if (config.RemoteDBSwitch) {	//config.RemoteDBSwitch
        const res = await axios.get(`${config.RemoteDBUrl}/station/queryAllRoom`);
        if (res.data.status == 'success') {
            tempRoomList = res.data.data;
        }
        else {
            return [`从远程服务器获取房间列表失败`];
        }
    }
    //如果从本地获取
    else {
        tempRoomList = await (0, Room_1.queryAllRoom)();
    }
    if (tempRoomList.length == 0) {
        return ['myc'];
    }
    let roomList = [];
    for (let i = 0; i < tempRoomList.length; i++) {
        const room = tempRoomList[i];
        if (keyWord != undefined) {
            if (!room.rawMessage.includes(keyWord)) {
                continue;
            }
        }
        roomList.push(room);
    }
    if (roomList.length == 0 && keyWord != undefined) {
        return [`没有找到包含 ${keyWord} 的房间`];
    }
    return await (0, getReplyFromBackend_1.getReplyFromBackend)(`${config.backendUrl}/roomList`, {
        roomList,
        compress: config.compress
    });
}
