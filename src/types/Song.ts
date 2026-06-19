import { callAPIAndCacheResponse } from '@/api/getApi'
import { Image, loadImage } from 'skia-canvas'
import { downloadFile } from '@/api/downloadFile'
import { getServerByPriority, Server } from '@/types/Server'
import mainAPI from '@/types/_Main'
import { Bestdoriurl } from '@/config'
import { stringToNumberArray } from '@/types/utils'
import { assetErrorImageBuffer } from "@/image/utils";
import { cardInfo } from '@/teamBuilder/types'

export const difficultyName = {//难度名称
    0: "easy",
    1: "normal",
    2: "hard",
    3: "expert",
    4: "special"
}

export const tagNameList = {
    'normal': '原创曲',
    'anime': '翻唱曲',
    'tie_up': 'EXTRA歌曲',
}

export const difficultyColorList = [ //画难度时使用的配色
    "#8eb4fd",
    "#a6f692",
    "#fbdf8c",
    "#ff898b",
    "#f383cb"
]
export const difficultyNameList = [ //难度名称List
    'easy',
    'normal',
    'hard',
    'expert',
    'special'
]

export class Song {
    songId: number;
    isExist = false;
    data: object;
    tag: string;
    bandId: number;
    jacketImage: Array<string>;
    musicTitle: Array<string | null>;
    publishedAt: Array<number | null>;
    closedAt: Array<number | null>;
    difficulty: {
        [difficultyId: number]: {
            playLevel: number,
            multiLiveScoreMap?: object,
            notesQuantity?: number,
            scoreC?: number,
            scoreB?: number,
            scoreA?: number,
            scoreS?: number,
            scoreSS?: number,
            publishedAt?: Array<number | null>,
        }
    };
    length: number;
    notes: {
        [difficultyId: number]: number
    };
    bpm: {
        [difficultyId: number]: Array<{
            bpm: number,
            start: number,
            end: number
        }>
    }


    //other
    bgmId: string;
    bgmFile: string;
    seq: number;
    achievements: Array<{
        musicId: number,
        achievementType: string,
        rewardType: string,
        quantity: number,
    }>
    detail: {
        lyricist: string[],
        composer: string[],
        arranger: string[],
    }
    howToGet: Array<string | null>
    //用于模糊搜索
    songLevels: number[] = []
    nickname: string | null = null;

    //meta数据
    hasMeta = false;

    meta: {
        [difficultyId: number]: {
            [skillDuration: number]: [
                withoutFeverWithoutSkill: number,
                withoutFeverWithSkill: number,
                withFeverWithoutSkill: number,
                withFeverWithSkill: number
            ]
        }
    }

    isInitfull = false

    constructor(songId: number,apiData?:object) {
        this.songId = songId
        let songData
            songData = mainAPI['songs'][songId.toString()]
        
        if (songData == undefined) {
            this.isExist = false;
            return
        }

        this.isExist = true;
        this.data = songData
        this.tag = songData['tag']
        this.bandId = songData['bandId']
        this.jacketImage = songData['jacketImage']
        this.musicTitle = songData['musicTitle']
        this.publishedAt = songData['publishedAt'] ? stringToNumberArray(songData['publishedAt']) : [];
        this.closedAt = songData['closedAt'] ? stringToNumberArray(songData['closedAt']) : [];
        this.difficulty = songData['difficulty']
        this.length = songData['length']
        this.notes = songData['notes']
        this.bpm = songData['bpm']
        this.nickname = songData['nickname']
        for (let i in this.difficulty) {
            const playLevel = this.difficulty[i].playLevel;
            this.songLevels.push(playLevel !== undefined ? playLevel : 0);
        }

        //meta数据
        const metaData = mainAPI['meta'][songId.toString()]
        if (metaData == undefined) {
            return
        }
        this.hasMeta = true
        this.meta = metaData

    }
    async initFull() {
        if (this.isInitfull) {
            return
        }
        if (this.isExist == false) {
            return
        }
        const songData = await this.getData()

        this.data = songData

        this.tag = songData['tag']
        this.bandId = songData['bandId']
        this.jacketImage = songData['jacketImage']
        this.musicTitle = songData['musicTitle']
        this.publishedAt = songData['publishedAt'] ? stringToNumberArray(songData['publishedAt']) : [];
        this.closedAt = songData['closedAt'] ? stringToNumberArray(songData['closedAt']) : [];
        this.difficulty = songData['difficulty']
        this.length = songData['length']
        this.notes = songData['notes']
        this.bpm = songData['bpm']

        //other
        this.bgmId = songData['bgmId']
        this.bgmFile = songData['bgmFile']
        this.achievements = songData['achievements']
        this.seq = songData['seq']
        this.detail = {
            lyricist: songData['lyricist'],
            composer: songData['composer'],
            arranger: songData['arranger'],
        }
        this.howToGet = songData['howToGet']
        this.isInitfull = true
    }
    async getData() {
        const songData = await callAPIAndCacheResponse(`${Bestdoriurl}/api/songs/${this.songId}.json`,1,3,false,0)
        return songData
    }
    getSongRip(): number {
        return Math.ceil(this.songId / 10) * 10
    }
    async getSongJacketImage(displayedServerList: Server[] = [Server.jp, Server.cn],cacheOnly=false): Promise<Image> {
        const jacketImageUrl = this.getSongJacketImageURL(displayedServerList)
        var jacketImageBuffer = await downloadFile(jacketImageUrl)
        //下载失败自动尝试切换服务器下载
        if (jacketImageBuffer.equals(assetErrorImageBuffer)) {
            console.log("download failed, try to download jacket from other servers")
          const servers = ['jp', 'cn', 'en', 'tw', 'kr'];
          var jacketImageName = this.jacketImage[this.jacketImage.length - 1];
          for (const server of servers) {
            const retryUrl = `${Bestdoriurl}/assets/${server}/musicjacket/musicjacket${this.getSongRip()}_rip/assets-star-forassetbundle-startapp-musicjacket-musicjacket${this.getSongRip()}-${jacketImageName.toLowerCase()}-jacket.png`;
            jacketImageBuffer = await downloadFile(retryUrl, true, false, 1);
            if (!jacketImageBuffer.equals(assetErrorImageBuffer)) break;
          }
        }
        return cacheOnly?null:await loadImage(jacketImageBuffer)
    }
    async getSongJacketBuffer(displayedServerList: Server[] = [Server.jp, Server.cn],cacheOnly=false): Promise<Buffer> {
        const jacketImageUrl = this.getSongJacketImageURL(displayedServerList)
        var jacketImageBuffer = await downloadFile(jacketImageUrl)
        //下载失败自动尝试切换服务器下载
        if (jacketImageBuffer.equals(assetErrorImageBuffer)) {
            console.log("download failed, try to download jacket from other servers")
          const servers = ['jp', 'cn', 'en', 'tw', 'kr'];
          var jacketImageName = this.jacketImage[this.jacketImage.length - 1];
          for (const server of servers) {
            const retryUrl = `${Bestdoriurl}/assets/${server}/musicjacket/musicjacket${this.getSongRip()}_rip/assets-star-forassetbundle-startapp-musicjacket-musicjacket${this.getSongRip()}-${jacketImageName.toLowerCase()}-jacket.png`;
            jacketImageBuffer = await downloadFile(retryUrl, true, false, 1);
            if (!jacketImageBuffer.equals(assetErrorImageBuffer)) break;
          }
        }
        return cacheOnly?null:await jacketImageBuffer
    }
    getSongJacketImageURL(displayedServerList?: Server[]): string {
        var server = getServerByPriority(this.publishedAt, displayedServerList)
        var jacketImageName = this.jacketImage[this.jacketImage.length - 1]
        var songRip = this.getSongRip();
        if (this.songId == 13 || this.songId == 40) {
            songRip = 30;
        } else if(this.songId == 273) { //针对273的修复
            server = Server.cn;
        }
        var jacketImageUrl = `${Bestdoriurl}/assets/${Server[server]}/musicjacket/musicjacket${songRip}_rip/assets-star-forassetbundle-startapp-musicjacket-musicjacket${songRip}-${jacketImageName.toLowerCase()}-jacket.png`
        return jacketImageUrl
    }
    getTagName(): string {
        if (this.tag == undefined) {
            return this.tag
        }
        return tagNameList[this.tag]
    }
    async getSongChart(difficultyId: number,retry = false): Promise<any> {
        try{
            const songChart = await callAPIAndCacheResponse(`${Bestdoriurl}/api/charts/${this.songId}/${difficultyName[difficultyId]}.json`,1/0,2,false,0)
            return songChart
        }
        catch(e){
            return null
        }
    }
    getMaxMetaDiffId(withFever: boolean = true): number{
        var maxDiff = 0, maxMeta = 0
        for (var i in this.difficulty) {
            const difficultyId = parseInt(i)
            const meta = this.calcMeta(withFever, difficultyId)
            if (meta > maxMeta) {
                maxDiff = difficultyId
                maxMeta = meta
            }
        }
        return maxDiff
    }
    /*
    第一个键是歌曲ID，第二个键是难度ID，第三个键是技能时长
    取到的数组是[ 非fever非技能占比, 非fever技能占比, fever非技能占比, fever技能占比 ]
    天下EX，7秒技能的话就取meta[125][3][7]
    返回[ 1.7464, 2.1164, 2.0527, 2.789 ]
    协力带fever，只看2.0527, 2.789
    如果技能是115%的话总百分比为2.0527 + 215% * 2.789

    上面那个算出来之后，最后再乘准确度加成1.1 * P% + 0.8 * (1 - P%)
    得到的就和站上meta的数字一样了
    然后乘上队伍综合力就行
    */

    calcMeta(withFever: boolean, difficultyId: number, scoreUpMaxValue: number = 100, skillDuration: number = 7, accruacy: number = 100): number {
        if (this.hasMeta == false) {
            return 0
        }
        if (withFever) {
            var skillParameter = this.meta[difficultyId][skillDuration][2] + (100 + scoreUpMaxValue) / 100 * this.meta[difficultyId][skillDuration][3]
        }
        else {
            var skillParameter = this.meta[difficultyId][skillDuration][0] + (100 + scoreUpMaxValue) / 100 * this.meta[difficultyId][skillDuration][1]
        }
        var scoreParameter = skillParameter * (1.1 * accruacy / 100 + 0.8 * (1 - accruacy / 100))
        return scoreParameter
    }
    async getChartData(diff: number) {
        const origin = await this.getSongChart(diff)
        const timepoints = origin.filter(n => n.type === 'BPM')
        const chart = new Chart()
        chart.level = this.difficulty[diff].playLevel
        timepoints.sort((a, b) => a.beat - b.beat)
        timepoints.forEach((tp, i, a) => {
            if (i === 0) a[i].time = 0
            else a[i].time = a[i - 1].time + (tp.beat - a[i - 1].beat) * (60 / a[i - 1].bpm)
        })
        const getTime = beat => {
            let lastBPM = timepoints[0]
            for (let i = 0; i < timepoints.length; i++) {
                if (timepoints[i].beat > beat) break
                lastBPM = timepoints[i]
            }
            return lastBPM.time + 60 / lastBPM.bpm * (beat - lastBPM.beat)
        }
    
        origin.forEach((n) => {
            if (n.type === "Long" || n.type === "Slide") {
                n.connections.forEach((c) => {
                    if (c.hidden)
                        return
                    const time = getTime(c.beat)
                    chart.nodes.push({ type: c.skill ? "skill" : "node", time })
                    chart.count += 1
                })
            } else if (n.type == "Single" || n.type === "Directional") {
                const time = getTime(n.beat)
                chart.nodes.push({ type: n.skill ? "skill" : "node", time })
                chart.count += 1
            }
        })

        chart.nodes.sort((a, b) => {
            const val = {
                skill: 0,
                node: 1
            }
            if (sgn(a.time - b.time) != 0) {
                return sgn(a.time - b.time)
            }
            return val[a.type] - val[b.type]
        })
        return chart
    }
}
function sgn(x: number) {
    const eps = 0.001
    return Number(x > eps) - Number(x < -eps)
}
export function getComboMod(combo: number, isMedley: boolean = false) {
    if (combo <= 20)
        return 1
    if (combo <= 300)
        return 1 + 0.01 * Math.ceil(combo / 50)
    if (combo <= 700 || isMedley && combo <= 3000)
        return 1.03 + 0.01 * Math.ceil(combo / 100)
    if (!isMedley)
        return 1.11
    return 1.34
}
export class Chart {
    nodes: Array<{
        type: "node" | "skill"
        time: number
    }>
    level: number
    count: number
    combo: number
    warning: Array<{
        id: number
        timeGap: number
    }>
    meta: {
        noSkill: number
        skill: Array<{
            [duration: number]: number
        }>
        '100+0.5p': Array<{
            [duration: number]: number
        }>
    }
    constructor() {
        this.nodes = []
        this.count = 0
    }
    init(combo: number = 0, isMedley: boolean) {
        this.combo = combo
        const durationList = [3, 3.5, 4, 4.5, 5, 5.5, 5.6, 5.7, 6, 6.2, 6.4, 6.5, 6.8, 7, 7.2, 7.5, 8]
        const durationList2 = [5, 5.5, 6, 6.5, 7]
        this.meta = {
            noSkill: 0,
            skill: [],
            '100+0.5p': []
        }
        this.warning = []
        const base = 3 * (1 + 0.01 * (this.level - 5)) / this.count * 1.1
        for (var i = 0; i < this.nodes.length; i += 1) {
            const node = this.nodes[i]
            combo += 1
            this.meta.noSkill += base * getComboMod(combo, isMedley)
            if (node.type == 'skill') {
                {
                    const skill = {}
                    for (const duration of durationList) {
                        var tempCombo = combo
                        skill[duration] = 0
                        for (var j = i + 1; ; j += 1) {
                            if (sgn(this.nodes[j].time - node.time - duration - 1/30) > 0) {
                                break
                            }
                            tempCombo += 1
                            skill[duration] += base * getComboMod(tempCombo, isMedley)
                        }
                    }
                    this.meta.skill.push(skill)
                }
                {
                    const skill = {}
                    for (const duration of durationList2) {
                        var tempCombo = combo, skillMod = 200
                        skill[duration] = 0
                        for (var j = i + 1; ; j += 1) {
                            if (skillMod < 300)
                                skillMod += 1
                            if (sgn(this.nodes[j].time - node.time - duration - 1/30) > 0) {
                                break
                            }
                            tempCombo += 1
                            skill[duration] += base * getComboMod(tempCombo, isMedley) * skillMod / 200
                        }
                    }
                    this.meta['100+0.5p'].push(skill)
                }
            }
        }
        const skills = this.nodes.filter((node) => node.type == 'skill')
        for (var i = 0; i < skills.length - 1; i += 1) {
            if (skills[i + 1].time - skills[i].time < 8.75) {
                this.warning.push({
                    id: i + 1,
                    timeGap: skills[i + 1].time - skills[i].time
                })
            }
        }
    }
    getSkillMeta(i: number, duration: number, scoreUpMaxValue: number, rateup: boolean) {
        if (rateup)
            return this.meta['100+0.5p'][i][duration]
        return this.meta.skill[i][duration] * scoreUpMaxValue
    }
    getMaxMetaOrder(list: Array<cardInfo> ,scoreUp: Array<number>): {
        meta: number,
        team: Array<cardInfo>,
        capital: cardInfo,
        scoreUp: Array<number>
    } {
        let debugFlags = false;
        const dp = new Array<number>(1 << 5).fill(0), choose = new Array<number>(1 << 5).fill(-1)
        dp[0] = this.meta.noSkill
        for (let j = 0; j < 5; j++) {
            
            if(debugFlags)console.log(`check item ${j}`, {
                duration: list[j].duration,
                rateup: list[j].rateup,
                scoreUp: scoreUp[j],
                meta0: this.getSkillMeta(0, list[j].duration, scoreUp[j], list[j].rateup)
            });
        }
        for (var i = 0; i < 1 << 5; i += 1) {
            var k = 0
            for (var j = 0; j < 5; j += 1) {
                if (i >> j & 1)
                    k += 1
            }
            for (let j = 0; j < 5; j += 1) {
                if (i >> j & 1)
                    continue
                const tmp = dp[i] + this.getSkillMeta(k, list[j].duration, scoreUp[j], list[j].rateup)
                if (tmp > dp[i | 1 << j]) {
                    if(debugFlags)console.log(`update dp[${i}|${1<<j} = ${i | (1<<j)}] using j=${j}, from dp[${i}] and getSkillMeta return ${this.getSkillMeta(k, list[j].duration, scoreUp[j], list[j].rateup)}`)
                    dp[i | 1 << j] = tmp
                    choose[i | 1 << j] = j
                }
                //console.log("final dp:", dp)
                //console.log("final choose:", choose)
            }
        }

        var meta = 0, capital, capitalScoreUp = 0
        for (let i = 0; i < 5; i++) {
            const tmp = this.getSkillMeta(5, list[i].duration, scoreUp[i], list[i].rateup)
            if (tmp > meta) {
                meta = tmp
                capital = list[i]
                capitalScoreUp = scoreUp[i]
            }
        }
        meta += dp[(1 << 5) - 1]
        const order = []
        var i = (1 << 5) - 1
        while (i !== 0) {
            const j = choose[i];
            if (j === -1) throw new Error(`State ${i} was never assigned in DP`);
            order.push(j);
            i ^= 1 << j;
        }
        order.reverse()
        const team = order.map(i => list[i])
        return { meta, team, capital, scoreUp: [...order.map(i => scoreUp[i]), capitalScoreUp] }
    }

    getScore(cardList: Array<cardInfo>, scoreUp: Array<number>, stat: number, isMedley: boolean): number {
        const base = 3 * stat * (1 + 0.01 * (this.level - 5)) / this.count
        var result = 0, skillCount = 0, combo = this.combo, skillMod = 1, rateup = false
        const event = []
        for (var i = 0; i < this.nodes.length; i += 1) {
            const node = this.nodes[i]
            if (event.length > 0 && sgn(node.time - event[0].time) > 0) {
                skillMod = event[0].skillMod
                rateup = event[0].rateup
                event.shift()
            }
            combo += 1
            if (rateup && sgn(skillMod - 2.5) < 0)
                skillMod += 0.005
            result += Math.floor(Math.floor(base * getComboMod(combo, isMedley) * 1.1) * skillMod)
            if (node.type == 'skill') {
                if (event.length > 0) {
                    const startTime = event.at(-1).time + 0.75
                    event.push({
                        time: startTime,
                        skillMod: 1 + scoreUp[skillCount],
                        rateup: cardList[skillCount].rateup
                    })
                    event.push({
                        time: startTime + cardList[skillCount].duration + 1/30,
                        skillMod: 1,
                        rateup: false
                    })
                }
                else {
                    skillMod = 1 + scoreUp[skillCount]
                    rateup = cardList[skillCount].rateup
                    event.push({
                        time: node.time + cardList[skillCount].duration + 1/30,
                        skillMod: 1,
                        rateup: false
                    })
                }
                skillCount += 1
            }
        }
        return result
    }
}



//获取时间范围内指定服务器推出的新歌
export function getPresentSongList(mainServer: Server, start: number = Date.now(), end: number = Date.now()): Song[] {
    var songList: Array<Song> = []
    var songListMain = mainAPI['songs']

    for (const songId in songListMain) {
        if (Object.prototype.hasOwnProperty.call(songListMain, songId)) {
            const song = new Song(parseInt(songId))
            // 检查活动的发布时间和结束时间是否在指定范围内
            if (song.publishedAt[mainServer] == null) {
                continue
            }
            if (song.publishedAt[mainServer] <= end && song.publishedAt[mainServer] >= start) {
                songList.push(song)
            }
            for (let i in song.difficulty) {
                if (song.difficulty[i].publishedAt != undefined) {
                    if (song.difficulty[i].publishedAt[mainServer] <= end && song.difficulty[i].publishedAt[mainServer] >= start) {
                        songList.push(song)
                    }
                }
            }
        }
    }

    return songList
}
export interface songInRank {
    songId: number,
    difficulty: number,
    meta: number,
    rank: number
}
export function getMetaRanking(Fever: boolean, mainServer: Server): songInRank[] {
    var songIdList = Object.keys(mainAPI['meta'])
    var songRankList: songInRank[] = []
    //var currentDateTime = new Date().getTime()
    for (let i = 0; i < songIdList.length; i++) {
        const songId = songIdList[i];
        var song = new Song(parseInt(songId))
        //如果在所选服务器都没有发布，则跳过
        if (song.publishedAt[mainServer] == null ||Object.keys(song.notes).length == 0 ) { //song.publishedAt[mainServer] < currentDateTime
            continue
        }

        //如果没有meta数据，则跳过
        if (song.hasMeta == false) {
            continue
        }
        //有一些song没有4 difficulty
        for (var j in song.difficulty) {
            var difficulty = parseInt(j)
            var meta = song.calcMeta(Fever, difficulty)
            songRankList.push({
                songId: song.songId,
                difficulty: difficulty,
                meta: meta,
                rank: 0
            })
        }
    }
    songRankList.sort((a, b) => {
        return b.meta - a.meta
    })
    for (let i = 0; i < songRankList.length; i++) {
        songRankList[i].rank = i
    }
    return songRankList
}

export function calcLoseFire(song1:Song,song2:Song,fever:boolean,diffId1:number,diffId2:number,mainServer:Server){ // 亏火计算，没写完，用到再写
    const meta1 = song1.calcMeta(fever, diffId1)
    const meta2 = song2.calcMeta(fever, diffId2)

    // Ensure `high` is the song with higher meta (A 相对 B 出分更高)
    let highMeta = meta1, lowMeta = meta2
    let highSong = song1, lowSong = song2
    let highDiff = diffId1, lowDiff = diffId2
    if (meta2 > meta1) {
        highMeta = meta2; lowMeta = meta1
        highSong = song2; lowSong = song1
        highDiff = diffId2; lowDiff = diffId1
    }

    const isSameSong = song1.songId === song2.songId || song1.musicTitle[mainServer] == song2.musicTitle[mainServer]
    const titleHigh = isSameSong ? (difficultyNameList[highDiff]?.toUpperCase() || 'Unknown') : ((highSong.musicTitle && highSong.musicTitle[mainServer]) || 'Unknown')
    const titleLow = isSameSong ? (difficultyNameList[lowDiff]?.toUpperCase() || 'Unknown') : ((lowSong.musicTitle && lowSong.musicTitle[mainServer]) || 'Unknown')
    const song1Title = isSameSong ? (difficultyNameList[diffId1]?.toUpperCase() || 'Unknown') : ((song1.musicTitle && song1.musicTitle[mainServer]) || 'Unknown')
    const song2Title = isSameSong ? (difficultyNameList[diffId2]?.toUpperCase() || 'Unknown') : ((song2.musicTitle && song2.musicTitle[mainServer]) || 'Unknown')

    // Guard: identical or non-positive meta
    if (highMeta <= 0 || lowMeta <= 0 || Math.abs(highMeta - lowMeta) < 1e-9) {
        const tips = `${titleHigh} 与 ${titleLow} 的 meta 相同或无效，无法计算亏火`
        return { ok: false, tips }
    }

    const diff = highMeta - lowMeta

    // 1) 计算 n 使得 n * highMeta ≈ (n+1) * lowMeta
    //    解得 n = lowMeta / (highMeta - lowMeta)
    const equalPlaysExact = lowMeta / diff
    const equalPlaysRound = Math.round(equalPlaysExact)
    const equalPlaysCeil = Math.ceil(equalPlaysExact)

    // 2) 计算打多少把会亏一火（游戏中 1 火 = 5 把）
    //    损失一火的价值 = 5 * highMeta
    //    每多打一把 lowSong 相比 highSong 亏损 = (highMeta - lowMeta)
    //    所以需要的把数 = 5 * highMeta / (highMeta - lowMeta)
    const playsToLoseOneFireExact = 5 * highMeta / diff
    const playsToLoseOneFire = Math.ceil(playsToLoseOneFireExact)

    // 3) 各打 30 把，B 相较于 A 会亏多少火
    //    差值总量 = 30 * (highMeta - lowMeta)
    //    换算为火 = 差值总量 / (5 * highMeta)
    const lostFiresFor30Plays = (30*15 * diff) / (5 * highMeta)

    const timesPerOneRound = 3600
    const extraTime1 = 30   // 严格模式
    const extraTime2 = 40   // 宽松判定
    let song1CountPerRoundStrict = Math.floor(timesPerOneRound / (Math.floor(song1.length) + extraTime1))
    let song2CountPerRoundStrict = Math.floor(timesPerOneRound / (Math.floor(song2.length) + extraTime1))
    const totalScoreSong1PreRound = (song1CountPerRoundStrict*15 * meta1)
    const totalScoreSong2PreRound = (song2CountPerRoundStrict*15 * meta2)


    const tips = []
    tips.push(`${titleHigh} 相较于 ${titleLow} 出分更高 (meta: ${highMeta.toFixed(4)} vs ${lowMeta.toFixed(4)})`)
    // 
    tips.push(`打三火（15把）时，同样出分下 ${titleHigh} 比 ${titleLow} 少用 ${(((highMeta*15)-(lowMeta*15))/(lowMeta*5)).toFixed(4)} 火`) 
    tips.push(`打三火（15把）时，同样出分下 ${titleLow} 比 ${titleHigh} 多用 ${(((highMeta*15)-(lowMeta*15))/(highMeta*5)).toFixed(4)} 火`) 
    tips.push(`约: ${titleHigh} 打 ${equalPlaysRound} 把 ≈ ${titleLow} 打 ${equalPlaysRound + 1} 把`) 
    tips.push(`精确值: n = ${equalPlaysExact.toFixed(4)} (向上取整 ${equalPlaysCeil})`)
    tips.push(`大约打 ${playsToLoseOneFire} 把 （${Math.round(playsToLoseOneFireExact/5)}火） ${titleLow} 会亏一火，精确值 ${playsToLoseOneFireExact.toFixed(4)}`)
    tips.push(`固定30把3火时，${titleLow} 相较于 ${titleHigh} 会亏约 ${lostFiresFor30Plays.toFixed(2)} 火`)
    

    if (totalScoreSong1PreRound<totalScoreSong2PreRound){
        let lose = (totalScoreSong2PreRound - totalScoreSong1PreRound) / (5*meta2)
        tips.push(`严格一个周回内，${song1Title} 相较于 ${song2Title} 会亏约 ${lose.toFixed(2)} 火`)
        tips.push(`严格一个周回内，${song1Title} 相较于 ${song2Title} 会少打 ${Math.abs(song1CountPerRoundStrict - song2CountPerRoundStrict)} 把`)
    }else{
        let lose = (totalScoreSong1PreRound - totalScoreSong2PreRound) / (5*meta1)
        tips.push(`严格一个周回内，${song2Title} 相较于 ${song1Title} 会亏约 ${lose.toFixed(2)} 火`)
        tips.push(`严格一个周回内，${song2Title} 相较于 ${song1Title} 会少打 ${Math.abs(song1CountPerRoundStrict - song2CountPerRoundStrict)} 把`)
    }

    return {
        ok: true,
        highSong: highSong.songId,
        lowSong: lowSong.songId,
        highMeta,
        lowMeta,
        equalPlaysExact,
        equalPlaysRound,
        equalPlaysCeil,
        playsToLoseOneFireExact,
        playsToLoseOneFire,
        lostFiresFor30Plays,
        tips: tips.join('\n')
    }
}
