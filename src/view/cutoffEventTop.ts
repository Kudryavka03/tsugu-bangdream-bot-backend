import { Image, Canvas } from 'skia-canvas'
import { drawTitle } from "@/components/title";
import { serverNameFullList } from "@/config";
import { CutoffEventTop } from "@/types/CutoffEventTop";
import { Event } from '@/types/Event';
import { Server } from "@/types/Server";
import { drawEventDatablock } from '@/components/dataBlock/event';
import { drawDatablock } from '@/components/dataBlock';
import { outputFinalBuffer } from '@/image/output';
import { drawPlayerRankingInList } from '@/components/list/playerRanking';
import { drawCutoffEventTopChart } from '@/components/chart/cutoffChart';
import { songChartRouter } from '@/routers/songChart';
import { drawList, drawListMerge, drawListMergeMin, line } from '@/components/list';
import { drawDottedLine } from '@/image/dottedLine';
import { resizeImage } from '@/components/utils';
import { stackImage } from '@/components/utils';
import { logger } from '@/logger';
import { drawText } from '@/image/text';
import { drawTips } from '@/components/tips';
import { changeTimePeriodFormat, changeTimefomant, formatSeconds } from '@/components/list/time';

export async function drawCutoffEventTop(eventId: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull();
    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} 活动不存在或数据不足`];
    }
    var all = [];
    all.push(await drawTitle('档线', `${serverNameFullList[mainServer]} 10档线`));
    var list: Array<Image | Canvas> = [];
    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    // all.push(await drawEventDatablock(event, [mainServer]));
    var drawPlayerRankingInListPromise = []
    const drawCutoffEventTopChartPromise = drawCutoffEventTopChart(cutoffEventTop, false, mainServer).catch(err => {
        logger('drawCutoffEventTopChart error:', err);
        return null;
    });
    //前十名片
    var userInRankings = cutoffEventTop.getLatestRanking();
    for (let i = 0; i < userInRankings.length; i++) {
        var color = i % 2 == 0 ? 'white' : '#f1f1f1';
        var user = cutoffEventTop.getUserByUid(userInRankings[i].uid);
        //var playerRankingImage = await drawPlayerRankingInList(user, color, mainServer);
        drawPlayerRankingInListPromise.push(drawPlayerRankingInList(user, color, mainServer))

    }
    var drawPlayerRankingInListResult = await Promise.all(drawPlayerRankingInListPromise)
    for(var r of drawPlayerRankingInListResult){
        if (r != undefined) {
          list.push(r);
        }
    }

    list.push(new Canvas(800, 50))
    
    //折线图
    list.push(await drawCutoffEventTopChartPromise)

    var listImage = await drawDatablock({ list });
    all.push(await drawEventDatablockPromise)
    all.push(listImage);

    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })

    return [buffer];
}

export async function drawTopRateDetail(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    if (playerId == 114514 || playerId == 0 || tier == 0) return drawTopRateSpeedRank(eventId,playerId,tier,maxCount,mainServer,compress)
    // 因为没用上所以凭感觉优化了一下，不知道能不能用
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull(0);
    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} 活动不存在或数据不足`];
    }
    if (cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }

    var all = [];
    const widthMax = 1000, line: Canvas = drawDottedLine({
        width: widthMax,
        height: 30,
        startX: 5,
        startY: 15,
        endX: widthMax - 5,
        endY: 15,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })
    all.push(await drawTitle('查岗', `${serverNameFullList[mainServer]}`));
    {
        const list: Array<Image | Canvas> = [];
        // var event = new Event(eventId);
        // all.push(await drawEventDatablock(event, [mainServer]));
        //名片
        var userInRankings = cutoffEventTop.getLatestRanking();
        var drawPlayerRankingInListPromise1 = []
        for (let i = 0; i < userInRankings.length; i++) {
            if (playerId && userInRankings[i].uid != playerId || tier && tier != i + 1) {
                continue
            }
            playerId = userInRankings[i].uid
            var user = cutoffEventTop.getUserByUid(playerId);
            drawPlayerRankingInListPromise1.push(drawPlayerRankingInList(user, 'white', mainServer))
            /*
            var playerRankingImage = await drawPlayerRankingInList(user, 'white', mainServer);

            if (playerRankingImage != undefined) {
                list.push(resizeImage({ image: playerRankingImage, widthMax }));
            }
            */
        }
        var drawPlayerRankingInListResult1 = await Promise.all(drawPlayerRankingInListPromise1)
        for(var r of drawPlayerRankingInListResult1){
            if (r != undefined) {
              list.push(r);
            }
        }

        if (list.length > 0) {
            all.push(await drawDatablock({ list, maxWidth: widthMax }))
        }
        else 
            return [`玩家当前不在${serverNameFullList[mainServer]}: 活动${eventId}前十名里`]
    }
    const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId)
    //最近maxCount次分数变化
    {
        const list = [], imageList = []
        let count = 0
        if (!maxCount) {
            maxCount = 20
        }
        list.push(drawListMerge([await drawList({ key: '时间' }), await drawList({ key: '分数' }), await drawList({ key: '时间' }), await drawList({ key: '分数' })], widthMax))
        const halfLine: Canvas = drawDottedLine({
            width: widthMax / 2,
            height: 30,
            startX: 15,
            startY: 15,
            endX: widthMax / 2 - 15,
            endY: 15,
            radius: 2,
            gap: 10,
            color: "#a8a8a8"
        })
        for (let i = 0; i + 1 < playerRating.length; i += 1) {
            if (playerRating[i + 1].value == -1) {
                break
            }
            if (count == maxCount) {
                break
            }
            if (playerRating[i].value != playerRating[i + 1].value) {
                count += 1
                const mid = new Date((playerRating[i + 1].time + playerRating[i].time) / 2), score = playerRating[i].value - playerRating[i + 1].value
                imageList.push(drawListMerge([await drawList({ text: `${mid.toTimeString().slice(0, 5)}`}), await drawList({ text: `${score}`})], widthMax / 2))
                // list.push(line)
            }
        }
        if (count == 0) {
            list.push(await drawList( {text: '数据不足'} ))
        }
        else {
            imageList.reverse()
            const leftImage = [], rightImage = []
            for (let i = 0; i < count + 1 >> 1; i += 1) {
                leftImage.push(imageList[i])
                leftImage.push(halfLine)
            }
            leftImage.pop()
            for (let i = count + 1 >> 1; i < count; i += 1) {
                rightImage.push(imageList[i])
                rightImage.push(halfLine)
            }
            if (count % 2 == 0)
                rightImage.pop()
            list.push(drawListMerge([stackImage(leftImage), stackImage(rightImage)], widthMax))
        }
        all.push(await drawDatablock({ list, topLeftText: `最近${maxCount}次分数变化`}))
    }
    //近期统计数据
    const timeList = [1, 3, 12, 24]
    {
        const list = [], now = Date.now()
        list.push(drawListMerge([await drawList({ key: '时间' }), await drawList({ key: '分数变动次数' }), await drawList({ key: '平均时间间隔' }), await drawList({ key: '平均分数' })], widthMax))
        for (const a of timeList) {
            const begin = now - a * 60 * 60 * 1000
            const st = new Date(begin), ed = new Date(now)
            const timeImage = await drawList({ text: `${st.toTimeString().slice(0, 5)}~${ed.toTimeString().slice(0, 5)}`})
            const offset = Math.floor((now / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60) - Math.floor((begin / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60)
            // console.log(st.getTimezoneOffset())
            if (offset > 0) {
                const ctx = timeImage.getContext('2d')
                ctx.font = "18px old,Microsoft Yahei"
                ctx.fillText(`-${offset}`, 30, 13)
            }
            let flag = 0, count = 0, sumScore = 0, timestamps = []
            for (let i = 0; i + 1 < playerRating.length; i += 1) {
                if (playerRating[i + 1].value == -1) {
                    flag = 1
                    break
                }
                if (playerRating[i].value != playerRating[i + 1].value) {
                    timestamps.push(playerRating[i].time)
                    if (playerRating[i + 1].time < begin)
                        break
                    count += 1
                    sumScore += playerRating[i].value - playerRating[i + 1].value
                }
                if (playerRating[i + 1].time < begin)
                    break
            }
            if (flag) {
                list.push(drawListMerge([timeImage, await drawList({ text: '数据不足' })], widthMax))
            }
            else {
                const averageTime = getAverageTime(timestamps)
                list.push(drawListMerge([timeImage, await drawList({ text: `${count}` }), await drawList({ text: timestamps.length <= 1 ? '-' : `${(new Date(averageTime)).toTimeString().slice(3, 8)}` }), await drawList({ text: count == 0 ? '-' : `${Math.floor(sumScore / count)}` })], widthMax))
            }
            list.push(line)
        }
        list.pop()
        all.push(await drawDatablock({ list, topLeftText: `近期统计数据`}))
    }


    // list.push(new Canvas(800, 50))

    // //折线图
    // list.push(await drawCutoffEventTopChart(cutoffEventTop, false, mainServer))

    // var listImage = drawDatablock({ list });
    // all.push(listImage);

    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })

    return [buffer];
}

export async function drawTopRateSpeedRank(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    let count = 0
    if (!maxCount) {
        maxCount = 20
    }
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull(0);
    var userInRankings = cutoffEventTop.getLatestRanking(); // 前十当前排名，其中包含UID跟Point
    var rank = []   // 分数
    var rankBetween = []    // 前后两个分差
    var rankBetweenLastTick = [] //前后两个时刻分数变化
    var rankChangeCount = [] // 分数变动次数
    var avgRankChange = [] // 把均pt
    var rankForBetween = []
    var userName = []
    
    const now = new Date();

    var calcTimestamp = new Date(now);
    calcTimestamp.setMinutes(0);
    calcTimestamp.setSeconds(0);
    calcTimestamp.setMilliseconds(0);
    var thisHour = calcTimestamp.getTime();
    //console.log(thisHour)

    var LastHour = thisHour - 3600000;
    //console.log(LastHour)
    // thisHour是当前小时如16:37就返回16:00
    // LastHour是上一个小时，到时候就只要取这几个区间的就好
    //console.log(userInRankings)
    for (let i = 0; i < userInRankings.length; i++) {
        

        playerId = userInRankings[i].uid
        var user = cutoffEventTop.getUserByUid(playerId);
        userName.push(user.name)
        rank.push(userInRankings[i].point)  // 玩家当前时刻分数
        let countChange = 0
        let lastScore = 0
        let nowScore = 0
        var isFirst = true
        const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId) // 按照时间段排的分数，最高返回最近100次的变化分数，从最近到最远。
        //console.log( playerRating.length)
        for (let j = 0; j + 1 < playerRating.length; j += 1) {
            if (playerRating[j + 1].value == -1) {
                break
            }
            //console.log(playerRating[j].time)
            if (playerRating[j].time >thisHour) continue
            if (playerRating[j].time <LastHour) continue
            if(isFirst) {
                nowScore = playerRating[j].value
                isFirst = false
            }
            if (playerRating[j].value != playerRating[j + 1].value) {
                countChange ++
                lastScore = playerRating[j].value
            }
        }
        //rankBetweenLastTick.push()
        rankChangeCount.push(countChange)   // 分数变动次数

        if(lastScore >0 ){
            rankBetweenLastTick.push(nowScore - lastScore)// 与上一时刻相比相差了多少
        }else{
            rankBetweenLastTick.push(0)
        }
       // console.log((nowScore-lastScore) / countChange==0?1:countChange)
        avgRankChange.push(Math.round((nowScore-lastScore) / (countChange==0?1:countChange)))    // 把均Pt
        if (i == 0) {
            rankBetween.push(0)
        }
        else rankBetween.push(rank[i-1] - nowScore  )  // 与上一名的分数差距
    }


    for (let h = 0; h < rankBetweenLastTick.length; h++) {
        let rank = 1;
        for (let g = 0; g < rankBetweenLastTick.length; g++) {
            if (rankBetweenLastTick[g] > rankBetweenLastTick[h]) rank++;
        }
        rankForBetween.push(rank);
    }
    var all = [];
    all.push(await drawTitle('T10时速排名', `${serverNameFullList[mainServer]}表`));
    var list = [], imageList = []
    const widthMax = 200+300+420+250+250+400+300+300+200
    var timeTips = `统计时段：${changeTimefomant(LastHour)} - ${changeTimefomant(thisHour)}`
    
    list.push(drawListMergeMin([await drawList({ key: '排名' ,maxWidth:200}), await drawList({ key: 'UID',maxWidth:300 }), await drawList({ key: '昵称' ,maxWidth: 420}), await drawList({ key: '分数',maxWidth:250 })

    ,await drawList({ key: '分差',maxWidth:250 }),await drawList({ key: '1小时内分数变化',maxWidth:400 }),await drawList({ key: '速度排名',maxWidth:300 }),await drawList({ key: '分数变动次数',maxWidth:300 }),
    await drawList({ key: '把均PT' ,maxWidth:200})]))
    const FullLine: Canvas = drawDottedLine({
        width: widthMax,
        height: 30,
        startX: 15,
        startY: 15,
        endX: widthMax,
        endY: 15,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    })
    list.push(FullLine)
    for(let k = 0;k<10;k++){
        //console.log(`${k+1}   ${userInRankings[k].uid}   ${rank[k]}   ${rankBetween[k]}   ${rankBetweenLastTick[k]}   ${rankChangeCount[k]}   ${avgRankChange[k]}`)
        imageList.push(drawListMergeMin([
            await drawList({ key: `${k+1}`,maxWidth:200}),
            await drawList({ key: `${userInRankings[k].uid}`,maxWidth:300}),
            await drawList({ key: `${userName[k]}`,maxWidth:420}),
            await drawList({ key: `${rank[k]}`,maxWidth:250}),
            await drawList({ key: `${rankBetween[k]}`,maxWidth:250}),
            await drawList({ key: `${rankBetweenLastTick[k]}`,maxWidth:400}),
            await drawList({ key: `${rankForBetween[k]}`,maxWidth:300}),
            await drawList({ key: `${rankChangeCount[k]}`,maxWidth:300}),
            await drawList({ key: `${avgRankChange[k]}`,maxWidth:200}),
        ]))
        imageList.push(FullLine)
    }
    list.push(...imageList)
    all.push(await drawDatablock({ list}))
    all.push(await drawTips({text:timeTips}))
    //all.push(...list)
    all.push(await drawEventDatablockPromise)
    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })

    return [buffer];
}



export function getRatingByPlayer(points: Array<{
    time:number,
    uid:number,
    value:number
}>, playerId: number) {
    const map = {}
    for (const info of points) {
        if (map[info.time] == undefined)
            map[info.time] = -1
        if (info.uid == playerId)
            map[info.time] = info.value
    }
    const timestamp = Object.keys(map)
    return timestamp.sort((a, b) => parseInt(b) - parseInt(a)).map((t) => {
        return {
            time: parseInt(t),
            value: map[t]
        }
    })
}

export function getAverageTime(timestamps: Array<number>) {
    let res = 0
    for (let i = 0; i < timestamps.length >> 1; i += 1)
        res += timestamps[i]
    for (let i = timestamps.length + 1 >> 1; i < timestamps.length; i += 1)
        res -= timestamps[i]
    return res / (timestamps.length >> 1) / (timestamps.length + 1 >> 1)
}