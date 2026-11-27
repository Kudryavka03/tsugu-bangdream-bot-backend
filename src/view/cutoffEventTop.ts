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
import { drawCutoffScatterChart } from '@/components/chart/cutoffScatterChart';
import { songChartRouter } from '@/routers/songChart';
import { drawList, drawListMerge, drawListMergeMin, line } from '@/components/list';
import { drawDottedLine } from '@/image/dottedLine';
import { resizeImage } from '@/components/utils';
import { stackImage } from '@/components/utils';
import { logger } from '@/logger';
import { drawText, setFontStyle } from '@/image/text';
import { roundedRectPath } from '@/image/surfaceShadow';
import { drawGuideSingleLineText, GUIDE_THEME } from '@/image/theme';
import { drawTips } from '@/components/tips';
import { changeTimePeriodFormat, changeTimefomant, formatSeconds, getDateByServerTimezone, getServerUtcOffset, normalizeTimestamp } from '@/components/list/time';
import mainAPI, { TopRateSpeed } from '@/types/_Main';
import { estimateChallengePoints } from '@/types/challengePointEstimate';
import { summarizeTopRateSpeedHour, summarizeTopRateSpeedWindow, TopRateTimeWindow } from '@/types/topRateSpeedWindow';
import array from 'ref-array-di';
import { min } from 'moment';
import { getTop10AvgScore } from './cutoffDetail';
import { checkCutoffEventIfNeedFallbackToUpperServer, Cutoff } from '@/types/Cutoff';
import { drawT10CutoffSummary } from '@/view/t10CutoffSummary';
import { getTopTierCutoffs } from '@/types/TrackerTop';

type TopRateLimit = {
    min?: number,
    max?: number,
    minInclusive?: boolean,
    maxInclusive?: boolean
}

type PlayerRatingChange = {
    time: number,
    score: number
}

export async function drawTopRateScatter(eventId: number, playerId: number, tier: number, maxCount: number | undefined, mainServer: Server, compress: boolean, day?: number, limit?: TopRateLimit, range?: TopRateTimeWindow): Promise<Array<Buffer | string>> {
    mainServer = checkCutoffEventIfNeedFallbackToUpperServer(eventId,mainServer)
    const serverName = serverNameFullList[mainServer];
    const cutoff = new CutoffEventTop(eventId, mainServer);
    if (!cutoff.isExist || !Number.isFinite(cutoff.startAt) || !Number.isFinite(cutoff.endAt) || cutoff.status === 'not_start') {
        return [`错误：${serverName} 活动 ${eventId} 不存在或尚未开始`];
    }
    await cutoff.initFull();
    if (!cutoff.isExist) {
        return [`错误：${serverName} 活动 ${eventId} 前十数据不足`];
    }

    const ranking = cutoff.getLatestRanking();
    const selectedId = tier ? ranking[tier - 1]?.uid : Number(playerId);
    if (!selectedId) {
        return [`${serverName} 活动 ${eventId} 的最新前十榜单中没有该排名`];
    }

    const rating = getRatingByPlayer(cutoff.points, selectedId)
        .map(({ time, value }) => ({ time: normalizeTimestamp(time), value }))
        .filter(({ time }) => Number.isFinite(time));
    if (!rating.some(({ value }) => Number.isFinite(value) && value >= 0)) {
        return [`玩家 ${selectedId} 在${serverName}活动 ${eventId} 中没有前十记录`];
    }
    const dayRange = day ? getEventDayRange(cutoff.startAt, mainServer, day) : undefined;
    const begin = Math.max(normalizeTimestamp(cutoff.startAt), dayRange?.begin ?? -Infinity, range?.from ?? -Infinity);
    const eventEnd = normalizeTimestamp(cutoff.endAt);
    const availableEnd = cutoff.status === 'ended' ? eventEnd : Math.min(eventEnd, rating[0].time);
    const end = Math.min(availableEnd, dayRange?.end ?? Infinity, range?.to ?? Infinity);
    if (begin >= end) {
        return ['所选范围内没有可绘制的分数变动记录'];
    }

    const gaps = rating.slice(1).map((point, index) => rating[index].time - point.time)
        .filter(gap => gap > 0).sort((a, b) => a - b);
    // A gap spanning more than one typical sampling interval cannot establish a single increment.
    const maxSampleGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] * 1.8 : Infinity;
    const changes = getPlayerRatingChanges(rating, begin, end, limit, maxSampleGap)
        .filter(({ time, score }) => Number.isFinite(time) && Number.isFinite(score))
        .slice(0, maxCount).reverse();
    if (!changes.length) {
        return ['所选范围内没有可绘制的分数变动记录'];
    }

    const points = changes.map(({ time, score }) => ({ x: time, y: score }));
    const title = await drawTitle('查散点图', `${serverName} 活动 ${eventId}`);
    const index = ranking.findIndex(user => user.uid == selectedId);
    const playerName = cutoff.getUserNameById(selectedId) || selectedId.toString();
    const heading = index >= 0 ? `T${index + 1} ${playerName}` : playerName;
    const chart = drawCutoffScatterChart(points, mainServer, { begin, end });
    const formatTime = (time: number) => getDateByServerTimezone(time, mainServer).toISOString().slice(0, 16).replace('T', ' ');
    const chartNote = drawList({
        text: `${formatTime(begin)} 至 ${formatTime(end)}（服务器时间）\n散点表示连续前十记录间的分数差，横轴取两次记录的中间时刻。`,
        textSize: 20,
        color: GUIDE_THEME.muted,
        leftPadding: 16,
    });
    const statistics = drawScatterStatistics(points.map(point => point.y), day);
    const [block, eventInfo] = await Promise.all([
        drawDatablock({ list: [chart, chartNote, statistics], topLeftText: heading }),
        drawEventDatablock(new Event(eventId), [mainServer], '活动信息').catch(error => {
            logger('drawEventDatablock error:', error);
            return null;
        }),
    ]);
    const imageList = eventInfo ? [title, block, eventInfo] : [title, block];
    return [await outputFinalBuffer({ imageList, compress })];
}

function drawScatterStatistics(scores: number[], day?: number): Canvas {
    const sorted = [...scores].sort((a, b) => a - b);
    const count = sorted.length;
    const average = sorted.reduce((sum, score) => sum + score, 0) / count;
    const variance = sorted.reduce((sum, score) => sum + (score - average) ** 2, 0) / count;
    const median = (sorted[Math.floor((count - 1) / 2)] + sorted[Math.floor(count / 2)]) / 2;
    const formatPt = (score: number) => `${Math.round(score)} Pt`;
    const metrics = [
        ['变动次数', `${count.toLocaleString('zh-CN')} 次`],
        ['平均分差', formatPt(average)],
        ['标准差', formatPt(Math.sqrt(variance))],
        ['最小分差', formatPt(sorted[0])],
        ['中位分差', formatPt(median)],
        ['最大分差', formatPt(sorted[count - 1])],
    ];

    const canvas = new Canvas(800, 216);
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'middle';
    ctx.fillStyle = GUIDE_THEME.text;
    setFontStyle(ctx, 27, 'old');
    const heading = day ? `图中散点统计 · 活动第 ${day} 天` : '图中散点统计';
    drawGuideSingleLineText(ctx, heading, 16, 24, 768);

    for (const [index, [label, value]] of metrics.entries()) {
        const x = 16 + (index % 3) * 260;
        const y = 48 + Math.floor(index / 3) * 88;
        roundedRectPath(ctx, x, y, 248, 80, GUIDE_THEME.cardRadius);
        ctx.fillStyle = GUIDE_THEME.surfaceTint;
        ctx.fill();
        ctx.fillStyle = GUIDE_THEME.muted;
        setFontStyle(ctx, 20, 'old');
        drawGuideSingleLineText(ctx, label, x + 18, y + 23, 212);
        ctx.fillStyle = GUIDE_THEME.text;
        setFontStyle(ctx, 30, 'old');
        drawGuideSingleLineText(ctx, value, x + 18, y + 54, 212);
    }
    return canvas;
}

export async function drawCutoffEventTop(eventId: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    mainServer = checkCutoffEventIfNeedFallbackToUpperServer(eventId,mainServer)
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    await cutoffEventTop.initFull(0);
    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} 活动不存在或数据不足`];
    }
    var all = [];
    all.push(await drawTitle('档线', `${serverNameFullList[mainServer]} 10档线`));
    var list: Array<Image | Canvas> = [];

    const t10Cutoffs = getTopTierCutoffs(cutoffEventTop.points);
    if (t10Cutoffs.length == 0) {
        return [`错误: ${serverNameFullList[mainServer]} ${eventId} 前十数据不足`];
    }
    const t10Cutoff = new Cutoff(eventId, mainServer, 10, {
        startAt: cutoffEventTop.startAt,
        endAt: cutoffEventTop.endAt,
        eventType: event.eventType,
        dataSourceName: cutoffEventTop.dataSourceName,
    });
    await t10Cutoff.initFull({
        cutoffs: t10Cutoffs,
        dataSourceName: cutoffEventTop.dataSourceName,
    });
    list.push(...await drawT10CutoffSummary(t10Cutoff));
    list.push(line);


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
        drawPlayerRankingInListPromise.push(drawPlayerRankingInList(user, color, mainServer,undefined,undefined,cutoffEventTop))

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
    all.push(await drawTips({
        text: `当期顶配：${Math.round(await getTop10AvgScore(event,mainServer,null,cutoffEventTop))}`
    }))
    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })

    return [buffer];
}

export async function drawTopRateDetail(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean, day?: number, limit?: TopRateLimit): Promise<Array<Buffer | string>> {
    mainServer = checkCutoffEventIfNeedFallbackToUpperServer(eventId,mainServer)
    if (playerId == 1 || playerId == 0 || tier == 0) return drawTopRateSpeedRank(eventId,playerId,tier,maxCount,mainServer,compress)
    if (playerId == 3 ) return drawTopRateSleep(eventId,1007987242,tier,maxCount,mainServer,compress)
    if (playerId == 4 ) return drawTopRateChanged(eventId,1004512554,tier,maxCount,mainServer,compress)
    if (!maxCount) {
        maxCount = 20
    }
    if (maxCount >400) return [`错误: 查岗次数过多，请适当缩减查岗的次数。次数过多会占用大量Bot硬件资源且图片可能会无法被正常送出。如需查T10时速表请回复查岗 0`];
    // 因为没用上所以凭感觉优化了一下，不知道能不能用
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    await cutoffEventTop.initFull(0);
    if (!cutoffEventTop.isExist) {
        return [`错误: ${serverNameFullList[mainServer]} 活动不存在或数据不足`];
    }
    if (cutoffEventTop.status != "in_progress" && false) {
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
            drawPlayerRankingInListPromise1.push(drawPlayerRankingInList(user, 'white', mainServer,widthMax))
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
    const hasLimit = limit != undefined && (limit.min != undefined || limit.max != undefined)
    const changeRange = day && day > 0 ? getEventDayRange(cutoffEventTop.startAt, mainServer, day) : undefined
    const changeBegin = changeRange?.begin
    const changeEnd = changeRange?.end
    const playerRatingChanges = getPlayerRatingChanges(playerRating, changeBegin, changeEnd, limit)
    const filterTips = []
    if (day && day > 0) {
        filterTips.push(`第${day}天`)
    }
    if (limit?.min != undefined) {
        filterTips.push(`变动${limit.minInclusive ? '>=' : '>'}${limit.min}`)
    }
    if (limit?.max != undefined) {
        filterTips.push(`变动${limit.maxInclusive ? '<=' : '<'}${limit.max}`)
    }
    const filterTipsText = filterTips.length > 0 ? `${filterTips.join('，')}` : '无'
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
        for (const change of playerRatingChanges) {
            if (count == maxCount) {
                break
            }
            count += 1
            const mid = new Date(change.time)
            const timeChangeImage = drawListMerge([await drawList({ text: `${mid.toTimeString().slice(0, 8)}`}), await drawList({ text: `${change.score}`})], widthMax / 2)
            const ctx = timeChangeImage.getContext('2d')
            ctx.font = "18px old,Microsoft Yahei"
            ctx.fillText(`${mid.getMonth()+1}.${mid.getDate()}`, 45, 13)
            imageList.push(timeChangeImage)
            // list.push(line)
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
    if (!hasLimit && mainAPI['events']?.[eventId]?.eventType === 'challenge') {
        const estimate = estimateChallengePoints(playerRating.map(({ time, value }) => ({
            time: normalizeTimestamp(time),
            value,
        })));
        if (estimate) {
            const rows = [
                ['估算协力次数', estimate.coopCount],
                ['估算协力获得的CP', estimate.earnedCp],
                ['把均Pt(协力/CP)', `${estimate.averageCoopPt} / ${estimate.averageClearPt}`],
                ['把均Pt(近50把)', `${estimate.recentAverageCoopPt} / ${estimate.recentAverageClearPt}`],
                ['估算清CP次数', estimate.clearCount],
                ['估算现有CP', estimate.remainingCp ?? '数据不足'],
                ['可归类分数占比', `${estimate.classifiedPercent}%`],
            ];
            const list = [];
            for (const [key, value] of rows) {
                if (list.length) list.push(line);
                list.push(drawListMerge([await drawList({ text: key.toString() }), await drawList({ text: value.toString() })]));
            }
            all.push(await drawDatablock({ list, topLeftText: 'CP估算 (Beta)' }));
        }
    }
    //近期统计数据
    const timeList = [1, 3, 12, 24]
    {
        const list = [], now = Date.now()
        const statWidths = [400, 220, 220, 160]
        list.push(drawListMerge([await drawList({ key: '时间', maxWidth: statWidths[0] }), await drawList({ key: '变动次数', maxWidth: statWidths[1] }), await drawList({ key: '平均间隔', maxWidth: statWidths[2] }), await drawList({ key: '平均分数', maxWidth: statWidths[3] })], widthMax, false, "top", statWidths))
        for (const a of timeList) {
            const begin = changeBegin ?? now - a * 60 * 60 * 1000
            const end = changeEnd ?? now
            const st = new Date(begin), ed = new Date(end)
            const timeImage = await drawList({ text: `${st.toTimeString().slice(0, 8)}~${ed.toTimeString().slice(0, 8)}`})
            const offset = Math.floor((end / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60) - Math.floor((begin / 1000 / 60 - st.getTimezoneOffset()) / 24 / 60)
            // console.log(st.getTimezoneOffset())
            if (offset > 0) {
                const ctx = timeImage.getContext('2d')
                ctx.font = "18px old,Microsoft Yahei"
                ctx.fillText(`-${offset}`, 30, 13)
            }
            const rangeChanges = playerRatingChanges.filter(change => change.time >= begin && change.time < end)
            const count = rangeChanges.length
            const sumScore = rangeChanges.reduce((sum, change) => sum + change.score, 0)
            const timestamps = rangeChanges.map(change => change.time)
            const averageTime = getAverageTime(timestamps)
            list.push(drawListMerge([timeImage, await drawList({ text: `${count}` }), await drawList({ text: timestamps.length <= 1 ? '-' : `${(new Date(averageTime)).toTimeString().slice(3, 8)}` }), await drawList({ text: count == 0 ? '-' : `${Math.floor(sumScore / count)}` })], widthMax, false, "top", statWidths))
            list.push(line)
            if (changeBegin != undefined && changeEnd != undefined) {
                break
            }
        }
        list.pop()
        all.push(await drawDatablock({ list, topLeftText: `近期统计数据`}))
    }
    all.push(await drawEventDatablock(new Event(eventId), [mainServer]))
    all.push(await drawTips({text:'筛选条件：'+filterTipsText}))
    // list.push(new Canvas(800, 50))

    // //折线图
    // list.push(await drawCutoffEventTopChart(cutoffEventTop, false, mainServer))

    // var listImage = drawDatablock({ list });
    // all.push(listImage);

    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })

    return [buffer];
}

export async function drawTopRateSpeedRank(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean, apiData?: object, range?: TopRateTimeWindow): Promise<Array<Buffer | string>> {
    if (range) return drawTopRateSpeedRankInWindow(eventId, mainServer, compress, range);
    mainServer = checkCutoffEventIfNeedFallbackToUpperServer(eventId,mainServer)
    console.log(eventId)
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    /*
    if (cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }
    */
    if (playerId < 1 ){    // 如果不等于114514就返回缓存。缓存每隔5分钟刷新一次
        if (TopRateSpeed) return TopRateSpeed   // 如果缓存不存在就走正常获取流程
    }
    let subTimeTips = (playerId==2)?'上个时段统计':'即刻统计'
    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    await cutoffEventTop.initFull(0);
    if (!cutoffEventTop.isExist || !cutoffEventTop.points?.length) return ['该活动的前十榜单数据不足'];

    const points = cutoffEventTop.points.map(point => ({ ...point, time: normalizeTimestamp(point.time) }));
    const summary = summarizeTopRateSpeedHour(points);
    if (!summary) return ['至少需要两次前十榜单记录'];
    const sortUidList = summary.rows.map(row => row.uid);

    // 判断是否在同一房间内
    // 基本思路：抽取出同一时间value的人，数据越多越纯。但也不要太多
    // [[1,2,3,4,5,6,8],[7,9]],[[1,2,3,4,5],[6,8],[7,9]]
    // 就可以判断得出，[1,2,3,4,5]在同一辆车上,[6,8]在同一辆车上,[7,9]在同一辆车上
    let possibleAtSameRoom = []
    let tempArr1 = []
    let tempArr2 = []
    try{
        const pureData = points.filter(({ time }) => time >= summary.from && time <= summary.last);
        var timeList = [];  // 一共有多少个time（采集点）
        for (let pd of pureData){
            if (!timeList.includes(pd.time)) timeList.push(pd.time)
        }
        // 获取uid
        var uidList = []
        for (let pd of pureData){
            if (!uidList.includes(pd.uid)) uidList.push(pd.uid)
        }
        // 获取到采集点之后，开始对比采集点之间的不同
        var timeListIndex = 0;
        var valueChangeData = []
        // 将每一次采集点之间的变动情况进行记录
        for (let t = 0;t<timeList.length;t++){  // 便利timeList 。 t为timeList的Index
            let tempData1 = []
            let tempData2 = []
            for(let pd of pureData){
                if (pd.time == timeList[t]) tempData1.push(pd)
                if (pd.time == timeList[t+1]) tempData2.push(pd)
            }
            let valueChangeUid = []
            for(let tIndex1 = 0;tIndex1<tempData1.length;tIndex1++){
                for(let tIndex2 = 0;tIndex2<tempData2.length;tIndex2++){
                    if (tempData1[tIndex1].uid == tempData2[tIndex2].uid  && tempData1[tIndex1].value != tempData2[tIndex2].value) {
                        valueChangeUid.push(tempData1[tIndex1].uid)
                    }
                }
            }
            valueChangeData.push(valueChangeUid)
        }
        possibleAtSameRoom =  inferPossibleRoomsByScoreChange(valueChangeData,sortUidList)
    }
    catch{
        // TODO: 在房间出现变动的时候使用较多数据的一个房间进行判断。（已完成）
    }
    const columns: [string, number][] = [
        ['排名', 200], ['UID', 300], ['昵称', 420], [playerId == 2 ? '统计时分数' : '分数', 275],
        ['上下分差', 250], ['1小时内分差', 300], ['速度排名', 300], ['分数变动次数', 300],
        ['把均PT', 200], ['前空白', 200], ['尾空白', 200], ['猜房间', 200],
    ];
    const blankStart = new Date(summary.last - 3_600_000).setSeconds(0, 0);
    const rows = summary.rows.map((row, index) => {
        const rating = getRatingByPlayer(points, row.uid);
        const { leadingMinutes, trailingMinutes } = getTopRateBlankMinutes(rating, blankStart, summary.last);
        return [
            index + 1, row.uid, cutoffEventTop.getUserNameById(row.uid) || String(row.uid), row.score, row.gap,
            row.gain ?? '--', row.gain == null ? '--' : 1 + summary.rows.filter(candidate => candidate.gain != null && candidate.gain > row.gain).length,
            row.changeCount ?? '--', row.averageGain ?? '--',
            `${leadingMinutes ?? '--'}min`, `${trailingMinutes ?? '--'}min`,
            getPossibleRoom(possibleAtSameRoom, row.uid),
        ];
    });
    const timeTips = `统计时段：${changeTimefomant(summary.from, undefined, true)} - ${changeTimefomant(summary.last, undefined, true)}`;
    return drawTopRateSpeedReport(mainServer, subTimeTips, columns, rows,
        `${timeTips}\n次数按相邻榜单的增分统计，缺榜或分数回调时显示 --。\n仅在T10用户一直保持在一个房间，猜房间数据才具有可信度`, drawEventDatablockPromise, compress);
}

function getTopRateBlankMinutes(rating: { time: number; value: number }[], start: number, end: number) {
    let score = rating[0].value;
    let changeTime = end;
    let trailingMinutes: number | undefined;
    for (let i = 1; i < rating.length; i++) {
        const { time, value } = rating[i];
        if (value === score) continue;

        if (trailingMinutes === undefined) {
            if (end - time >= 3_600_000) break;
            trailingMinutes = Math.round((time - end + 60_000) / 60_000);
        }

        // The leading blank requires a differing observation before the rounded start.
        if (time < start) {
            const leadingMinutes = Math.round((changeTime - start) / 60_000);
            return { leadingMinutes: leadingMinutes <= 30 ? leadingMinutes : undefined, trailingMinutes };
        }

        score = value;
        changeTime = rating[i - 1].time;
    }
    return { leadingMinutes: undefined, trailingMinutes };
}

async function drawTopRateSpeedRankInWindow(eventId: number, server: Server, compress: boolean, range: TopRateTimeWindow): Promise<Array<Buffer | string>> {
    server = checkCutoffEventIfNeedFallbackToUpperServer(eventId,server)
    const cutoff = new CutoffEventTop(eventId, server);
    if (!cutoff.isExist || cutoff.status === 'not_start' || !Number.isFinite(cutoff.startAt) || !Number.isFinite(cutoff.endAt)) {
        return [`错误：${serverNameFullList[server]} 活动 ${eventId} 不存在或尚未开始`];
    }
    await cutoff.initFull();
    if (!cutoff.isExist) return ['该活动的前十榜单数据不足'];

    const from = Math.max(range.from ?? cutoff.startAt, cutoff.startAt);
    const to = Math.min(range.to ?? cutoff.endAt + 1, cutoff.endAt + 1);
    const points = cutoff.points.map(point => ({ ...point, time: normalizeTimestamp(point.time) }));
    const summary = summarizeTopRateSpeedWindow(points, from, to);
    if (!summary) return ['所选时段内至少需要两次前十榜单记录'];

    const columns: [string, number][] = [
        ['排名', 200], ['UID', 300], ['昵称', 420], ['时段末分数', 275], ['上下分差', 250],
        ['时段增量', 275], ['每小时PT', 275], ['速度排名', 230], ['变动次数', 235],
        ['次均PT', 235], ['前空白', 200], ['尾空白', 200],
    ];
    const rows = summary.rows.map((row, index) => [
        index + 1, row.uid, cutoff.getUserNameById(row.uid) || String(row.uid), row.score, row.gap,
        row.gain ?? '--', row.hourlyGain ?? '--', row.gain == null ? '--' : 1 + summary.rows.filter(candidate => candidate.gain != null && candidate.gain > row.gain).length,
        row.changeCount ?? '--', row.averageGain ?? '--',
        row.changeCount === 0 ? '未变动' : row.leadingMinutes == null ? '--' : `${row.leadingMinutes}min`,
        row.changeCount === 0 ? '未变动' : row.trailingMinutes == null ? '--' : `${row.trailingMinutes}min`,
    ]);
    const formatTime = (time: number) => getDateByServerTimezone(time, server).toISOString().slice(0, 19).replace('T', ' ');
    const timeTips = `采样时段：${formatTime(summary.first)} 至 ${formatTime(summary.last)}（服务器时间）\n排名取时段末榜单，变动按相邻记录计算，-- 表示记录不完整或分数回调。`;
    const eventInfo = drawEventDatablock(new Event(eventId), [server]).catch(error => {
        logger('drawEventDatablock error:', error);
        return null;
    });
    return drawTopRateSpeedReport(server, '时段统计', columns, rows, timeTips, eventInfo, compress);
}

async function drawTopRateSpeedReport(server: Server, subtitle: string, columns: [string, number][], rows: Array<Array<string | number>>, timeTips: string, eventInfo: Promise<Canvas>, compress: boolean): Promise<Buffer[]> {
    const width = columns.reduce((sum, [, columnWidth]) => sum + columnWidth, 0);
    const drawRow = (cells: Array<string | number>) => drawListMergeMin(cells.map((cell, index) => drawList({ key: String(cell), maxWidth: columns[index][1] })));
    const FullLine: Canvas = drawDottedLine({
        width,
        height: 30,
        startX: 15,
        startY: 15,
        endX: width,
        endY: 15,
        radius: 2,
        gap: 10,
        color: "#a8a8a8"
    });
    const list = [drawRow(columns.map(([name]) => name)), FullLine, ...rows.flatMap(row => [drawRow(row), FullLine])];
    const [title, table, tips, event] = await Promise.all([
        drawTitle('T10时速排名', `${serverNameFullList[server]} ${subtitle}`),
        drawDatablock({ list }),
        drawTips({ text: timeTips, maxWidth: width }),
        eventInfo,
    ]);
    const images = event ? [title, table, tips, event] : [title, table, tips];
    return [await outputFinalBuffer({ imageList: images, compress })];
}

export async function drawTopRateSleep(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean,apiData?:object): Promise<Array<Buffer | string>> {
    mainServer = checkCutoffEventIfNeedFallbackToUpperServer(eventId,mainServer)
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);
    /*
    if (cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }
    */


    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    await cutoffEventTop.initFull(0);
    if(!playerId){
        var userInRankings = cutoffEventTop.getLatestRanking();
        playerId = userInRankings[tier-1].uid
        console.log(playerId)
    }
    var all = [];
    const timeColumnWidth = 560
    var breakTime = 1490000 // 如果间隔相差25min则认定为休息
    const playerRating = getRatingByPlayer(cutoffEventTop.points, playerId) // 按照最近到最远排名
    // console.log(playerId)
   // console.log(playerRating)
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

    var all = [];

    all.push(await drawTitle('查停摆', `${serverNameFullList[mainServer]}`));
    {
        const list: Array<Image | Canvas> = [];
        // var event = new Event(eventId);
        // all.push(await drawEventDatablock(event, [mainServer]));
        //名片
        var widthMax = timeColumnWidth+timeColumnWidth+270
        var userInRankings = cutoffEventTop.getLatestRanking();
        var drawPlayerRankingInListPromise1 = []
        for (let i = 0; i < userInRankings.length; i++) {
            if (playerId && userInRankings[i].uid != playerId || tier && tier != i + 1) {
                continue
            }
            playerId = userInRankings[i].uid
            var user = cutoffEventTop.getUserByUid(playerId);
            drawPlayerRankingInListPromise1.push(drawPlayerRankingInList(user, 'white', mainServer,widthMax))
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
            all.push(await drawDatablock({ list, maxWidth: 400+400+200+200+250 }))
        }
        else 
            return [`玩家当前不在${serverNameFullList[mainServer]}: 活动${eventId}前十名里`]
    }
  
    const drawCutoffEventTopChartPromise = drawCutoffEventTopChart(cutoffEventTop, false, mainServer,playerId,widthMax,900).catch(err => {
        logger('drawCutoffEventTopChart error:', err);
        return null;
    });
    var list = [], imageList = []
    //下面是ai生成的
// 分割线

const FullLine2: Canvas = drawDottedLine({
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

list.push(drawListMergeMin([
    await drawList({ key: '开始时间', maxWidth: timeColumnWidth }),
    await drawList({ key: '结束时间', maxWidth: timeColumnWidth }),
    await drawList({ key: '停摆时长', maxWidth: 270 }),
]))
list.push(FullLine2)
// 数据行
for (let j = allCount> 10? allCount -10 : 0; j < allCount; j++) {    // 人工注：只允许查后10

    


    imageList.push(drawListMergeMin([
        await drawList({ key: `${changeTimefomant(breakTimeSt[j], undefined, true)}`, maxWidth: timeColumnWidth }),
        await drawList({ key: `${changeTimefomant(breakTimeEd[j], undefined, true)}`, maxWidth: timeColumnWidth }),
        await drawList({ key: `${changeTimePeriodFormat(breakTimeEd[j] - breakTimeSt[j],false)}`, maxWidth: 270 }),
    ]))

    imageList.push(FullLine2)
}
list.push(...imageList)
list.push(await drawCutoffEventTopChartPromise)
all.push(await drawDatablock({ list}))
    all.push(await drawEventDatablockPromise)

    /*
    for(var j = 0;j<allCount;j++){
        console.log(`${changeTimeSt[j]} - ${changeTimeEd[j]}  ${changeTimeCounts[j]}  ${changeTimeTotalPts[j]}`)
    }
    */
    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })
    return [buffer]

    for(var j = 0;j<allCount;j++){
        console.log(`${breakTimeSt[j]} - ${breakTimeEd[j]} `)
    }
    return ['Check Console']
}

export async function drawTopRateChanged(eventId: number, playerId: number, tier: number, maxCount: number, mainServer: Server, compress: boolean,apiData?:object): Promise<Array<Buffer | string>> {
    mainServer = checkCutoffEventIfNeedFallbackToUpperServer(eventId,mainServer)
    var cutoffEventTop = new CutoffEventTop(eventId, mainServer);

    /*
    if (cutoffEventTop.status != "in_progress") {
        return [`当前主服务器: ${serverNameFullList[mainServer]}没有进行中的活动`]
    }
    */
    var event = new Event(eventId);
    const drawEventDatablockPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });
    await cutoffEventTop.initFull(0);
    if(playerId == undefined){
        var userInRankings = cutoffEventTop.getLatestRanking();
        playerId = userInRankings[tier-1].uid
    }
    //console.log(playerId)
    var all = [];
    var breakTime = 1500000 // 如果间隔相差15min则认定为休息
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
    var oldTime =0;
    for(var i = playerRating.length-1;i>0;i--){   //从尾倒回头,[i-1]永远要比[i]分数高,反向读取进fixPlayerRating
        if (playerRating[i].value == -1) {
        if(fixPlayerRating.length>0) fixPlayerRating[fixPlayerRating.length-1].isContinuous =false
        continue}
        var isContinuousStatus = false
        
        if(playerRating[i].value == oldValue) {
         if (playerRating[i-1].time-playerRating[i].time > breakTime) fixPlayerRating[fixPlayerRating.length-1].isContinuous =false
        continue
        }
        if(playerRating[i].value == playerRating[i-1].value)  isContinuousStatus = true
        oldValue = playerRating[i].value
        fixPlayerRating.push({time:playerRating[i].time,value:playerRating[i].value,isContinuous:isContinuousStatus,part:0})
    }
    // 这样处理完毕后，fixPlayerRating中就不会存在相同的value，以及value为-1的参数
    // 接下来开始处理fixPlayerRating，此时fixPlayerRating已经是从低到高排序了
    var tempSt = 0
    var tempEt = 0
    var isProcessing = false// 判定当前是新段还是旧段处理中
    var totalCount = 0
    var totalPts = 0
    var partIndex =0
    for(var i  = 1;i<fixPlayerRating.length;i++){

        if (fixPlayerRating[i].time-fixPlayerRating[i-1].time>=breakTime ){
            partIndex++
        }

        fixPlayerRating[i].part = partIndex
    }
    var partIndexRuntime = -1
    var  statusOKIndex = 2
    for(var i = 1;i<fixPlayerRating.length;i++){
        if(fixPlayerRating[i].time - fixPlayerRating[i-1] < breakTime) {    // 寻昭可以开始计算的Index
            statusOKIndex = i
            break
        }
    }
    
    for(var i  = statusOKIndex;i<fixPlayerRating.length;i++){ // 从第四个开始，因为第一个通常不准。
        if (partIndexRuntime == -1){    // 初始状态，初始化
            totalCount++
            tempSt =fixPlayerRating[i].time
            tempEt =fixPlayerRating[i].time
            //allCount++
            totalPts +=(fixPlayerRating[i].value - fixPlayerRating[i-1].value)
            partIndexRuntime=fixPlayerRating[i].part
            continue
         }
        if (fixPlayerRating[i].part>partIndexRuntime){//结束了上一轮但是由于上一轮没有统计分数，因此在这里统计
            allCount++
            //totalCount++
            //totalPts +=fixPlayerRating[i].value - fixPlayerRating[i-1].value
            if (tempSt == tempEt) tempSt -=(2*1000*60)
            changeTimeSt.push(tempSt)
            changeTimeEd.push(tempEt)
            changeTimeCounts.push(totalCount)
            changeTimeTotalPts.push(totalPts)
            totalCount=0
            tempEt=0
            tempSt=fixPlayerRating[i].time
            totalPts=0
            partIndexRuntime =fixPlayerRating[i].part   // 标记最新的Part
         }


        if (fixPlayerRating[i].part==partIndexRuntime){ 
            if (fixPlayerRating[i-1].isContinuous && fixPlayerRating[i-1].part!=partIndexRuntime){ // 如果上一个part跟这个part不一样，即新分段，如果是连续的 
                totalCount++
                tempEt =fixPlayerRating[i].time
                totalPts +=fixPlayerRating[i].value - fixPlayerRating[i-1].value    // 这里要注意，
            }
            if (fixPlayerRating[i-1].part==partIndexRuntime){   // 如果是连续的一段
                totalCount++
                tempEt =fixPlayerRating[i].time
                totalPts +=fixPlayerRating[i].value - fixPlayerRating[i-1].value    // 这里要注意，
            }
            tempEt =fixPlayerRating[i].time
            //如果上一段不标记连续，则是新的开始，跳过
         }
         if (i == fixPlayerRating.length-1){//处理最后一个分数
            allCount++
            if (tempSt == tempEt) tempSt -=(2*1000*60)
            changeTimeSt.push(tempSt)
            changeTimeEd.push(tempEt)
            changeTimeCounts.push(totalCount)
            changeTimeTotalPts.push(totalPts)
         }
    }
    var all = [];
    const timeColumnWidth = 560
    var widthMax = timeColumnWidth+timeColumnWidth+200+200+250
    all.push(await drawTitle('查变动', `${serverNameFullList[mainServer]}`));
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
            drawPlayerRankingInListPromise1.push(drawPlayerRankingInList(user, 'white', mainServer,widthMax))
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
            all.push(await drawDatablock({ list, maxWidth: 400+400+200+200+250 }))
        }
        else 
            return [`玩家当前不在${serverNameFullList[mainServer]}: 活动${eventId}前十名里`]
    }
    var list = [], imageList = []
    
    const drawCutoffEventTopChartPromise = drawCutoffEventTopChart(cutoffEventTop, false, mainServer,playerId,widthMax,900).catch(err => {
        logger('drawCutoffEventTopChart error:', err);
        return null;
    });
    //下面部分是ai生成的
// 分割线

const FullLine2: Canvas = drawDottedLine({
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

list.push(drawListMergeMin([
    await drawList({ key: '开始时间', maxWidth: timeColumnWidth }),
    await drawList({ key: '结束时间', maxWidth: timeColumnWidth }),
    await drawList({ key: '变动次数', maxWidth: 200 }),
    await drawList({ key: '把均Pt', maxWidth: 200 }),
    await drawList({ key: '总变动Pt', maxWidth: 250 }),
]))
list.push(FullLine2)
// 数据行
var totalTimes = 0
for(let h = 0;h<allCount;h++){
    totalTimes +=(changeTimeEd[h] - changeTimeSt[h])
}
for (let j = allCount> 100? allCount -100 : 0; j < allCount; j++) {    // 人工注：只允许查后10

    // 把均Pt = 总变化Pt / 次数（避免除 0）
    const avgPt = changeTimeCounts[j] > 0 
        ? Math.floor(changeTimeTotalPts[j] / changeTimeCounts[j])
        : "0"
    imageList.push(drawListMergeMin([
        await drawList({ key: `${changeTimefomant(changeTimeSt[j], undefined, true)}`, maxWidth: timeColumnWidth }),
        await drawList({ key: `${changeTimefomant(changeTimeEd[j], undefined, true)}`, maxWidth: timeColumnWidth }),
        await drawList({ key: `${changeTimeCounts[j]}`, maxWidth: 200 }),
        await drawList({ key: `${avgPt}`, maxWidth: 200 }),
        await drawList({ key: `${changeTimeTotalPts[j]}`, maxWidth: 250 }),
    ]))

    imageList.push(FullLine2)
}
list.push(...imageList)
var eventNowTimestamp = Date.now() - event.startAt[mainServer]
var avgPerDayTimesPresent = totalTimes / eventNowTimestamp

var avePerDayTimes = Math.floor(86400000 * avgPerDayTimesPresent)
//console.log(eventNowTimestamp,avgPerDayTimesPresent,avePerDayTimes)

list.push(await drawList({ key: `有效数据内总计：${changeTimePeriodFormat(totalTimes,false)} | 平均每天：${changeTimePeriodFormat(avePerDayTimes,false)}`, maxWidth: 1250 }))
list.push(await drawCutoffEventTopChartPromise)
all.push(await drawDatablock({ list}))
    all.push(await drawEventDatablockPromise)
    /*
    for(var j = 0;j<allCount;j++){
        console.log(`${changeTimeSt[j]} - ${changeTimeEd[j]}  ${changeTimeCounts[j]}  ${changeTimeTotalPts[j]}`)
    }
    */
    var buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, compress: compress, })
    return [buffer]
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

function getPossibleRoom (data,uid){
    //return '无数据'
    if (!data) return '猜不透'
    try{
        for(let i = 0;i<data.length;i++){
            if (data[i].includes(uid)) return '房间' + String.fromCharCode(65 +i)
        }
        return '猜不透'
    }
    catch{
        return '猜不透'
    }

}

export function labelEventTopRooms(valueChangeData: number[][], uidSort: number[]): string[] {
    let rooms: number[][] = []
    try {
        const inferred = inferPossibleRoomsByScoreChange(valueChangeData, uidSort)
        if (Array.isArray(inferred)) rooms = inferred
    } catch (error) {
        logger('labelEventTopRooms error:', error)
    }
    return uidSort.map(uid => getPossibleRoom(rooms, uid))
}

export function compareSameDataArray(arr1,arr2){       // 判断两个数组是否包含相同的数据
    if (arr1.length != arr2.length) return false
    var tempArr = []
    for (let i = 0;i<arr1.length;i++){
        if (!tempArr.includes(arr1[i])){
            tempArr.push(arr1[i])
            var count1 = 0  // 判断相同元素
            var count2 = 0
            for(var i1 of arr1){
                if (i1 === arr1[i] || isNaN(i1))  count1 ++
            }
            for (var j1 of arr2){
                if (j1 === arr1[i] || isNaN(j1))  count2 ++
            }
            if (count1 != count2)
                return false
        }
    }
    return true
}
// 猜房间
// 首先取出要猜UID（参数UID）出现变动时，跟着一起变的用户
// 然后对于整个小时数据而言，出现总数量相同，且变动数量相同的用户，则可以百分百确认时同一个房间的
// 对于变动稍有出入的用户来说，允许设置一定的偏移去应对可能出现的掉线等情况从而无法记录。
const EVENT_TOP_ROOM_SIZE = 5;

function inferSureRoomsByScoreChange(valueChangeData: number[][],uid: number,dupUid: number[] = []){
    // 首先，将当前uid发生变动的提取出来
    var currentUidChange = []   // 这个array的length就是代表当前uid总变动次数
    for(let uidArray of valueChangeData){
        if (uidArray.includes(uid) && uidArray.length < 11) currentUidChange.push(uidArray)
    }
    var tempUidList = []    // 临时uidList，用于标记与当前查询uid分数一起变动的其他uid列表
    var tempUidListAppearCount = [] // 临时uidList中的uid在pointData中出现的总次数
    var tempUidListAppearCountInCurrentUidChange = [] // 临时uidList中的uid在currentUidChange中出现的总次数

    for(let uidArray of currentUidChange){  // 标记所有一同更改过的uid
        for(let uid2 of uidArray){
            if (!tempUidList.includes(uid2))tempUidList.push(uid2)
        }
    }
    for(let i =0;i<tempUidList.length;i++){ // 遍历tempUidList，将出现次数增加进入tempUidListAppearCount
        let appearCount = 0
        for(let uidArray of valueChangeData){
            if (uidArray.includes(tempUidList[i])) {
                appearCount++
            }
        }
        tempUidListAppearCount.push(appearCount)
    }
    for(let i =0;i<tempUidList.length;i++){ // 遍历currentUidChange，将出现次数增加进入tempUidListAppearCount
        let appearCount = 0
        for(let uidArray of currentUidChange){
            if (uidArray.includes(tempUidList[i])) {
                appearCount++
            }
        }
        tempUidListAppearCountInCurrentUidChange.push(appearCount)
    }
    var sureAtSameRoom = [] // 完全确认是在同一个房间的
    // 先把最有可能时同一个房间的uid加起来
    for(let i = 0;i<tempUidList.length;i++){    // 严格模式下。优先添加
        // 参数UID与待查UID占整个时段的变动次数，取大
        var largeCountInTotal = (tempUidListAppearCount[i] > currentUidChange.length)?tempUidListAppearCount[i]:currentUidChange.length
        // 参数UID与待查UID占整个时段的变动次数，取小
        var smallCountInTotal = (tempUidListAppearCount[i] > currentUidChange.length)?currentUidChange.length:tempUidListAppearCount[i]
        // 参数UID与待查UID占与 参数UID 一起变动 的变动次数，取大
        var largeCountInPart = (tempUidListAppearCountInCurrentUidChange[i] < currentUidChange.length)?currentUidChange.length:tempUidListAppearCountInCurrentUidChange[i]
        // 参数UID与待查UID占与 参数UID 一起变动 的变动次数，取小
        var smallCountInPart = (tempUidListAppearCountInCurrentUidChange[i] > currentUidChange.length)?currentUidChange.length:tempUidListAppearCountInCurrentUidChange[i]
        if (largeCountInTotal == smallCountInTotal && largeCountInPart == smallCountInPart && sureAtSameRoom.length < EVENT_TOP_ROOM_SIZE && !dupUid.includes(tempUidList[i])){
            sureAtSameRoom.push(tempUidList[i])     // 确认是在一个房间的
        }
    }
    return sureAtSameRoom
}

function inferPossibleRoomsByScoreChange(valueChangeData: number[][] = [],uidSort?: number[]){
    //console.log('test')
    //console.log(valueChangeData)
    var finalResultOut = []
    var uidTotalList: number[] = []
    var dupUid = []
    var totalChangeCount = 0    // 总变动次数，是否启用严格模式。处于严格模式下，只允许绝对确认
    
    const strictCount = 305
    const sameRoomRatioConfidence = 0.86  // 同房倍率
    const sameRoomRatioToTotalConfidence = 0.76  // 同房 / 总出现次数 > 0.76
    const minTogetherCount = 10    // 最小同房数量
    for(let t of valueChangeData){
        if (!uidSort){
            for(let t1 of t){
                if (!uidTotalList.includes(t1)) uidTotalList.push(t1)
            }
        }
        totalChangeCount += t.length
    }
    //console.log(totalChangeCount)
    const strictMode = totalChangeCount>=strictCount ?true:false
    // 为了在后来的结算中排除这些已经高度绑定的结果
    var sureMap = new Map<number,any[]>()  // uid对应的其他绝对同房uid
    var sureAtSameRoomUidList = []
    var sureAtSameRoomUidListFirst = []
    if (uidSort) uidTotalList = uidSort
    for(let uid of uidTotalList){
        if (sureAtSameRoomUidList.includes(uid)) continue   // 性能优化
        var sureSameUidList = inferSureRoomsByScoreChange(valueChangeData,uid)
        if (sureSameUidList.length > 1){
            for(let sureSameUid of sureSameUidList){
                if (!sureAtSameRoomUidList.includes(sureSameUid)){
                    sureAtSameRoomUidList.push(sureSameUid)
                    sureMap.set(uid,sureSameUidList)
                }
                //console.log(sureSameUidList)
                /*
                if (sureSameUidList.length==5){   // 对于已经是等于5个的，直接push进去，不再参与循环
                    console.log(sureSameUidList)
                    sureSameUidList.forEach(x=>dupUid.push(x))
                }
                    */
                if (!sureAtSameRoomUidListFirst.includes(uid))  sureAtSameRoomUidListFirst.push(uid)   // 吧同房的第一个uid push进去
            }
        
        }
        
    }
    for(let utl = 0;utl<uidTotalList.length;utl++){
        if (dupUid.includes(uidTotalList[utl])) continue  // 掩耳盗铃，但是确实可以避免一些问题
        var finalResultIn = []
        var uid = uidTotalList[utl]
        //if (uid == 0) uid = 1000522880
        // 首先，将当前uid发生变动的提取出来
        var currentUidChange = []   // 这个array的length就是代表当前uid总变动次数
        for(let uidArray of valueChangeData){
            if (uidArray.includes(uid) && uidArray.length < 11) currentUidChange.push(uidArray)
        }
        var tempUidList = []    // 临时uidList，用于标记与当前查询uid分数一起变动的其他uid列表
        var tempUidListAppearCount = [] // 临时uidList中的uid在pointData中出现的总次数
        var tempUidListAppearCountInCurrentUidChange = [] // 临时uidList中的uid在currentUidChange中出现的总次数

        for(let uidArray of currentUidChange){  // 标记所有一同更改过的uid
            for(let uid2 of uidArray){
                if (!tempUidList.includes(uid2))tempUidList.push(uid2)
            }
        }
        for(let i =0;i<tempUidList.length;i++){ // 遍历tempUidList，将出现次数增加进入tempUidListAppearCount
            let appearCount = 0
            for(let uidArray of valueChangeData){
                if (uidArray.includes(tempUidList[i])) {
                    appearCount++
                }
            }
            tempUidListAppearCount.push(appearCount)
        }
        for(let i =0;i<tempUidList.length;i++){ // 遍历currentUidChange，将出现次数增加进入tempUidListAppearCount
            let appearCount = 0
            for(let uidArray of currentUidChange){
                if (uidArray.includes(tempUidList[i])) {
                    appearCount++
                }
            }
            tempUidListAppearCountInCurrentUidChange.push(appearCount)
        }
        var sureAtSameRoom = inferSureRoomsByScoreChange(valueChangeData,uid,dupUid) // 完全确认是在同一个房间的
        console.log(utl,sureAtSameRoom)
        var possibleAtSameRoom = [] // 可能在同一个房间的Uid
        var possibleAtSameRoomRatio = [] // 可能在同一个房间的可能概率
        let possibleAtSameRoomTemp = []
        let possibleAtSameRoomRatioTemp = []
        const roomLeft = EVENT_TOP_ROOM_SIZE - sureAtSameRoom.length
        const qualifiedCandidates = new Map<number, { rule: 1 | 2; members: number[] }>()
        const eligibleMembers = new Set<number>(sureAtSameRoom)
        if (!strictMode && roomLeft > 0) {
            for (let i = 0; i < tempUidList.length; i++) {
                const candidate = tempUidList[i]
                const candidateChanges = tempUidListAppearCount[i]
                const together = tempUidListAppearCountInCurrentUidChange[i]
                if (together < minTogetherCount || dupUid.includes(candidate) || sureAtSameRoom.includes(candidate)) continue

                let rule: 1 | 2
                if (together / Math.max(candidateChanges, currentUidChange.length) > sameRoomRatioConfidence) {
                    rule = 1
                } else if (candidateChanges < currentUidChange.length && together / candidateChanges > sameRoomRatioConfidence) {
                    rule = 2
                } else {
                    continue
                }

                const members = (sureMap.get(candidate) ?? [candidate]).filter(member => !dupUid.includes(member))
                qualifiedCandidates.set(candidate, { rule, members })
                for (const member of members) eligibleMembers.add(member)
            }
        }
        // Only compare alternatives when the eligible players cannot all fit in this room.
        const hasOverflow = eligibleMembers.size > EVENT_TOP_ROOM_SIZE
        let skipCompare = false
        for(let i = 0;i<tempUidList.length;i++){
            // 26.9.23： 如果sureAtSameRoomUidList.includes，则表示主动跳过同房的列表，导致同房会单独另起一个房间
            //if (sureAtSameRoomUidList.includes(tempUidList[i]))continue

            if (sureAtSameRoom.includes(tempUidList[i]))continue
            //if (sureAtSameRoom.length>=5)break
            if (strictMode)break
            // 参数UID与待查UID占整个时段的变动次数，取大
            let largeCountInTotal = (tempUidListAppearCount[i] > currentUidChange.length)?tempUidListAppearCount[i]:currentUidChange.length
            // 参数UID与待查UID一起变动的次数
            let smallCountInPart = (tempUidListAppearCountInCurrentUidChange[i] > currentUidChange.length)?currentUidChange.length:tempUidListAppearCountInCurrentUidChange[i]
            // 2026-08-31: 从绝对同房中寻找是否有更好的同房列表。例如跟当前跟同房A 同房B都符合条件，但是同房B的条件更加符合，因此跳过。
            // 比例更高还不够：漏拍次数相同只是各漏了不同的一拍。只有锚点漏拍更少，才算另一间更紧的房。
            //console.log(`${uid} VS ${tempUidList[i]} 总出现次数：${currentUidChange.length}  ${tempUidList[i]} 总出现次数：${tempUidListAppearCount[i]} 同时变动次数：${tempUidListAppearCountInCurrentUidChange[i]} 待查UID同时变动 / 当前查询总变动：${tempUidListAppearCountInCurrentUidChange[i] /currentUidChange.length}`)
            //console.log(tempUidList[i],dupUid.includes(tempUidList[i]))
            if (smallCountInPart>= minTogetherCount && !dupUid.includes(tempUidList[i])){     // 最小同房次数且 UID 未分组
                const candidate = qualifiedCandidates.get(tempUidList[i])
                if (candidate?.rule === 1) {

                    let ratioValue = smallCountInPart /largeCountInTotal    // 记录当前的可能度
                    let findGreaterResult = false
                    for (let m = 0; hasOverflow && m < sureAtSameRoomUidListFirst.length; m++) {
                        let index = findIndexOfArray(tempUidList,sureAtSameRoomUidListFirst[m])
                        if (tempUidList[index] == uid ||tempUidList[index]==tempUidList[i] ) continue // 重复uid不判断
                        if (index == -1) break
                        let largeCountInTotalNew = (tempUidListAppearCount[index] > currentUidChange.length)?tempUidListAppearCount[index]:currentUidChange.length
                        let smallCountInPartNew = (tempUidListAppearCountInCurrentUidChange[index] > currentUidChange.length)?currentUidChange.length:tempUidListAppearCountInCurrentUidChange[index]
                        let ratioValueOfSameRoomUid = smallCountInPartNew / largeCountInTotalNew
                        let missCount = largeCountInTotal - smallCountInPart
                        let missCountNew = largeCountInTotalNew - smallCountInPartNew
                        if (ratioValueOfSameRoomUid > ratioValue && missCountNew < missCount){
                            console.log(`G1: 判定同房 ${uid} 总出现次数：${currentUidChange.length}  ${tempUidList[i]} 总出现次数：${tempUidListAppearCount[i]} 同时变动次数：${tempUidListAppearCountInCurrentUidChange[i]} 最小同房/最大变动次数：${smallCountInPart /largeCountInTotal} > ${sameRoomRatioConfidence} 漏拍：${missCount}`)
                            console.log(`G1: 更好的结果 - 判定同房 ${uid} 总出现次数：${currentUidChange.length}  ${tempUidList[index]} 总出现次数：${tempUidListAppearCount[index]} 同时变动次数：${tempUidListAppearCountInCurrentUidChange[index]} 最小同房/最大变动次数：${smallCountInPartNew / largeCountInTotalNew} > ${sameRoomRatioConfidence} 漏拍：${missCountNew}`)
                            findGreaterResult = true
                            break
                        }
                    }
                    if (!findGreaterResult){
                        const matchedRatio = smallCountInPart / largeCountInTotal
                        for (const sml of candidate.members){
                            if (possibleAtSameRoomTemp.includes(sml) || sureAtSameRoom.includes(sml)) continue
                            possibleAtSameRoomTemp.push(sml)
                            possibleAtSameRoomRatioTemp.push(matchedRatio)
                        }

                        console.log(`G1: 判定同房 ${uid} 总出现次数：${currentUidChange.length}  ${tempUidList[i]} 总出现次数：${tempUidListAppearCount[i]} 同时变动次数：${tempUidListAppearCountInCurrentUidChange[i]} 最小同房/最大变动次数：${smallCountInPart /largeCountInTotal} > ${sameRoomRatioConfidence} / 规则1`)
                    }
                    if (findGreaterResult) continue
                }
                else if (candidate?.rule === 2) {
                    // 如果 当前查询UID的变动 大于等于 待查UID同时变动 且 （待查UID同时变动 / 待查UID总变动） >  sameRoomRatioToTotalConfidence(0.76)(10/13) 且 
                    // 这个是给刚入局的用的。例如中途加入了某个车。与规则3互相形成互补。
                    // 因过于宽松26-06-18起调整倍率为与sameRoomRatio一致。原倍率sameRoomRatioToTotalConfidence暂时不用
                    let ratioValue = smallCountInPart /largeCountInTotal    // 记录当前的可能度
                    let findGreaterResult = false // 是否找到更好的结果
                    for (let m = 0; hasOverflow && m < sureAtSameRoomUidListFirst.length; m++) {
                        let index = findIndexOfArray(tempUidList,sureAtSameRoomUidListFirst[m])
                        if (index == -1) break
                        if (tempUidList[index] == uid ||tempUidList[index]==tempUidList[i]) continue // 重复uid不判断
                        if (tempUidListAppearCount[index] < currentUidChange.length && currentUidChange.length >= tempUidListAppearCountInCurrentUidChange[index]){
                            let largeCountInTotalNew = (tempUidListAppearCount[index] > currentUidChange.length)?tempUidListAppearCount[index]:currentUidChange.length
                            let smallCountInPartNew = (tempUidListAppearCountInCurrentUidChange[index] > currentUidChange.length)?currentUidChange.length:tempUidListAppearCountInCurrentUidChange[index]
                            let missCount = largeCountInTotal - smallCountInPart
                            let missCountNew = largeCountInTotalNew - smallCountInPartNew
                            if ((smallCountInPartNew / largeCountInTotalNew) > ratioValue && missCountNew < missCount){
                                findGreaterResult = true
                                console.log(`G2: 判定同房 ${uid} 总出现次数：${currentUidChange.length}  ${tempUidList[i]} 总出现次数：${tempUidListAppearCount[i]} 同时变动次数：${tempUidListAppearCountInCurrentUidChange[i]} 待查UID同时变动 / 待查UID总变动：${tempUidListAppearCountInCurrentUidChange[i] / tempUidListAppearCount[i]} > ${sameRoomRatioConfidence} 漏拍：${missCount}`)
                                console.log(`G2: 更好的结果 - 判定同房 ${uid} 总出现次数：${currentUidChange.length}  ${tempUidList[index]} 总出现次数：${tempUidListAppearCount[index]} 同时变动次数：${tempUidListAppearCountInCurrentUidChange[index]} 待查UID同时变动 / 待查UID总变动：${tempUidListAppearCountInCurrentUidChange[index] / tempUidListAppearCount[index]} > ${sameRoomRatioConfidence} 漏拍：${missCountNew}`)
                                break
                            }
                        }
                    }
                    if (!findGreaterResult){
                        const matchedRatio = smallCountInPart / largeCountInTotal
                        for (const sml of candidate.members){
                            if (possibleAtSameRoomTemp.includes(sml) || sureAtSameRoom.includes(sml)) continue
                            possibleAtSameRoomTemp.push(sml)
                            possibleAtSameRoomRatioTemp.push(matchedRatio)
                        }
                        console.log(`G2: 判定同房 ${uid} 总出现次数：${currentUidChange.length}  ${tempUidList[i]} 总出现次数：${tempUidListAppearCount[i]} 同时变动次数：${tempUidListAppearCountInCurrentUidChange[i]} 待查UID同时变动 / 待查UID总变动：${tempUidListAppearCountInCurrentUidChange[i] / tempUidListAppearCount[i]} > ${sameRoomRatioConfidence} / 规则2`)
                    }
                    if (findGreaterResult) continue
                }
                // 如果当前查询UID变动小于待查UID变动呢？
                else if(roomLeft > possibleAtSameRoomTemp.length && currentUidChange.length >= tempUidListAppearCountInCurrentUidChange[i] && (tempUidListAppearCountInCurrentUidChange[i] /currentUidChange.length) > sameRoomRatioToTotalConfidence && tempUidListAppearCount[i] > currentUidChange.length){           // 如果最小同房次数 / 最大房间数量 > sameRoomRatioConfidence比例
                    // 房间已满 5 人就不再记规则3。满员后没有空位，也不能把当前房间整间推迟。
                    // 如果 当前查询UID的变动 大于等于 待查UID同时变动 且 （待查UID同时变动 / 当前查询总变动） >  sameRoomRatioToTotalConfidence(0.76)(10/13)
                    if(!skipCompare)skipCompare = true  // 让后面的流程来匹配
                    console.log(`数值偏少但可能同房 ${uid} 总出现次数：${currentUidChange.length}  ${tempUidList[i]} 总出现次数：${tempUidListAppearCount[i]} 同时变动次数：${tempUidListAppearCountInCurrentUidChange[i]} 待查UID同时变动 / 当前查询总变动：${tempUidListAppearCountInCurrentUidChange[i] /currentUidChange.length} > ${sameRoomRatioToTotalConfidence} / 规则3`)
                }else{
                    //console.log(`${uid}判定与${tempUidList[i]}不同房: ${uid} 总出现次数：${currentUidChange.length}  ${tempUidList[i]} 总出现次数：${tempUidListAppearCount[i]} 同时变动次数：${tempUidListAppearCountInCurrentUidChange[i]} 待查UID同时变动 / 当前查询总变动：${tempUidListAppearCountInCurrentUidChange[i] /currentUidChange.length} > ${sameRoomRatioToTotalConfidence}`)
                }
            }else{
                //console.log(`${uid}判定与${tempUidList[i]}不同房: ${uid} 总出现次数：${currentUidChange.length}  ${tempUidList[i]} 总出现次数：${tempUidListAppearCount[i]} 同时变动次数：${tempUidListAppearCountInCurrentUidChange[i]} 待查UID同时变动 / 当前查询总变动：${tempUidListAppearCountInCurrentUidChange[i] /currentUidChange.length} > ${sameRoomRatioToTotalConfidence}`)
            }
        }
        if (skipCompare == true && possibleAtSameRoomTemp.length <1) continue
        if (roomLeft > 0 && possibleAtSameRoomTemp.length >roomLeft){
            // 交换函数
            const swap = function (arr: number[],lNumber:number,rNumber:number){
                if(lNumber == rNumber) return
                let old = arr[lNumber]
                arr[lNumber] = arr[rNumber]
                arr[rNumber] = old
            }
            const qs = function(arr: number[], left, right){
            left = typeof left != 'number' ? 0 : left,
                right = typeof right != 'number' ? arr.length - 1 : right;
                if (left>=right) return 
                let pivot  = left
                let index = pivot+1
                for(let l = index ;l<=right;l++){
                    if (arr[l] > arr[pivot]) {
                        swap(arr, l, index);
                        swap(possibleAtSameRoomTemp,l,index)
                        index++;
                    }   
                }
                    // 此时index是所有小于pivot的值的总和+1
                    // pivot此时还在第一位，至于两数组中间
                    // 3214567 此时index是3（对应数组1）
                    //    1      2        3       4       5
                    // 3214567 3214567 3412567 3452167 3456127      …   3456721
                    //    1       1        2      3        4       
                    // 3跟1交换，即1234567
                swap(arr, pivot, index - 1)
                swap(possibleAtSameRoomTemp, pivot, index - 1)     
                qs(arr,left,index-2) // 12排序
                qs(arr,index,right)// 4567排序
            }
            qs(possibleAtSameRoomRatioTemp,0,possibleAtSameRoomRatioTemp.length-1)
            console.log('---------候选前----------')
            console.log(possibleAtSameRoomTemp)
            console.log(possibleAtSameRoomRatioTemp)
                //此时排序好了
            let gaps = (1-sameRoomRatioConfidence)/2.5
            possibleAtSameRoom.push(possibleAtSameRoomTemp[0])
            for(let i =0;i<possibleAtSameRoomTemp.length-1;i++){

                if (possibleAtSameRoom.length>=roomLeft) break
                let o =possibleAtSameRoomRatioTemp[i]
                let n =possibleAtSameRoomRatioTemp[i+1]
                if (o-n <gaps && i<=roomLeft){
                    possibleAtSameRoom.push(possibleAtSameRoomTemp[i+1])
                } //尝试从大于5个房间中再细分两到三个房间
                else{
                    break
                }
            }
            console.log('---------候选后----------')
            console.log(possibleAtSameRoom)
            console.log(possibleAtSameRoomRatioTemp)
            console.log('--------候选结束---------')
        }
        else if (roomLeft > 0){
            for(let d of possibleAtSameRoomTemp){
                possibleAtSameRoom.push(d)
            }
        }
        
        for(let f of sureAtSameRoom){
            if (finalResultIn.length < EVENT_TOP_ROOM_SIZE){
                finalResultIn.push(f)
                dupUid.push(f)
            }
        }
        for(let f of possibleAtSameRoom){
            if (finalResultIn.length < EVENT_TOP_ROOM_SIZE && !finalResultIn.includes(f)){
                finalResultIn.push(f)
                dupUid.push(f)
            }
        }
        if (finalResultIn.length != 0)finalResultOut.push(finalResultIn)
    }
    //console.log(finalResultOut)
    return finalResultOut
}

function getPlayerRatingChanges(playerRating: Array<{
    time: number,
    value: number
}>, begin?: number, end?: number, limit?: TopRateLimit, maxSampleGap?: number): PlayerRatingChange[] {
    const result: PlayerRatingChange[] = []
    for (let i = 0; i + 1 < playerRating.length; i += 1) {
        if (playerRating[i].value == -1 || playerRating[i + 1].value == -1) {
            continue
        }
        if (playerRating[i].value == playerRating[i + 1].value) {
            continue
        }
        if (maxSampleGap !== undefined) {
            const sampleGap = playerRating[i].time - playerRating[i + 1].time;
            if (sampleGap <= 0 || sampleGap > maxSampleGap) continue;
        }
        const score = playerRating[i].value - playerRating[i + 1].value
        if (limit?.min != undefined && (limit.minInclusive ? score < limit.min : score <= limit.min)) {
            continue
        }
        if (limit?.max != undefined && (limit.maxInclusive ? score > limit.max : score >= limit.max)) {
            continue
        }
        const time = (playerRating[i + 1].time + playerRating[i].time) / 2
        if (begin != undefined && time < begin) {
            continue
        }
        if (end != undefined && time >= end) {
            continue
        }
        result.push({ time, score })
    }
    return result
}

function getEventDayRange(startAt: number, server: Server, day: number): { begin: number, end: number } {
    const offsetMs = getServerUtcOffset(server) * 60 * 60 * 1000
    const eventStartAtTime = normalizeTimestamp(startAt)
    const serverStartTime = eventStartAtTime + offsetMs
    const startDate = new Date(serverStartTime)

    const firstDayEndServerTime =
        serverStartTime +
        ((86400000 + 4 * 60 * 60 * 1000)
            - startDate.getUTCHours() * 60 * 60 * 1000
            - startDate.getUTCMinutes() * 60 * 1000
            - startDate.getUTCSeconds() * 1000
            - startDate.getUTCMilliseconds())

    const firstDayEndTime = firstDayEndServerTime - offsetMs
    if (day <= 1) {
        return {
            begin: eventStartAtTime,
            end: firstDayEndTime,
        }
    }
    return {
        begin: firstDayEndTime + (day - 2) * 86400000,
        end: firstDayEndTime + (day - 1) * 86400000,
    }
}
function findIndexOfArray(arr:any[],value):number{
    for(let e = 0;e<arr.length;e++){
        if (arr[e]== value){
            return e
        }
    }
    return -1
}
