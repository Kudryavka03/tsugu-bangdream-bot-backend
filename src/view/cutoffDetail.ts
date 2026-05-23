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

export async function drawCutoffDetail(eventId: number, tier: number, mainServer: Server, compress: boolean,eventId2?:number): Promise<Array<Buffer | string>> {
    //eventId2 = 277
    //if (!mainAPI['events'][`${eventId}`]['endAt'][mainServer]) return [`错误: ${serverNameFullList[mainServer]} 活动不存在或未举办`]
    var cutoff = new Cutoff(eventId, mainServer, tier)
    var cutoffGroup = []
    if (cutoff.isExist == false) {
        return [`错误: ${serverNameFullList[mainServer]} 活动或档线不存在`]
    }
    cutoffGroup.push(cutoff.initFull())
    let cutoff2:Cutoff = null
    var cutoffEventTop0 = eventId2?new CutoffEventTop(eventId, mainServer):null;
    var cutoffEventTop1 = eventId2?new CutoffEventTop(eventId2, mainServer):null;
    var rate:number = 1
    if (eventId2){
        cutoff2 = new Cutoff(eventId2,mainServer,tier)
        if (cutoff2.isExist == false) {
            return [`错误: ${serverNameFullList[mainServer]} 带对比的活动或档线不存在`]
        }
        cutoffGroup.push(cutoff2.initFull())
        cutoffGroup.push(cutoffEventTop0.initFull(0))
        cutoffGroup.push(cutoffEventTop1.initFull(0))
    }

    
    var event = new Event(eventId)
    const drawPromise = await drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    const drawPromiseEvent2 = eventId2?await drawEventDatablock(new Event(eventId2), [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    }):null
    await Promise.all(cutoffGroup);
    let avgT0:number = 1

    let avgT1:number = 1
    if (eventId2){
        if (event.eventType!='challenge' && new Event(eventId2).eventType!='challenge'){
            // 假设档线1的倍率是1x
            var userInRankings0 = cutoffEventTop0.getLatestRanking();
            let playerId0 = userInRankings0[0].uid
            var userInRankings1 = cutoffEventTop1.getLatestRanking();
            let playerId1 = userInRankings1[0].uid
            let playerFlags = false
            //console.log(playerId0,playerId1)
            for(let data of [cutoffEventTop0.points,cutoffEventTop1.points]){
                let scorePoint = []
                let scoreChange:number[]  = []
                for(let d of data){
                    if (d.uid == (playerFlags?playerId1:playerId0)){
                        //console.log(d)
                        if ( scorePoint.length==0 ||  d.value != scorePoint[scorePoint.length-1][1]) scorePoint.push([d.time,d.value])
                    }
                }
                //console.log(scorePoint)
                for(let i = Math.round(scorePoint.length * 0.3);i<Math.round(scorePoint.length * 0.7);i++){ // 避免异常数据
                    if (scorePoint[i+1][0] - scorePoint[i][0] < 7*60*1000)    // 简单防炸
                    scoreChange.push(scorePoint[i+1][1]-scorePoint[i][1])
                }
                let avgScore:number = 0
                for(let a of scoreChange){
                   // console.log(a)
                    avgScore+=a
                }
                if(playerFlags){
                    avgT1= avgScore/ scoreChange.length
                }
               else avgT0= avgScore / scoreChange.length
                playerFlags = !playerFlags
            }
            //console.log(avgT0,avgT1)
            rate = avgT0 / avgT1
        }
    }
    if (eventId2 && isFinite(rate)) cutoff2.changeScoreRateForCompare(rate)

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
            key: `日增速 / ${changeTimefomant(cutoff.latestCutoff.time)}  Day${cutoff.getDaysOfEvent(cutoff.latestCutoff.time)+1}  完成率${Math.round((cutoff.latestCutoff.time - cutoff.startAt)/(cutoff.endAt - cutoff.startAt)*100)}%`,
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
            key: '国服 总参与人数',
            text:  `${mainAPI['events'][event.eventId.toString()]['totalPlayerDataCN']}`
        }))
        list.push(drawListMerge(Line2List))
        list.push(line)
        const tempList = []
        console.log(cutoff.dailyIncrement)
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
    list.push(cutoff2?(await drawCutoffChart([cutoff,cutoff2], true, mainServer,true)):(await drawCutoffChart([cutoff])))
    if (cutoff2){
        //list.pop()
        list.push(line)
        list.push((await drawList({
            key: `对比档线：${eventId2} T${tier}`,
        })))
        list.push(line)
        const Line2List = []
        Line2List.push(await drawList({
            key: '最终分数线',
            text: (cutoff2.latestCutoff.ep).toString()
        }))
        if (mainAPI['events'][eventId2.toString()]['totalPlayerDataCN']) Line2List.push(await drawList({
            key: '国服探底',
            text:  `${mainAPI['events'][eventId2.toString()]['totalPlayerDataCN']}`
        }))
        Line2List.push(await drawList({
            key: '补偿倍率',
            text: `${Math.round(rate*100)/100}`
        }))
        list.push(drawListMerge(Line2List))
        list.push(line)
        const tempList = []
        //console.log(cutoff2.dailyIncrement)
        tempList.push((await drawList({
            key: '日增速',
            text: `${cutoff2.dailyIncrement.join('/')}`
        })))
        list.push(drawListMerge(tempList))
        //list.push(line)
    }
    //创建最终输出数组
    var listImage = await drawDatablock({ list })
    all.push(drawPromise)
    all.push(listImage)
    if(eventId2)all.push(drawPromiseEvent2)
    if (eventId2) all.push(await drawTips({
        text: `以${eventId}为基准。${eventId}顶配${Math.round(avgT0)} | ${eventId2}顶配${Math.round(avgT1)}`,
        
        //image: await loadImageFromPath(path.join(assetsRootPath, 'tsugu.png'))
    }))
    /*
    all.push(await drawTips({
        text: '预测线1为Tsugu原版预测线 / 数据源切换：查曲 8734499\n预测线2仅对伍佰、K、2K线服务，想法来自：byydzh/MYCX_1000\n若Bestdori关键节点(凌晨3:45)无数据，日增将根据时间差均匀补偿\n',
        
        //image: await loadImageFromPath(path.join(assetsRootPath, 'tsugu.png'))
    }))
        */
    
    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress: compress,
    })

    return [buffer];

}
