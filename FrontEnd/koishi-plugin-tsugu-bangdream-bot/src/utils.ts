// @ts-nocheck
import * as config_1 from "./config";
import * as koishi_1 from "koishi";
// 将messageList转换为Array<Element | string>  用于session.send
export function paresMessageList(list) {
    if (!list) {
        return [];
    }
    let messageList = [];
    for (let i = 0; i < list.length; i++) {
        parseMessage(list[i]);
    }
    function parseMessage(message) {
        if (typeof message == 'string') {
            messageList.push(message);
        }
        else if (message instanceof Buffer) {
            messageList.push(koishi_1.h.image(message, 'image/png'));
        }
    }
    return messageList;
}
//将tierListOfServer转换为文字，server:tier,tier,tier
export function tierListOfServerToString() {
    let tierListString = '';
    for (var i in config_1.tierListOfServer) {
        tierListString += i + ' : ';
        for (var j in config_1.tierListOfServer[i]) {
            tierListString += config_1.tierListOfServer[i][j] + ', ';
        }
        tierListString += '\n';
    }
    return tierListString;
}
//判断左侧5个或者6个是否为数字
export function checkLeftDigits(str) {
    const regexSixDigits = /^(\d{6})/;
    const regexFiveDigits = /^(\d{5})/;
    const sixDigitsMatch = str.match(regexSixDigits);
    if (sixDigitsMatch) {
        return parseInt(sixDigitsMatch[1]);
    }
    const fiveDigitsMatch = str.match(regexFiveDigits);
    if (fiveDigitsMatch) {
        return parseInt(fiveDigitsMatch[1]);
    }
    return 0;
}
//将string Array 转化为 number Array，修复displayedServerList koishi数据库类型错误
export function stringArrayToNumberArray(strArray) {
    let numArray = [];
    for (let i = 0; i < strArray.length; i++) {
        numArray.push(parseInt(strArray[i]));
    }
    return numArray;
}
