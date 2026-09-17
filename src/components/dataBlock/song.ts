import { drawSongInList } from "@/components/list/song"
import { Song } from "@/types/Song"
import { drawDatablock } from '@/components/dataBlock'
import { Image, Canvas } from 'skia-canvas'
import { drawDottedLine } from '@/image/dottedLine'
import { stackImage } from "@/components/utils"
import { Server, getServerByPriority } from "@/types/Server"
import { Band } from "@/types/Band"
import { drawText, releaseCanvas } from "@/image/text"
import { drawDifficulityList } from "@/components/list/difficulty"
import { globalDefaultServer } from "@/config"
import { drawRoundedImage } from '@/image/surfaceShadow'

// 紧凑化虚线分割
const line = drawDottedLine({
    width: 365,
    height: 20,
    startX: 5,
    startY: 10,
    endX: 360,
    endY: 10,
    radius: 2,
    gap: 10,
    color: "#a8a8a8"
})

export async function drawSongDataBlock(song: Song, text?: string, displayedServerList: Server[] = globalDefaultServer) {
    var server = getServerByPriority(song.publishedAt, displayedServerList)
    var songJacketImage = await song.getSongJacketImage()
    var songName = song.musicTitle[server]
    var bandName = new Band(song.bandId).bandName[server]
    var songTipsName = song.getTagName()

    // 绘制歌曲名
    var songNameImage = await drawText({
        text: songName,
        textSize: 40,
        maxWidth: 365
    })
    // 绘制歌曲信息
    var songDetail = `${bandName}\n${songTipsName}\nID:${song.songId}`
    if (text != undefined) {
        songDetail = `${songDetail}\n${text}`
    }
    var songDetailImage = await drawText({
        text: songDetail,
        textSize: 30,
        maxWidth: 365
    })
    var difficultyImage = await drawDifficulityList(song, 60, 10)
    var list = [songNameImage, line, songDetailImage, new Canvas(1, 60)]
    var rightCanvas = stackImage(list)

    const jacketWidth = 400
    const jacketHeight = songJacketImage.height * jacketWidth / songJacketImage.width
    // Preserve the original 400px-wide cover slot. A 2px internal inset leaves
    // enough room for the cheap contact shadow without changing any sibling
    // coordinates or the outer component dimensions.
    var canvas = new Canvas(jacketWidth + 35 + rightCanvas.width, Math.max(jacketHeight, rightCanvas.height))
    var ctx = canvas.getContext("2d")
    drawRoundedImage(ctx, songJacketImage, 2, 2, jacketWidth - 4, jacketHeight - 4, { radius: 22 })
    ctx.drawImage(rightCanvas, 435, 0)
    ctx.drawImage(difficultyImage, 435, canvas.height - difficultyImage.height)

    return (drawDatablock({ list: [canvas] }))
}
