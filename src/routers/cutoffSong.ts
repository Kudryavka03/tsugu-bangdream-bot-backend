import { drawCutoffSongsDetail } from '@/view/cutoffSong';
import { drawCutoffSongAll } from '@/view/cutoffSongAll';
import { drawSongTop10 } from '@/view/songTop10';
import { Server, getServerByServerId, isServer } from '@/types/Server';
import { Event, getLatestSongRankingEventId, hasSongRanking } from '@/types/Event';
import { Song } from '@/types/Song';
import { serverNameFullList } from '@/config';
import { listToBase64 } from '@/routers/utils';
import { body } from 'express-validator';
import express from 'express';
import { middleware } from '@/routers/middleware';
import { Request, Response } from 'express';

const router = express.Router();

router.post(
    '/',
    [
        body('mainServer').custom(isServer),
        body('tier').custom(value => value === 'all' || /^-?\d+$/.test(String(value))),
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

export async function commandCutoffSong(mainServer: Server, tier: number | 'all', compress: boolean, eventId?: number, songId?: number): Promise<Array<Buffer | string>> {
    const normalizedTier = tier === 'all' ? tier : Number(tier);
    const validTiers = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000];
    if (!normalizedTier) {
        return ['请输入排名'];
    }
    if (normalizedTier !== 'all' && !validTiers.includes(normalizedTier)) {
        return [`错误: 档位请输入 all 或以下数字之一：${validTiers.join(', ')}`];
    }
    const normalizedSongId = songId == undefined ? undefined : Number(songId);
    const selectedEventId = Number(eventId) || getLatestSongRankingEventId(mainServer, normalizedSongId);
    if (selectedEventId === undefined) {
        const serverName = serverNameFullList[mainServer];
        return [normalizedSongId === undefined
            ? `${serverName}没有已开始的歌榜活动`
            : `${serverName}没有已开始的活动提供歌曲 ${normalizedSongId} 的单曲歌榜`];
    }
    const event = new Event(selectedEventId);
    if (!event.isExist) return ['错误: 活动不存在'];
    const startAt = event.startAt[mainServer];
    const endAt = event.endAt[mainServer];
    try {
        await event.initFull();
    } catch {
        // 单活动详情不可用时，仍可使用活动汇总中的歌榜歌曲。
    }
    // 活动汇总可能已更新本服排期，单活动详情仍在使用旧缓存。
    if (startAt != null) event.startAt[mainServer] = startAt;
    if (endAt != null) event.endAt[mainServer] = endAt;
    if (!hasSongRanking(event.eventType)) return ['错误: 该活动没有歌榜'];

    const isMedley = event.eventType === 'medley';
    if (isMedley && normalizedSongId !== undefined) {
        return [`组曲活动只提供整组歌榜，请输入 gb ${normalizedTier} ${Server[mainServer]} -e ${selectedEventId}`];
    }
    const serverSongIds = event.getSongIds(mainServer);
    const songIds = serverSongIds.length > 0 ? serverSongIds : event.getSongIds(Server.jp);
    if (songIds.length === 0) return ['错误: 该活动没有歌曲数据'];
    if (normalizedSongId !== undefined && !songIds.includes(normalizedSongId)) {
        return [`错误: 活动中不存在歌曲 ${normalizedSongId}`];
    }
    if (!isMedley && normalizedSongId === undefined && songIds.length > 1) {
        const songs = songIds.map(id => {
            const titles = new Song(id).musicTitle;
            const title = titles?.[mainServer] || titles?.find(Boolean) || `歌曲 ${id}`;
            return `${id} ${title}`;
        });
        const example = `${normalizedTier} ${songIds[0]} ${selectedEventId} ${Server[mainServer]}`;
        return [`第 ${selectedEventId} 期活动有多首歌曲，请选择一首查询。\n${songs.join('\n')}\n输入示例：gb ${example}\n也可输入：ycxmusic ${example}`];
    }

    const selectedSongId = isMedley ? undefined : normalizedSongId ?? songIds[0];
    if (normalizedTier === 'all') {
        return await drawCutoffSongAll(event, mainServer, compress ?? false, selectedSongId);
    }
    if (normalizedTier === 10) {
        return await drawSongTop10(event, mainServer, compress ?? false, selectedSongId);
    }
    return await drawCutoffSongsDetail(selectedEventId, normalizedTier, mainServer, compress ?? false, selectedSongId, event);
}

export { router as cutoffSongRouter }
