import { Event } from '@/types/Event';
import { Server } from '@/types/Server';
import { EventStage, Stage } from '@/types/EventStage';
import { serverNameFullList } from '@/config';
import { drawTitle } from '@/components/title'
import { Canvas } from 'skia-canvas'
import { drawEventStageTypeTop, drawEventStageSongHorizontal } from '@/components/list/eventStage'
import { outputFinalBuffer } from '@/image/output'
import { drawDatablock } from '@/components/dataBlock'
import { stackImage, stackImageHorizontal } from '@/components/utils'
import { line } from '@/components/list';
import { checkTsIfInRangeOrNot } from '@/components/list/time';
import { drawSongListDataBlock, drawSongListWithoutDataBlock } from '@/components/dataBlock/songList';
import { Song } from '@/types/Song';
import { drawSongListInListWithMoreDetail, drawSongListInListWithMoreDetailCustomKey } from '@/components/list/song';

export async function drawEventStage(eventId: number, index: number, date: Date, mainServer: Server, meta: boolean = false, compress: boolean): Promise<Array<Buffer | string>> {
    const event = new Event(eventId);
    if (!event.isExist) {
        return [`错误: 活动不存在`];
    }
    if (event.eventType != 'festival') {
        return [`错误: 活动不是festival类型`];
    }
    if (event.startAt[mainServer] == null) {
        return [`错误: ${serverNameFullList[mainServer]} ID:${eventId} 活动没有时间数据`];
    }
    const eventStage = new EventStage(eventId);
    await eventStage.initFull();
    if (!eventStage.isExist) {
        return [`错误: 活动stage数据不足`];
    }
    var songList:Song[] = []
    var all = []
    all.push(await drawTitle('查试炼', `国服 ID:${eventId} 活动试炼`))

    let showCurrentStageOnly = true    // 是否只显示当前的试炼
    if (!checkTsIfInRangeOrNot(eventStage.getStageStartTs(),eventStage.getStageEndTs(),new Date().getTime())){

        showCurrentStageOnly = false
        
    }else{
        if (date) showCurrentStageOnly = false
    }
    //获得活动stage列表
    var stageList = eventStage.getStageList()
    if (!date) {
        //date = new Date(stageList[0].startAt + (index - 1) * 24 * 60 * 60 * 1000)
        date = new Date()
    }
    stageList = stageList.filter((stage) => {
        // console.log((new Date(stage.startAt)))
        return (new Date(stage.startAt)).getDate() == date.getDate() || (new Date(stage.endAt)).getDate() == date.getDate()
    })
    if (stageList.length == 0) {
        return ['日期' + date.toDateString() + '不在活动范围内']
    }
    let eventStagePromises = []

    //绘制活动stage，每个stage一个图片
    async function drawStageSong(stage: Stage) {
        let imageList =[]
        let nowtime = new Date().getTime()
        let isDrawEventStageSongHorizontal = false
        const  checkTs=function(tsTypeStart,tsTypeEnd,nowTs){
            if (isDrawEventStageSongHorizontal) return false
            let r = (((Number(tsTypeStart) <= nowTs)) && (Number(tsTypeEnd) >= nowTs))
            return (r)
        }
        const  preCheckTs=function(tsTypeStart){
            if (isDrawEventStageSongHorizontal) return false
            let r = (((Number(tsTypeStart) <= nowtime)))
            return (r)
        }
        //console.log(stage)
        
        for (let i = 0 ;i<stage.type.length;i++){
            if (stage.type[i] == undefined) continue
            // 现在时间大于试炼的开始时间，试炼歌曲时间
            if (Number(stage.type[i].endAt) >= stage.startAt && Number(stage.type[i].startAt)<= stage.startAt){
                imageList.push(await drawEventStageTypeTop(stage,i))
                if (checkTs(stage.type[i].startAt,stage.type[i].endAt,nowtime)){
                    imageList.push(await drawEventStageSongHorizontal(stage, meta))
                    isDrawEventStageSongHorizontal = true
                }
                continue
            }
            if (Number(stage.type[i].startAt) >= (stage.startAt) &&  Number(stage.type[i].startAt) <= (stage.endAt)){
                imageList.push(await drawEventStageTypeTop(stage,i))
                if (checkTs(stage.type[i].startAt,stage.type[i].endAt,nowtime)){
                    imageList.push(await drawEventStageSongHorizontal(stage, meta))
                    isDrawEventStageSongHorizontal = true
                }
                continue
            }
            if (Number(stage.type[i].startAt) >= (stage.startAt) &&  Number(stage.type[i].endAt) <= (stage.endAt)){
                imageList.push(await drawEventStageTypeTop(stage,i))
                if (checkTs(stage.type[i].startAt,stage.type[i].endAt,nowtime)){
                    imageList.push(await drawEventStageSongHorizontal(stage, meta))
                    isDrawEventStageSongHorizontal = true
                }
                continue
            }
        }
        if (!isDrawEventStageSongHorizontal) imageList.push(await drawEventStageSongHorizontal(stage, meta))
        return stackImage(imageList)
        /*
        return stackImage([
            await drawEventStageTypeTop(stage),
            await drawEventStageSongHorizontal(stage, meta)
        ])
            */

    }
    let ts_cur_date = new Date()
    let ts_cur = ts_cur_date.getTime()
    for (let i = 0; i < stageList.length; i++) {
        const stage = stageList[i];
        if (showCurrentStageOnly){      // 如果只显示当前试炼
            if (checkTsIfInRangeOrNot(stage.startAt,stage.endAt,ts_cur)){
                eventStagePromises.push(drawStageSong(stage))
                for(let id of stage.songIdList){
                    songList.push(new Song(id))
                }
            }
        }
        else{
            eventStagePromises.push(drawStageSong(stage))
        }
    }

    var eventStageResults = await Promise.all(eventStagePromises)

    //将活动stage图片纵向并横向合并
    var tempH = 0;
    const maxHeight = 6000;

    var tempEventStageImageList: Canvas[] = [];
    var eventStageImageListHorizontal: Canvas[] = [];
    
    for (var i = 0; i < eventStageResults.length; i++) {
        var tempImage = eventStageResults[i];
        tempH += tempImage.height;
        if (tempH > maxHeight) {
            if (tempEventStageImageList.length > 0) {
                eventStageImageListHorizontal.push(await drawDatablock({ list: tempEventStageImageList }));
            }
            tempEventStageImageList = [];
            tempH = tempImage.height;
        }
        tempEventStageImageList.push(tempImage);
        tempEventStageImageList.push(line)
        if (i == eventStageResults.length - 1) {
            if (!showCurrentStageOnly)tempEventStageImageList.pop()
            //let content = tempEventStageImageList
            if (showCurrentStageOnly) tempEventStageImageList.push(await drawSongListInListWithMoreDetailCustomKey(songList,null,null,[mainServer],false,undefined))
            eventStageImageListHorizontal.push(await drawDatablock({ list: tempEventStageImageList }));
        }
    }
    
    const eventStageListImage = stackImageHorizontal(eventStageImageListHorizontal)
    all.push(eventStageListImage)
    //if (showCurrentStageOnly) all.push(await drawDatablock({list:[await drawSongListInListWithMoreDetail(songList,null,null,[mainServer],false,undefined)]}))
    var buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG: true,
        compress: compress,
    })
    let returnResult = []
    returnResult.push(buffer)
    if (showCurrentStageOnly) returnResult.push(`如需查看当天全部试炼请回复：查试炼 ${ts_cur_date.getMonth()+1}.${ts_cur_date.getDate()}`)
    return returnResult;

}