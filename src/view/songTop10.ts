import { Canvas, Image } from 'skia-canvas';
import { drawTitle } from '@/components/title';
import { serverNameFullList } from '@/config';
import { Server } from '@/types/Server';
import { Event } from '@/types/Event';
import { Song } from '@/types/Song';
import { TrackerTop10 } from '@/types/TrackerTop';
import { drawDatablock } from '@/components/dataBlock';
import { drawEventDatablock } from '@/components/dataBlock/event';
import { drawPlayerRankingInList } from '@/components/list/playerRanking';
import { drawCutoffEventTopChart } from '@/components/chart/cutoffChart';
import { drawSongInList } from '@/components/list/song';
import { drawList, line } from '@/components/list';
import { outputFinalBuffer } from '@/image/output';
import mainAPI from '@/types/_Main';
import { logger } from '@/logger';
import { Cutoff } from '@/types/Cutoff';
import { drawT10CutoffSummary } from '@/view/t10CutoffSummary';
import { getTopTierCutoffs } from '@/types/TrackerTop';

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

function getEventSongIdList(event: Event, mainServer: Server): number[] {
    const result: number[] = [];
    let musicList = event.musics?.[mainServer];
    if (!Array.isArray(musicList) || musicList.length === 0) {
        musicList = mainAPI['events'][event.eventId.toString()]?.['musics']?.[mainServer];
    }
    if (!Array.isArray(musicList)) return result;
    for (const music of musicList) {
        const musicId = Number(typeof music === 'object' ? music?.musicId : music);
        if (musicId > 0 && !result.includes(musicId)) result.push(musicId);
    }
    return result;
}

async function drawSongTopBlock(song: Song, trackerTop: TrackerTop10, mainServer: Server): Promise<Canvas> {
    const list: Array<Image | Canvas> = [];
    const drawCutoffEventTopChartPromise = drawCutoffEventTopChart(trackerTop as any, false, mainServer).catch(err => {
        logger('drawCutoffEventTopChart error:', err);
        return null;
    });
    try {
        list.push(await drawSongInList(song, undefined, undefined, [mainServer]));
    }
    catch (e) {
        list.push(await drawList({ key: '歌曲', text: `${ song.songId }` }));
    }
    list.push(line);

    const songCutoff = new Cutoff(trackerTop.eventId, mainServer, 10, {
        startAt: trackerTop.startAt,
        endAt: trackerTop.endAt,
        eventType: 'song',
        dataSourceName: 'HHWX',
    });
    await songCutoff.initFull({
        cutoffs: getTopTierCutoffs(trackerTop.points),
        dataSourceName: 'HHWX',
        dailyIncrementDivisor: 1,
    });
    list.push(...await drawT10CutoffSummary(songCutoff));
    list.push(line);

    const userInRankings = trackerTop.getLatestRanking();
    const playerRankingPromise: Promise<Canvas>[] = [];
    for (let i = 0; i < userInRankings.length; i++) {
        const color = i % 2 == 0 ? 'white' : '#f1f1f1';
        const user = trackerTop.getUserByUid(userInRankings[i].uid);
        if (user != undefined) {
            // 歌榜不传 CutoffEventTop，避免执行分数异常检测和平均分计算。
            playerRankingPromise.push(drawPlayerRankingInList(user, color, mainServer));
        }
    }
    const playerRankingResult = await Promise.all(playerRankingPromise);
    for (const image of playerRankingResult) {
        if (image != undefined) list.push(image);
    }
    list.push(new Canvas(800, 50));
    const chart = await drawCutoffEventTopChartPromise;
    if (chart != null) list.push(chart);
    return await drawDatablock({ list, topLeftText: `歌曲${ song.songId } T10` });
}

export async function drawSongTop10(
    eventId: number,
    mainServer: Server,
    compress: boolean,
    songIdFilter?: number,
): Promise<Array<Buffer | string>> {
    const event = new Event(eventId);
    if (!event.isExist) return ['错误: 活动不存在'];
    try {
        await event.initFull();
    }
    catch (e) {
        // 单活动详情不可用时，继续使用现役活动汇总数据中的歌曲列表。
    }

    const songIdList = getEventSongIdList(event, mainServer);
    if (songIdList.length === 0) return ['错误: 该活动没有歌曲数据'];
    if (songIdList.length > 1 && songIdFilter == undefined) {
        const songOptions = songIdList.map(songId => {
            const song = new Song(songId);
            const musicTitle = song.musicTitle?.[mainServer]
                || song.musicTitle?.find(title => title != null && title !== '')
                || `歌曲${ songId }`;
            return `${ songId }: ${ musicTitle }`;
        });
        return [`当前活动存在多首歌曲。请选择其中一首进行查询：\n${ songOptions.join('\n') }`];
    }
    const eventTime = getEventTime(event, mainServer);
    const songTopList: { song: Song, trackerTop: TrackerTop10 }[] = [];
    let matchedSong = false;

    for (const currentSongId of songIdList) {
        // 歌曲 ID 查询在歌曲循环中筛选，未命中时继续检查其他歌曲。
        if (songIdFilter != undefined && currentSongId != songIdFilter) continue;
        matchedSong = true;
        const song = new Song(currentSongId);
        const trackerTop = new TrackerTop10({
            eventId,
            server: mainServer,
            type: 'song',
            songId: currentSongId,
            startAt: eventTime.startAt,
            endAt: eventTime.endAt,
        });
        await trackerTop.initFull();
        if (!trackerTop.isExist) continue;
        songTopList.push({ song, trackerTop });
    }

    if (songIdFilter != undefined && !matchedSong) {
        return [`错误: 活动中不存在歌曲${ songIdFilter }`];
    }
    if (songTopList.length === 0) {
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
    for (const songTop of songTopList) {
        all.push(await drawSongTopBlock(songTop.song, songTop.trackerTop, mainServer));
    }

    const buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        text: 'Song T10',
        compress,
    });
    return [buffer];
}
