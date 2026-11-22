import { drawCutoffSongsDetail } from '@/view/cutoffSong';
import { drawSongTop10 } from '@/view/songTop10';
import { Server, getServerByServerId } from '@/types/Server';
import { getLatestSongRankingEventId } from '@/types/Event';
import { serverNameFullList } from '@/config';
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
    const normalizedSongId = songId == undefined ? undefined : Number(songId);
    const selectedEventId = Number(eventId) || getLatestSongRankingEventId(mainServer, normalizedSongId);
    if (selectedEventId === undefined) {
        const serverName = serverNameFullList[mainServer];
        return [normalizedSongId === undefined
            ? `${serverName}没有已开始的歌榜活动`
            : `${serverName}没有已开始的活动提供歌曲 ${normalizedSongId} 的单曲歌榜`];
    }
    if (normalizedTier === 10) {
        return await drawSongTop10(selectedEventId, mainServer, compress ?? false, normalizedSongId);
    }
    return await drawCutoffSongsDetail(selectedEventId, normalizedTier, mainServer, compress, normalizedSongId);
}

export { router as cutoffSongRouter }
