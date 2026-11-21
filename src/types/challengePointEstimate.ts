type ScoreSnapshot = { time: number, value: number };
type ScoreGain = { points: number, continuous: boolean };
type Live = { points: number, cpCost: number };

const MIN_COOP_SAMPLES = 8;
const PT_PER_CP = 20;
const CLEAR_TIERS = [
    { cpCost: 1600, minimumCoopRatio: 6.1 },
    { cpCost: 800, minimumCoopRatio: 3.35 },
    { cpCost: 400, minimumCoopRatio: 1.65 },
];

function median(values: number[]): number {
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return (values[middle] + values[Math.floor((values.length - 1) / 2)]) / 2;
}

function summarize(lives: Live[]) {
    const summary = { coopCount: 0, coopPt: 0, clearCount: 0, clearPt: 0, spentCp: 0 };
    for (const { points, cpCost } of lives) {
        if (cpCost > 0) {
            summary.clearCount++;
            summary.clearPt += points;
            summary.spentCp += cpCost;
        } else {
            summary.coopCount++;
            summary.coopPt += points;
        }
    }
    return summary;
}

function classifyLive(points: number, coopMedian: number): Live | undefined {
    const ratio = points / coopMedian;
    // A 200 CP play can overlap a normal cooperative play. Higher boost
    // cooperative plays can also overlap the lower CP tiers.
    if ((ratio >= 0.3 && ratio <= 1.45) || (ratio >= 2.35 && ratio <= 2.95 && points % 40 === 0)) {
        return { points, cpCost: 0 };
    }
    const tier = CLEAR_TIERS.find(({ cpCost, minimumCoopRatio }) => {
        const multiplier = cpCost / 200;
        const basePt = points / multiplier;
        return ratio >= minimumCoopRatio && Number.isInteger(basePt) && basePt >= 6000 && basePt <= 18000;
    });
    return tier ? { points, cpCost: tier.cpCost } : undefined;
}

/** Estimate CP from newest-first activity ranking snapshots with millisecond timestamps. */
export function estimateChallengePoints(snapshots: ScoreSnapshot[]) {
    const intervals: number[] = [];
    for (let i = 1; i < snapshots.length; i++) {
        const interval = snapshots[i - 1].time - snapshots[i].time;
        if (interval > 0) intervals.push(interval);
    }
    if (intervals.length === 0) return undefined;
    const samplingInterval = median(intervals);
    if (samplingInterval > 120_000) return undefined;

    const maxContinuousInterval = Math.min(samplingInterval * 1.8, 150_000);
    const gains: ScoreGain[] = [];
    let highestPt = 0;
    let previousTime: number | undefined;
    for (let i = snapshots.length - 1; i >= 0; i--) {
        const { time, value } = snapshots[i];
        if (value < highestPt || !Number.isFinite(value)) {
            previousTime = undefined;
            continue;
        }
        if (value > highestPt) {
            const continuous = previousTime !== undefined && time > previousTime && time - previousTime <= maxContinuousInterval;
            gains.push({ points: value - highestPt, continuous });
            highestPt = value;
        }
        previousTime = time;
    }

    const coopSamples = gains
        .filter(({ points, continuous }) => continuous && points >= 2500 && points <= 18000 && points % 15 === 0)
        .map(({ points }) => points);
    if (coopSamples.length < MIN_COOP_SAMPLES) return undefined;
    const coopMedian = median(coopSamples);

    const lives: Live[] = [];
    for (const { points, continuous } of gains) {
        if (!continuous) continue;
        const live = classifyLive(points, coopMedian);
        if (live) lives.push(live);
    }
    const total = summarize(lives);
    if (total.coopCount === 0) return undefined;
    const recent = summarize(lives.slice(-50));
    const opening = summarize(lives.slice(0, 100));
    const classifiedPt = total.coopPt + total.clearPt;
    const missingPt = highestPt - classifiedPt;

    // Use the opening play mix for the unobserved initial score, and the
    // full observed mix for later gaps. Cap inferred clears by the CP budget.
    const openingMissingPt = gains[0].continuous ? 0 : gains[0].points;
    const openingPt = opening.coopPt + opening.clearPt;
    const missingClearPt = openingMissingPt * opening.clearPt / openingPt
        + (missingPt - openingMissingPt) * total.clearPt / classifiedPt;
    const averageClearPt = total.clearCount ? total.clearPt / total.clearCount : 0;
    const averageCpCost = total.clearCount ? total.spentCp / total.clearCount : 0;
    const budgetBeforeMissingClears = (total.coopPt + missingPt) / PT_PER_CP - total.spentCp;
    const missingClears = averageClearPt > 0
        ? Math.max(0, Math.floor(Math.min(
            missingClearPt / averageClearPt,
            budgetBeforeMissingClears / (averageClearPt / PT_PER_CP + averageCpCost),
        )))
        : 0;
    const missingCoopPt = missingPt - missingClears * averageClearPt;
    const estimatedEarnedCp = (total.coopPt + missingCoopPt) / PT_PER_CP;
    const estimatedRemainingCp = estimatedEarnedCp - total.spentCp - missingClears * averageCpCost;
    const latestPt = snapshots.find(({ value }) => value >= 0 && Number.isFinite(value))?.value;
    const canEstimateBalance = latestPt === highestPt && classifiedPt >= highestPt / 2 && estimatedRemainingCp >= 0;

    return {
        coopCount: total.coopCount + Math.round(missingCoopPt / coopMedian),
        earnedCp: Math.round(estimatedEarnedCp),
        averageCoopPt: total.coopCount ? Math.round(total.coopPt / total.coopCount) : 0,
        averageClearPt: Math.round(averageClearPt),
        recentAverageCoopPt: recent.coopCount ? Math.round(recent.coopPt / recent.coopCount) : 0,
        recentAverageClearPt: recent.clearCount ? Math.round(recent.clearPt / recent.clearCount) : 0,
        clearCount: total.clearCount + missingClears,
        remainingCp: canEstimateBalance ? Math.round(estimatedRemainingCp) : undefined,
        classifiedPercent: Math.round(100 * classifiedPt / highestPt),
    };
}
