import { Canvas, Image } from 'skia-canvas';
import { drawTitle } from '@/components/title';
import { serverNameFullList } from '@/config';
import { Server } from '@/types/Server';
import { Event } from '@/types/Event';
import { Song } from '@/types/Song';
import { TrackerTop10 } from '@/types/TrackerTop';
import { formatSongCutoffRatio } from '@/api/songCutoffData';
import { getSongTopSnapshotData, SongTopSnapshotData } from '@/api/songTopScoreData';
import { drawDatablock } from '@/components/dataBlock';
import { drawEventDatablock } from '@/components/dataBlock/event';
import { drawPlayerRankingInList } from '@/components/list/playerRanking';
import { drawCutoffEventTopChart } from '@/components/chart/cutoffChart';
import { drawSongInList } from '@/components/list/song';
import { drawList, line } from '@/components/list';
import { outputFinalBuffer } from '@/image/output';
import { logger } from '@/logger';
import { Cutoff } from '@/types/Cutoff';
import { drawT10CutoffSummary } from '@/view/t10CutoffSummary';

function getEventTime(event: Event, server: Server): { startAt?: number, endAt?: number } {
    let startAt = event.startAt[server] ?? undefined;
    let endAt = event.endAt[server] ?? undefined;
    if (startAt == undefined) {
        for (let i = 0; i < event.startAt.length; i++) {
            if (event.startAt[i] != null) {
                startAt = event.startAt[i];
                break;
            }
        }
    }
    if (endAt == undefined) {
        for (let i = 0; i < event.endAt.length; i++) {
            if (event.endAt[i] != null) {
                endAt = event.endAt[i];
                break;
            }
        }
    }
    return { startAt, endAt };
}

async function drawSongTopBlock(
    song: Song | null,
    trackerTop: TrackerTop10,
    mainServer: Server,
    snapshot: SongTopSnapshotData,
): Promise<Canvas> {
    const { cutoffs, correction, ranking } = snapshot;
    const list: Array<Image | Canvas> = [];
    const drawCutoffEventTopChartPromise = drawCutoffEventTopChart(
        trackerTop, false, mainServer, undefined, undefined, undefined, correction?.excludedUids,
    ).catch(err => {
        logger('drawCutoffEventTopChart error:', err);
        return null;
    });
    if (song) {
        try {
            list.push(await drawSongInList(song, undefined, undefined, [mainServer]));
        }
        catch {
            list.push(await drawList({ key: '歌曲', text: `${ song.songId }` }));
        }
    }
    list.push(line);

    const songCutoff = new Cutoff(trackerTop.eventId, mainServer, 10, {
        startAt: trackerTop.startAt,
        endAt: trackerTop.endAt,
        eventType: 'song',
        dataSourceName: 'HHWX',
    });
    await songCutoff.initFull({
        cutoffs,
        dataSourceName: 'HHWX',
        dailyIncrementDivisor: 1,
    });
    list.push(...await drawT10CutoffSummary(songCutoff, false));
    list.push(line);
    const t1 = correction?.effectiveT1Score ?? ranking[0].point;
    list.push(await drawList({
        key: '占比T1',
        text: formatSongCutoffRatio(ranking[9].point, t1, correction?.effectiveT1Rank),
    }));
    if (correction) {
        list.push(drawList({
            key: '⚠原始T1分数异常',
            RoundedRectColor: '#dc3545',
            RoundedRectTextColor: '#ffffff',
        }));
    }
    list.push(line);

    const playerRankingPromise: Promise<Canvas>[] = [];
    for (let i = 0; i < ranking.length; i++) {
        const { uid, point } = ranking[i];
        if (correction?.excludedUids.has(uid)) continue;
        const user = trackerTop.getUserByUid(uid);
        if (user != undefined) {
            // 歌榜不传 CutoffEventTop，避免执行分数异常检测和平均分计算。
            const color = playerRankingPromise.length % 2 === 0 ? 'white' : '#f1f1f1';
            playerRankingPromise.push(drawPlayerRankingInList({ ...user, ranking: i + 1, currentPt: point }, color, mainServer));
        }
    }
    const playerRankingResult = await Promise.all(playerRankingPromise);
    for (const image of playerRankingResult) {
        if (image != undefined) list.push(image);
    }
    list.push(new Canvas(800, 50));
    const chart = await drawCutoffEventTopChartPromise;
    if (chart != null) list.push(chart);
    return song?await drawDatablock({ list, topLeftText: `歌曲${ song.songId } T10` }):await drawDatablock({ list, topLeftText: `T10档线` });
}

export async function drawSongTop10(
    event: Event,
    mainServer: Server,
    compress: boolean,
    songId?: number,
): Promise<Array<Buffer | string>> {
    const eventId = event.eventId;
    const eventTime = getEventTime(event, mainServer);
    const trackerTop = new TrackerTop10({
        eventId,
        server: mainServer,
        type: 'song',
        songId,
        startAt: eventTime.startAt,
        endAt: eventTime.endAt,
    });
    await trackerTop.initFull();
    if (!trackerTop.isExist) {
        return [`错误: ${ serverNameFullList[mainServer] } 歌榜不存在或数据不足`];
    }
    const snapshot = await getSongTopSnapshotData(event, mainServer, songId, trackerTop.points, trackerTop.users);
    if (snapshot.ranking.length === 0) {
        return [`错误: ${ serverNameFullList[mainServer] } 歌榜不存在或数据不足`];
    }

    const all: Array<Canvas | Image> = [];
    all.push(await drawTitle('查询', `${ serverNameFullList[mainServer] } 歌榜T10`));
    try {
        all.push(await drawEventDatablock(event, [mainServer]));
    }
    catch (e) {
        all.push(await drawDatablock({
            list: [await drawList({ key: '活动ID', text: eventId.toString() })],
        }));
    }
    const song = songId === undefined ? null : new Song(songId);
    all.push(await drawSongTopBlock(song, trackerTop, mainServer, snapshot));

    const buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        text: 'Song T10',
        compress,
    });
    return [buffer];
}
