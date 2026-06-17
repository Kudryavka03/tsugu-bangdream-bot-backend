import { callAPIAndCacheResponse } from '@/api/getApi';
import { HHWX_Url } from '@/config';
import { Server } from '@/types/Server';

/** 国服月榜档线档位（HHWX 数据源） */
export const CN_MONTHLY_TIER_LIST = [1, 10, 20, 30, 40, 50, 100, 200, 300, 500, 1000, 2000, 3000, 4000] as const;

const CN_MONTHLY_EPOCH_YEAR = 2025;

/** 进行中月榜：缓存末点距今超过该时长则重新拉取 */
export const CN_MONTHLY_CUTOFF_STALE_MS = 30 * 60 * 1000;

export type CnMonthlyBorderResponse = {
    result: boolean;
    cutoffs: { time: number; ep: number }[];
};

/** 与 HHWX 约定：event = (year - 2025) * 12 + getMonth() */
export function monthlyEventIdFromDate(date: Date = new Date()): number {
    return (date.getFullYear() - CN_MONTHLY_EPOCH_YEAR) * 12 + date.getMonth();
}

export function yearMonthFromMonthlyEventId(eventId: number): { year: number; month: number } {
    const year = CN_MONTHLY_EPOCH_YEAR + Math.floor(eventId / 12);
    const month = eventId % 12;
    return { year, month };
}

export function getCnMonthlyDisplayName(eventId: number, server: Server = Server.cn): string {
    const { year, month } = yearMonthFromMonthlyEventId(eventId);
    return `${year}年${month + 1}月榜`;
}

/** 国服月榜起止时间（东八区自然月） */
export function getCnMonthlyTimeRange(eventId: number): { startAt: number; endAt: number } {
    const { year, month } = yearMonthFromMonthlyEventId(eventId);
    const offsetMs = 8 * 60 * 60 * 1000;
    const startAt = Date.UTC(year, month, 1, 0, 0, 0, 0) - offsetMs;
    const endAt = Date.UTC(year, month + 1, 1, 0, 0, 0, 0) - offsetMs - 1;
    return { startAt, endAt };
}

export function isCnMonthlyEventId(eventId: number): boolean {
    console.log(typeof(eventId),Number.isInteger(eventId),eventId,eventId >= 0)
    return Number.isInteger(eventId) && eventId >= 0;
}

export function isCnMonthlyTier(tier: number): boolean {
    return (CN_MONTHLY_TIER_LIST as readonly number[]).includes(tier);
}

export function isCnMonthlyServer(server: Server): boolean {
    return server === Server.cn;
}

export function getPresentCnMonthlyEventId(time: number = Date.now()): number {
    return monthlyEventIdFromDate(new Date(time));
}

/** 含当前月在内的最近 count 期月榜 eventId（按月份递增） */
export function getRecentCnMonthlyEventIds(currentEventId: number, count: number): number[] {
    const result: number[] = [];
    const start = Math.max(0, currentEventId - count + 1);
    for (let id = start; id <= currentEventId; id++) {
        result.push(id);
    }
    return result;
}

export function buildCnMonthlyRankingNameArray(eventId: number): Array<string | null> {
    const name = getCnMonthlyDisplayName(eventId);
    const names: Array<string | null> = [null, null, null, name, null];
    return names;
}

export function buildCnMonthlyTimeArray(eventId: number): { startAt: Array<number | null>; endAt: Array<number | null> } {
    const { startAt, endAt } = getCnMonthlyTimeRange(eventId);
    return {
        startAt: [null, null, null, startAt, null],
        endAt: [null, null, null, endAt, null],
    };
}

export function cnMonthlyCutoffCacheKey(eventId: number, tier: number): string {
    return `${eventId}:${tier}`;
}

export function buildCnMonthlyCutoffUrl(eventId: number, tier: number): string {
    return `${HHWX_Url}/api/bandori/tracker/data?server=${Server.cn}&event=${eventId}&type=monthly&tier=${tier}`;
}

function normalizeCutoffTimestamp(time: number): number {
    return time < 1e12 ? time * 1000 : time;
}

/**
 * 根据缓存档线末点判断是否需要重新请求。
 * - 已结束月榜：末点 >= 结束时刻 → 数据完整，不再更新
 * - 进行中月榜：末点距今 <= 30 分钟 → 沿用缓存
 */
export function shouldRefreshCnMonthlyCutoffs(
    eventId: number,
    cached: CnMonthlyBorderResponse | undefined,
    now: number = Date.now(),
): boolean {
    if (!cached?.result || !cached.cutoffs?.length) {
        return true;
    }

    const { endAt } = getCnMonthlyTimeRange(eventId);
    const lastTime = normalizeCutoffTimestamp(cached.cutoffs[cached.cutoffs.length - 1].time);

    if (lastTime >= endAt) {
        return false;
    }

    if (now > endAt) {
        return true;
    }

    return now - lastTime > CN_MONTHLY_CUTOFF_STALE_MS;
}

async function loadCnMonthlyCutoffsFromCache(url: string): Promise<CnMonthlyBorderResponse | undefined> {
    try {
        return await callAPIAndCacheResponse(url, Infinity, 3, true) as CnMonthlyBorderResponse;
    } catch {
        return undefined;
    }
}

export async function fetchCnMonthlyCutoffs(
    eventId: number,
    tier: number,
    forceReadCache: boolean = false,
): Promise<CnMonthlyBorderResponse | undefined> {
    const url = buildCnMonthlyCutoffUrl(eventId, tier);
    const cached = await loadCnMonthlyCutoffsFromCache(url);

    if (forceReadCache) {
        return cached?.result ? cached : undefined;
    }

    if (cached && !shouldRefreshCnMonthlyCutoffs(eventId, cached)) {
        return cached;
    }

    try {
        return await callAPIAndCacheResponse(url, 0, 3, false, 2) as CnMonthlyBorderResponse;
    } catch {
        return cached?.result ? cached : undefined;
    }
}

/** 并行批量获取档线，自动去重 eventId+tier */
export async function fetchCnMonthlyCutoffsBatch(
    requests: Array<{ eventId: number; tier: number }>,
    forceReadCache: boolean = false,
): Promise<Map<string, CnMonthlyBorderResponse>> {
    const unique = new Map<string, { eventId: number; tier: number }>();
    for (const req of requests) {
        unique.set(cnMonthlyCutoffCacheKey(req.eventId, req.tier), req);
    }

    const entries = await Promise.all(
        [...unique.entries()].map(async ([key, { eventId, tier }]) => {
            const data = await fetchCnMonthlyCutoffs(eventId, tier, forceReadCache);
            return [key, data] as const;
        }),
    );

    const result = new Map<string, CnMonthlyBorderResponse>();
    for (const [key, data] of entries) {
        if (data) {
            result.set(key, data);
        }
    }
    return result;
}
