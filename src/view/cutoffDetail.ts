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

export async function drawCutoffDetail(eventId: number, tier: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    var cutoff = new Cutoff(eventId, mainServer, tier)
    if (cutoff.isExist == false) {
        return [`错误: ${serverNameFullList[mainServer]} 活动或档线不存在`]
    }
    await cutoff.initFull()
    /*
    if (cutoff.isExist == false) {
        return '错误: 活动或档线数据错误'
    }
    */
    var cutoffPromise = []
    var all = []
    all.push(drawTitle('预测线', `${serverNameFullList[mainServer]} ${cutoff.tier}档线`))
    var list: Array<Image | Canvas> = []
    var event = new Event(eventId)

    cutoffPromise.push(await drawEventDatablock(event, [mainServer]))

    //状态
    var time = new Date().getTime()
    var promiseResult;

    //如果活动在进行中    
    if (cutoff.status == 'in_progress') {
        
        cutoffPromise.push(cutoff.predict())
        cutoffPromise.push(cutoff.predict2())
        promiseResult = Promise.all(cutoffPromise)
        list.push(promiseResult[0])
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
            drawList({
                key: '预测线1',
                text: predictText
            }),
            drawList({
                key: '预测线2',
                text: predictText2
            }),
        ]))
        list.push(line)


        const tempImageList = []
        //最新分数线
        const finalCutoffImage = drawList({
            key: '最新分数线',
            text: cutoff.latestCutoff.ep.toString()
        })
        tempImageList.push(finalCutoffImage)
        
        tempImageList.push(drawList({
            key: '当前时速',
            text: `${Math.round((cutoff.latestCutoff.ep - lastep) / timeSpan)} pt/h`
        }))


        list.push(drawListMerge(tempImageList)) //合并两个list
        list.push(line)
        const tempTimeList = []
        //活动剩余时间
        tempTimeList.push(drawList({
            key: '活动剩余时间',
            text: `${changeTimePeriodFormat(cutoff.endAt - time,false)}`
        }))
        tempTimeList.push(drawList({
            key: '更新时间',
            text: `${changeTimePeriodFormat((new Date().getTime()) - cutoff.latestCutoff.time)}前`
        }))
        list.push(drawListMerge(tempTimeList))


        list.push(line)

    }
    else if (cutoff.status == 'ended') {
        promiseResult = Promise.all(cutoffPromise)
        list.push(promiseResult[0])
        list.push(drawList({
            key: '状态',
            text: statusName[cutoff.status]
        }))
        list.push(line)

        //最新分数线
        list.push(drawList({
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
    var listImage = drawDatablock({ list })

    all.push(listImage)
    
    all.push(drawTips({
        text: '想给我们提供数据?\n可以在B站 @Tsugu_Official 的置顶动态留言\n或者在群238052000中提供数据\n我们会尽快将数据上传至服务器',
        //image: await loadImageFromPath(path.join(assetsRootPath, 'tsugu.png'))
    }))
    
    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress: compress,
    })

    return [buffer];

}
