import express from 'express';
import { body } from 'express-validator';
import { Request, Response } from 'express';
import { middleware } from '@/routers/middleware';
import { listToBase64 } from '@/routers/utils';
import { isServer, Server, getServerByServerId } from '@/types/Server';
import { commandCutoffSong } from '@/routers/cutoffSong';

const router = express.Router();

router.post(
    '/',
    [
        body('mainServer').custom(isServer),
        body('eventId').optional().isInt(),
        body('songId').optional().isInt(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { mainServer, eventId, songId, compress } = req.body;
        try {
            const result = await commandSongTop10(
                getServerByServerId(mainServer),
                eventId == undefined ? undefined : Number(eventId),
                songId == undefined ? undefined : Number(songId),
                compress,
            );
            res.send(listToBase64(result));
        }
        catch (e) {
            console.log(e);
            res.status(500).send({ status: 'failed', data: '内部错误' });
        }
    },
);

export async function commandSongTop10(
    mainServer: Server,
    eventId?: number,
    songId?: number,
    compress: boolean = false,
): Promise<Array<Buffer | string>> {
    return await commandCutoffSong(mainServer, 10, compress, eventId, songId);
}

export { router as songTop10Router };
