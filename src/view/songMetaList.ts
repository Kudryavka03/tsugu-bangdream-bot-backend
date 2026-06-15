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
import { formatSeconds } from "@/components/list/time";
import mainAPI from "@/types/_Main";
import { matchSongList } from "./songList";
import { fuzzySearch, FuzzySearchResult, include } from "@/fuzzySearch";
import pLimit from "p-limit";
import { parentPort, threadId, isMainThread } from 'worker_threads';
import { drawTips } from "@/components/tips";
const limitSub = pLimit(3);
const limitMain = pLimit(7);
const limitTask = isMainThread ? limitMain : limitSub;
if (!isMainThread && parentPort) {
    console.log = (...args) => {
      parentPort!.postMessage({
        type: 'log',
        threadId,
        args
      });
    };
  }
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
const difficulties = [
    'easy',
    'normal',
    'hard',
    'expert',
    'special'
]

export async function drawSongMetaList(mainServer: Server, compress: boolean,searchCondition?:string,timeOffset:number=30): Promise<Array<Buffer | string>> {
    let difficultMask = 0b00000
    let isRatioMode = false
    //console.log(searchCondition)
    if (searchCondition && searchCondition.includes('效率')){
        isRatioMode = true
        searchCondition = searchCondition.replace(' 效率','').replace('效率','')
    }
    searchCondition = (searchCondition) ?searchCondition:''
    searchCondition = searchCondition.toLowerCase()
    let difficultyCondition = searchCondition.split(' ')
    for(const [i,d] of difficultyCondition.entries()){
        let cnDiffDesc =  d.replace('谱','').replace('铺','')
        if(d == 'easy' || d == 'ez' || cnDiffDesc=='蓝'|| cnDiffDesc=='紫'){
            difficultMask |= (1<<0)
            difficultyCondition[i] = ''
        }
        else if(d == 'normal' || d == 'nl' || d == 'nm' || cnDiffDesc=='绿'){
            difficultMask |= (1<<1)
            difficultyCondition[i] = ''
        }
        else if(d == 'hard' || d == 'hd'|| cnDiffDesc=='黄'){
            difficultMask |= (1<<2)
            difficultyCondition[i] = ''
        }
        else if(d == 'expert' || d == 'ex'|| cnDiffDesc=='红'){
            difficultMask |= (1<<3)
            difficultyCondition[i] = ''
        }
        else if(d == 'special' || d == 'sp'|| cnDiffDesc=='粉'){
            difficultMask |= (1<<4)
            difficultyCondition[i] = ''
        }
    }

    searchCondition = difficultyCondition.filter(x=>(x!='')).join(' ')
    //console.log(`\'${searchCondition}\'`)
    //console.log(difficultMask,[0,1,2,3,4].map(x=>{return (difficultMask & (1 << x))} ))
    let fuzzySearchResult: FuzzySearchResult
    fuzzySearchResult = (searchCondition!='')?fuzzySearch(searchCondition):null
    const feverMode = [true, false]
    const imageList = []
    var drawMetaRankListDatablockPromise = []

    for (let i = 0; i < feverMode.length; i++) {
        const element = feverMode[i];
        !isRatioMode?drawMetaRankListDatablockPromise.push(limitTask(() => drawMetaRankListDatablock(element, mainServer,fuzzySearchResult,difficultMask)))
        : drawMetaRankListDatablockPromise.push(limitTask(() => drawMetaTimeRatioRankListDatablock(element, mainServer,fuzzySearchResult,difficultMask)))
        // imageList.push(await drawMetaRankListDatablock(element, mainServer))
    }
    const drawMetaRankListDatablockResult = await Promise.all(drawMetaRankListDatablockPromise)
    for(var dataRankList of drawMetaRankListDatablockResult){
        imageList.push(dataRankList)
    }


    var all = []
    all.push(await drawTitle('查询', `${serverNameFullList[mainServer]} 分数排行榜`))
    all.push(stackImageHorizontal(imageList))
     all.push(await drawTips({text:`按${!isRatioMode?'分数':'周回效率'}排序 在一个周回内，歌曲本体时长 + ${timeOffset}秒选歌回房时间的周回效率，超出周回的结算分将被丢弃。`,maxWidth:1600}))
    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress:compress
    })
    return [buffer]
}

async function drawMetaRankListDatablock(Fever: boolean, mainServer: Server,matches:FuzzySearchResult,difficultyMask=0b11111,timeOffset:number=30): Promise<Canvas> {
    if (!difficultyMask || difficultyMask == 0b00000)difficultyMask = 0b11111
    
    const tempSongList = matches?matchSongList(matches, [Server.jp]):[]
    let level = (matches && matches['songLevels'])?matches['songLevels']:null
    const metaRanking = getMetaRanking(Fever, mainServer);
    const maxMeta = metaRanking[0].meta
    const metaTimeRatioRankMap = new Map<string, number>();
    [...metaRanking]
        .sort((a, b) => {
            return getMetaTimeRatio(b.meta, getSongLength(b.songId), timeOffset, 1)
                - getMetaTimeRatio(a.meta, getSongLength(a.songId), timeOffset, 1);
        })
        .forEach((item, index) => {
            metaTimeRatioRankMap.set(`${item.songId}_${item.difficulty}`, index + 1);
        });
    let list: Array<Canvas> = []
    var drawSongInListPromise = []
    for (let i = 0; i < metaRanking.length; i++) {
        let song = new Song(metaRanking[i].songId)
        let difficultyId = metaRanking[i].difficulty
        if (tempSongList && tempSongList.length!=0){
            for(let ts of tempSongList){
                if (song.songId == ts.songId){
                    if((difficultyMask & (1 << difficultyId)) !== 0){
                        if(!level || level.includes(song.difficulty[difficultyId].playLevel)){
                            const metaTimeRatioRank = metaTimeRatioRankMap.get(`${song.songId}_${difficultyId}`) ?? '-';
                            let precent = metaRanking[i].meta / maxMeta * 100
                            precent = Math.round(precent * 100) / 100
                            let metaTimeRatio = getMetaTimeRatio(metaRanking[i].meta,song.length,timeOffset,1)
                            drawSongInListPromise.push(limitTask(() => drawSongInList(song, difficultyId, `相对分数: ${precent}% #${metaRanking[i].rank + 1} / 时长：${formatSeconds(song.length)}（${metaTimeRatio}%/#${metaTimeRatioRank}）`)))
                        }
                    }
                }
            }
        }else{
            if((difficultyMask == 0b11111) || (difficultyMask & (1 << difficultyId)) !== 0){
                if(!level || level.includes(song.difficulty[difficultyId].playLevel)){
                    const metaTimeRatioRank = metaTimeRatioRankMap.get(`${song.songId}_${difficultyId}`) ?? '-';
                    let precent = metaRanking[i].meta / maxMeta * 100
                    precent = Math.round(precent * 100) / 100
                    let metaTimeRatio = getMetaTimeRatio(metaRanking[i].meta,song.length,timeOffset,1)
                    drawSongInListPromise.push(limitTask(() => drawSongInList(song, difficultyId, `相对分数: ${precent}% #${metaRanking[i].rank + 1} / 时长：${formatSeconds(song.length)}（${metaTimeRatio}%/#${metaTimeRatioRank}）`)))
                }
            }
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

async function drawMetaTimeRatioRankListDatablock(Fever: boolean, mainServer: Server,matches:FuzzySearchResult,difficultyMask=0b11111,timeOffset:number=30): Promise<Canvas> {
    if (!difficultyMask || difficultyMask == 0b00000)difficultyMask = 0b11111
    
    const tempSongList = matches?matchSongList(matches, [Server.jp]):[]
    let level = (matches && matches['songLevels'])?matches['songLevels']:null
    const metaRankingTemp = getMetaRanking(Fever, mainServer);
    const maxMeta = metaRankingTemp[0].meta
    //const metaTimeRatioRankMap = new Map<string, number>();
    const metaRanking = [...metaRankingTemp].sort((a,b)=>getMetaTimeRatio(b.meta,getSongLength(b.songId),timeOffset,1) - getMetaTimeRatio(a.meta,getSongLength(a.songId),timeOffset,1))
    /*
    metaRanking.forEach((item, index) => {
            metaTimeRatioRankMap.set(`${item.songId}_${item.difficulty}`, index + 1);
        });
        */
    let list: Array<Canvas> = []
    var drawSongInListPromise = []
    for (let i = 0; i < metaRanking.length; i++) {
        let song = new Song(metaRanking[i].songId)
        let difficultyId = metaRanking[i].difficulty
        if (tempSongList && tempSongList.length!=0){
            for(let ts of tempSongList){
                if (song.songId == ts.songId){
                    if((difficultyMask & (1 << difficultyId)) !== 0){
                        if(!level || level.includes(song.difficulty[difficultyId].playLevel)){
                            //const metaTimeRatioRank = metaTimeRatioRankMap.get(`${song.songId}_${difficultyId}`) ?? '-';
                            let precent = metaRanking[i].meta / maxMeta * 100
                            precent = Math.round(precent * 100) / 100
                            let metaTimeRatio = getMetaTimeRatio(metaRanking[i].meta,song.length,timeOffset,1)
                            drawSongInListPromise.push(limitTask(() => drawSongInList(song, difficultyId, `相对分数: ${precent}% #${metaRanking[i].rank + 1} / 时长：${formatSeconds(song.length)}（${metaTimeRatio}%/#${i+1}）`)))
                        }
                    }
                }
            }
        }else{
            if((difficultyMask == 0b11111) || (difficultyMask & (1 << difficultyId)) !== 0){
                if(!level || level.includes(song.difficulty[difficultyId].playLevel)){
                    //const metaTimeRatioRank = metaTimeRatioRankMap.get(`${song.songId}_${difficultyId}`) ?? '-';
                    let precent = metaRanking[i].meta / maxMeta * 100
                    precent = Math.round(precent * 100) / 100
                    let metaTimeRatio = getMetaTimeRatio(metaRanking[i].meta,song.length,timeOffset,1)
                    drawSongInListPromise.push(limitTask(() => drawSongInList(song, difficultyId, `相对分数: ${precent}% #${metaRanking[i].rank + 1} / 时长：${formatSeconds(song.length)}（${metaTimeRatio}%/#${i+1}）`)))
                }
            }
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

function getMetaTimeRatio(meta:number,songLength,timeOffset:number=30,round:number=1):number{
    let roundTime = 3600 * round
    let baseTime = (Math.floor(songLength) + timeOffset)
    let baseRatio = meta / baseTime
    let count = Math.floor(roundTime / baseTime)
    //console.log(baseTime,baseRatio,count,(baseRatio * count))
    return Math.round((baseRatio * count)*10000)/100
}

function getSongLength(songId:number):number{
    return mainAPI['songs'][songId.toString()]['length']
}

export async function genMetaRankCache(Fever: boolean, mainServer: Server) {
    const metaRanking = getMetaRanking(Fever, mainServer);
    const maxMeta = metaRanking[0].meta
    for (let i = 0; i < metaRanking.length; i++) {
        let difficultyId = metaRanking[i].difficulty
        /*   暂时用不上
        let song = new Song(metaRanking[i].songId)
        let precent = metaRanking[i].meta / maxMeta * 100
        precent = Math.round(precent * 100) / 100
        */
        try{
            mainAPI['metaCache'][Fever][mainServer][`${metaRanking[i].songId}`][difficultyId] = (metaRanking[i].rank + 1)
        }
        catch{
            mainAPI['metaCache'][Fever][mainServer][`${metaRanking[i].songId}`] ??= {}
            mainAPI['metaCache'][Fever][mainServer][`${metaRanking[i].songId}`][difficultyId] = (metaRanking[i].rank + 1)
        }

    }
}
