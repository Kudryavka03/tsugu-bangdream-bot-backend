import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import { middleware } from '@/routers/middleware';
import { listToBase64 } from '@/routers/utils';
import { serverNameFullList, tierListOfServer } from '@/config';
import { getServerByServerId, isServer, Server, serverList } from '@/types/Server';
import { Event, getPresentEvent } from '@/types/Event';
import mainAPI from '@/types/_Main';
import {
    addSubscriptCache,
    delSubscriptCache,
    makeSubscriptCacheKey,
    readSubscriptCacheStatusTotal,
    subscriptCacheTtlSeconds,
} from '@/types/CutoffCacheSystem';

const router = express.Router();
const tierPattern = /^[tT]?(\d+)$/;
const cacheIdPattern = /^S(\d+)E(\d+)T(\d+)D(\d+)$/;

function isTierInput(value: any): boolean {
    if (typeof value === 'number') {
        return Number.isInteger(value);
    }
    return typeof value === 'string' && tierPattern.test(value.trim());
}

router.post(
    '/add',
    [
        body('mainServer').custom(isServer),
        body('tier').custom(isTierInput),
        body('eventId').optional({ nullable: true }).isInt({ min: 1 }),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { mainServer, tier, eventId } = req.body;

        try {
            const result = await commandAddCutoffCache(
                getServerByServerId(mainServer),
                tier,
                eventId == null ? undefined : Number(eventId),
            );
            res.send(listToBase64(result));
        }
        catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    },
);

router.post(
    '/del',
    [
        body('id').isString().matches(cacheIdPattern),
    ],
    middleware,
    async (req: Request, res: Response) => {
        try {
            const result = await commandDelCutoffCache(req.body.id);
            res.send(listToBase64(result));
        }
        catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    },
);

router.post(
    '/status',
    middleware,
    (_req: Request, res: Response) => {
        try {
            res.send(listToBase64(commandCutoffCacheStatus()));
        }
        catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    },
);

export async function commandAddCutoffCache(
    mainServer: Server,
    tierInput: string | number,
    eventId?: number,
): Promise<Array<Buffer | string>> {
    const tier = parseTierInput(tierInput);
    if (tier == null) {
        return ['错误: 档线格式无效，请使用纯数字或T加数字，例如 1000 或 T1000'];
    }

    if (!tierListOfServer[Server[mainServer]].includes(tier)) {
        return [`错误: ${serverNameFullList[mainServer]}不支持档线T${tier}`];
    }

    const resolvedEventId = eventId == null ? resolveDefaultEventId(mainServer) : Number(eventId);
    if (resolvedEventId == null) {
        return ['错误: 当前没有可用的活动'];
    }

    const availability = getEventAvailability(mainServer, resolvedEventId);
    if (availability === 'not_exist') {
        return [`错误: 活动ID${resolvedEventId}不存在`];
    }
    if (availability === 'ended') {
        return ['错误: 仅允许添加正在举办/未举办的活动'];
    }

    await addSubscriptCache(mainServer, resolvedEventId, tier);
    const id = makeSubscriptCacheKey(mainServer, resolvedEventId, tier, subscriptCacheTtlSeconds);
    return [
        `预热档线添加成功，预热的档线为${serverNameFullList[mainServer]}T${tier}，活动ID${resolvedEventId}，预热ID为${id}`,
    ];
}

export async function commandDelCutoffCache(id: string): Promise<Array<Buffer | string>> {
    const match = cacheIdPattern.exec(id);
    if (!match) {
        return ['错误: 预热ID格式无效'];
    }

    const server = Number(match[1]) as Server;
    const eventId = Number(match[2]);
    const tier = Number(match[3]);
    const cacheTtl = Number(match[4]);

    if (!serverList.includes(server) || cacheTtl !== subscriptCacheTtlSeconds) {
        return ['错误: 不支持的预热ID'];
    }

    await delSubscriptCache(server, eventId, tier);
    return ['删除档线成功'];
}

export function commandCutoffCacheStatus(): string[] {
    const statusList = readSubscriptCacheStatusTotal();
    const result = ['当前档线缓存订阅列表：'];

    for (const status of statusList) {
        result.push(
            `${serverNameFullList[status.server]} ${status.eventId}T${status.tier} （${status.id}） 上次缓存时间：${formatCacheTime(status.prevUpdate)}`,
        );
    }

    return [result.join('\n')];
}

function formatCacheTime(timestamp: number): string {
    if (!Number.isFinite(timestamp)) {
        return '未知';
    }

    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseTierInput(tierInput: string | number): number | null {
    const match = tierPattern.exec(String(tierInput).trim());
    if (!match) {
        return null;
    }
    return Number(match[1]);
}

function resolveDefaultEventId(server: Server): number | undefined {
    const presentEvent = getPresentEvent(server);
    if (!presentEvent) {
        return undefined;
    }

    if (!isEventEnded(server, presentEvent.eventId)) {
        return presentEvent.eventId;
    }

    if (server === Server.cn) {
        return findNextEventId(server, presentEvent.eventId);
    }

    return presentEvent.eventId + 1;
}

function findNextEventId(server: Server, currentEventId: number): number | undefined {
    const eventIds = Object.keys(mainAPI['events'] ?? {})
        .map(Number)
        .filter(eventId => Number.isInteger(eventId) && eventId > currentEventId && eventId < 5000)
        .sort((a, b) => a - b);

    for (const eventId of eventIds) {
        const event = new Event(eventId);
        if (event.startAt[Server.jp] == null || event.endAt[Server.jp] == null) {
            continue;
        }

        const endAt = event.endAt[server];
        if (endAt == null || Number(endAt) >= Date.now()) {
            return eventId;
        }
    }

    return undefined;
}

function isEventEnded(server: Server, eventId: number): boolean {
    return getEventAvailability(server, eventId) === 'ended';
}

function getEventAvailability(
    server: Server,
    eventId: number,
): 'not_exist' | 'not_start' | 'in_progress' | 'ended' {
    const event = new Event(eventId);
    if (!event.isExist) {
        return 'not_exist';
    }

    const now = Date.now();
    const startAt = event.startAt[server];
    const endAt = event.endAt[server];

    if (endAt != null && Number(endAt) < now) {
        return 'ended';
    }
    if (startAt != null && Number(startAt) > now) {
        return 'not_start';
    }
    if (startAt == null && endAt == null) {
        return 'not_start';
    }

    return 'in_progress';
}

export { router as cutoffCacheRouter };
