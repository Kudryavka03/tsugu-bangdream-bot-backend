/**
 * StarFreedomX 月榜前十车速/查岗相关算法（独立模块，不修改原有 cutoffEventTop 实现）
 */
import { MonthlyRankingCutoffTop } from '@/monthlyRanking/types/MonthlyRankingCutoff';

export function getRatingByPlayer(points: Array<{
    time: number,
    uid: number,
    value: number
}>, playerId: number) {
    const map: Record<string, number> = {}
    let tmpTime = -1, counts = 0;
    for (const info of points) {
        if (map[info.time] == undefined)
            map[info.time] = -1
        if (info.uid == playerId)
            map[info.time] = info.value
        if (info.time !== tmpTime) {
            if (tmpTime !== -1 && counts !== 10) {
                delete map[tmpTime];
            }
            tmpTime = info.time;
            counts = 1;
        } else {
            counts++;
        }
    }
    if (counts !== 10) delete map[tmpTime];

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

function findTargetTimeRankingGroup(
    sorted: { time: number; uid: number; value: number }[],
    targetTime: number
): { time: number; uid: number; value: number }[] {
    let left = 0, right = sorted.length - 1;
    let index = -1;

    while (left <= right) {
        const mid = (left + right) >> 1;
        if (sorted[mid].time < targetTime) {
            index = mid;
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }

    if (index === -1) index = 0;

    const groupTime = sorted[index].time;

    let start = index;
    while (start > 0 && sorted[start - 1].time === groupTime) {
        start--;
    }

    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1].time === groupTime) {
        end++;
    }

    return sorted.slice(start, end + 1);
}

function computeSpeed(
    top10List: { uid: number; point: number }[],
    top10_Old: { time: number; uid: number; value: number }[]
): { uid: number; speed: number; speedRanking: number }[] {
    const speed: { uid: number; speed: number; speedRanking: number }[] = [];
    const fallbackValue = top10_Old.at(-1)?.value ?? 0;
    const oldValueMap = new Map<number, number>();
    for (const { uid, value } of top10_Old) {
        oldValueMap.set(uid, value);
    }
    for (const { uid, point } of top10List) {
        const oldPoint = oldValueMap.get(uid) ?? fallbackValue;
        speed.push({ uid, speed: point - oldPoint, speedRanking: 0 });
    }
    speed.sort((a, b) => b.speed - a.speed);
    for (let i = 0; i < speed.length; i++) {
        speed[i].speedRanking = speed[i].speed > 0 ? i + 1 : 0;
    }
    return speed;
}

function countSpeedData(playerPoints: { time: number; value: number }[]) {
    let firstTime = 0;
    let lastTime = 0;
    let count = -1;
    let tmpPoint = 0;
    let init = false;
    for (const data of playerPoints.reverse()) {

        if (data.value == -1) {
            return { firstTime: -1, lastTime: -1, count: -1 };
        }
        if (data?.value != tmpPoint) {
            if (init && !firstTime) {
                firstTime = data.time;
            }
            if (tmpPoint == 0 && data.value > 0) {
                init = true;
            }
            lastTime = data.time;
            count += 1;
            if (data.value > 0)
                tmpPoint = data.value;
        }
    }
    if (count == 0)
        return { firstTime: -1, lastTime: -1, count: 0 };
    return { firstTime: firstTime, lastTime: lastTime, count: count };
}

export function getTopRatingDuringTime(cutoffEventTop: MonthlyRankingCutoffTop, windowTimeLimit: number = 60, date: Date, compareTier: number, comparePlayerUid: number) {
    const limitPoints = date ? cutoffEventTop.points.filter(item => item.time <= date.getTime()) : cutoffEventTop.points;
    const now = limitPoints.at(-1).time;
    const top10List: { uid: number, point: number }[] = limitPoints.slice(-10).map(({ uid, value }) => ({
        uid,
        point: value
    }));
    const top10_Old: {
        time: number,
        uid: number,
        value: number
    }[] = findTargetTimeRankingGroup(limitPoints, now - windowTimeLimit * 60 * 1000);
    const old_time = top10_Old?.[0]?.time;
    const top10_ranking: {
        ranking: number,
        uid: number,
        name: string,
        point: number,
        distanceToAbove: number,
        distanceToPlayer: number,
        speedInTime: number,
        speedRanking: number,
        playTimes: number,
        firstTime: string,
        lastTime: string,
        averagePoints: number,
        nowTime: string,
        oldTime: string,
    }[] = [];
    const speed: { uid: number, speed: number, speedRanking: number }[] = computeSpeed(top10List, top10_Old)
    if (!top10_Old?.length) return null;

    top10List.forEach((info, index) => {
        const uid = info.uid;
        const nowPoints = info.point;
        const comparePlayerPoints = compareTier ? (top10List?.[compareTier - 1]?.point) : (comparePlayerUid ? top10List.find(item => item.uid == comparePlayerUid)?.point : 0);
        const playerSpeedInfo = speed.find(item => item.uid == uid);
        const playerTimesInfo = countSpeedData(getRatingByPlayer(limitPoints.filter(item => item.time >= old_time), uid))
        const fmt = new Intl.DateTimeFormat('zh-CN', {
            timeZone: 'Asia/Shanghai',
            dateStyle: 'medium',
            timeStyle: 'medium'
        });
        top10_ranking.push({
            ranking: index + 1,
            uid: uid,
            name: cutoffEventTop.getUserNameById(uid),
            point: nowPoints,
            distanceToAbove: index == 0 ? 0 : top10List[index - 1].point - nowPoints,
            distanceToPlayer: comparePlayerPoints ? nowPoints - comparePlayerPoints : 0,
            speedInTime: playerSpeedInfo.speed,
            speedRanking: playerSpeedInfo.speedRanking,
            playTimes: playerTimesInfo.count,
            firstTime: playerTimesInfo.firstTime > 0 ? `${Math.round((playerTimesInfo.firstTime - old_time) / (60 * 1000))}min` : '',
            lastTime: playerTimesInfo.lastTime > 0 ? `${Math.round((playerTimesInfo.lastTime - now) / (60 * 1000))}min` : '',
            averagePoints: playerTimesInfo.count > 0 ? Math.floor(playerSpeedInfo.speed / playerTimesInfo.count) : 0,
            nowTime: fmt.format(new Date(now)),
            oldTime: fmt.format(new Date(old_time))
        })
    })
    return top10_ranking;
}
