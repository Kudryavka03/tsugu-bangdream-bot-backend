import { Canvas, Image } from 'skia-canvas';
import { drawList, drawListMerge, line } from '@/components/list';
import { changeTimePeriodFormat, changeTimefomant } from '@/components/list/time';
import { Cutoff } from '@/types/Cutoff';

/** The status block shared by the event, monthly, and song T10 pages. */
export async function drawT10CutoffSummary(cutoff: Cutoff, showDailyIncrement: boolean = true): Promise<Array<Image | Canvas>> {
    const list: Array<Image | Canvas> = [];
    const now = Date.now();
    const latestTime = cutoff.latestCutoff?.time ?? cutoff.startAt;
    const latestScore = cutoff.latestCutoff?.ep ?? 0;
    const speed = cutoff.cutoffs?.length > 1 ? cutoff.getAnyCutoffSpeedByTime() : 0;

    let remainingText = '未开始';
    if (cutoff.status == 'in_progress') {
        remainingText = changeTimePeriodFormat(Math.max(0, cutoff.endAt - now), false);
    }
    else if (cutoff.status == 'ended') {
        remainingText = '已结束';
    }

    const updateText = latestTime > 0
        ? `${ changeTimePeriodFormat(Math.max(0, now - latestTime)) }前`
        : '未更新';
    list.push(drawListMerge([
        await drawList({ key: '最新分数线', text: latestScore.toString() }),
        await drawList({ key: '当前时速', text: `${ speed } pt/h` }),
    ]));
    list.push(line);
    list.push(drawListMerge([
        await drawList({ key: '活动剩余时间', text: remainingText }),
        await drawList({ key: '更新时间', text: updateText }),
    ]));
    if (showDailyIncrement) {
        list.push(line);
        const dayCount = cutoff.getDaysOfEvent(latestTime) + 1;
        const eventLength = cutoff.endAt - cutoff.startAt;
        const completion = eventLength > 0
            ? Math.round((latestTime - cutoff.startAt) / eventLength * 100)
            : 0;
        const dailyIncrementText = cutoff.dailyIncrement.length == 0
            ? '0'
            : cutoff.dailyIncrement.join('/');
            
        list.push(await drawList({
            key: `日增速 / ${ changeTimefomant(latestTime, cutoff.server) }  Day${ dayCount }  完成率${ completion }%`,
            text: dailyIncrementText,
        }));
        
    }
    return list;
}
