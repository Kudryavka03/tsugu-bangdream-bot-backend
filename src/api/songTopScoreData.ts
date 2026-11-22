import { getSongCutoffData, getSongCutoffPoints, SongCutoffPoint } from '@/api/songCutoffData';
import { getTrackerTopData, TrackerTopDataPoint, TrackerTopDataUser } from '@/api/trackerTopData';
import { normalizeTimestamp } from '@/components/list/time';
import { logger } from '@/logger';
import { Event, getCurrentOrLatestEndedEventId } from '@/types/Event';
import { Server } from '@/types/Server';
import { evaluateSongTopScores, getSongTopReviewStart } from '@/types/songTopScoreRule';

type PlayerLevel = Pick<TrackerTopDataUser, 'uid' | 'rank'>;

interface SongRankingData {
    points: readonly TrackerTopDataPoint[];
    users: readonly PlayerLevel[];
}

export interface SongTopCorrection {
    time: number;
    originalT1Score: number;
    effectiveT1Score: number;
    effectiveT1Rank: number;
    excludedUids: ReadonlySet<number>;
}

type SongRanking = { uid: number; point: number }[];

export interface SongTopSnapshotData {
    ranking: SongRanking;
    cutoffs: SongCutoffPoint[];
    correction?: SongTopCorrection;
}

interface SongT1History {
    points: SongCutoffPoint[];
    latestCorrection?: SongTopCorrection;
    forecastStartAt?: number;
}

function collectSongSnapshots(points: readonly TrackerTopDataPoint[], startAt: number, now: number) {
    const snapshots = new Map<number, Map<number, number>>();
    for (const point of points) {
        if (!point) continue;
        const time = normalizeTimestamp(point.time);
        const uid = Number(point.uid);
        const score = Number(point.value);
        if (!Number.isFinite(time) || time < startAt || time > now ||
            !Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(score) || score <= 0) continue;
        let snapshot = snapshots.get(time);
        if (!snapshot) {
            snapshot = new Map();
            snapshots.set(time, snapshot);
        }
        snapshot.set(uid, Math.max(score, snapshot.get(uid) ?? 0));
    }
    return snapshots;
}

function getPlayerLevels(users: readonly PlayerLevel[]) {
    return new Map(users.filter(Boolean).map(user => [Number(user.uid), Number(user.rank)]));
}

function rankSongSnapshot(snapshot: ReadonlyMap<number, number>): SongRanking {
    return Array.from(snapshot, ([uid, point]) => ({ uid, point }))
        .sort((a, b) => b.point - a.point)
        .slice(0, 10);
}

function evaluateSongSnapshot(
    time: number,
    ranking: SongRanking,
    levels: ReadonlyMap<number, number>,
    startAt: number | null | undefined,
    endAt: number | null | undefined,
): SongTopCorrection | undefined {
    const result = evaluateSongTopScores(
        ranking.map(({ uid, point }) => ({ score: point, level: levels.get(uid) })),
        startAt, endAt, time,
    );
    if (result?.lastFlaggedRank === undefined) return;
    return {
        time,
        originalT1Score: ranking[0].point,
        effectiveT1Score: result.effectiveT1Score,
        effectiveT1Rank: result.effectiveT1Rank,
        excludedUids: new Set(ranking.slice(0, result.lastFlaggedRank).map(({ uid }) => uid)),
    };
}

function getEligibleSongReviewStart(event: Event, server: Server, now: number): number | undefined {
    const reviewStart = getSongTopReviewStart(event.startAt[server], event.endAt[server]);
    if (reviewStart === undefined || now < reviewStart ||
        getCurrentOrLatestEndedEventId(server, now) !== event.eventId) return;
    return reviewStart;
}

async function getActiveSongReviewStart(
    event: Event,
    server: Server,
    songId: number | undefined,
    reviewStart: number | undefined,
    t10Points?: Promise<SongCutoffPoint[]>,
): Promise<number | undefined> {
    if (reviewStart === undefined) return;
    const endAt = event.endAt[server];

    try {
        const points = t10Points ? await t10Points : getSongCutoffPoints(
            await getSongCutoffData(server, event.eventId, 10), event.eventType === 'medley', songId,
        );
        const latestAt = normalizeTimestamp(points.at(-1)?.time);
        // Bestdori 以 22:59:59 表示最后一秒，HHWX 的正常收官快照可记为 23:00:00。
        const nextMinute = Math.ceil(endAt / 60_000) * 60_000;
        const closingBoundary = nextMinute - endAt <= 1000 ? nextMinute : endAt;
        if (Number.isFinite(latestAt) && latestAt <= closingBoundary) return reviewStart;
    } catch (error) {
        logger('getActiveSongReviewStart', `读取歌榜 T10 档线失败 (${error})`);
    }
}

export async function getSongTopSnapshotData(
    event: Event,
    server: Server,
    songId: number | undefined,
    trackerData: Promise<SongRankingData | undefined>,
    now?: number,
): Promise<SongTopSnapshotData> {
    const startAt = event.startAt[server];
    const endAt = event.endAt[server];
    const eligibleStart = getEligibleSongReviewStart(event, server, now ?? Date.now());
    const reviewStartPromise = getActiveSongReviewStart(event, server, songId, eligibleStart);
    const data = await trackerData;
    if (!data) return { ranking: [], cutoffs: [] };
    const snapshots = collectSongSnapshots(data.points, startAt ?? 0, now ?? Date.now());
    const cutoffs: SongCutoffPoint[] = [];
    let ranking: SongRanking = [];
    let latestTime = -Infinity;
    for (const [time, snapshot] of snapshots) {
        if (snapshot.size < 10) continue;
        const ranked = rankSongSnapshot(snapshot);
        cutoffs.push({ time, ep: ranked[9].point });
        if (time > latestTime) {
            ranking = ranked;
            latestTime = time;
        }
    }
    const reviewStart = ranking.length ? await reviewStartPromise : undefined;
    const correction = reviewStart !== undefined && latestTime >= reviewStart
        ? evaluateSongSnapshot(latestTime, ranking, getPlayerLevels(data.users), startAt, endAt)
        : undefined;
    return { ranking, cutoffs: cutoffs.sort((a, b) => a.time - b.time), correction };
}

export async function getSongT1History(
    event: Event,
    server: Server,
    songId: number | undefined,
    rawPoints: SongCutoffPoint[] | Promise<SongCutoffPoint[]>,
    now?: number,
    t10Points?: Promise<SongCutoffPoint[]>,
): Promise<SongT1History> {
    const eligibleStart = getEligibleSongReviewStart(event, server, now ?? Date.now());
    if (eligibleStart === undefined) return { points: await rawPoints };
    if (Array.isArray(rawPoints) && rawPoints.length === 0) return { points: rawPoints };

    const reviewStartPromise = getActiveSongReviewStart(event, server, songId, eligibleStart, t10Points);
    const trackerDataPromise = getTrackerTopData({ server, eventId: event.eventId, type: 'song', songId }).catch(error => {
        logger('getSongT1History', `读取歌榜前十失败 (${error})`);
        return null;
    });
    const points = await rawPoints;
    if (points.length === 0) return { points };
    const reviewStart = await reviewStartPromise;
    if (reviewStart === undefined) return { points };
    const data = await trackerDataPromise;
    if (!data) return { points };

    const startAt = event.startAt[server];
    const endAt = event.endAt[server];
    const snapshots = collectSongSnapshots(data.points ?? [], reviewStart, now ?? Date.now());
    const levels = getPlayerLevels(data.users ?? []);
    let latestCorrection: SongTopCorrection | undefined;
    let hasCorrection = false;
    const corrected = points.map((point, index) => {
        const time = normalizeTimestamp(point.time);
        const snapshot = snapshots.get(time);
        if (!snapshot || snapshot.size < 10) return point;
        const correction = evaluateSongSnapshot(time, rankSongSnapshot(snapshot), levels, startAt, endAt);
        // 仅替换与档线同一时刻且榜首分数一致的快照，避免覆盖已更新的档线。
        if (!correction || correction.originalT1Score !== point.ep) return point;
        hasCorrection = true;
        if (index === points.length - 1) latestCorrection = correction;
        return { ...point, ep: correction.effectiveT1Score };
    });
    return { points: corrected, latestCorrection, forecastStartAt: hasCorrection ? reviewStart : undefined };
}
