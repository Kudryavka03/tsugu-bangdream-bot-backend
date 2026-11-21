import express from 'express';
import { body } from 'express-validator';
import { globalDefaultServer, serverNameFullList } from '@/config';
import { fuzzySearch } from '@/fuzzySearch';
import { middleware } from '@/routers/middleware';
import { resolveSongServerAlias } from '@/routers/searchSong';
import { isInteger, listToBase64 } from '@/routers/utils';
import { isServer, Server } from '@/types/Server';
import { getLatestReleasedSongs, Song } from '@/types/Song';
import { drawSongDiff } from '@/view/songDiff';
import { matchSongList } from '@/view/songList';

const router = express.Router();

router.post('/', [
    body('text').optional().isString(),
    body('mainServer').optional().custom(isServer),
    body('sourceServer').optional().isString(),
    body('destinationServer').optional().isString(),
    body('compress').optional().isBoolean(),
], middleware, async (req, res) => {
    const { text, mainServer, sourceServer, destinationServer, compress } = req.body;
    try {
        const result = await commandSongDiff(text, mainServer, sourceServer, destinationServer, compress);
        res.send(listToBase64(result));
    } catch (error) {
        console.error(error);
        res.status(500).send({ status: 'failed', data: '内部错误' });
    }
});

export async function commandSongDiff(
    text = '',
    mainServer: Server = globalDefaultServer[0],
    sourceServer?: string,
    destinationServer?: string,
    compress?: boolean,
): Promise<Array<Buffer | string>> {
    const source = sourceServer === undefined ? Server.jp : resolveSongServerAlias(sourceServer);
    const destination = destinationServer === undefined
        ? (mainServer === Server.jp ? Server.cn : mainServer)
        : resolveSongServerAlias(destinationServer);
    if (source === undefined || destination === undefined || (sourceServer !== undefined && destinationServer !== undefined && source === destination)) {
        return ['错误: 服务器不存在'];
    }

    const input = text.trim();
    const compareAll = input.toLowerCase() === 'all';
    const now = Date.now();
    let maxSongId: number | undefined;
    if (!compareAll) {
        const sourceLatestId = getLatestSongId(source, now);
        const destinationLatestId = getLatestSongId(destination, now);
        if (sourceLatestId === 0 || destinationLatestId === 0) {
            const emptyServer = sourceLatestId === 0 ? source : destination;
            return [`${serverNameFullList[emptyServer]}没有当前可用的歌曲，可用 songdiff all 比较全范围`];
        }
        maxSongId = Math.min(sourceLatestId, destinationLatestId);
    }
    const scope = compareAll ? '全部编号' : `ID 1–${maxSongId}`;
    const query = compareAll ? '' : input;
    const matches = isInteger(query) ? { songId: [Number(query)], _all: [] } : fuzzySearch(query);
    const excludeScheduledCn = !compareAll && (source === Server.cn || destination === Server.cn);
    const songs = matchSongList(matches, [source, destination]).filter(song => {
        if (maxSongId !== undefined && (song.songId < 1 || song.songId > maxSongId)) return false;
        const cnRelease = song.publishedAt?.[Server.cn];
        return !(excludeScheduledCn && Number.isFinite(cnRelease) && cnRelease > now);
    });
    if (songs.length === 0) return [`${scope} 范围内没有搜索到符合条件的歌曲`];

    const sourceOnly: Song[] = [];
    const destinationOnly: Song[] = [];
    for (const song of songs) {
        const inSource = song.isAvailableOn(source, now);
        const inDestination = song.isAvailableOn(destination, now);
        if (inSource === inDestination) continue;
        (inSource ? sourceOnly : destinationOnly).push(song);
    }
    if (sourceOnly.length + destinationOnly.length === 0) {
        return [`${serverNameFullList[destination]}与${serverNameFullList[source]}在 ${scope} 范围内没有歌曲差异`];
    }
    return await drawSongDiff(source, destination, sourceOnly, destinationOnly, compress, scope);
}

function getLatestSongId(server: Server, now: number): number {
    return Math.max(0, ...getLatestReleasedSongs(server, now).map(song => song.songId));
}

export { router as songDiffRouter };
