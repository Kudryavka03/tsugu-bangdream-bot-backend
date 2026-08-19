import { Canvas, Image } from 'skia-canvas';
import { drawTitle } from '@/components/title';
import { serverNameFullList } from '@/config';
import { Server } from '@/types/Server';
import { MonthlyRanking } from '@/types/MonthlyRanking';
import { TrackerTop10 } from '@/types/TrackerTop';
import { drawDatablock } from '@/components/dataBlock';
import { drawBannerImageCanvas } from '@/components/dataBlock/utils';
import { drawPlayerRankingInList } from '@/components/list/playerRanking';
import { drawCutoffEventTopChart } from '@/components/chart/cutoffChart';
import { drawList, drawListWithLine, line } from '@/components/list';
import { changeTimefomant } from '@/components/list/time';
import { outputFinalBuffer } from '@/image/output';
import { logger } from '@/logger';
import { Cutoff } from '@/types/Cutoff';
import { drawT10CutoffSummary } from '@/view/t10CutoffSummary';
import { getTopTierCutoffs } from '@/types/TrackerTop';
import { isCnMonthlyServer } from '@/monthlyRanking/cn/cnMonthlyRanking';

function getMonthlyRankingTime(monthlyRanking: MonthlyRanking, server: Server): { startAt?: number, endAt?: number } {
    let startAt = monthlyRanking.startAt[server] ?? undefined;
    let endAt = monthlyRanking.endAt[server] ?? undefined;
    if (startAt == undefined) {
        for (let i = 0; i < monthlyRanking.startAt.length; i++) {
            if (monthlyRanking.startAt[i] != null) {
                startAt = monthlyRanking.startAt[i];
                break;
            }
        }
    }
    if (endAt == undefined) {
        for (let i = 0; i < monthlyRanking.endAt.length; i++) {
            if (monthlyRanking.endAt[i] != null) {
                endAt = monthlyRanking.endAt[i];
                break;
            }
        }
    }
    return { startAt, endAt };
}

async function drawMonthlyRankingTopDatablock(monthlyRanking: MonthlyRanking, server: Server): Promise<Canvas> {
    const list: Canvas[] = [];
    list.push(drawBannerImageCanvas(await monthlyRanking.getBannerImage([server])));
    list.push(new Canvas(800, 30));
    list.push(drawListWithLine([
        await drawList({
            text: `ID: ${ monthlyRanking.monthlyRankingId } ${ monthlyRanking.monthlyRankingName[server] ?? '' }`,
        }),
        await drawList({
            text: '开始时间：'+changeTimefomant(monthlyRanking.startAt[server]),
        }),
        await drawList({
            text: '结束时间：'+changeTimefomant(monthlyRanking.endAt[server]),
        }),
    ]));
    return await drawDatablock({ list });
}

export async function drawMonthlyRankingTop10(
    monthlyRankingId: number,
    mainServer: Server,
    compress: boolean,
): Promise<Array<Buffer | string>> {
    if (!isCnMonthlyServer(mainServer)) {
        return ['月榜档线仅支持国服'];
    }
    const monthlyRanking = new MonthlyRanking(monthlyRankingId);
    if (!monthlyRanking.isExist) {
        return ['错误: 月榜不存在'];
    }

    const monthlyRankingTime = getMonthlyRankingTime(monthlyRanking, mainServer);
    const trackerTop = new TrackerTop10({
        eventId: monthlyRankingId,
        server: mainServer,
        type: 'monthly',
        startAt: monthlyRankingTime.startAt,
        endAt: monthlyRankingTime.endAt,
    });
    await trackerTop.initFull();
    if (!trackerTop.isExist) {
        return [`错误: ${ serverNameFullList[mainServer] } 月榜不存在或数据不足`];
    }

    const monthlyCutoff = new Cutoff(monthlyRankingId, mainServer, 10, {
        startAt: trackerTop.startAt,
        endAt: trackerTop.endAt,
        eventType: 'monthly',
        dataSourceName: 'HHWX',
    });
    await monthlyCutoff.initFull({
        cutoffs: getTopTierCutoffs(trackerTop.points),
        dataSourceName: 'HHWX',
        dailyIncrementDivisor: 1,
    });

    const all: Array<Canvas | Image> = [];
    all.push(await drawTitle('查询', `${ serverNameFullList[mainServer] } 月榜T10`));

    try {
        await monthlyRanking.initFull();
        all.push(await drawMonthlyRankingTopDatablock(monthlyRanking, mainServer));
    }
    catch (e) {
        // 月榜横幅不是榜单数据的一部分，资源暂时不可用时仍显示榜单。
        all.push(await drawDatablock({
            list: [await drawList({ key: '月榜ID', text: monthlyRankingId.toString() })],
        }));
    }

    const list: Array<Image | Canvas> = [];
    list.push(...await drawT10CutoffSummary(monthlyCutoff));
    list.push(line);
    const userInRankings = trackerTop.getLatestRanking();
    const playerRankingPromise: Promise<Canvas>[] = [];
    const drawCutoffEventTopChartPromise = drawCutoffEventTopChart(trackerTop as any, false, mainServer).catch(err => {
        logger('drawCutoffEventTopChart error:', err);
        return null;
    });
    for (let i = 0; i < userInRankings.length; i++) {
        const color = i % 2 == 0 ? 'white' : '#f1f1f1';
        const user = trackerTop.getUserByUid(userInRankings[i].uid);
        if (user != undefined) {
            // topdata 采样精度不足，月榜 T10 暂不计算每次得分。
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

    all.push(await drawDatablock({ list }));
    const buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        text: 'Monthly Ranking T10',
        compress,
    });
    return [buffer];
}
