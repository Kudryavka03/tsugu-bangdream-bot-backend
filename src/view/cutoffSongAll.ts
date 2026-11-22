import { formatSongCutoffRatio, getSongCutoffData, getSongCutoffPoints } from '@/api/songCutoffData';
import { getSongT1History } from '@/api/songTopScoreData';
import { drawCutoffChart } from '@/components/chart/cutoffChart';
import { drawDatablock } from '@/components/dataBlock';
import { drawEventDatablock } from '@/components/dataBlock/event';
import { drawList, line } from '@/components/list';
import { drawSongInList } from '@/components/list/song';
import { changeTimefomant } from '@/components/list/time';
import { drawTitle } from '@/components/title';
import { serverNameFullList, statusName } from '@/config';
import { outputFinalBuffer } from '@/image/output';
import { logger } from '@/logger';
import { Cutoff } from '@/types/Cutoff';
import { Event } from '@/types/Event';
import { Server } from '@/types/Server';
import { Song } from '@/types/Song';

const songOverviewTiers = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000];

export async function drawCutoffSongAll(
    event: Event,
    mainServer: Server,
    compress: boolean,
    songId?: number,
): Promise<Array<Buffer | string>> {
    const startAt = event.startAt[mainServer];
    const endAt = event.endAt[mainServer];
    const serverName = serverNameFullList[mainServer];
    if (startAt == null || endAt == null) return [`${serverName}没有该活动的举办时间`];
    if (Date.now() < startAt) return ['活动未开始'];

    const isMedley = event.eventType === 'medley';
    const t10Points = getSongCutoffData(mainServer, event.eventId, 10)
        .then(data => getSongCutoffPoints(data, isMedley, songId));
    const results = await Promise.allSettled(songOverviewTiers.map(async tier => {
        const rawPoints = tier === 10
            ? await t10Points
            : getSongCutoffPoints(await getSongCutoffData(mainServer, event.eventId, tier), isMedley, songId);
        if (rawPoints.length === 0) return undefined;
        const history = tier === 1 ? await getSongT1History(event, mainServer, songId, rawPoints, undefined, t10Points) : undefined;

        const cutoff = new Cutoff(event.eventId, mainServer, tier, {
            startAt, endAt, eventType: 'song', dataSourceName: 'HHWX',
        });
        await cutoff.initFull({ cutoffs: history?.points ?? rawPoints, dailyIncrementDivisor: 1 });
        if (cutoff.status === 'in_progress') {
            cutoff.rate = 0;
            const forecastStartAt = history?.forecastStartAt;
            const forecastPoints = forecastStartAt === undefined ? undefined : cutoff.cutoffs.filter(point =>
                point.time >= forecastStartAt && point.ep <= cutoff.latestCutoff.ep);
            cutoff.predict(forecastPoints);
        }
        return { cutoff, correction: history?.latestCorrection };
    }));
    const cutoffs = new Map<number, Cutoff>();
    results.forEach((result, index) => {
        const tier = songOverviewTiers[index];
        if (result.status === 'rejected') {
            logger('drawCutoffSongAll', `读取活动 ${event.eventId} 歌榜 T${tier} 失败 (${result.reason})`);
        } else if (result.value) {
            cutoffs.set(tier, result.value.cutoff);
        }
    });
    if (cutoffs.size === 0) return [`${serverName}没有该活动的歌榜档线数据`];

    // 预测应介于当前档线和更高档位的可用预测之间。
    let predictionCeiling = Infinity;
    for (const cutoff of cutoffs.values()) {
        if (!Number.isFinite(cutoff.predictEP) || cutoff.predictEP <= 0) continue;
        const latestScore = cutoff.latestCutoff.ep;
        if (latestScore > predictionCeiling) {
            cutoff.predictEP = 0;
            continue;
        }
        cutoff.predictEP = Math.max(latestScore, Math.min(cutoff.predictEP, predictionCeiling));
        predictionCeiling = cutoff.predictEP;
    }

    const t1 = cutoffs.get(1)?.latestCutoff.ep;
    const firstTier = results[0];
    const t1Correction = firstTier.status === 'fulfilled' ? firstTier.value?.correction : undefined;
    const status = cutoffs.values().next().value.status;
    const song = songId === undefined ? undefined : new Song(songId);
    const songRow = song === undefined
        ? drawList({ key: '歌榜歌曲', text: '组曲总分' })
        : await drawSongInList(song, undefined, undefined, [mainServer]).catch(error => {
            logger('drawCutoffSongAll', `歌曲信息加载失败 (${error})`);
            const title = song.musicTitle?.[mainServer] ?? song.musicTitle?.find(Boolean);
            return drawList({ key: '歌榜歌曲', text: title ? `${songId} ${title}` : String(songId) });
        });
    const list = [songRow, line, drawList({ key: '状态', text: statusName[status] })];
    for (const tier of songOverviewTiers) {
        const cutoff = cutoffs.get(tier);
        let text = '暂无档线数据';
        if (cutoff) {
            const { ep, time } = cutoff.latestCutoff;
            const rows = cutoff.status === 'in_progress'
                ? [
                    `当前预测线 ${cutoff.predictEP > 0 && Number.isFinite(cutoff.predictEP) ? cutoff.predictEP : '?'}`,
                    `最新分数线 ${ep}`,
                    `更新时间 ${changeTimefomant(time, mainServer)}`,
                ]
                : [`最终分数线 ${ep}`];
            if (tier !== 1) rows.push(`占比T1 ${formatSongCutoffRatio(ep, t1, t1Correction?.effectiveT1Rank)}`);
            text = rows.join('\n');
        }
        list.push(line, drawList({ key: `T${tier}`, text }));
    }

    const eventBlock = await drawEventDatablock(event, [mainServer]).catch(error => {
        logger('drawCutoffSongAll', `活动信息加载失败 (${error})`);
        return drawDatablock({ list: [drawList({ key: '活动ID', text: String(event.eventId) })] });
    });
    const chart = await drawCutoffChart([...cutoffs.values()], false, mainServer, false, 'current');
    list.push(line, chart);
    return [await outputFinalBuffer({
        imageList: [
            await drawTitle('歌榜档线列表', serverName),
            eventBlock,
            await drawDatablock({ list }),
        ],
        useEasyBG: true,
        compress,
    })];
}
