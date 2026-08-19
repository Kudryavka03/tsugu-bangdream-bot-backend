import { callAPIAndCacheResponse } from '@/api/getApi';
import { HHWX_Url } from '@/config';
import { Server } from '@/types/Server';

export type TrackerTopDataType = 'monthly' | 'song';

export interface TrackerTopDataPoint {
    time: number;
    uid: number;
    value: number;
}

export interface TrackerTopDataUser {
    uid: number;
    name: string;
    introduction: string;
    rank: number;
    sid: number;
    strained: number;
    degrees: number[];
}

export interface TrackerTopDataResponse {
    points?: TrackerTopDataPoint[];
    users?: TrackerTopDataUser[];
    result?: boolean;
    success?: boolean;
    [key: string]: any;
}

export function buildTrackerTopDataUrl(params: {
    server: Server;
    eventId: number;
    type: TrackerTopDataType;
    songId?: number;
}): string {
    let url = `${ HHWX_Url }/api/bandori/tracker/topdata?server=${ <number>params.server }&event=${ params.eventId }&type=${ params.type }`;
    if (params.type === 'song' && params.songId != undefined) {
        url += `&song=${ params.songId }`;
    }
    return url;
}

/**
 * HHWX topdata is separate from the older eventtop/tracker endpoints.
 * A failed song lookup is intentionally returned as null so callers can
 * continue loading the remaining songs in a multi-song event.
 */
export async function getTrackerTopData(params: {
    server: Server;
    eventId: number;
    type: TrackerTopDataType;
    songId?: number;
}): Promise<TrackerTopDataResponse | null> {
    if (params.type === 'song' && params.songId == undefined) {
        return null;
    }

    const url = buildTrackerTopDataUrl(params);
    try {
        const data = await callAPIAndCacheResponse(
            url,
            0,
            3,
            false,
            1,
        ) as TrackerTopDataResponse;

        if (!data || data.result === false || data.success === false || !Array.isArray(data.points) || !Array.isArray(data.users)) {
            return null;
        }
        return data;
    }
    catch (e) {
        const status = (e as any)?.response?.status;
        if (status === 400 || status === 404) return null;
        throw e;
    }
}
