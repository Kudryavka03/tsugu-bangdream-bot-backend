import { formatSongCutoffRatio, getSongCutoffData, getSongCutoffPoints } from '@/api/songCutoffData';
import { getSongT1History, SongTopCorrection } from '@/api/songTopScoreData';
import { Event, hasSongRanking } from '@/types/Event';
import { Server } from '@/types/Server';
import { Song } from '@/types/Song';
import { Image, Canvas } from 'skia-canvas';
import { drawList, line, drawListMerge } from '@/components/list';
import { drawDatablock } from '@/components/dataBlock';
import { drawTitle } from '@/components/title';
import { drawSongListInListWithMoreDetailKey } from '@/components/list/song';
import { outputFinalBuffer } from '@/image/output';
import { changeTimePeriodFormat } from '@/components/list/time';
import { drawEventDatablock } from '@/components/dataBlock/event';
import { logger } from '@/logger';
import { drawCutoffSongChart, CutoffSongChartEntry } from '@/components/chart/cutoffSongChart';

export async function drawCutoffSongsDetail(
    eventId: number,
    tier: number,
    mainServer: Server,
    compress: boolean,
    songIdFilter?: number,
    event: Event = new Event(eventId),
): Promise<Array<Buffer | string>> {
    if (!event.isExist) {
        return ['错误: 活动不存在'];
    }

    await event.initFull();

    const isMedley = event.eventType === 'medley';
    const defaultServer = songIdFilter === undefined ? Server.jp : mainServer;
    const defaultSongs = event.getSongIds(defaultServer);
    const songIds = defaultSongs.length > 0 ? defaultSongs : event.getSongIds(defaultServer === Server.jp ? mainServer : Server.jp);
    if (!hasSongRanking(event.eventType) || songIds.length === 0) {
        return ['错误: 该活动不是歌榜活动或没有歌曲数据'];
    }
    if (isMedley && songIdFilter !== undefined) return ['错误: 组曲活动只提供整组歌榜'];
    if (songIdFilter !== undefined && !songIds.includes(songIdFilter)) return [`错误: 活动中不存在歌曲${songIdFilter}`];
    const selectedSongs = songIdFilter !== undefined ? [songIdFilter] : isMedley ? songIds.slice(0, 1) : songIds;
    const songList = selectedSongs.map(songId => new Song(songId));

    const eventBannerPromise = drawEventDatablock(event, [mainServer]).catch(err => {
        logger('drawEventDatablock error:', err);
        return null;
    });

    const [t1Data, tierData] = await Promise.all([
        getSongCutoffData(mainServer, eventId, 1),
        tier === 1 ? undefined : getSongCutoffData(mainServer, eventId, tier),
    ]);

    const t1Score = new Map<number, number>();
    const t1Corrections = new Map<number, SongTopCorrection>();
    const tierScore = new Map<number, number>();
    const tierPrevScore = new Map<number, number>();
    const latestUpdateTime = new Map<number, number>();
    const tierFirstSameScore = new Map<number, number>();
    const chartEntries: CutoffSongChartEntry[] = [];

    const histories = await Promise.all(songList.map(song =>
        getSongT1History(event, mainServer, isMedley ? undefined : song.songId,
            getSongCutoffPoints(t1Data, isMedley, song.songId))));
    for (const [index, song] of songList.entries()) {
        const songId = song.songId;
        const { points: t1List, latestCorrection } = histories[index];
        const tierList = tier === 1 ? t1List : getSongCutoffPoints(tierData, isMedley, songId);
        if (!t1List.length || !tierList.length) {
            continue;
        }
        const lastT1 = t1List[t1List.length - 1];
        const lastTier = tierList[tierList.length - 1];
        const prevTier = [...tierList].reverse().find(point => point.ep < lastTier.ep)?.ep;
        const firstSamePointTier = tierList.find(point => point.ep === lastTier.ep)?.time;
        t1Score.set(songId, lastT1.ep);
        if (latestCorrection) t1Corrections.set(songId, latestCorrection);
        tierScore.set(songId, lastTier.ep);
        tierPrevScore.set(songId, prevTier);
        latestUpdateTime.set(songId, lastTier.time);
        tierFirstSameScore.set(songId, firstSamePointTier);
        chartEntries.push({
            song,
            t1List,
            tierList,
            currentT1: lastT1.ep,
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
    let songIndex = 0;
    for (const song of songList) {
        const songId = song.songId;
        const latest = tierScore.get(songId);
        const prev = tierPrevScore.get(songId);
        const t1 = t1Score.get(songId);
        const correction = t1Corrections.get(songId);
        if (latest == null || t1 == null) {
            continue;
        }

        const incrementText = prev == null ? '+0' : `+${latest - prev}`;

        const label = `歌曲${++songIndex}`;
        songDataBlockPromises.push((async () => {
            const songDetailList: Array<Image | Canvas> = [];
            songDetailList.push(await drawSongListInListWithMoreDetailKey([song], undefined, label, [mainServer], false));
            const timeSinceSameScore = latestUpdateTime.get(songId) - tierFirstSameScore.get(songId);
            const timeTips = timeSinceSameScore > 0 ? `${changeTimePeriodFormat(timeSinceSameScore, false)}前` : '现在';
            songDetailList.push(line);
            if (tier === 1 && correction) {
                songDetailList.push(drawListMerge([
                    drawList({ key: '原 T1 分数', text: String(correction.originalT1Score) }),
                    drawList({ key: '修正后 T1 分数', text: String(correction.effectiveT1Score) }),
                ]));
                songDetailList.push(drawList({
                    key: '⚠ T1分数异常',
                    RoundedRectColor: '#dc3545',
                    RoundedRectTextColor: '#ffffff',
                }));
            } else {
                songDetailList.push(await drawList({ key: '最新分数', text: `${latest} (${timeTips} ${incrementText})` }));
            }
            if (tier !== 1) {
                songDetailList.push(line);
                songDetailList.push(await drawList({
                    key: '占比T1',
                    text: formatSongCutoffRatio(latest, t1, correction?.effectiveT1Rank),
                }));
            }
            return drawDatablock({ list: songDetailList });
        })());
    }
    const songDataBlocks = await Promise.all(songDataBlockPromises);
    if (songDataBlocks.length === 0) {
        return ['错误: 歌曲信息加载失败'];
    }

    const all: Array<Image | Canvas> = [];
    all.push(await drawTitle('查询', `歌榜 T${tier}`));
    const eventBannerCanvas = await eventBannerPromise;

    if (eventBannerCanvas) all.push(eventBannerCanvas);
    all.push(await drawDatablock({ list: summaryList }));
    all.push(...songDataBlocks);

    if (startAt != null && endAt != null && chartEntries.length > 0) {
        all.push(await drawDatablock({ list: [await drawCutoffSongChart(chartEntries, tier, startAt, endAt, mainServer)] }));
    }

    const buffer = await outputFinalBuffer({ imageList: all, useEasyBG: true, text: 'Event', compress });
    return [buffer];
}
