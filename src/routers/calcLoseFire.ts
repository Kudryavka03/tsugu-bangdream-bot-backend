import express from 'express'
import { body } from 'express-validator'
import { isServer, Server } from '@/types/Server'
import { middleware } from '@/routers/middleware'
import { Request, Response } from 'express'
import drawCalcLoseFire from '@/view/calcLoseFire'
import { isInteger, listToBase64 } from '@/routers/utils'
import { fuzzySearch } from '@/fuzzySearch'
import { drawSongList, matchSongList } from '@/view/songList'
import { Song } from '@/types/Song'
import { piscina } from '@/WorkerPool'

const router = express.Router()

router.post('/', [
    body('mainServer').custom((value) => { if (!isServer(value)) throw new Error('mainServer must be a Server'); return true }),
    body('song1').optional().isString(),
    body('song2').optional().isString(),
    body('song1Id').optional().isInt(),
    body('song2Id').optional().isInt(),
    body('diff1').optional(),
    body('diff2').optional(),
    body('useEasyBG').optional().isBoolean(),
    body('compress').optional().isBoolean(),
], middleware, async (req: Request, res: Response) => {
    try {
        const { mainServer, useEasyBG, compress } = req.body
        const server = mainServer as Server
        const song1Text = req.body.song1 ?? req.body.song1Id
        const song2Text = req.body.song2 ?? req.body.song2Id ?? '325'
        const song1 = await resolveSong(song1Text, server, compress ?? true, '第一首歌曲')
        if (Array.isArray(song1)) {
            res.send(listToBase64(song1))
            return
        }
        const song2 = await resolveSong(song2Text, server, compress ?? true, '第二首歌曲')
        if (Array.isArray(song2)) {
            res.send(listToBase64(song2))
            return
        }

        const diff1 = resolveDifficulty(req.body.diff1, song1)
        const diff2 = resolveDifficulty(req.body.diff2 ?? (song2Text === '325' ? 3 : undefined), song2)
        if (diff1 == null || diff2 == null) {
            res.send(listToBase64(['错误: 难度名未能匹配任何难度']))
            return
        }
        if (!song1.difficulty[diff1] || !song2.difficulty[diff2]) {
            res.send(listToBase64(['错误: 指定歌曲不存在对应难度']))
            return
        }

        const result = await drawCalcLoseFire(song1.songId, song2.songId, diff1, diff2, server, useEasyBG ?? true, compress ?? true)
        res.send(listToBase64(result))
    } catch (e) {
        console.error(e)
        res.status(500).send({ status: 'failed', data: '内部错误' })
    }
})

async function resolveSong(songText: any, mainServer: Server, compress: boolean, label: string): Promise<Song | Array<Buffer | string>> {
    if (songText == undefined || songText === '') {
        return [`错误: ${label}未输入`]
    }

    if (isInteger(String(songText))) {
        const song = new Song(Number(songText))
        if (!song.isExist) return [`错误: ${label}不存在`]
        return song
    }

    const fuzzySearchResult = fuzzySearch(String(songText))
    const tempSongList = matchSongList(fuzzySearchResult, [mainServer])

    if (tempSongList.length == 0) {
        return [`没有搜索到符合条件的歌曲: ${songText}`]
    }
    if (tempSongList.length == 1) {
        return tempSongList[0]
    }

    let result = await drawSongList(fuzzySearchResult, [mainServer], compress, `${label}搜索存在多个结果，请改用歌曲ID或更精确的关键词：`)
    if (result == null) {
        result = (await piscina.drawList.run({
            matches: fuzzySearchResult,
            displayedServerList: [mainServer],
            compress,
            message: `${label}搜索存在多个结果，请改用歌曲ID或更精确的关键词：`
        })).map(toBuffer)
    }
    return result
}

function resolveDifficulty(diffText: any, song: Song): number | null {
    if (diffText == undefined || diffText === '') {
        return song.getMaxMetaDiffId(true)
    }
    if (isInteger(String(diffText))) {
        return Number(diffText)
    }

    const fuzzySearchResult = fuzzySearch(String(diffText))
    if (fuzzySearchResult.difficulty && fuzzySearchResult.difficulty.length > 0) {
        return Number(fuzzySearchResult.difficulty[0])
    }
    return null
}

function toBuffer(x: any): Buffer | string {
    if (x instanceof Uint8Array && !(x instanceof Buffer)) {
        return Buffer.from(x)
    }
    return x
}

export { router as calcLoseFireRouter }
