import { Event } from '@/types/Event';
import { drawList, line, drawListMerge } from '@/components/list';
import { drawDatablock } from '@/components/dataBlock'
import { Image, Canvas } from 'skia-canvas'
import { changeTimePeriodFormat, changeTimefomant } from '@/components/list/time';
import { Server } from '@/types/Server';
import { drawTitle } from '@/components/title'
import { outputFinalBuffer } from '@/image/output'
import { Cutoff } from "@/types/Cutoff";
import { drawCutoffChart } from '@/components/chart/cutoffChart'
import { assetsRootPath, serverNameFullList } from '@/config';
import { drawEventDatablock } from '@/components/dataBlock/event';
import { statusName } from '@/config';
import { drawTips } from '@/components/tips';
import path from 'path';
import { logger } from '@/logger';
import mainAPI from '@/types/_Main';
import { drawCutoffHistoryChart } from '@/components/chart/cutoffHistoryChart';
import { CutoffEventTop } from '@/types/CutoffEventTop';
import { Band } from '@/types/Band';
import { now } from 'moment';
import { start } from 'repl';

export async function drawCutoffDetail(eventId: number, tier: number, mainServer: Server, compress: boolean,eventId2?:number): Promise<Array<Buffer | string>> {
    //if (!mainAPI['events'][`${eventId}`]['endAt'][mainServer]) return [`错误: ${serverNameFullList[mainServer]} 活动不存在或未举办`]
    var cutoff = new Cutoff(eventId, mainServer, tier)
    var cutoffGroup = []
    if (cutoff.isExist == false) {
        return [`错误: ${serverNameFullList[mainServer]} 活动或档线不存在`]
    }
    cutoffGroup.push(cutoff.initFull())
    // 获取T10分数
    var event = new Event(eventId)
    var cutoffT10AvgScoreWorkGroup = []
    var cutoffT10Record = new Map<number,number>()
    // 检查当前活动是否已经开始
    const nowTime = new Date().getTime()
    const isEndEvent = (nowTime - event.endAt[mainServer] > 0)    // true为已举办
    if (isEndEvent) cutoffGroup.push(getTop10AvgScore(event,mainServer,cutoffT10Record))


    const drawPromise = await drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    await Promise.all(cutoffGroup);
    if (!cutoff.cutoffs) return [`错误: ${serverNameFullList[mainServer]} 活动或档线不存在`]
    //const [_, drawResult] = await Promise.all([initPromise, drawPromise]);
    //await cutoff.initFull()
    /*
    if (cutoff.isExist == false) {
        return '错误: 活动或档线数据错误'
    }
    */
    var all = []
    all.push(await drawTitle(`预测线`, `${serverNameFullList[mainServer]} ${cutoff.tier}档线`))
    var list: Array<Image | Canvas> = []
    //状态
    var time = new Date().getTime()
   
    //如果活动在进行中    
    if (cutoff.status == 'in_progress') {
        
        cutoff.predict()
        cutoff.predict2()
        if (cutoff.predictEP == null || cutoff.predictEP == 0) {
            var predictText = '?'
            var predictText2 = '数据不足'
        }
        else {
            var predictText = cutoff.predictEP.toString()
            var predictText2 = cutoff.predictEP2.toString()
            if(cutoff.latestCutoff.ep.toString() == predictText2) predictText2='不预测或暂无数据'
        }

        //预测线和时速
        const cutoffs = cutoff.cutoffs
        const lastep = cutoffs.length > 1 ? cutoffs[cutoffs.length - 2].ep : 0
        const timeSpan = (cutoffs.length > 1 ? cutoff.latestCutoff.time - cutoffs[cutoffs.length - 2].time : cutoff.latestCutoff.time - cutoff.startAt) / (1000 * 3600)
        list.push(drawListMerge([
            await drawList({
                key: '预测线1',
                text: predictText
            }),
            await drawList({
                key: '线性外推',
                text: (cutoffs[cutoffs.length - 1])?Math.round(((cutoff.latestCutoff.ep - lastep) / timeSpan) * ((cutoff.endAt - cutoffs[cutoffs.length - 1].time) / 3600000) + cutoffs[cutoffs.length - 1].ep).toString():'无数据'
            }),
            await drawList({
                key: '预测线2',
                text: predictText2
            }),
        ]))
        list.push(line)


        const tempImageList = []
        //最新分数线
        const finalCutoffImage = await drawList({
            key: '最新分数线',
            text: cutoff.latestCutoff.ep.toString()
        })
        tempImageList.push(finalCutoffImage)
        tempImageList.push(await drawList({
            key: '数据来源',
            text: `${cutoff.useHHWX?"HHWX":"Bestdori"}`
        }))
        tempImageList.push(await drawList({
            key: '当前时速',
            text: `${Math.round((cutoff.latestCutoff.ep - lastep) / timeSpan)} pt/h`
        }))


        list.push(drawListMerge(tempImageList)) //合并两个list
        list.push(line)
        const tempTimeList = []
        //活动剩余时间
        tempTimeList.push(await drawList({
            key: '活动剩余时间',
            text: `${changeTimePeriodFormat(cutoff.endAt - time,false)}`
        }))
        tempTimeList.push(await drawList({
            key: '更新时间',
            text: `${changeTimePeriodFormat((new Date().getTime()) - cutoff.latestCutoff.time)}前`
        }))
        list.push(drawListMerge(tempTimeList))
        list.push(line)
        const tempList = []
        tempList.push((await drawList({
            key: `日增速 / ${changeTimefomant(cutoff.latestCutoff.time,cutoff.server)}  Day${cutoff.getDaysOfEvent(cutoff.latestCutoff.time)+1}  完成率${Math.round((cutoff.latestCutoff.time - cutoff.startAt)/(cutoff.endAt - cutoff.startAt)*100)}%`,
            text: `${cutoff.dailyIncrement.length == 0?0:cutoff.dailyIncrement.join('/')}`
        })))
        list.push(drawListMerge(tempList))

        let yesterdayIncrementRate = cutoff.getYesterdayIncrementRate()
        let highestIncrementRate = cutoff.getYesterdayIncrementRate(-1)
        if (yesterdayIncrementRate){
            list.push(await drawList({
                key: `${yesterdayIncrementRate}`,
                //color:'#005737',
                RoundedRectColor:yesterdayIncrementRate.includes('↑')?'#dc3545':'#59B748'
            }))
        }
        if (highestIncrementRate && yesterdayIncrementRate!= highestIncrementRate){
            list.push(await drawList({
                key: `${highestIncrementRate}`,
                RoundedRectColor:highestIncrementRate.includes('↑')?'#dc3545':'#59B748'
            }))
        }
        list.push(line)
    }
    else if (cutoff.status == 'ended') {
        list.push(await drawList({
            key: '状态',
            text: statusName[cutoff.status]
        }))
        list.push(line)

        //最新分数线
        const Line2List = []
        Line2List.push(await drawList({
            key: '最终分数线',
            text: cutoff.latestCutoff.ep.toString()
        }))
        Line2List.push(await drawList({
            key: '当期顶配',
            text: Math.round(cutoffT10Record.get(cutoff.eventId)).toString()
        }))
        if (mainAPI['events'][event.eventId.toString()]['totalPlayerDataCN']) Line2List.push(await drawList({
            key: '总参与人数',
            text:  `${mainAPI['events'][event.eventId.toString()]['totalPlayerDataCN']}`
        }))
        list.push(drawListMerge(Line2List))
        list.push(line)
        const tempList = []
        //console.log(cutoff.dailyIncrement)
        tempList.push((await drawList({
            key: '日增速',
            text: `${cutoff.dailyIncrement.join('/')}`
        })))
        list.push(drawListMerge(tempList))
        list.push(line)

    }
    list.pop()
    list.push(new Canvas(800, 50))

    //折线图
    list.push(await drawCutoffChart([cutoff]))
    //创建最终输出数组
    var listImage = await drawDatablock({ list })
    all.push(drawPromise)
    all.push(listImage)
    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress: compress,
    })
    return [buffer];
}

export async function drawCutoffDetailWithCompare(eventId: number, tier: number, mainServer: Server, compress: boolean,eventId2?:string): Promise<Array<Buffer | string>> {
    // TODO: eventId2改为字符串，这样可以多个ycx一起对比。
    //eventId2 = 277
    if (eventId2 == eventId.toString()) return ['同档线。']
    //eventId2 = '  305t1000 308 292 292 308   308t500'
    //if (!mainAPI['events'][`${eventId}`]['endAt'][mainServer]) return [`错误: ${serverNameFullList[mainServer]} 活动不存在或未举办`]
    let compareEventList:number[] = [eventId]
    let compareEventTierList:number[] = [tier]
    //let compareEventScoreAvg:number[] = []
    let compareEventRateOfFirstEvent:number[] = [1]
    let compareEventObject = new Map<number,Event>()
    let compareIfHaveSame:string[] = []
    if (!isNaN(Number(eventId2))){
        compareEventList.push(Number(eventId2))
        compareEventTierList.push(tier)
    }else{
        // '301t200 302t300 303 304'
        let tierList = eventId2.split(' ')
        let tierNumber = tier
        for(let t of tierList){
            let tier = tierNumber
            let eventId = 0
            if (t.includes('t')){
                let detail = t.split('t')
                if (detail.length == 2){
                    let tierCheck = Number(detail[1])
                    let eventIdCheck = Number(detail[0])
                    if (!isNaN(tierCheck)) tier = tierCheck
                    if (!isNaN(eventIdCheck)) eventId = eventIdCheck
                    console.log(tier,eventIdCheck)
                }
                else{
                    return [`待对比的活动：${t} 输入有误。如需对比同一档线的多个tier，请用诸如ycx100 -c 300t100 300t500之类的参数来对比`]
                }
            }
            else{
                let eventIdCheck = Number(t)
                if (!isNaN(eventIdCheck)){
                    eventId = eventIdCheck
                }else{
                    return [`待对比的活动：${t} 输入有误。如需对比同一档线的多个tier，请用诸如ycx100 -c 300t100 300t500 301之类的参数来对比`]
                }
            }
            if (eventId ==0) continue
            if (compareIfHaveSame.includes(`${eventId}/${tier}`)) continue
            compareIfHaveSame.push(`${eventId}/${tier}`)
            compareEventTierList.push(tier)
            compareEventList.push(eventId)
        }
    }
    //console.log(compareEventList)
    //console.log(compareEventTierList)
    if (compareEventList.length!= compareEventTierList.length) return ['内部错误']
    if (compareEventList.length>5) return ['对比档线太多，请适当减少一些档线吧。']
    for(let e of compareEventList){
        compareEventObject.set(e,new Event(e))
    }
    let cutoffGroupResult:Cutoff[] = [] // 存放Cutoff Object
    for(let i = 0;i<compareEventList.length;i++){
        cutoffGroupResult.push(new Cutoff(compareEventList[i],mainServer,compareEventTierList[i]))
    }
    var cutoff = cutoffGroupResult[0]

    var cutoffWorkGroup = []
    for(let c of cutoffGroupResult){
        cutoffWorkGroup.push(c.initFull())
    }
    var cutoffT10AvgScoreWorkGroup = []
    var cutoffT10Record = new Map<number,number>()
    let dupRecordEvent = new Set<number>()
    for(let t = 0;t<compareEventList.length;t++){
        if (!dupRecordEvent.has(compareEventList[t])){
            cutoffT10AvgScoreWorkGroup.push(getTop10AvgScore(compareEventObject.get(compareEventList[t]),mainServer,cutoffT10Record))
            dupRecordEvent.add(compareEventList[t])
        }
    }
    const [_, compareEventScoreAvg] = await Promise.all([
        Promise.all(cutoffWorkGroup),
        Promise.all(cutoffT10AvgScoreWorkGroup)
    ])
    //console.log(compareEventScoreAvg)
    for (let c of cutoffGroupResult){
        if (c.isExist == false){
            return [`错误: ${serverNameFullList[mainServer]} ${c.eventId}T${c.tier} 不存在`]
        }
    }
    // 开始计算比例
    let baseScore = cutoffT10Record.get(eventId)
    for(let i = 1;i<compareEventList.length;i++){
        if (cutoffT10Record.get(compareEventList[i])>0){
            compareEventRateOfFirstEvent.push(baseScore / cutoffT10Record.get(compareEventList[i]))
        }
        else{
            compareEventRateOfFirstEvent.push(1)
        }
    }
    //console.log(compareEventRateOfFirstEvent)
    for (let i =1;i<compareEventList.length;i++){
        cutoffGroupResult[i].changeScoreRateForCompare(compareEventRateOfFirstEvent[i])
    }
    
    var event = compareEventObject.get(eventId)
    const drawPromise = await drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });


    if (!cutoff.cutoffs) return [`错误: ${serverNameFullList[mainServer]} 活动或档线不存在`]

    var all = []
    all.push(await drawTitle(`预测线`, `${serverNameFullList[mainServer]} ${cutoff.tier}档线`))
    var list: Array<Image | Canvas> = []

    //状态
    var time = new Date().getTime()

    //如果活动在进行中    
    if (cutoff.status == 'in_progress') {
        cutoff.predict()
        cutoff.predict2()
        if (cutoff.predictEP == null || cutoff.predictEP == 0) {
            var predictText = '?'
            var predictText2 = '数据不足'
        }
        else {
            var predictText = cutoff.predictEP.toString()
            var predictText2 = cutoff.predictEP2.toString()
            if(cutoff.latestCutoff.ep.toString() == predictText2) predictText2='不预测或暂无数据'
        }

        //预测线和时速
        const cutoffs = cutoff.cutoffs
        const lastep = cutoffs.length > 1 ? cutoffs[cutoffs.length - 2].ep : 0
        const timeSpan = (cutoffs.length > 1 ? cutoff.latestCutoff.time - cutoffs[cutoffs.length - 2].time : cutoff.latestCutoff.time - cutoff.startAt) / (1000 * 3600)
        list.push(drawListMerge([
            await drawList({
                key: '预测线1',
                text: predictText
            }),
            await drawList({
                key: '线性外推',
                text: (cutoffs[cutoffs.length - 1])?Math.round(((cutoff.latestCutoff.ep - lastep) / timeSpan) * ((cutoff.endAt - cutoffs[cutoffs.length - 1].time) / 3600000) + cutoffs[cutoffs.length - 1].ep).toString():'无数据'
            }),
            await drawList({
                key: '预测线2',
                text: predictText2
            }),
        ]))
        list.push(line)

        const tempImageList = []
        //最新分数线
        const finalCutoffImage = await drawList({
            key: '最新分数线',
            text: cutoff.latestCutoff.ep.toString()
        })
        tempImageList.push(finalCutoffImage)
        tempImageList.push(await drawList({
            key: '数据来源',
            text: `${cutoff.useHHWX?"HHWX":"Bestdori"}`
        }))
        tempImageList.push(await drawList({
            key: '当前时速',
            text: `${Math.round((cutoff.latestCutoff.ep - lastep) / timeSpan)} pt/h`
        }))

        list.push(drawListMerge(tempImageList)) //合并两个list
        list.push(line)
        const tempTimeList = []
        //活动剩余时间
        tempTimeList.push(await drawList({
            key: '活动剩余时间',
            text: `${changeTimePeriodFormat(cutoff.endAt - time,false)}`
        }))
        tempTimeList.push(await drawList({
            key: '更新时间',
            text: `${changeTimePeriodFormat((new Date().getTime()) - cutoff.latestCutoff.time)}前`
        }))
        list.push(drawListMerge(tempTimeList))
        list.push(line)
        const tempList = []
        tempList.push((await drawList({
            key: `日增速 / ${changeTimefomant(cutoff.latestCutoff.time,cutoff.server)}  Day${cutoff.getDaysOfEvent(cutoff.latestCutoff.time)+1}  完成率${Math.round((cutoff.latestCutoff.time - cutoff.startAt)/(cutoff.endAt - cutoff.startAt)*100)}%`,
            text: `${cutoff.dailyIncrement.length == 0?0:cutoff.dailyIncrement.join('/')}`
        })))
        list.push(drawListMerge(tempList))

        let yesterdayIncrementRate = cutoff.getYesterdayIncrementRate()
        let highestIncrementRate = cutoff.getYesterdayIncrementRate(-1)
        if (yesterdayIncrementRate){
            list.push(await drawList({
                key: `${yesterdayIncrementRate}`,
                //color:'#005737',
                RoundedRectColor:yesterdayIncrementRate.includes('↑')?'#dc3545':'#59B748'
            }))
        }
        if (highestIncrementRate && yesterdayIncrementRate!= highestIncrementRate){
            list.push(await drawList({
                key: `${highestIncrementRate}`,
                RoundedRectColor:highestIncrementRate.includes('↑')?'#dc3545':'#59B748'
            }))
        }
        list.push(line)
    }
    else if (cutoff.status == 'ended') {
        list.push(await drawList({
            key: '状态',
            text: statusName[cutoff.status]
        }))
        list.push(line)

        //最新分数线
        const Line2List = []
        Line2List.push(await drawList({
            key: '最终分数线',
            text: cutoff.latestCutoff.ep.toString()
        }))
        if (mainAPI['events'][event.eventId.toString()]['totalPlayerDataCN']) Line2List.push(await drawList({
            key: '国服探底',
            text:  `${mainAPI['events'][event.eventId.toString()]['totalPlayerDataCN']}`
        }))
        Line2List.push(await drawList({
            key: '顶配',
            text: `${Math.round(compareEventScoreAvg[0])}`
        }))
        list.push(drawListMerge(Line2List))
        list.push(line)
        const tempList = []
        //console.log(cutoff.dailyIncrement)
        tempList.push((await drawList({
            key: '日增速',
            text: `${cutoff.dailyIncrement.join('/')}`
        })))
        list.push(drawListMerge(tempList))
        list.push(line)

    }
    list.pop()
    list.push(new Canvas(800, 50))

    //折线图
    list.push(await drawCutoffChart(cutoffGroupResult, true, mainServer,true))
    for(let i = 1;i<compareEventList.length;i++){
        let subEvent = compareEventObject.get(compareEventList[i])
        let eventIdStr = compareEventList[i].toString()
        try{
            var bandName = new Band(subEvent.bandId[0]).bandName[0]
        }
        catch{
            var bandName = '混活'
        }
        
        list.push(line)
        list.push((await drawList({
            key: `对比档线：${compareEventList[i]} T${compareEventTierList[i]}  顶配 ${Math.round(cutoffT10Record.get(subEvent.eventId))}  ${subEvent.getTypeName()}`,
            text:`活动名称：${subEvent.eventName[mainServer]?subEvent.eventName[mainServer]:subEvent.eventName[0]}\n活动乐队：${bandName}`
        })))
        list.push(line)
        const Line2List = []
        Line2List.push(await drawList({
            key: '最终分数线',
            text: (cutoffGroupResult[i].latestCutoff.ep).toString()
        }))
        if (mainAPI['events'][eventIdStr]['totalPlayerDataCN']) Line2List.push(await drawList({
            key: '国服探底',
            text:  `${mainAPI['events'][eventIdStr]['totalPlayerDataCN']}`
        }))
        Line2List.push(await drawList({
            key: '补偿倍率',
            text: `${Math.round(compareEventRateOfFirstEvent[i]*100)/100}`
        }))
        list.push(drawListMerge(Line2List))
        list.push(line)
        if(cutoff.status == 'in_progress'){     // 如果主ycx为正在进行状态
            let precent = (cutoff.latestCutoff.time - cutoff.startAt)/(cutoff.endAt - cutoff.startAt)
            let tpEP:TimePresentEP = getTimePresentEP(cutoffGroupResult[i],precent,compareEventRateOfFirstEvent[i],cutoff)
            if (tpEP.value!=0){
                list.push(await drawList({
                    key: '同一时刻对比',
                    text: `原始：${tpEP.value} / 补偿后: ${tpEP.valueWithRatio}\n取样时间：${changeTimefomant(tpEP.time,mainServer)}`
                }))
                list.push(line)
            }

        }

        const tempList = []
        //console.log(cutoff2.dailyIncrement)
        tempList.push((await drawList({
            key: '日增速',
            text: `${cutoffGroupResult[i].dailyIncrement.join('/')}`
        })))
        list.push(drawListMerge(tempList))
    }

    //创建最终输出数组
    var listImage = await drawDatablock({ list })
    all.push(drawPromise)
    all.push(listImage)

    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress: compress,
    })

    return [buffer];

}

export async function getTop10AvgScore(event:Event,mainServer:Server,record:Map<number,number>,tempCutoffs?:CutoffEventTop):Promise<number>{
    if (event && event.eventType=='challenge') return 0
    const t10Cutoff = tempCutoffs?tempCutoffs:new CutoffEventTop(event.eventId, mainServer)
    await t10Cutoff.initFull(0)
    var userInRankings = t10Cutoff.getLatestRanking();
    if (userInRankings.length<10){
        if (record)record.set(event.eventId,0)
        return 0
    }
    let playerId = userInRankings[0].uid
    
    let scorePoint = []
    let scoreChange:number[]  = []
    for(let d of t10Cutoff.points){
        if (d.uid == playerId){
            if ( scorePoint.length==0 ||  d.value != scorePoint[scorePoint.length-1][1]) scorePoint.push([d.time,d.value])
        }
    }
    let leftIndex =  Math.round(scorePoint.length * 0.3)
    let rightIndex = Math.round(scorePoint.length * 0.7)
    if (rightIndex - leftIndex < 4){
        if (record)record.set(event.eventId,0)
        return 0
    }
    for(let i = leftIndex;i<rightIndex;i++){ // 避免异常数据
        if (scorePoint[i+1][0] - scorePoint[i][0] < 7*60*1000)    // 简单防炸
        scoreChange.push(scorePoint[i+1][1]-scorePoint[i][1])
    }
    let avgScore:number = 0
    for(let a of scoreChange){
        // console.log(a)
        avgScore+=a
    }
    if (scoreChange.length == 0) return 0
    const result:number = avgScore/ scoreChange.length
    if (record)record.set(event.eventId,result)
    return result
}

export interface TimePresentEP {
    value: number;
    valueWithRatio: number;
    time: number;
}
// 取得特定百分比时候的EP
export function getTimePresentEP(cutoff:Cutoff,present:number,ratio:number,cutoff2:Cutoff){    // 接受cutoff数据，百分比，比值
    console.log(present)
      let debugflags = false
    if (!cutoff || cutoff.cutoffs.length < 1){
        return {value:0,valueWithRatio:0,time:cutoff.endAt} as TimePresentEP
    }
    if (!cutoff2 || cutoff2.cutoffs.length < 1){
        return {value:0,valueWithRatio:0,time:cutoff.endAt} as TimePresentEP
    }
    let startTime = cutoff.startAt
    // 修正startTime，对齐主预测先
    let mainCutoffHours = new Date(cutoff2.startAt).getHours()
    startTime = new Date(startTime).setHours(mainCutoffHours)
    let endTime = cutoff.endAt
    mainCutoffHours = new Date(cutoff2.endAt).getHours()
    if (new Date(endTime).getHours()!= mainCutoffHours){
        if (debugflags) console.log('debug',new Date(endTime).getHours())
        endTime = new Date(endTime).setHours(mainCutoffHours)
    if (debugflags) console.log('debug',new Date(endTime).getHours())
    }
    let length = endTime - startTime
    console.log('cutoff1 length',length)
    console.log('cutoff2 length',cutoff2.endAt - cutoff2.startAt)
    let targetLength = startTime + length * present
    // 寻找最符合目标的时间
    let data = cutoff.cutoffs
    let index = Math.round((cutoff.cutoffs.length)/2)
    let index1 = 0
    let findLeft = true // 是否往左找
    let stopFlags = false
  
    while (!stopFlags){
        if(debugflags)console.log('index:',index,'index1',index1)
        if (index > data.length-1){
            return {value:data[data.length-1].ep,valueWithRatio:Math.round(data[data.length-1].ep * ratio),time:data[data.length-1].time} as TimePresentEP
        }
        if (index < 0){
            return {value:data[0].ep,valueWithRatio:Math.round(data[0].ep * ratio),time:data[0].time} as TimePresentEP
        }
        if (((data[index].time - startTime) / length) > present){
            if(debugflags)console.log('>',((data[index].time - startTime) / length),present,(((data[index].time - startTime) / length) > present))
            //console.log('<',((data[index].time - startTime) / length),present,(((data[index].time - startTime) / length) < present))
            findLeft = true // 往左找
        }
        if (((data[index].time - startTime) / length) < present){
            //console.log('>',((data[index].time - startTime) / length),present,(((data[index].time - startTime) / length) > present))
            if(debugflags)console.log('<',((data[index].time - startTime) / length),present,(((data[index].time - startTime) / length) < present))
            findLeft = false    // 往右找
        }
        if (((data[index].time - startTime)/ length) == present){
            return {value:data[index].ep,valueWithRatio:Math.round(data[index].ep * ratio),time:data[index].time} as TimePresentEP
        }

        let count = Math.abs(index - index1)
        if (count <=1){
            stopFlags = true
            if (count==1){
                let indexPresent = (data[index].time - startTime) / length
                let index1Present =(data[index1].time - startTime) / length
                if (Math.abs(present - indexPresent) > Math.abs(present - index1Present)){
                    if(debugflags)console.log('找到 index:',index1,'找到百分比',index1Present,'目标百分比差值',Math.abs(present - index1Present))
                    return {value:data[index1].ep,valueWithRatio:Math.round(data[index1].ep * ratio),time:data[index1].time} as TimePresentEP
                }
                else{
                    if(debugflags)console.log('找到 index:',index,'找到百分比',indexPresent,'目标百分比差值',Math.abs(present - indexPresent))
                    return {value:data[index].ep,valueWithRatio:Math.round(data[index].ep * ratio),time:data[index].time} as TimePresentEP
                }
            }
        }else if (count==0){
            //let indexPresent = data[index].time / length
            return {value:data[index].ep,valueWithRatio:Math.round(data[index].ep * ratio),time:data[index].time} as TimePresentEP
        }
        if (findLeft === true){  // 如果往左边找 
            if(debugflags)console.log('当前Index',index,'当前数据',data[index],'targetNum',present,'往左边找',index - Math.ceil(Math.abs(index1-index)/2))
                //console.log(Math.floor(Math.abs(index1-index)/2))
            let history = index1
            index1 = index      // 假定index当前是中间，那么往左边找中间点继续判断，index1代表上一个中间点
            index = index - Math.ceil(Math.abs(history-index)/2) // 把index定位到0,index中间
        }
        if (findLeft === false){ // 如果往右边找
            if(debugflags)console.log('当前Index',index,'当前数据',data[index],'targetNum',present,'往右边找，目标Index',index +Math.ceil(Math.abs(index1-index)/2))
            let history = index1
            index1 = index      // 假定index当前是中间，那么往右边找中间点继续判断，index1代表上一个中间点
            index = index +Math.ceil(Math.abs(history-index)/2) // 把index定位到index,data终点
        }
    }
    // Ohno我写了个什么万一出来
}