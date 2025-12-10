import { Event } from '@/types/Event';
import { drawList, line, drawListMerge } from '@/components/list';
import { drawDatablock } from '@/components/dataBlock'
import { Image, Canvas } from 'skia-canvas'
import { changeTimePeriodFormat } from '@/components/list/time';
import { Server } from '@/types/Server';
import { drawTitle } from '@/components/title'
import { outputFinalBuffer } from '@/image/output'
import { Cutoff } from "@/types/Cutoff";
import { drawCutoffChart } from '@/components/chart/cutoffChart'
import { assetsRootPath, serverNameFullList } from '@/config';
import { drawEventDatablock } from '@/components/dataBlock/event';
import { statusName } from '@/config';
import { loadImageFromPath } from '@/image/utils';
import { drawTips } from '@/components/tips';
import path from 'path';
import { logger } from '@/logger';

export async function drawCutoffDetail(eventId: number, tier: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    var cutoff = new Cutoff(eventId, mainServer, tier)
    if (cutoff.isExist == false) {
        return [`错误: ${serverNameFullList[mainServer]} 活动或档线不存在`]
    }
    const initPromise = cutoff.initFull();
    var event = new Event(eventId)
    const drawPromise = await drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    await initPromise;

    //const [_, drawResult] = await Promise.all([initPromise, drawPromise]);
    //await cutoff.initFull()
    /*
    if (cutoff.isExist == false) {
        return '错误: 活动或档线数据错误'
    }
    */
    var all = []
    all.push(await drawTitle('预测线', `${serverNameFullList[mainServer]} ${cutoff.tier}档线`))
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

    }
    else if (cutoff.status == 'ended') {
        list.push(await drawList({
            key: '状态',
            text: statusName[cutoff.status]
        }))
        list.push(line)

        //最新分数线
        list.push(await drawList({
            key: '最终分数线',
            text: cutoff.latestCutoff.ep.toString()
        }))
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
    
    all.push(await drawTips({
        text: '预测线1为Tsugu原版预测线\n预测线2仅对千线服务，想法来自：byydzh/MYCX_1000',
        //image: await loadImageFromPath(path.join(assetsRootPath, 'tsugu.png'))
    }))
    
    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress: compress,
    })

    return [buffer];

}
