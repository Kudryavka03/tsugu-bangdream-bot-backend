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
import { TopRateSpeed } from '@/types/_Main';

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
    if (playerId == 1 || playerId == 0 || tier == 0) return drawTopRateSpeedRank(eventId,playerId,tier,maxCount,mainServer,compress)
    if (playerId == 3 ) return drawTopRateSleep(eventId,playerId,tier,maxCount,mainServer,compress)
    if (playerId == 4 ) return drawTopRateChanged(eventId,playerId,tier,maxCount,mainServer,compress)
    if (!maxCount) {
        maxCount = 20
    }
    if (maxCount >10000) return [`错误: 查岗次数过多，请适当缩减查岗的次数。次数过多会占用大量Bot硬件资源且图片可能会无法被正常送出。如需查T10时速表请回复查岗 0`];
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

export async function drawTopRateSpeedRank(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean,apiData?:object): Promise<Array<Buffer | string>> {

    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    if (cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }
    if (playerId < 1 ){    // 如果不等于114514就返回缓存。缓存每隔5分钟刷新一次
        if (TopRateSpeed) return TopRateSpeed   // 如果缓存不存在就走正常获取流程
    }
    let subTimeTips = (playerId==2)?'上个时段统计':'即刻统计'
    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    let pId = playerId

    //var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
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

    /*
    else {

        calcTimestamp.setMinutes(0);
        calcTimestamp.setSeconds(0);
        calcTimestamp.setMilliseconds(0);
    }
    */
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
          // 玩家当前时刻分数
          rank.push(userInRankings[i].point)
        let countChange = 0
        let lastScore = 0
        let nowScore = 0
        var isFirst = true
        const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId) // 按照时间段排的分数，最高返回最近100次的变化分数，从最近到最远。
        //console.log( playerRating.length)

        for (let j = 0; j  < playerRating.length; j += 1) {
            if (playerRating[j ].value == -1) {
                break
            }
            //console.log(playerRating[j].time)
            if (playerRating[j].time >thisHour) continue
            if (playerRating[j].time <LastHour) {
                lastScore = playerRating[j].value
                break
            }
            if(isFirst) {
                nowScore = playerRating[j].value
                //
                rank[i] = nowScore  // 玩家状态将会显示
                //rank.push(nowScore)
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
        avgRankChange.push(countChange==0?0:Math.round((nowScore-lastScore) / countChange))    // 把均Pt
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
    
    all.push(await drawTitle('T10时速排名', `${serverNameFullList[mainServer]} ${subTimeTips}`));
    var list = [], imageList = []
    const widthMax = 200+300+420+250+275+300+300+300+200
    var timeTips = `统计时段：${changeTimefomant(LastHour)} - ${changeTimefomant(thisHour)}`
    
    list.push(drawListMergeMin([await drawList({ key: '排名' ,maxWidth:200}), await drawList({ key: 'UID',maxWidth:300 }), await drawList({ key: '昵称' ,maxWidth: 420}), await drawList({ key: pId==2?'统计时分数':'分数',maxWidth:275 })

    ,await drawList({ key: '上下分差',maxWidth:250 }),await drawList({ key: '1小时内分差',maxWidth:300 }),await drawList({ key: '速度排名',maxWidth:300 }),await drawList({ key: '分数变动次数',maxWidth:300 }),
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
            await drawList({ key: `${rank[k]}`,maxWidth:275}),
            await drawList({ key: `${rankBetween[k]}`,maxWidth:250}),
            await drawList({ key: `${rankBetweenLastTick[k]}`,maxWidth:300}),
            await drawList({ key: `${rankForBetween[k]}`,maxWidth:300}),
            await drawList({ key: `${rankChangeCount[k]}`,maxWidth:300}),
            await drawList({ key: `${avgRankChange[k]}`,maxWidth:200}),
        ]))
        imageList.push(FullLine)
    }
    list.push(...imageList)
    all.push(await drawDatablock({ list}))
    all.push(await drawTips({text:timeTips,maxWidth:widthMax}))
    //all.push(...list)
    all.push(await drawEventDatablockPromise)
    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })

    return [buffer];
}

export async function drawTopRateSleep(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean,apiData?:object): Promise<Array<Buffer | string>> {
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    
    if (cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }
    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    await cutoffEventTop.initFull(0);
    var all = [];
    var breakTime = 1490000 // 如果间隔相差25min则认定为休息
    const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId) // 按照最近到最远排名
    // console.log(playerId)
    console.log(playerRating)
    var breakTimeSt = [];
    var breakTimeEd = [];
    var StIndex = playerRating.length-1;
    var tempScore =  playerRating[StIndex].value;
    var allCount = 0;
    if (playerRating.length <3) return ['数据唔够Bot统计喔']
    for (var i =playerRating.length-1;i>0;i--){
        if (playerRating[i].value != tempScore){  //如果分数不一样了,那就读取上一个一样的数据。因为是倒过来，所以i-1意味着比i时间要大的记录。
            if ((playerRating[i-1].time - playerRating[StIndex].time) > breakTime){   // 如果前后间隔大于设定的休息时间，这两段之间是休息的
                breakTimeSt.push(playerRating[StIndex].time)    //push开始的时间
                breakTimeEd.push(playerRating[i-1].time)    // push 不一样的上一个时间
                StIndex = i
                tempScore = playerRating[i].value
                allCount++
            }
            else{   // 如果不算是休息，则更新StIndex及tempScore方便下一次计算
                StIndex = i
                tempScore = playerRating[i].value
            }
        }
        else if(i == 1){    //一直处于暂停中
           // console.log(i)
            //console.log(playerRating[StIndex].time,playerRating[i-1].time)
            breakTimeSt.push(playerRating[StIndex].time)    //push开始的时间
            breakTimeEd.push(playerRating[i-1].time)    // push 不一样的上一个时间
            allCount++
        }

    }
    for(var j = 0;j<allCount;j++){
        console.log(`${breakTimeSt[j]} - ${breakTimeEd[j]} `)
    }
    return ['Check Console']
}

export async function drawTopRateChanged(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean,apiData?:object): Promise<Array<Buffer | string>> {
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    
    if (cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }
    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    await cutoffEventTop.initFull(0);
    var all = [];
    var breakTime = 1500000 // 如果间隔相差25min则认定为休息
    const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId) // 按照最近到最远排名
    var changeTimeSt = [];
    var changeTimeEd = [];
    var changeTimeTotalPts = [];    // 总Pts
    var changeTimeCounts = [];  // 把均Pt
    var allCount = 0
/*
1. PlayRating中途会有-1的存在，先将-1的处理完毕
2. 从高到低排Pt
3. 重复的要特殊标记
*/
    var fixPlayerRating = []
    var oldValue = 0;
    for(var i = playerRating.length-1;i>0;i--){   //从尾倒回头,[i-1]永远要比[i]分数高,反向读取进fixPlayerRating
        if (playerRating[i].value == -1) continue
        var isContinuousStatus = false
        if(playerRating[i].value == oldValue) continue
        if(playerRating[i].value == playerRating[i-1].value)  isContinuousStatus = true
        oldValue = playerRating[i].value
        fixPlayerRating.push({time:playerRating[i].time,value:playerRating[i].value,isContinuous:isContinuousStatus})
    }
    // 这样处理完毕后，fixPlayerRating中就不会存在相同的value，以及value为-1的参数
    // 接下来开始处理fixPlayerRating，此时fixPlayerRating已经是从低到高排序了
    var tempSt = 0
    var tempEt = 0
    var isProcessing = false// 判定当前是新段还是旧段处理中
    var totalCount = 0
    var totalPts = 0
    for(var i  = 1;i<fixPlayerRating.length;i++){
        if ((fixPlayerRating[i].time - fixPlayerRating[i-1].time >= breakTime) && isProcessing == false){  // 如果没处理，前后关系为休息状态
            continue
        }
        if (i == (fixPlayerRating.length-1)  && isProcessing == true){   // 如果是最后一个，且当前正在被处理
            totalCount++
            totalPts +=(fixPlayerRating[i].value - fixPlayerRating[i-1].value)
            tempEt = fixPlayerRating[i].time
            //console.log(tempEt)
            changeTimeSt.push(tempSt)
            changeTimeEd.push(tempEt)
            changeTimeCounts.push(totalCount)
            changeTimeTotalPts.push(totalPts)
            isProcessing = false    // 标记为不再处理的状态
            allCount++//标记已经完成push了
            continue

        }
        if ((fixPlayerRating[i+1].time - fixPlayerRating[i].time >= breakTime) && isProcessing == true){   // 如果在处理中的段被认定为休息了，记录并且另开新段
            totalCount++
            totalPts +=(fixPlayerRating[i].value - fixPlayerRating[i-1].value)
            //console.log(`认定休息：i: ${i}  ${fixPlayerRating[i].time}  ${fixPlayerRating[i-1].time}`)
            tempEt = fixPlayerRating[i].time
            //console.log(tempEt)
            changeTimeSt.push(tempSt)
            changeTimeEd.push(tempEt)
            changeTimeCounts.push(totalCount)
            changeTimeTotalPts.push(totalPts)
            isProcessing = false    // 标记为不再处理的状态
            totalCount = 0
            totalPts = 0
            allCount++//标记已经完成push了
            continue

        }

        if ((fixPlayerRating[i].time - fixPlayerRating[i-1].time < breakTime) && isProcessing == true){  // 如果当前处于处理中的段且跟上一个段相比
            //console.log(`处理中：${fixPlayerRating[i].time} ${fixPlayerRating[i-1].time} `)
            //tempEt = fixPlayerRating[i].time
            totalCount++
            totalPts +=(fixPlayerRating[i].value - fixPlayerRating[i-1].value)
            continue
        }

        if((fixPlayerRating[i].time - fixPlayerRating[i-1].time < breakTime) && isProcessing == false){ // 如果没处理，先后关系为连接关系，则(最先处理，比如第零个第一个)

            totalCount = 0
            totalPts = 0
            isProcessing = true
            tempSt = fixPlayerRating[i-1].time
            
            if ( i > 1 &&fixPlayerRating[i-2].isContinuous){    // 如果是连续的，那么还需要将连续的给加回来
                totalCount++
                totalPts += (fixPlayerRating[i-1].value - fixPlayerRating[i-2].value)
            }
            totalCount++
            totalPts += (fixPlayerRating[i].value - fixPlayerRating[i-1].value) // 以前面那个为基准，后面-前面
            //console.log(totalPts)
            continue
        }
    }
    for(var j = 0;j<allCount;j++){
        console.log(`${changeTimeSt[j]} - ${changeTimeEd[j]}  ${changeTimeCounts[j]}  ${changeTimeTotalPts[j]}`)
    }
    return ['Check Console']
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