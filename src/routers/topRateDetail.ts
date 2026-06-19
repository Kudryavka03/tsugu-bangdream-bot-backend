import { drawCutoffDetail } from '@/view/cutoffDetail';
import { Server, getServerByServerId } from '@/types/Server';
import { getPresentEvent } from '@/types/Event';
import { listToBase64 } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { body } from 'express-validator';
import express from 'express';
import { drawTopRateChanged, drawTopRateDetail, drawTopRateSleep, drawTopRateSpeedRank } from '@/view/cutoffEventTop';
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
        body('mode').optional().isInt(),    // 1：实时查岗  3：查停摆   2：查变动
        body('eventId').optional().isInt(),
        body('day').optional().isInt(),
        body('limit').optional(),
    ],
    middleware,
    async (req: Request, res: Response) => {

        const { mainServer, playerId, tier, count, compress,mode,eventId,day,limit } = req.body;

        try {
           // console.log(eventId)
            const result = await commandTopRateDetail(getServerByServerId(mainServer), playerId, tier, compress, count,mode,eventId,day,parseTopRateLimit(limit));
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandTopRateDetail(mainServer: Server, playerId: number, tier: number, compress: boolean, maxCount?: number,mode:number = 0,eventId:number = 0,day?:number,limit?:{ min?: number, max?: number, minInclusive?: boolean, maxInclusive?: boolean }): Promise<Array<Buffer | string>> {
    if ((mode !=1)&&!playerId && !tier) {
        // 这里查前十车速总表
        return ['请输入玩家id或排名']
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
