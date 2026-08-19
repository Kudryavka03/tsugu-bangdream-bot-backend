import { drawCutoffSongsDetail } from '@/view/cutoffSong';
import { drawSongTop10 } from '@/view/songTop10';
import { Server, getServerByServerId } from '@/types/Server';
import { getPresentEvent } from '@/types/Event';
import { listToBase64 } from '@/routers/utils';
import { isServer } from '@/types/Server';
import { body } from 'express-validator';
import express from 'express';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';

const router = express.Router();

router.post(
    '/',
    [
        body('mainServer').custom(isServer),
        body('tier').isInt(),
        body('eventId').optional().isInt(),
        body('songId').optional().isInt(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {

        const { mainServer, tier, eventId, songId, compress } = req.body;

        try {
            const result = await commandCutoffSong(getServerByServerId(mainServer), tier, compress, eventId, songId);
            res.send(listToBase64(result));
        } catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    }
);

export async function commandCutoffSong(mainServer: Server, tier: number, compress: boolean, eventId?: number, songId?: number): Promise<Array<Buffer | string>> {
    const normalizedTier = Number(tier);
    const validTiers = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000];
    if (!normalizedTier) {
        return ['请输入排名'];
    }
    if (!validTiers.includes(normalizedTier)) {
        return [`错误: 档位必须为以下之一: ${validTiers.join(', ')}`];
    }
    if (!eventId) {
        eventId = getPresentEvent(mainServer).eventId;
    }
    if (normalizedTier === 10) {
        return await drawSongTop10(eventId, mainServer, compress ?? false, songId == undefined ? undefined : Number(songId));
    }
    return await drawCutoffSongsDetail(eventId, normalizedTier, mainServer, compress);
}

export { router as cutoffSongRouter }
