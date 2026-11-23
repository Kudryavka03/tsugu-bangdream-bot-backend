import express from 'express';
import { body } from 'express-validator';
import { Request, Response } from 'express';
import { fuzzySearch, FuzzySearchResult, isFuzzySearchResult, match, checkRelationList } from '@/fuzzySearch';
import { isInteger, listToBase64, parseSearchDate, ReplyItem } from '@/routers/utils';
import { middleware } from '@/routers/middleware';
import { isServer, Server } from '@/types/Server';
import { Event, getCurrentEvent, getEventIdBySchedule, getEventListByTimeRange, sortEventList } from '@/types/Event';
import mainAPI from '@/types/_Main';
import { serverNameFullList } from '@/config';
import { getRequireCommand, getRequireOffset, hasCurrentEventReference, requireStatus, resolveCurrentEventReferences } from './eventSearchInput';

const router = express.Router();

router.post('/',
    [
        body('mainServer').custom(isServer),
        body('fuzzySearchResult').optional().custom(isFuzzySearchResult),
        body('text').optional().isString(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { fuzzySearchResult, text, mainServer } = req.body;
        const searchText = typeof text === 'string' ? text.trim() : undefined;
        if (searchText && fuzzySearchResult) {
            return res.status(422).json({ status: 'failed', data: 'text 与 fuzzySearchResult 不能同时存在' });
        }
        try {
            const result = await commandEventVoice(searchText || fuzzySearchResult, mainServer);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).json({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandEventVoice(input: string | FuzzySearchResult | undefined, mainServer: Server): Promise<ReplyItem[]> {
    if (input == null || (typeof input === 'string' && !input.trim())) {
        const eventId = getEventIdBySchedule(mainServer);
        if (eventId === undefined) return ['该服务器暂无可查询的活动'];
        return voicesOfEvent(eventId, mainServer);
    }

    if (typeof input === 'string') {
        const command = getRequireCommand(input);
        const offset = getRequireOffset(input);
        if (command !== null || offset !== null) {
            const eventOffset = offset ?? (command === requireStatus.prev ? -1 : command === requireStatus.next ? 1 : 0);
            let eventId = eventOffset === 0 ? getCurrentEvent(mainServer)?.eventId : getEventIdBySchedule(mainServer, eventOffset);
            let voiceServer = mainServer;
            if (eventId === undefined && eventOffset > 0) {
                const currentJpEvent = getCurrentEvent(Server.jp);
                if (!currentJpEvent) return ['错误: 日服没有已开始的活动'];
                eventId = currentJpEvent.eventId;
                voiceServer = Server.jp;
            }
            if (eventId === undefined) return [eventOffset === 0 ? '错误: 该服务器没有已开始的活动' : '错误: 活动不存在'];
            return voicesOfEvent(eventId, voiceServer);
        }

        let text = resolveCurrentEventReferences(input);
        if (hasCurrentEventReference(text)) {
            const currentEvent = getCurrentEvent(mainServer);
            if (!currentEvent) return ['错误: 该服务器没有已开始的活动'];
            text = resolveCurrentEventReferences(text, currentEvent.eventId);
        }
        const dateRange = parseSearchDate(text);
        if (dateRange) {
            return voicesOfEvents(getEventListByTimeRange(dateRange.rangeStart, dateRange.rangeEnd, [mainServer]), mainServer);
        }
        if (isInteger(text)) {
            return voicesOfEvent(parseInt(text), mainServer);
        }
        return voicesOfEvents(matchEvents(fuzzySearch(text)), mainServer);
    }

    const fuzzySearchResult: FuzzySearchResult = { ...input };
    if (input._relationStr) {
        const relations = input._relationStr.map(value => resolveCurrentEventReferences(String(value)));
        if (relations.some(hasCurrentEventReference)) {
            const currentEvent = getCurrentEvent(mainServer);
            if (!currentEvent) return ['错误: 该服务器没有已开始的活动'];
            fuzzySearchResult._relationStr = relations.map(value => resolveCurrentEventReferences(value, currentEvent.eventId));
        } else {
            fuzzySearchResult._relationStr = relations;
        }
    }
    if (Object.keys(fuzzySearchResult).length == 0) {
        return ['错误: 没有有效的关键词'];
    }
    return voicesOfEvents(matchEvents(fuzzySearchResult), mainServer);
}

function matchEvents(matches: FuzzySearchResult): Event[] {
    const result: Event[] = [];
    for (const eventId of Object.keys(mainAPI['events'] ?? {}).map(Number)) {
        const event = new Event(eventId);
        if (!event.isExist) continue;
        let matched = match(matches, event, ['eventId']);
        if (matches._relationStr != undefined && (matched || Object.keys(matches).length == 1)) {
            matched = checkRelationList(event.eventId, matches._relationStr as string[]);
        }
        if (matched) result.push(event);
    }
    return result;
}

async function voicesOfEvents(events: Event[], server: Server): Promise<ReplyItem[]> {
    const existing = events.filter(event => event.isExist);
    if (existing.length === 0) return ['没有搜索到符合条件的活动'];
    if (existing.length === 1) return voicesOfEvent(existing[0].eventId, server);
    return [formatEventChoices(existing, server)];
}

async function voicesOfEvent(eventId: number, server: Server): Promise<ReplyItem[]> {
    const event = new Event(eventId);
    if (!event.isExist) return ['错误: 活动不存在'];
    const voices = dedupeBuffers(await event.getRewardStampVoice(server));
    const title = eventLabel(event, server);
    const assetServer = event.startAt?.[server] != null && event.startAt[server] <= Date.now() ? server : Server.jp;
    if (voices.length === 0) return [`${title}（${serverNameFullList[assetServer]}）没有可播放的奖励语音`];
    return [

        ...voices.map(data => ({ type: 'audio' as const, mime: 'audio/mpeg', data })),
    ];
    //        `${title}（${serverNameFullList[assetServer]}）的奖励语音，共 ${voices.length} 条`,
}

function formatEventChoices(events: Event[], server: Server): string {
    const sorted = [...events];
    sortEventList(sorted, [server]);
    const limit = 15;
    const shown = sorted.slice(0, limit);
    const lines = shown.map(event => eventLabel(event, server));
    const more = sorted.length > limit ? `\n还有 ${sorted.length - limit} 个活动未列出` : '';
    const exampleId = shown[0]?.eventId;
    return `匹配到 ${sorted.length} 个活动，请使用活动 ID 查询语音${exampleId == null ? '' : `，例如：查语音 ${exampleId}`}。\n${lines.join('\n')}${more}`;
}

function dedupeBuffers(buffers: Buffer[]): Buffer[] {
    const unique: Buffer[] = [];
    for (const buffer of buffers) {
        if (!unique.some(item => item.equals(buffer))) unique.push(buffer);
    }
    return unique;
}

function eventLabel(event: Event, server: Server): string {
    const name = event.eventName?.[server] || event.eventName?.[Server.jp] || '';
    return name ? `${event.eventId} ${name}` : `${event.eventId}`;
}

export { router as searchEventVoiceRouter }
