import express from 'express';
import { body } from 'express-validator';
import { Request, Response } from 'express';
import { middleware } from '@/routers/middleware';
import { listToBase64 } from '@/routers/utils';
import { isServer, Server, getServerByServerId } from '@/types/Server';
import { getPresentMonthlyRanking } from '@/types/MonthlyRanking';
import { drawMonthlyRankingTop10 } from '@/view/monthlyRankingTop10';

const router = express.Router();

router.post(
    '/',
    [
        body('mainServer').custom(isServer),
        body('monthlyRankingId').optional().isInt(),
        body('compress').optional().isBoolean(),
    ],
    middleware,
    async (req: Request, res: Response) => {
        const { mainServer, monthlyRankingId, compress } = req.body;
        try {
            const result = await commandMonthlyRankingTop10(
                getServerByServerId(mainServer),
                monthlyRankingId == undefined ? undefined : Number(monthlyRankingId),
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

export async function commandMonthlyRankingTop10(
    mainServer: Server,
    monthlyRankingId?: number,
    compress: boolean = false,
): Promise<Array<Buffer | string>> {
    if (monthlyRankingId == undefined) {
        const presentMonthlyRanking = getPresentMonthlyRanking(mainServer);
        if (!presentMonthlyRanking) return [`错误: ${ mainServer } 当前没有可用月榜`];
        monthlyRankingId = presentMonthlyRanking.monthlyRankingId;
    }
    return await drawMonthlyRankingTop10(Number(monthlyRankingId), mainServer, compress);
}

export { router as monthlyRankingTop10Router };
