import { Room } from "@/types/Room";
import { Player } from "@/types/Player";
import { getUserIcon } from "@/api/userIcon"
import { Canvas, Image } from 'skia-canvas';
import { drawDatablock } from "@/components/dataBlock";
import { drawList, line, drawListWithLine, drawListMerge, drawListMergeWithoutWidth } from "@/components/list";
import { drawText, releaseCanvas } from "@/image/text";
import { stackImage, stackImageHorizontal } from "@/components/utils";
import { changeTimefomant } from '@/components/list/time'
import { drawPlayerCardInList } from '@/components/list/playerCardIconList'
import { drawDegree } from '@/components/degree'
import { Degree } from "@/types/Degree";
import { resizeImage } from "@/components/utils";
import { drawRoundedRectWithText } from "@/image/drawRect";


export async function drawRoomListTitle() {
    const canvas = new Canvas(1000, 150)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ff3b72'
    ctx.fillRect(0, 0, 1000, 150)
    var roomListTips = await drawText({
        color: '#ffffff',
        text: '房间列表',
        lineHeight: 70,
        textSize: 70,
        maxWidth: 1000
    })
    ctx.drawImage(roomListTips, 40, 40)

    
    const timeText = await drawText({
        color: '#ffffff',
        text: changeTimefomant(new Date().getTime()),
        lineHeight: 30,
        textSize: 30,
        maxWidth: 1000
    })
    ctx.drawImage(timeText, 960 - timeText.width, 80)

    return canvas
}

const maxWidthText = 580
export async function drawRoonInList(room: Room) {
    let workgroup = []
    let player:Player = null;
    workgroup.push(getUserIcon(room.avatarUrl))
    //console.log('drawRoonInList')
    if (room.player != undefined) { // 是否取得缓存是高度跟cacheTime挂钩的。如果出现Bestdori通知客户端使用缓存的话，cacheTime不会更新。因此要给Player增加强制使用本地缓存的选项
        player = new Player(room.player.playerId, room.player.server)
        //await player.initFull(true,1,true)
        workgroup.push(player.initFull(true,1,false,0))
    }
    const Icon = (await Promise.all(workgroup))[0]

    const timeNow = new Date().getTime()
    //头像
    ////const Icon = await getUserIcon()
    //const Icon = await getUserIcon(room.avatarUrl)
    //文本
    const textList: Canvas[] = []
    var timesFrom = await drawText({
        text: `${room.userName} 来自${room.source} ${Math.floor((timeNow - room.time) / 1000)}秒前`,
        textSize: 30,
        maxWidth: maxWidthText
    })
    textList.push(timesFrom )
    // 防止写小作文
    // 
    let label = getLabelFromRawMessage(room.rawMessage)
    let shouldBeRemove =( room.rawMessage.length >  50)
    // 大于50个字就进入检查流程
    if (shouldBeRemove){
        const regex1 = /\d+\s*(?:w|万)[\s\S]*?q\d+.{0,12}/gi;
        const regex2 = /\b\d{6}\b[\s\S]*?q\d+.{0,12}/gi;
        const regex3 = /\b\d{6}\b[\s\S]*?\d+\s*(?:w|万)\s*\d+/gi;

        const matches1 = room.rawMessage.match(regex1);
        const matches2 = room.rawMessage.match(regex2);
        const matches3 = room.rawMessage.match(regex3);

        const filteredMatches = matches1 || matches2 || matches3;

        const filteredText = filteredMatches
            ? filteredMatches.join(' ')
            : room.number.toString() + ' 无法提取说明，可能为无效车牌';

        const roomNumberText = filteredMatches
            ? `${room.number} `
            : '';

        if (!filteredMatches) {
            console.log('无法提取车牌：', room.number, room.rawMessage);
        }else{
            textList.push(await drawText({
                text: roomNumberText + filteredText.replace(roomNumberText,"").replace(roomNumberText,""),
                textSize: 40,
                maxWidth: maxWidthText
            }));
        }
    }else{
        textList.push(await drawText({
            text: room.number.toString() + room.rawMessage.replace(`${room.number}`,"").replace(`${room.number}`,""),
            textSize: 40,
            maxWidth: maxWidthText
        }));
    }




    //textList.push(rawMsg);

    //画text
    const textImage = stackImage(textList)
    const canvas = new Canvas(600, textImage.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(textImage, 20, 0)
    //画icon
    const canvasLeft = new Canvas(200, 200)
    const ctxLeft = canvasLeft.getContext('2d')
    ctxLeft.drawImage(Icon, 0, 0, 180, 180)
    //合并
    const canvasUp = stackImageHorizontal([canvasLeft, canvas])
    //画竖线
    const ctxUp = canvasUp.getContext('2d')
    let height = Math.max(180, textImage.height)
    ctxUp.fillStyle = '#a8a8a8'
    ctxUp.fillRect(200, 0, 5, height)
    let list = [canvasUp]
            if (label.length > 0){
        //list.push(line)
        let lbl = []
        for(let t of label){
            lbl.push(await  drawRoundedRectWithText({
                    text: t,
                    textSize: 30,
                    color:'#ebe5e5',
                    textColor:"#3a3939"
                }))
        }
        list.push(drawListMergeWithoutWidth(lbl))
    }
    
    if (player && player.isExist && !player.initError) {
        list.push(line)
        list.push(await drawPlayerDetailInRoomList(player))
    }

    return (drawDatablock({ list: list }))

}

async function drawPlayerDetailInRoomList(player: Player) {
    const canvas = new Canvas(800, 110)
    const ctx = canvas.getContext('2d')
    //画卡
    const cardIconList = await drawPlayerCardInList(player, undefined, true, 100)
    ctx.drawImage(cardIconList, -20, 10)
    //画综合力
    const stat = await player.calcStat()
    let statText: string
    if (player.profile.publishTotalDeckPowerFlg) {
        statText = `综合力: ${Math.floor(stat.performance + stat.technique + stat.visual)}`
    }
    else {
        statText = `综合力: 未公开`
    }
    const statTextImage = await drawText({
        text: statText,
        textSize: 30,
        lineHeight: 50,
        maxWidth: 400
    })
    ctx.drawImage(statTextImage, 800 - statTextImage.width, 0)


    //画牌子
    var degreeImageList: Array<Canvas | Image> = []
    var userProfileDegreeMap = player.profile.userProfileDegreeMap.entries
    const promises: Promise<Canvas | Image>[] = []
    for (const key in userProfileDegreeMap) {
        const tempDegree = userProfileDegreeMap[key]
    
        const p = drawDegree(new Degree(tempDegree.degreeId), player.server)
        promises.push(p)
    }
    const images = await Promise.all(promises)
    for (const img of images) {
        degreeImageList.push(resizeImage({
            image: img,
            heightMax: 35
        }))
        degreeImageList.push(new Canvas(10, 35))
    }
    degreeImageList.pop()
    const degreeListImage = stackImageHorizontal(degreeImageList)
    ctx.drawImage(degreeListImage, 800 - degreeListImage.width, 56)
    return canvas
}

function getLabelFromRawMessage(rawMsg:string):string[]{
    let obj = {
        "ALIVE":[" a","alive","a车"],
        "EXIST":[" e","exist","e车"],
        "跳":[" j","jumpin","红黄跳"],
        "SAVIOR OF SONG":["savior of song"," s","sos","s车"],
        "效率自选":["效率自选","效率","自选"],
        "长途":["长","长途"],
        "禁FC":["禁fc","禁hdfc"],
        "禁HD":["禁hd","禁fchd"],
        "满级技能":["满级"],
        "gr友好":["gr友好","不查gr","不查准度","准度友好"],
        "欢迎清火":["hyqh","欢迎清货","后院起火","海员七号","花音求婚"],
        "下把":["xb","下把","下吧"],
        "结算中":["结算","js"],
        "接车牌":["接车牌"]
    }
    let result:string[] = []
    const plateRegex = /(\d+)\s*(?:w|万)\s*(\d+)?/gi;

    //const plates: string[] = [];

    for (const match of rawMsg.replace("满级","").matchAll(plateRegex)) {
        const base = match[1];
        const skill = match[2];

        const plate = skill
            ? `${base}W${skill}`
            : `${base}W`;

        result.push(plate);
    }
    for (const label in obj) {
        for (const keyword of obj[label]) {
            const key = keyword.toLowerCase();

            // e / s 这种单字母需要作为独立单词匹配
            const matched = key.length === 1 && /[a-z]/i.test(key)
                ? new RegExp(`\\b${key}\\b`, "i").test(rawMsg)
                : rawMsg.toLowerCase().includes(key);

            if (matched) {
                result.push(label);
                break;
            }
        }
    }
    return result
}
