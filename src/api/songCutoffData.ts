import { callAPIAndCacheResponse } from '@/api/getApi';
import { HHWX_Url } from '@/config';
import { Server } from '@/types/Server';
import pLimit from 'p-limit';

export interface SongCutoffPoint {
    time: number;
    ep: number;
}

export interface SongCutoffData {
    result?: boolean;
    cutoffs?: SongCutoffPoint[] | Record<string, SongCutoffPoint[]>;
}

const limitSongTrackerRequests = pLimit(8);
const pendingSongTrackerRequests = new Map<string, Promise<object>>();

export function getSongTrackerResponse(url: string, retryCount: number, realtimeLevel: number): Promise<object> {
    const pending = pendingSongTrackerRequests.get(url);
    if (pending) return pending;
    const request = limitSongTrackerRequests(
        () => callAPIAndCacheResponse(url, 0, retryCount, false, realtimeLevel),
    ).finally(() => pendingSongTrackerRequests.delete(url));
    pendingSongTrackerRequests.set(url, request);
    return request;
}

export async function getSongCutoffData(server: Server, eventId: number, tier: number): Promise<SongCutoffData> {
    const url = `${HHWX_Url}/api/bandori/tracker/data?server=${server}&event=${eventId}&type=song&tier=${tier}`;
    return await getSongTrackerResponse(url, 1, 2) as SongCutoffData;
}

export function getSongCutoffPoints(data: SongCutoffData | undefined, isMedley: boolean, songId?: number): SongCutoffPoint[] {
    const cutoffs = data?.result === false ? undefined : data?.cutoffs;
    const points = Array.isArray(cutoffs)
        ? (isMedley ? cutoffs : undefined)
        : (isMedley || songId === undefined ? undefined : cutoffs?.[songId]);
    if (!Array.isArray(points)) return [];
    return points.filter(point => Number.isFinite(point?.time) && Number.isFinite(point.ep))
        .sort((a, b) => a.time - b.time);
}

export function formatSongCutoffRatio(current: number | undefined, baseline: number | undefined, t1SourceRank?: number): string {
    if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline <= 0) return 'N/A';
    const ratio = `${((current / baseline) * 100).toFixed(2)}%`;
    return t1SourceRank === undefined ? ratio : `${ratio}（T1 取原榜 T${t1SourceRank}）`;
}
