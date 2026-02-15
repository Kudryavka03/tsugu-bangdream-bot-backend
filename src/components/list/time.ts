import { globalDefaultServer } from '@/config';
import { getPresentEvent } from '@/types/Event';
import { Server, getServerByName } from '@/types/Server';
import { drawListByServerList } from '@/components/list'
import { Canvas } from 'skia-canvas'
import { Event } from '@/types/Event'
import mainAPI from '@/types/_Main';

interface timeInListOptions {
    key?: string;
    content: Array<number | null>;
    eventId?: number;
    estimateCNTime?: boolean;
}
export async function drawTimeInList({
    key,
    content,
    eventId,
    estimateCNTime = false
}: timeInListOptions, displayedServerList: Server[] = globalDefaultServer): Promise<Canvas> {
    var formatedTimeList: Array<string> = []
    for (let i = 0; i < content.length; i++) {
        const element = content[i];
        if (element == null) {
            if (i == 3 && estimateCNTime) {
                const currentEvent = getPresentEvent(getServerByName("cn"));
                const currentEventId = currentEvent.eventId;
                if (eventId > currentEventId) {
                    formatedTimeList.push(changeTimefomant(GetProbablyTimeDifference(eventId, currentEvent)) + " (预计开放时间)")
                }
            }
            formatedTimeList.push(null)
            continue
        }
        formatedTimeList.push(changeTimefomant(element))
    }
    var canvas = await drawListByServerList(formatedTimeList, key, displayedServerList)
    return canvas
}
//获取当前活动与查询活动的大致时间差(国服)
export function GetProbablyTimeDifference(eventId: number, currentEvent: Event): number {
    // 待查的活动
    const tempEvent = new Event(eventId)

    // 查询已经进行过的活动并加入偏移量
    const eventsData = mainAPI['events'];
    const eventsRecord: Record<number,Event> = {};
    eventsRecord[currentEvent.eventId] = currentEvent;
    const completedEvent =
        Object.keys(eventsData).map(Number).filter((theEventId) => {
            // 活动ID层过滤
            if(theEventId <= currentEvent.eventId || theEventId >= eventId) return false;
            const theEvent = new Event(theEventId);
            // 防止undefined
            if (!theEvent.startAt[Server.jp] || !tempEvent.startAt[Server.jp] || !currentEvent.startAt[Server.jp]) return false;
            // 活动时间层过滤
            if(theEvent.startAt[Server.jp] <= currentEvent.startAt[Server.jp]
              || theEvent.startAt[Server.jp] >= tempEvent.startAt[Server.jp]) return false;
            eventsRecord[theEventId] = theEvent;
            return !!(theEvent.startAt[Server.cn]);
        });

    // 已完成活动需要调整的时间偏移（为负数），包括活动时间和活动前的无邦日
    const finishOffset = completedEvent.reduce((acc, cur) => {
        const theEvent = eventsRecord[cur];
        const preEvent = eventsRecord[cur-1];
        return acc + (preEvent.endAt[Server.jp] - theEvent.endAt[Server.jp]);
    }, 0)

    // 当期时长偏移，使得当期更改活动时长后（如294）对未来活动时间的预测仍准确
    const eventLengthOffset = (
        occupiedDays(currentEvent.startAt[Server.cn], currentEvent.endAt[Server.cn])
        - occupiedDays(currentEvent.startAt[Server.jp], currentEvent.endAt[Server.jp])
    )*24*3600*1000;

    let sureEndEvent = 298  // 确定已经结束的Event，减少循环量
    let unHoldEventOffset = 0   // 计算相对于当前国服最新活动来说，未举办活动的offset
    let presentEvent = getPresentEvent(Server.cn).eventId   // 取得国服最新一期的活动

    // 假如最新一期是314

    // 假如国服314跟311调换顺序
    // 但由于312跟313已经举办过了，不应该计算进入offset
    // 首先列举出没有举办的活动的总日期
    console.log(eventId,presentEvent)
    if (eventId >= presentEvent){   // 如果预测的时间>= 国服最新一期的时间。如国服举办300，预测301
        for (var i = presentEvent;i> sureEndEvent;i--){
            var theEvent = new Event(i)
            if (!theEvent.endAt[Server.cn]){   // 如果theEvent没有举办，循环下去。下面已经处理完毕的了
                continue
            }
            // 往回寻找未举办的Event，将他们的offset加起来。
            // offset设置为日服当前的startAt+日服对应上一个活动的startAt，包含无邦日
            for (var j = i -1;j> sureEndEvent;j--){
                let curEvent = new Event(j)
                //let curPrvEvent = new Event(j-1)
                if (!curEvent.startAt[Server.cn]){   // 如果curEvent没有举办过
                    unHoldEventOffset += (occupiedDays(curEvent.startAt[Server.jp],theEvent.startAt[Server.jp])-1)*24*3600*1000  // 计算offset并加进去
                    console.log(curEvent.startAt[Server.jp],theEvent.startAt[Server.jp],occupiedDays(curEvent.startAt[Server.jp],theEvent.startAt[Server.jp]))
                    break   // 跳出当前循环
                }
                // 如果没有有效的数据，继续循环
            }
        }
    // 正常情况下，假如315跟311调换，310及之前已经举办了，那么举办314的时候就能发现311没有举办，然后会计算311占用时长，然后加进去
    }
    else {   // 如果预测的时间< 国服最新一期的时间。
        // 假如顺序298，301，299，300，303，302预测300（假如此时最新一期301）
        // 此时要预测300的时间
        // 可能 先检查对于自己而言小于自己的
        let curTime = Date.now()
        let presentEventJP = getPresentEvent(Server.jp).eventId   // 取得日服最新一期的活动
        // 找出非连续的Event
        let disContinuousEventId = 0
        for(var i = sureEndEvent;i<presentEventJP;i++){
            if (!new Event(i).startAt[Server.cn]){
                disContinuousEventId = i
                break
            }
        }   // 确定好非连续的EventID(299)后，此时如果要计算300的预测时间，从299开始，找到当前国服举办的未按顺序的最新活动
        let noBanGDaysOffsetPrv = 0
        if(presentEventJP != presentEvent){ // 如果日服最新的活动与国服不一样如312、313是一样的，那么presentEvent+1会报错
            noBanGDaysOffsetPrv =  (occupiedDays(new Event(presentEvent).endAt[Server.jp],new Event(presentEvent+1).startAt[Server.jp] )-1)*24*3600*1000   // 计算当前正在进行活动的相对于日服的无邦日 
        }
        else{   // 如果相同，则计算待预测活动相对于日服的无邦日
            noBanGDaysOffsetPrv = (occupiedDays( new Event(eventId-1).endAt[Server.jp],new Event(eventId).startAt[Server.jp])*24*3600*1000-1)   // 计算当前正在进行活动的相对于日服的无邦日 
        }
        // 假如顺序298，301，299，300，303，302预测300（假如此时最新一期301）
        // 循环就是298-301，查看299，300的情况
        // 298，301，300，299，302，303 当前300预测299 就是
        // 298-300 预测299  应该也能预测成功
        // 检查小于自己的活动是否有未举办的情形，加上
        for (var i = eventId-1;i> sureEndEvent;i--){
            let eventNow = new Event(i)
            if (!eventNow.startAt[Server.cn]){  // 如果当前待检测的活动未举办，吧当前的活动offset加上
                let eventPrev = new Event(i-1)
                unHoldEventOffset += ((occupiedDays(eventPrev.startAt[Server.jp] , eventNow.startAt[Server.jp])-1)*24*3600*1000)
            }
        }
        /*
        for(var i = eventId +1; i<= presentEvent; i++){   // 从现在计算+1活动，计算相对于正在进行活动的offset

        }
        */
            let eventTemp = new Event(presentEvent)
            if (eventTemp.startAt[Server.cn]){  // 如果当前待检测的活动已举办，吧当前的活动offset加上
                let eventTempNext = new Event(i+1)  // Next可能会存在下标问题
                unHoldEventOffset += ((occupiedDays(eventTemp.startAt[Server.jp] , eventTempNext.startAt[Server.jp])-1)*24*3600*1000)
            }
        unHoldEventOffset += ((occupiedDays(new Event(disContinuousEventId - 1).startAt[Server.jp] , new Event(disContinuousEventId).startAt[Server.jp])-1)*24*3600*1000)
        // 最后加上断联前的活动时长
        unHoldEventOffset += noBanGDaysOffsetPrv    // 吧之前的无邦日offset计算加上
    }
    console.log('unHoldEventOffset',unHoldEventOffset)
    const timeStamp = tempEvent.startAt[Server.jp] + (currentEvent.startAt[Server.cn] - currentEvent.startAt[Server.jp]) + finishOffset + eventLengthOffset + unHoldEventOffset;
    return timeStamp;
}
function occupiedDays(startTs: number, endTs: number): number {
    const start = new Date(startTs);
    const end = new Date(endTs);

    // 取年月日，忽略时分秒
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    const msPerDay = 1000 * 60 * 60 * 24;

    // 计算跨越的天数，再加1包含第一天
    return Math.floor((endDay.getTime() - startDay.getTime()) / msPerDay) + 1;
}
export function changeTimefomant(timeStamp: number | null) {//时间戳到年月日 精确到分钟
    if (timeStamp == null) {
        return '?'
    }
    var date = new Date(Math.floor(timeStamp / 1000) * 1000)
    var nMinutes: string
    var nHours: string
    if (date.getMinutes() < 10) {
        nMinutes = "0" + date.getMinutes().toString()
        if (date.getMinutes() == 0) { nMinutes = "00" }
    }
    

    else {
        nMinutes = date.getMinutes().toString()
    }
    if (date.getHours() < 10) {
        nHours = "0" + date.getHours().toString()
        if (date.getHours() == 0) { nHours = "00" }
    }
    else{
        nHours = date.getHours().toString()
    }
    var temp = date.getFullYear().toString() + "年" + (date.getMonth() + 1).toString() + "月" + date.getDate().toString() + "日 " + nHours + ":" + nMinutes
    return temp
}

export function changeTimefomantMonthDay(timeStamp: number | null) {//获取生日的月与日
    function toJapanTime(dateString) {
        // 创建一个新的Date实例，表示当前时间。
        let date = new Date(dateString);

        // 获取本地时间与UTC的时间差（分钟）。
        let offset = date.getTimezoneOffset() * 60000;

        // 将本地时间转换为UTC时间。
        let utcTime = date.getTime() + offset;

        // 日本时区的偏移量是UTC+9。
        let japanTimeOffset = 9 * 60 * 60 * 1000;

        // 将UTC时间转换为日本时间。
        let japanTime = new Date(utcTime + japanTimeOffset);

        // 返回日本时间的字符串表示。
        return japanTime;
    }

    if (timeStamp == null) {
        return '?'
    }
    var date = toJapanTime(timeStamp)
    var nMinutes: string
    if (date.getMinutes() < 10) {
        nMinutes = "0" + date.getMinutes().toString()
        if (date.getMinutes() == 0) { nMinutes = "00" }
    }
    else {
        nMinutes = date.getMinutes().toString()
    }
    var temp = (date.getMonth() + 1).toString() + "月" + date.getDate().toString() + "日 "
    return temp
}

export function changeTimePeriodFormat(period: number,showSecond = true): string {//时间戳的差值到年月日时分秒
    if (period == null) {
        return '?'
    }

    var centery = Math.floor(period / (1000 * 60 * 60 * 24 * 30 * 12 * 100));
    var years = Math.floor(period / (1000 * 60 * 60 * 24 * 30 * 12));
    var months = Math.floor(period / (1000 * 60 * 60 * 24 * 30));
    var days = Math.floor((period % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
    var hours = Math.floor((period % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    var minutes = Math.floor((period % (1000 * 60 * 60)) / (1000 * 60));
    var seconds = Math.floor((period % (1000 * 60)) / 1000);

    var temp = "";

    if (centery != 0) {
        temp += centery.toString() + "世纪";
    }
    if (years != 0) {
        temp += years.toString() + "年";
    }
    if (months != 0) {
        temp += months.toString() + "月";
    }
    if (days != 0) {
        temp += days.toString() + "日";
    }
    if (hours != 0) {
        temp += hours.toString() + "小时";
    }
    if (minutes != 0) {
        temp += minutes.toString() + "分钟";
    }
    if(showSecond){
        temp += seconds.toString() + "秒";
    }

    return temp;
}

//时间长度转时分秒函数
export function formatSeconds(value: number) {
    var theTime = value;// 秒
    var theTime1 = 0;// 分
    var theTime2 = 0;// 小时
    if (theTime > 60) {
        theTime1 = parseInt((theTime / 60).toString());
        theTime = parseInt((theTime % 60).toString());
        if (theTime1 > 60) {
            theTime2 = parseInt((theTime1 / 60).toString());
            theTime1 = parseInt((theTime1 % 60).toString());
        }
    }
    var result = "" + parseInt(theTime.toString()) + "秒";
    if (theTime1 > 0) {
        result = "" + parseInt(theTime1.toString()) + "分" + result;
    }
    if (theTime2 > 0) {
        result = "" + parseInt(theTime2.toString()) + "小时" + result;
    }
    return result;
}