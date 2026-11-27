import type { TrackerTopPoint } from './TrackerTop';

export type TopRateTimeWindow = { from?: number; to?: number };

function isValidPoint({ time, uid, value }: TrackerTopPoint) {
    return Number.isFinite(time) && Number.isFinite(uid) && Number.isFinite(value) && value >= 0;
}

export function summarizeTopRateSpeedHour(points: TrackerTopPoint[]) {
    let end = -Infinity;
    for (const point of points) {
        if (isValidPoint(point)) end = Math.max(end, point.time);
    }
    if (end === -Infinity) return undefined;

    const from = end - 3_600_000;
    let baseline: number | undefined;
    for (const point of points) {
        if (point.time <= from && (baseline === undefined || point.time > baseline) && isValidPoint(point)) {
            baseline = point.time;
        }
    }

    // The final snapshot at or before the start is only a baseline for changes inside the hour.
    const summary = summarizeTopRateSpeedWindow(points, from, end + 1, baseline);
    if (summary) return { ...summary, from: Math.max(from, summary.first) };
}

export function summarizeTopRateSpeedWindow(points: TrackerTopPoint[], from: number, to: number, baseline = from) {
    const snapshots = new Map<number, Map<number, number>>();
    for (const point of points) {
        const { time, uid, value } = point;
        if (time < baseline || time >= to || !isValidPoint(point)) continue;
        let scores = snapshots.get(time);
        if (!scores) {
            scores = new Map();
            snapshots.set(time, scores);
        }
        scores.set(uid, value);
    }

    const times = [...snapshots.keys()].sort((a, b) => a - b);
    if (times.length < 2) return undefined;

    const first = times[0];
    const last = times[times.length - 1];
    const hours = (last - first) / 3_600_000;
    const finalRanking = [...snapshots.get(last).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const rows = finalRanking.map(([uid, score], index) => {
        const gap = index === 0 ? 0 : finalRanking[index - 1][1] - score;
        const firstScore = snapshots.get(first).get(uid);
        const row = { uid, score, gap, gain: null, hourlyGain: null, changeCount: null, averageGain: null, leadingMinutes: null, trailingMinutes: null };
        if (firstScore === undefined) return row;

        let previous = firstScore;
        let firstChange: number | undefined;
        let lastChange: number | undefined;
        let changeCount = 0;
        let complete = true;
        for (let i = 1; i < times.length; i++) {
            const time = times[i];
            const current = snapshots.get(time).get(uid);
            if (current === undefined) {
                complete = false;
                continue;
            }
            if (current < previous) return row;
            if (current > previous) {
                changeCount++;
                firstChange ??= times[i - 1];
                lastChange = time;
            }
            previous = current;
        }

        const gain = score - firstScore;
        const hourlyGain = Math.round(gain / hours);
        // Boundary totals still give the speed across an in-window gap, but never the number of changes inside it.
        if (!complete) return { ...row, gain, hourlyGain };
        return {
            ...row,
            gain,
            hourlyGain,
            changeCount,
            averageGain: changeCount > 0 ? Math.round(gain / changeCount) : 0,
            leadingMinutes: firstChange === undefined ? null : Math.round((firstChange - first) / 60_000),
            trailingMinutes: lastChange === undefined ? null : Math.round((last - lastChange) / 60_000),
        };
    });
    return { first, last, rows };
}
