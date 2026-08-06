import { callAPIAndCacheResponse } from '@/api/getApi';
import { Event } from '@/types/Event';
import { Server } from '@/types/Server';
import { Song } from '@/types/Song';
import { Image, Canvas } from 'skia-canvas';
import { drawList, line, drawListMerge } from '@/components/list';
import { drawDatablock } from '@/components/dataBlock';
import { drawBannerImageCanvas } from '@/components/dataBlock/utils';
import { drawTitle } from '@/components/title';
import { drawSongListInListWithMoreDetail, drawSongListInListWithMoreDetailKey } from '@/components/list/song';
import { outputFinalBuffer } from '@/image/output';
import { changeTimePeriodFormat, changeTimefomant } from '@/components/list/time';
import { drawEventDatablock } from '@/components/dataBlock/event';
import { logger } from '@/logger';
import { drawCutoffSongChart, CutoffSongChartEntry } from '@/components/chart/cutoffSongChart';

// 暂时全部集中在一个页面，待上游合入。
interface cutoffSongsResponse {
    result: boolean;
    cutoffs: Record<string, cutoffSongsDetail[]>;
}
interface cutoffSongsResponseVersus {
    result: boolean;
    cutoffs: cutoffSongsDetail[];
}
interface cutoffSongsDetail {
    time: number;
    ep: number;
}
const eventTypes: string[] = ['versus', 'challenge', 'medley'];
const T1_ABNORMAL_THRESHOLD = 0.977;
const T1_ABNORMAL_COLOR = '#dc3545';

export async function drawCutoffSongsDetail(eventId: number, tier: number, mainServer: Server, compress: boolean): Promise<Array<Buffer | string>> {
    const event = new Event(eventId);
    if (!event.isExist) {
        return ['错误: 活动不存在'];
    }

    await event.initFull();

    //const eventTypes: string[] = ['versus', 'challenge', 'medley'];
    // versus只有一首歌
    let isVersus = false
    if (!eventTypes.includes(event.eventType) || !event.musics || event.musics.length === 0) {
        return ['错误: 该活动不是歌榜活动或没有歌曲数据'];
    }
    const drawEventDatablockP = await drawEventDatablock(event, [mainServer]).catch(err => {
            logger('drawEventDatablock error:', err);
            return null;
        });
    const defaultServer = Server.jp;
    const songList: Song[] = [];
    for (let i = 0; i < event.musics[defaultServer].length; i++) {
        songList.push(new Song(event.musics[defaultServer][i].musicId));
    }
    //console.log(songList)

    const SongTierUrl = `https://hhwx.org/api/bandori/tracker/data?server=${mainServer}&event=${eventId}&type=song&tier=${tier}`;
    const SongT1Url = `https://hhwx.org/api/bandori/tracker/data?server=${mainServer}&event=${eventId}&type=song&tier=1`;
    const SongT10Url = `https://hhwx.org/api/bandori/tracker/data?server=${mainServer}&event=${eventId}&type=song&tier=10`;
    if(event.eventType == 'versus'){
        isVersus = true
            var [vTier1, vTierN, vTier10] = await Promise.all([
            callAPIAndCacheResponse(SongT1Url, 0, 1, false, 2),
            callAPIAndCacheResponse(SongTierUrl, 0, 1, false, 2),
            tier==10?null:callAPIAndCacheResponse(SongT10Url, 0, 1, false, 2)
        ]) as [cutoffSongsResponseVersus, cutoffSongsResponseVersus, cutoffSongsResponseVersus];
    }else{
        var [tier1, tierN, tier10] = await Promise.all([
            callAPIAndCacheResponse(SongT1Url, 0, 1, false, 2),
            callAPIAndCacheResponse(SongTierUrl, 0, 1, false, 2),
            tier==10?null:callAPIAndCacheResponse(SongT10Url, 0, 1, false, 2)
        ]) as [cutoffSongsResponse, cutoffSongsResponse, cutoffSongsResponse];
    }
    if (tier==10 && !isVersus) {
        tier10 = tierN
    }else if(tier==10 && isVersus){
        vTier10 = vTierN
    }

    const t1Score = new Map<number, number>();
    const t10Score = new Map<number, number>();
    const ratioBaseScore = new Map<number, number>();
    const t1ScoreAbnormal = new Map<number, boolean>();
    const tierScore = new Map<number, number>();
    const t1PrevScore = new Map<number, number>();
    const tierPrevScore = new Map<number, number>();
    const latestUpdateTime = new Map<number, number>();
        const tierFirstSameScore = new Map<number, number>();
    const t1FirstSameScore = new Map<number, number>()
    const chartEntries: CutoffSongChartEntry[] = [];

    for (const song of songList) {
        const songId = song.songId.toString();

        if (!isVersus && (!tier1.cutoffs[songId] || !tierN.cutoffs[songId])) {
            continue;
        }
        if (isVersus && (!vTier1.cutoffs || !vTierN.cutoffs)) {
            continue;
        }
        let t1List = isVersus?vTier1.cutoffs:tier1.cutoffs[songId];
        let tierList = isVersus?vTierN.cutoffs:tierN.cutoffs[songId];
        let t10List = isVersus?vTier10.cutoffs:tier10.cutoffs?.[songId];
        if (!t1List.length || !tierList.length) {
            continue;
        }
        let lastT1 = t1List[t1List.length - 1];
        let lastTier = tierList[tierList.length - 1];
        let lastT10 = t10List?.[t10List.length - 1];
        let isT1Abnormal = !!lastT10 && lastT1.ep > 0 && lastT10.ep / lastT1.ep < T1_ABNORMAL_THRESHOLD;
        let prevT1 = [...t1List]
                .reverse()
                .find(x => x.ep < lastT1.ep)
                ?.ep;
        let prevTier = [...tierList]
                .reverse()
                .find(x => x.ep < lastTier.ep)
                ?.ep;
        let firstSamePointTier = [...tierList]
                .find(x => x.ep == lastTier.ep)
                ?.time;
        let firstSamePointT1 = [...t1List]
                .find(x => x.ep == lastT1.ep)
                ?.time;
        t1Score.set(Number(songId), lastT1.ep);
        if (lastT10) {
            t10Score.set(Number(songId), lastT10.ep);
        }
        ratioBaseScore.set(Number(songId), isT1Abnormal && lastT10 ? lastT10.ep : lastT1.ep);
        t1ScoreAbnormal.set(Number(songId), isT1Abnormal);
        tierScore.set(Number(songId), lastTier.ep);
        t1PrevScore.set(Number(songId), prevT1);
        tierPrevScore.set(Number(songId), prevTier);
        latestUpdateTime.set(Number(songId), lastTier.time);
        tierFirstSameScore.set(Number(songId),firstSamePointTier)
        t1FirstSameScore.set(Number(songId),firstSamePointT1)
        chartEntries.push({
            song,
            t1List,
            t10List,
            tierList,
            currentT1: lastT1.ep,
            currentT10: lastT10.ep
        });
    }



    const summaryList: Array<Image | Canvas> = [];

    summaryList.push(new Canvas(800, 30));
    summaryList.push(await drawList({ key: '活动名称', text: event.eventName[mainServer] || '' }));

    const now = Date.now();
    const startAt = event.startAt[mainServer];
    const endAt = event.endAt[mainServer];
    const hasEnded = endAt != null && now >= endAt;
    if (!hasEnded) {
        const remainingText = endAt != null
            ? changeTimePeriodFormat(Math.max(0, endAt - now), false)
            : '未知';
        const latestTimeStamp = Math.max(...Array.from(latestUpdateTime.values(), v => v || 0));
        const updateText = latestTimeStamp > 0
            ? `${changeTimePeriodFormat(now - latestTimeStamp, true)}前`
            : '未知';

        summaryList.push(line);
        summaryList.push(drawListMerge([
            await drawList({ key: '活动剩余时间', text: remainingText }),
            await drawList({ key: '更新时间', text: updateText })
        ]));
    }

    const songDataBlockPromises: Promise<Canvas>[] = [];
    let indexFlags  = 1
    for (const song of songList) {
        const songId = song.songId;
        const latest = tierScore.get(songId);
        const prev = tierPrevScore.get(songId)
        const t1 = t1Score.get(songId);
        const t10 = t10Score.get(songId);
        const ratioBase = ratioBaseScore.get(songId);
        const isT1Abnormal = t1ScoreAbnormal.get(songId) === true;
        if (latest == null || t1 == null || ratioBase == null) {
            continue;
        }

        const ratio = ratioBase === 0 ? 'N/A' : `${((latest / ratioBase) * 100).toFixed(2)}%`;
        const incrementText = prev == null ? '+0' : `+${latest - prev}`;

        const songIndex = indexFlags;
        songDataBlockPromises.push((async () => {
            const songDetailList: Array<Image | Canvas> = [];
            songDetailList.push(await drawSongListInListWithMoreDetailKey([song], undefined, `歌曲${songIndex}`, [mainServer], false));
            let timeTips = '现在'
            if (latestUpdateTime.get(songId) != tierFirstSameScore.get(songId)){
                timeTips = `${changeTimePeriodFormat(latestUpdateTime.get(songId) - tierFirstSameScore.get(songId),false)}前`
            }
            songDetailList.push(line)
            songDetailList.push(await drawList({ key: '最新分数', text: latest.toString() + ` (${timeTips} ${incrementText})` }))
            songDetailList.push(line);
            songDetailList.push(await drawList({ key: isT1Abnormal ? '占比T10' : '占比T1', text: ratio }));
            if (isT1Abnormal) {
                songDetailList.push(await drawList({
                    key: '⚠T1分数异常',
                    RoundedRectColor: T1_ABNORMAL_COLOR
                }));
            }
            return drawDatablock({ list: songDetailList });
        })());
        indexFlags++
    }
    const songDataBlocks = await Promise.all(songDataBlockPromises);
    if (songDataBlocks.length === 0) {
        return ['错误: 歌曲信息加载失败'];
    }

    const all: Array<Image | Canvas> = [];
    all.push(await drawTitle('查询', `歌榜 T${tier}`));
    const eventBannerCanvas = await drawEventDatablockP;

    all.push(eventBannerCanvas);
    all.push(await drawDatablock({ list: summaryList }));
    all.push(...songDataBlocks);

    if (startAt != null && endAt != null && chartEntries.length > 0) {
        all.push(await drawDatablock({list:[await drawCutoffSongChart(chartEntries, tier, startAt, endAt, mainServer)]}));
    }

    const buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, text: 'Event', compress });
    return [buffer];
}
