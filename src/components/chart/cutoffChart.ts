import { Canvas } from 'skia-canvas';
import { Cutoff } from "@/types/Cutoff";
import { drawTierChart, drawTimeLineChart } from "@/components/chart_Timeline";
import { Event } from '@/types/Event';
import { Server } from '@/types/Server';
import { CutoffEventTop } from '@/types/CutoffEventTop';
import { getPresetColor } from '@/types/Color';
import { drawList } from '@/components/list'
import { stackImage } from '@/components/utils'

export async function drawCutoffChart(cutoffList: Cutoff[], setStartToZero = false, server: Server = Server['jp'], drawPredict = false, prediction: boolean | 'current' = true) {
    // drawPredict是官方的
    // drawPredictHistory是后加上去的
    //setStartToZero:是否将开始时间设置为0
    var datasets = []
    var time = new Date().getTime()
    if (cutoffList.length == 0) {
        return (new Canvas(1, 1))
    }
    let cutoffServer = cutoffList[0].server
    // getDateByServerTimezone
    const list = []

    var onlyOne = cutoffList.length == 1
    for (let i = 0; i < cutoffList.length; i++) {
        const tempColor = getPresetColor(i)

        const cutoff = cutoffList[i];
        const tempEvent = new Event(cutoff.eventId)

        let lableName: string
        if (setStartToZero) {
            lableName = `[${tempEvent.eventId}] ${tempEvent.eventName[server]} T${cutoff.tier}`
            list.push(await drawList({
                content: [tempColor.generateColorBlock(0.8), `[${tempEvent.eventId}] ${tempEvent.eventName[server]} T${cutoff.tier}`],
                textSize: 20,
            }))
        }
        else {
            lableName = `T${cutoff.tier}`
            list.push(await drawList({
                content: [tempColor.generateColorBlock(0.8), `T${cutoff.tier}`],
                textSize: 20,
            }))
        }
        datasets.push({
            label: lableName,
            data: cutoff.getChartData(setStartToZero),
            borderWidth: 5,
            borderColor: [tempColor.getRGBA(1)],
            backgroundColor: [tempColor.getRGBA(0.2)],
            pointBackgroundColor: tempColor.getRGBA(1),
            pointBorderColor: tempColor.getRGBA(1),
            fill: onlyOne
        })
        if (drawPredict){
            datasets.push({
                label: lableName,
                data: cutoff.getPredictChartData(setStartToZero),
                borderWidth: 5,
                borderColor: [tempColor.getRGBA(1)],
                backgroundColor: [tempColor.getRGBA(1)],
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 0,
                borderDash: [10, 10],
            }) 
        }
        if (cutoff.status == 'in_progress') {
            
            datasets.push({
                label: lableName,
                data: cutoff.getPredictChartData(setStartToZero),
                borderWidth: 5,
                borderColor: [tempColor.getRGBA(1)],
                backgroundColor: [tempColor.getRGBA(1)],
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 0,
                borderDash: [10, 10],
            })
                

            if (prediction && cutoff.predictEP != null && cutoff.predictEP != 0) {
                const timeOffset = setStartToZero ? cutoff.startAt : 0;
                const history = prediction === 'current' ? [cutoff.latestCutoff] : cutoff.getPredictionHistory();
                const data = history.length > 0
                    ? history.map(point => ({ x: new Date(point.time - timeOffset), y: point.ep }))
                    : [{ x: new Date(cutoff.startAt - timeOffset), y: cutoff.predictEP }];
                const finalPrediction = prediction === 'current' ? cutoff.predictEP : history.at(-1)?.ep ?? cutoff.predictEP;
                data.push({ x: new Date(cutoff.endAt - timeOffset), y: finalPrediction });
                datasets.push({
                    label: `T${cutoff.tier} 预测线`,
                    borderColor: [tempColor.getRGBA(1)],
                    backgroundColor: [tempColor.getRGBA(1)],
                    data: data,
                    borderWidth: 5,
                    borderDash: [20, 10],
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                })


            }

        }
    }
    if (!setStartToZero) {
        if (time < cutoffList[0].endAt) {
            const tempColor = getPresetColor(0)
            datasets.push({
                label: "当前时间",
                borderColor: [tempColor.getRGBA(1)],
                backgroundColor: [tempColor.getRGBA(1)],
                data: [{ x: new Date(time), y: 0 }],
                fill: false,
                pointRadius: 10,
                pointHoverRadius: 15,
                showLine: false
            })
        }
    }
    let all = []
    all.push(stackImage(list))

    var data = {
        datasets: datasets
    }
    if (setStartToZero) {
        let longestTime = 0
        for (let i = 0; i < cutoffList.length; i++) {
            const cutoff = cutoffList[i];
            if (cutoff.endAt - cutoff.startAt > longestTime) {
                longestTime = cutoff.endAt - cutoff.startAt
            }
        }
        all.push(await drawTimeLineChart({ data, start: new Date(0), end: new Date(longestTime), setStartToZero,server:cutoffServer }))
        return (stackImage(all))
    }
    else {
        all.push(await drawTimeLineChart({ data, start: new Date(cutoffList[0].startAt), end: new Date(cutoffList[0].endAt), setStartToZero,server:cutoffServer }))
        return (stackImage(all))
    }

}
export async function drawCutoffEventTopChart(
    CutoffEventTop: Pick<CutoffEventTop, 'getChartData' | 'getUserNameById' | 'startAt' | 'endAt'>,
    setStartToZero = false,
    server: Server = Server.jp,
    playerId?: number,
    w = 800,
    h = 900,
    excludedPlayerIds?: ReadonlySet<number>,
) {
    var datasets = []
    if (CutoffEventTop == undefined) {
        return (new Canvas(1, 1))
    }
    var allData = CutoffEventTop.getChartData(undefined,playerId);
    function removeBraces(text: string): string {
        var newText = text.replace(/\[[^\]]*\]/g, "");
        return newText;
    }
    let colorNumber = 0
    for (const key in allData) {
        if (excludedPlayerIds?.has(Number(key))) continue;
        const tempColor = getPresetColor(colorNumber)
        datasets.push({
            label: removeBraces(CutoffEventTop.getUserNameById(Number(key))),
            data: allData[key],
            borderWidth: 4,
            borderColor: [tempColor.getRGBA(1)],
            backgroundColor: [tempColor.getRGBA(0.2)],
            pointBackgroundColor: tempColor.getRGBA(0),
            pointBorderColor: tempColor.getRGBA(0),
            pointStyle: false,
            fill: false
        })
        colorNumber++
    }
    var data = { datasets: datasets }
    return await drawTimeLineChart({ data, start: new Date(CutoffEventTop.startAt), end: new Date(CutoffEventTop.endAt), setStartToZero }, true,w,h)
}
// 给歌榜all 单独一个cutoff draw。歌榜使用一个全新的图标方式，他不反映个歌榜的趋势，而是反映歌榜每个Tier之间的下降趋势
export async function drawCutoffChartSongAll(cutoffList: Cutoff[], setStartToZero = false, server: Server = Server['jp'], drawPredict = false, prediction: boolean | 'current' = true) {
    var datasets = []
    var time = new Date().getTime()
    if (cutoffList.length == 0) {
        return (new Canvas(1, 1))
    }
    const list = []

    var onlyOne = cutoffList.length == 1
    const tier1Score = cutoffList.find(cutoff => cutoff.tier === 1)?.latestCutoff.ep
    let chartDataSongAll: { x: number, y: number }[] = []
    if (Number.isFinite(tier1Score) && tier1Score > 0) {
        for (const cutoff of cutoffList) {
            const score = cutoff.latestCutoff?.ep
            if (!Number.isFinite(score)) continue
            chartDataSongAll.push({ x: cutoff.tier, y: (score / tier1Score) * 100 })
        }
    }
    const tempColor = getPresetColor(1)
        datasets.push({
            label: '占比T1',
            data: chartDataSongAll,
            borderWidth: 5,
            borderColor: [tempColor.getRGBA(1)],
            backgroundColor: [tempColor.getRGBA(0.2)],
            pointBackgroundColor: tempColor.getRGBA(1),
            pointBorderColor: tempColor.getRGBA(1),
            fill: onlyOne
        })
    /*
    if (!setStartToZero) {
        if (time < cutoffList[0].endAt) {
            const tempColor = getPresetColor(0)
            datasets.push({
                label: "当前时间",
                borderColor: [tempColor.getRGBA(1)],
                backgroundColor: [tempColor.getRGBA(1)],
                data: [{ x: new Date(time), y: 0 }],
                fill: false,
                pointRadius: 10,
                pointHoverRadius: 15,
                showLine: false
            })
        }
    }
        */
    let all = []
    all.push(stackImage(list))

    var data = {
        datasets: datasets
    }

    if (chartDataSongAll.length > 0) all.push(await drawTierChart({ data }))
    return (stackImage(all))
    

}