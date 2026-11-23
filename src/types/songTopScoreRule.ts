export interface SongTopRankEntry {
    score: number;
    level?: number | null;
}

export interface SongTopRankScore {
    rank: number;
    score: number;
    gapPercent: number;
    gapScore: number;
    levelBonus: number;
    confidence: number;
    flagged: boolean;
}

export interface SongTopEvaluation {
    scores: SongTopRankScore[];
    lastFlaggedRank: number | undefined;
    effectiveT1Rank: number;
    effectiveT1Score: number;
}

function getLevelBonus(level: number | null | undefined): number {
    if (level == null || !Number.isInteger(level) || level <= 0) return 0;
    if (level < 150) return 60;
    if (level < 175) return 50;
    if (level < 200) return 40;
    return 0;
}

export function getSongTopReviewStart(startAt: number | null | undefined, endAt: number | null | undefined): number | undefined {
    if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || startAt <= 0 || endAt <= startAt) return;
    return startAt + (endAt - startAt) / 2;
}

/** Evaluate a single complete snapshot ordered by rank. The evaluation time may be the snapshot's timestamp. */
export function evaluateSongTopScores(
    ranking: readonly SongTopRankEntry[],
    startAt: number | null | undefined,
    endAt: number | null | undefined,
    now: number = Date.now(),
): SongTopEvaluation | undefined {
    if (startAt == null || endAt == null) return;
    const reviewStart = getSongTopReviewStart(startAt, endAt);
    if (reviewStart === undefined || !Number.isFinite(now) || now < reviewStart) return;

    const top10 = [...ranking.slice(0, 10)];
    if (top10.length !== 10 || top10.some((entry, index) =>
        !Number.isSafeInteger(entry?.score) || entry.score <= 0 || (index > 0 && entry.score > top10[index - 1].score))) return;

    const scores: SongTopRankScore[] = [];
    let lastFlaggedRank: number | undefined;
    for (let index = 0; index < top10.length - 1; index++) {
        const { score, level } = top10[index];
        const nextScore = top10[index + 1].score;
        // Keep the common denominator until after adding the bonus so exact thresholds stay exact.
        const percentNumerator = (score - nextScore) * 100;     // 定义一个1%的分叉阈值
        const excessNumerator = Math.max(0, percentNumerator - nextScore);  // 与下一名相减。
        //例如329当期T1 4364093  T2 4250680，计算得出2.6%的差距，那么减去1%基准就是1.6%
        const gapScoreNumerator = excessNumerator * 50;     
        const levelBonus = excessNumerator > 0 ? getLevelBonus(level) : 0;      // 硬性规定：小于150级的用户不可以拿歌榜T10

        const confidence = Math.min(100, (gapScoreNumerator + levelBonus * nextScore) / nextScore);
        const rank = index + 1;
        // 261123：不排除开挂的人在中间。因此在这里再次定义一个新的规定，通过检查T1-T10两者分差，决定是否需要标记异常
        let flagable = (top10[0].score - top10.at(-1).score)/top10.at(-1).score >  0.01
        const flagged = flagable && (confidence >= 60);
        if (flagged) lastFlaggedRank = rank;
        scores.push({
            rank,
            score,
            gapPercent: percentNumerator / nextScore,
            gapScore: gapScoreNumerator / nextScore,
            levelBonus,
            confidence,
            flagged,
        });
    }

    const effectiveT1Rank = (lastFlaggedRank ?? 0) + 1;
    return {
        scores,
        lastFlaggedRank,
        effectiveT1Rank,
        effectiveT1Score: top10[effectiveT1Rank - 1].score,
    };
}
