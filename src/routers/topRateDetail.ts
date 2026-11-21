import { Server, getServerByServerId } from '@/types/Server';
import { getCurrentEvent, getPresentEvent } from '@/types/Event';
import { listToBase64 } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { body } from 'express-validator';
import express from 'express';
import { drawTopRateChanged, drawTopRateDetail, drawTopRateScatter, drawTopRateSleep, drawTopRateSpeedRank } from '@/view/cutoffEventTop';
import type { TopRateTimeWindow } from '@/types/topRateSpeedWindow';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';

const router = express.Router();

router.post(
    '/',
    [
        body('mainServer').custom(isServer),
        body('playerId').optional().isInt(),
        body('tier').optional().isInt(),
        body('count').optional().isInt(),
        body('compress').optional().isBoolean(),
        body('mode').optional().isInt(),    // 1：实时查岗  2：查变动  3：查停摆  4：散点图
        body('eventId').optional().isInt(),
        body('day').optional().isInt(),
        body('limit').optional(),
        body(['from', 'to']).optional().isInt({ min: 0, max: 8_640_000_000_000_000 }).toInt(),
    ],
    middleware,
    async (req: Request, res: Response) => {

        const { mainServer, playerId, tier, count, compress, mode, eventId, day, limit, from, to } = req.body;
        const range = from === undefined && to === undefined ? undefined : { from, to };

        try {
           // console.log(eventId)
            const result = await commandTopRateDetail(getServerByServerId(mainServer), playerId, tier, compress, count, mode, eventId, day, parseTopRateLimit(limit), range);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandTopRateDetail(mainServer: Server, playerId: number, tier: number, compress: boolean, maxCount?: number,mode:number = 0,eventId:number = 0,day?:number,limit?:{ min?: number, max?: number, minInclusive?: boolean, maxInclusive?: boolean }, range?: TopRateTimeWindow): Promise<Array<Buffer | string>> {
    const speedRank = mode == 1 || (mode == 0 && (playerId == 0 || playerId == 1 || tier == 0));
    if (!speedRank && !playerId && !tier) {
        // 这里查前十车速总表
        return ['请输入玩家id或排名']
    }
    if (range) {
        if (range.from !== undefined && range.to !== undefined && range.from >= range.to) {
            return ['开始时间须早于结束时间'];
        }
        if (!speedRank && mode != 4) return ['指定时段请使用前十车速或查散点图'];
    }
    if (mode == 4) {
        if (tier != undefined && (tier < 1 || tier > 10)) return ['排名须在 1 到 10 之间'];
        if (playerId != undefined && playerId < 1) return ['请输入有效的玩家 ID'];
        if (maxCount != undefined && maxCount < 1) return ['记录次数须为正整数'];
        if (day != undefined && day < 1) return ['活动天数须为正整数'];
        const selectedEventId = Number(eventId) || getCurrentEvent(mainServer)?.eventId;
        if (!selectedEventId) return ['该服务器暂无已开始的活动'];
        return await drawTopRateScatter(selectedEventId, playerId, tier, maxCount, mainServer, compress, day, limit, range);
    }
    if (speedRank && range) {
        const selectedEventId = Number(eventId) || getCurrentEvent(mainServer)?.eventId;
        if (!selectedEventId) return ['该服务器暂无已开始的活动'];
        return await drawTopRateSpeedRank(selectedEventId, playerId, tier, maxCount, mainServer, compress, undefined, range);
    }
    if (eventId == null ) eventId = getPresentEvent(mainServer).eventId
    if (eventId == undefined ) eventId = getPresentEvent(mainServer).eventId
    if (eventId == 0 ) eventId = getPresentEvent(mainServer).eventId
    if(mode == 1 )return await drawTopRateSpeedRank(eventId, playerId, tier, maxCount, mainServer, compress)
    if(mode == 3 )return await drawTopRateSleep(eventId, playerId, tier, maxCount, mainServer, compress)
    if(mode == 2 )return await drawTopRateChanged(eventId, playerId, tier, maxCount, mainServer, compress)
    return await drawTopRateDetail(eventId, playerId, tier, maxCount, mainServer, compress, day, limit)
}

export { router as topRateDetailRouter }

function parseTopRateLimit(limit: any): { min?: number, max?: number, minInclusive?: boolean, maxInclusive?: boolean } | undefined {
    if (limit == undefined || limit === '') {
        return undefined
    }
    if (typeof limit == 'object') {
        const result: { min?: number, max?: number, minInclusive?: boolean, maxInclusive?: boolean } = {}
        if (limit.min != undefined && !isNaN(Number(limit.min))) {
            result.min = Number(limit.min)
            result.minInclusive = limit.minInclusive === true
        }
        if (limit.max != undefined && !isNaN(Number(limit.max))) {
            result.max = Number(limit.max)
            result.maxInclusive = limit.maxInclusive === true
        }
        return result.min == undefined && result.max == undefined ? undefined : result
    }
    const text = normalizeTopRateLimit(String(limit))
    const compareMatch = text.match(/^(>=|<=|>|<)(\d+)$/)
    if (compareMatch) {
        const value = Number(compareMatch[2])
        if (compareMatch[1].startsWith('>')) {
            return { min: value, minInclusive: compareMatch[1] == '>=' }
        }
        return { max: value, maxInclusive: compareMatch[1] == '<=' }
    }
    const rangeMatch = text.match(/^(\d+)-(\d+)$/)
    if (rangeMatch) {
        const left = Number(rangeMatch[1])
        const right = Number(rangeMatch[2])
        return {
            min: Math.min(left, right),
            max: Math.max(left, right),
            minInclusive: true,
            maxInclusive: true,
        }
    }
    return undefined
}

function normalizeTopRateLimit(limit: string): string {
    return limit.trim()
        .replace(/＞/g, '>')
        .replace(/＜/g, '<')
        .replace(/＝/g, '=')
        .replace(/\s/g, '')
}
