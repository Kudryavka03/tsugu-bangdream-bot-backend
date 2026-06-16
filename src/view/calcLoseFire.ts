import { Server } from '@/types/Server'
import { drawTitle } from '@/components/title'
import { outputFinalBuffer } from '@/image/output'
import { Song, calcLoseFire } from '@/types/Song'
import { Band } from '@/types/Band'
import { drawDifficulity } from '@/components/list/difficulty'
import { drawDatablock } from '@/components/dataBlock'
import { drawListTextWithImages, line } from '@/components/list'
import { drawText } from '@/image/text'
import { resizeImage } from '@/components/utils'
import { getServerByPriority } from '@/types/Server'
import { Canvas } from 'skia-canvas'
import { serverNameFullList } from '@/config'

const LIST_WIDTH = 800
const SONG_ROW_WIDTH = 760
const SONG_ROW_HEIGHT = 86
const RESULT_TEXT_SIZE = 24
const RESULT_LINE_HEIGHT = 34

export async function drawCalcLoseFire(song1Id: number, song2Id: number, diff1: number, diff2: number, mainServer: Server, useEasyBG: boolean, compress: boolean) {
    const song1 = new Song(song1Id)
    const song2 = new Song(song2Id)

    if (!song1.isExist || !song2.isExist) {
        return ['歌曲不存在']
    }

    const meta1 = song1.calcMeta(true, diff1)
    const meta2 = song2.calcMeta(true, diff2)
    let topSong = song1, topDiff = diff1, bottomSong = song2, bottomDiff = diff2
    if (meta2 > meta1) {
        topSong = song2; topDiff = diff2; bottomSong = song1; bottomDiff = diff1
    }

    const result = calcLoseFire(topSong, bottomSong, true, topDiff, bottomDiff, mainServer)
    let tipsText = ''
    if (!result || (result && result.ok === false)) {
        tipsText = typeof result === 'string' ? result : (result.tips || '无法计算')
    } else {
        tipsText = result.tips
    }

    const titleCard = await drawTitle(`${serverNameFullList[mainServer]}`, '亏火计算')
    const songCard = await makeSongBlock(song1, diff1, song2, diff2, mainServer)
    const tipsCard = await makeTipsBlock(tipsText)

    const buffer = await outputFinalBuffer({
        imageList: [titleCard, songCard, tipsCard],
        useEasyBG,
        BGimage: await topSong.getSongJacketImage(),
        compress,
    })

    return [buffer]
}

async function makeSongBlock(song1: Song, diff1: number, song2: Song, diff2: number, mainServer: Server) {
    const list = []

    list.push(drawListTextWithImages({
        key: '歌曲 1',
        content: [await drawSongRow(song1, diff1, mainServer)],
        maxWidth: LIST_WIDTH,
    }))
    list.push(line)
    list.push(drawListTextWithImages({
        key: '歌曲 2',
        content: [await drawSongRow(song2, diff2, mainServer)],
        maxWidth: LIST_WIDTH,
    }))

    return drawDatablock({ list, topLeftText: '歌曲对比' })
}

async function drawSongRow(song: Song, difficulty: number, mainServer: Server) {
    const server = getServerByPriority(song.publishedAt, [mainServer])
    const canvas = new Canvas(SONG_ROW_WIDTH, SONG_ROW_HEIGHT)
    const ctx = canvas.getContext('2d')
    const jacket = resizeImage({
        image: await song.getSongJacketImage(),
        widthMax: 74,
        heightMax: 74,
    })
    const idImage = await drawText({
        text: song.songId.toString(),
        textSize: 22,
        lineHeight: 36,
        maxWidth: 46,
    })
    const titleImage = await drawText({
        text: song.musicTitle[server] || 'Unknown',
        textSize: 23,
        lineHeight: 34,
        maxWidth: 520,
    })
    const bandName = new Band(song.bandId).bandName[server] || ''
    const detailImage = await drawText({
        text: `${bandName}    Meta: ${song.calcMeta(true, difficulty).toFixed(4)}`,
        textSize: 20,
        lineHeight: 30,
        maxWidth: 520,
        forceSingleLine: true,
    })
    const difficultyImage = await drawDifficulity(difficulty, song.difficulty[difficulty].playLevel, 58, true, song.notes[difficulty])

    ctx.drawImage(idImage, 0, 2)
    ctx.drawImage(jacket, 52, 6)
    ctx.drawImage(titleImage, 140, 6)
    ctx.drawImage(detailImage, 140, 48)
    ctx.drawImage(difficultyImage, SONG_ROW_WIDTH - difficultyImage.width - 10, (SONG_ROW_HEIGHT - difficultyImage.height) / 2)

    return canvas
}

async function makeTipsBlock(tipsText: string) {
    const tipsLines = tipsText.split('\n')
    const textCanvases = await Promise.all(tipsLines.map((text) => drawText({
        text: text || ' ',
        textSize: RESULT_TEXT_SIZE,
        lineHeight: RESULT_LINE_HEIGHT,
        forceSingleLine: true,
        maxWidth: 9999,
    })))
    const maxWidth = Math.max(LIST_WIDTH, ...textCanvases.map((canvas) => canvas.width + 40))
    const list = textCanvases.map((canvas, index) => {
        return drawListTextWithImages({
            key: index === 0 ? '结论' : undefined,
            content: [canvas],
            textSize: RESULT_TEXT_SIZE,
            lineSpacing: 10,
            maxWidth,
        })
    })

    return drawDatablock({ list, topLeftText: '计算结果' })
}

export default drawCalcLoseFire
