// @ts-nocheck
import * as Room_1 from "../types/Room";
import * as fs from "fs";
import * as config_1 from "../config";
import axios from "axios";
function loadConfig() {
    const fileContent = fs.readFileSync(config_1.carKeywordPath, 'utf-8');
    return JSON.parse(fileContent);
}
const carKeywordConfig = loadConfig();
export async function roomNumber(config, session, user, number, raw_message) {
    if (!user.shareRoomNumber) {
        return;
    }
    let isCar = false;
    for (let i = 0; i < carKeywordConfig['car'].length; i++) {
        const element = carKeywordConfig['car'][i];
        if (raw_message.indexOf(element.toLowerCase()) != -1) {
            isCar = true;
        }
    }
    for (let i = 0; i < carKeywordConfig['fake'].length; i++) {
        const element = carKeywordConfig['fake'][i];
        if (raw_message.indexOf(element.toLowerCase()) != -1) {
            isCar = false;
        }
    }
    if (isCar) {
        if (config.RemoteDBSwitch) {
            const res = await axios.post(`${config.RemoteDBUrl}/station/submitRoomNumber`, {
                number: number,
                rawMessage: raw_message,
                platform: user.platform,
                userId: user.userId,
                userName: session.username,
                time: Date.now(),
                avatarUrl: session.event.user.avatar,
                bandoriStationToken: config.bandoriStationToken
            });
        }
        else {
            let userPlayerInList;
            try {
                userPlayerInList = (0, config_1.getUserPlayerByUser)(user);
            }
            catch (e) {
            }
            let platform = user.platform;
            await (0, Room_1.submitRoomNumber)({
                number: number,
                rawMessage: raw_message,
                source: platform,
                userId: user.userId,
                time: Date.now(),
                userName: session.username,
                bandoriStationToken: config.bandoriStationToken
            }, userPlayerInList);
        }
    }
}
