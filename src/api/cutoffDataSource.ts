import { callAPIAndCacheResponse } from '@/api/getApi';
import {
    Bestdoriurl,
    HHWX_Url,
    StarFx_Url,
    clearDataSourceProblem,
    getCutoffDataSourcePreferenceOrder,
    reportDataSourceProblem,
} from '@/config';
import { logger } from '@/logger';
import { Server } from '@/types/Server';

export interface CutoffPoint {
    time: number;
    ep: number;
}

export interface CutoffTrackerResponse {
    result?: boolean;
    cutoffs?: CutoffPoint[];
    [key: string]: any;
}

export interface CutoffEventTopPoint {
    time: number;
    uid: number;
    value: number;
}

export interface CutoffEventTopResponse {
    result?: boolean;
    points?: CutoffEventTopPoint[];
    users?: any[];
    [key: string]: any;
}

export interface CutoffDataSourceResult<T> {
    data: T;
    sourceName: string;
}

type CutoffDataKind = 'tracker' | 'eventTop';

interface CutoffDataSourceDefinition {
    name: string;
    baseUrl: string;
    supportedServers?: Server[];
    supportedKinds: CutoffDataKind[];
}

interface FetchFromCutoffDataSourcesOptions<T> {
    kind: CutoffDataKind;
    server: Server;
    buildUrl: (source: CutoffDataSourceDefinition) => string;
    cacheTime?: number;
    retryCount?: number;
    isForceUseCache?: boolean;
    rtLevel?: number;
    validate?: (data: T, source: CutoffDataSourceDefinition) => boolean;
    shouldReportProblem?: (data: T, source: CutoffDataSourceDefinition) => boolean;
    selectBetter?: (current: CutoffDataSourceResult<T>, next: CutoffDataSourceResult<T>) => CutoffDataSourceResult<T>;
    retryFreshWhenProblem?: boolean;
    freshRetryCount?: number;
}

const cutoffDataSources: CutoffDataSourceDefinition[] = [
    {
        name: 'StarFX',
        baseUrl: StarFx_Url,
        supportedServers: [Server.cn,Server.jp],
        supportedKinds: ['tracker'],
        //supportedKinds: ['tracker', 'eventTop'],
    },
    {
        name: 'HHWX',
        baseUrl: HHWX_Url,
        supportedServers: [Server.cn],
        supportedKinds: ['tracker'],
    },
    {
        name: 'Bestdori',
        baseUrl: Bestdoriurl,
        supportedKinds: ['tracker', 'eventTop'],
    }
];

function isReportableDataSourceError(e: any) {
    return e?.response?.status != 404;
}

function getSources(kind: CutoffDataKind, server: Server) {
    const availableSources = cutoffDataSources.filter(source => {
        const supportsKind = source.supportedKinds.includes(kind);
        const supportsServer = !source.supportedServers || source.supportedServers.includes(server);
        return supportsKind && supportsServer;
    });
    const sourceNames = getCutoffDataSourcePreferenceOrder(
        availableSources.map(source => source.name),
    );
    return sourceNames
        .map(sourceName => availableSources.find(source => source.name == sourceName))
        .filter(Boolean) as CutoffDataSourceDefinition[];
}

function getLatestTime(list?: { time: number }[]) {
    if (!list || list.length == 0) return 0;
    return list[list.length - 1].time || 0;
}

async function requestData<T>(source: CutoffDataSourceDefinition, options: FetchFromCutoffDataSourcesOptions<T>, isForceUseCache: boolean, cacheTime: number, retryCount: number) {
    return await callAPIAndCacheResponse(
        options.buildUrl(source),
        cacheTime,
        retryCount,
        isForceUseCache,
        options.rtLevel ?? 1,
    ) as T;
}

async function fetchFromCutoffDataSources<T>(options: FetchFromCutoffDataSourcesOptions<T>): Promise<CutoffDataSourceResult<T> | null> {
    const sources = getSources(options.kind, options.server);
    const sourceNames = sources.map(source => source.name);
    let bestResult: CutoffDataSourceResult<T> | null = null;
    let preferredSourcePassed = false;

    const updateBestResult = (result: CutoffDataSourceResult<T>) => {
        if (!bestResult) {
            bestResult = result;
        } else if (options.selectBetter) {
            bestResult = options.selectBetter(bestResult, result);
        }
    };

    for (const source of sources) {
        try {
            let data = await requestData(
                source,
                options,
                options.isForceUseCache ?? false,
                options.cacheTime ?? 0,
                options.retryCount ?? 3,
            );
            // 如果需要校验
            if (!options.validate || options.validate(data, source)) {
                let result = { data, sourceName: source.name };
                // 假定当前是最佳数据源并更新档线数据
                updateBestResult(result);
                // shouldReportProblem旨在判断数据源实时性是否有问题。如果存在实时性问题，进if，不存在实时性问题则就用它
                if (options.shouldReportProblem && options.shouldReportProblem(data, source)) {
                    // 如果允许检测到实时性问题时重试，且当前配置为强制读取缓存，进if，不进if就直接标记有问题
                    if (options.retryFreshWhenProblem && (options.isForceUseCache ?? false)) {
                        try {
                            // 拿数据
                            data = await requestData(source, options, false, 0, options.freshRetryCount ?? 3);
                            // 如果需要校验，校验通过
                            if (!options.validate || options.validate(data, source)) {
                                result = { data, sourceName: source.name };
                                // 假定当前是最佳数据源并更新档线数据
                                updateBestResult(result);
                                // 检测实时性，如果实时性校验通过
                                if (!options.shouldReportProblem(data, source)) {
                                    // 就用它，标记当前数据源状态，且更新source name
                                    preferredSourcePassed = preferredSourcePassed || source.name == sources[0]?.name;
                                    // 跳出循环，采用当前数据
                                    break;
                                }
                            }
                        } catch (e) {
                            // 如果检测到数据源有问题且数据源明确返回了404
                            if (isReportableDataSourceError(e)) {
                                reportDataSourceProblem(source.name, sourceNames);
                            }
                            logger('cutoffDataSource', `${options.kind} fresh retry from ${source.name} failed: ${e?.message || e}`);
                        }
                    }
                    // 如果不允许重试或者当前不是强制读取缓存的，报告数据源问题
                    reportDataSourceProblem(source.name, sourceNames);
                    logger('cutoffDataSource', `${options.kind} data from ${source.name} is not fresh enough, try next source`);
                    // 下一轮候选
                    continue;
                }
                // 就用它，标记当前数据源状态，且更新source name
                preferredSourcePassed = preferredSourcePassed || source.name == sources[0]?.name;
                break;
            }
            // 校验不通过，记录一下当前数据源有问题

            reportDataSourceProblem(source.name, sourceNames);
            logger('cutoffDataSource', `${options.kind} data from ${source.name} failed validation, try next source`);
        } catch (e) {
            if (isReportableDataSourceError(e)) {
                reportDataSourceProblem(source.name, sourceNames);
            }
            logger('cutoffDataSource', `${options.kind} data source ${source.name} failed: ${e?.message || e}`);
        }
    }

    if (preferredSourcePassed && bestResult?.sourceName == sources[0]?.name) {
        clearDataSourceProblem(bestResult.sourceName);
    }

    return bestResult;
}

export async function getCutoffTrackerData(params: {
    server: Server;
    eventId: number;
    tier: number;
    forceReadCache?: boolean;
    validateFreshness?: boolean;
    maxStaleMs?: number;
    endAt?: number;
    maxEndLagMs?: number;
}): Promise<CutoffDataSourceResult<CutoffTrackerResponse> | null> {
    const forceReadCache = params.forceReadCache ?? false;
    const maxStaleMs = params.maxStaleMs ?? 2700000;
    const maxEndLagMs = params.maxEndLagMs ?? 410000;
    const now = Date.now();

    return fetchFromCutoffDataSources<CutoffTrackerResponse>({
        kind: 'tracker',
        server: params.server,
        buildUrl: source => `${source.baseUrl}/api/tracker/data?server=${<number>params.server}&event=${params.eventId}&tier=${params.tier}`,
        cacheTime: forceReadCache ? 1 / 0 : 0,
        retryCount: 3,
        isForceUseCache: forceReadCache,
        rtLevel: 1,
        validate: data => data != null && data.result !== false,
        shouldReportProblem: (data, source) => {
            const latestTime = getLatestTime(data.cutoffs);
            if (!latestTime) return Boolean(params.endAt);

            const sourceMaxEndLagMs = source.name === 'StarFX' ? 120000 : maxEndLagMs;
            if (params.endAt && params.endAt - latestTime > sourceMaxEndLagMs) return true;

            if (!params.validateFreshness) return false;
            if (params.server != Server.cn) return false;
            return now - latestTime >= maxStaleMs;
        },
        selectBetter: (current, next) => getLatestTime(next.data.cutoffs) > getLatestTime(current.data.cutoffs) ? next : current,
        retryFreshWhenProblem: forceReadCache,
    });
}

export async function getCutoffEventTopData(params: {
    server: Server;
    eventId: number;
    interval: number;
    forceReadCache?: boolean;
    validateFreshness?: boolean;
    endAt?: number;
    maxEndLagMs?: number;
}): Promise<CutoffDataSourceResult<CutoffEventTopResponse> | null> {
    const forceReadCache = params.forceReadCache ?? false;
    const maxEndLagMs = params.maxEndLagMs ?? 60 * 3 * 1000;

    return fetchFromCutoffDataSources<CutoffEventTopResponse>({
        kind: 'eventTop',
        server: params.server,
        buildUrl: source => `${source.baseUrl}/api/eventtop/data?server=${<number>params.server}&event=${params.eventId}&mid=0&interval=${params.interval}`,
        cacheTime: forceReadCache ? 1 / 0 : 0,
        retryCount: forceReadCache ? 1 : 3,
        isForceUseCache: forceReadCache,
        rtLevel: 1,
        validate: data => data != null && data.result !== false,
        shouldReportProblem: data => {
            if (!params.validateFreshness || !params.endAt) return false;
            const latestTime = getLatestTime(data.points);
            if (!latestTime) return true;
            return params.endAt - latestTime > maxEndLagMs;
        },
        selectBetter: (current, next) => getLatestTime(next.data.points) > getLatestTime(current.data.points) ? next : current,
        retryFreshWhenProblem: forceReadCache,
    });
}
