import { Song, getMetaRanking } from "@/types/Song";
import { Canvas } from 'skia-canvas'
import { drawTitle } from '@/components/title';
import { outputFinalBuffer } from '@/image/output'
import { drawSongInList } from '@/components/list/song';
import { drawDottedLine } from '@/image/dottedLine';
import { stackImageHorizontal } from '@/components/utils';
import { Server } from '@/types/Server';
import { serverNameFullList } from '@/config';
import { drawDatablock } from '@/components/dataBlock'

// 紧凑化虚线分割
const line = drawDottedLine({
    width: 800,
    height: 10,
    startX: 5,
    startY: 5,
    endX: 795,
    endY: 5,
    radius: 2,
    gap: 10,
    color: "#a8a8a8"
})

export async function drawSongMetaList(mainServer: Server, compress: boolean,bandId?:number): Promise<Array<Buffer | string>> {
    const feverMode = [true, false]
    const imageList = []
    var drawMetaRankListDatablockPromise = []
    for (let i = 0; i < feverMode.length; i++) {
        const element = feverMode[i];
        drawMetaRankListDatablockPromise.push(drawMetaRankListDatablock(element, mainServer,bandId))
        // imageList.push(await drawMetaRankListDatablock(element, mainServer))
    }
    const drawMetaRankListDatablockResult = await Promise.all(drawMetaRankListDatablockPromise)
    for(var dataRankList of drawMetaRankListDatablockResult){
        imageList.push(dataRankList)
    }


    var all = []
    all.push(drawTitle('查询', `${serverNameFullList[mainServer]} 分数排行榜`))
    all.push(stackImageHorizontal(imageList))
    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress:compress
    })
    return [buffer]
}

async function drawMetaRankListDatablock(Fever: boolean, mainServer: Server,bandId?:number): Promise<Canvas> {
    const metaRanking = getMetaRanking(Fever, mainServer);
    const maxMeta = metaRanking[0].meta
    let list: Array<Canvas> = []
    var drawSongInListPromise = []
    for (let i = 0; i < metaRanking.length; i++) {
        let song = new Song(metaRanking[i].songId)
        let difficultyId = metaRanking[i].difficulty
        let precent = metaRanking[i].meta / maxMeta * 100
        precent = Math.round(precent * 100) / 100
        //console.log(bandId)
        if (bandId && song.bandId == bandId){
            drawSongInListPromise.push(drawSongInList(song, difficultyId, `相对分数: ${precent}% #${metaRanking[i].rank + 1}`))
        }
        else{
            if(!bandId) drawSongInListPromise.push(drawSongInList(song, difficultyId, `相对分数: ${precent}% #${metaRanking[i].rank + 1}`))
        }
        if(drawSongInListPromise.length >= 50) break
    }
    for(var resultSong of await Promise.all(drawSongInListPromise)){
        list.push(resultSong)
        list.push(line)
    }

    list.pop()
    const topLeftText = Fever ? '有Fever' : '无Fever'
    return (drawDatablock({ list, topLeftText }))
}

