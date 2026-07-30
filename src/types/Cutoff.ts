import { getCutoffTrackerData } from '@/api/cutoffDataSource';
import mainAPI from '@/types/_Main';
import { USE_HHWX_SOURCE_PREFER, tierListOfServer } from '@/config';
import { Server } from '@/types/Server';
import { Event, getPresentEvent } from '@/types/Event';
import { predict } from '@/api/cutoff.cjs'
import * as fs from 'fs';
import path from 'path'
import { getDateByServerTimezone, GetProbablyTimeDifference, getServerUtcOffset, normalizeTimestamp } from '@/components/list/time';

export class Cutoff {
    eventId: number;
    server: Server;
    tier: number;
    isExist = false;
    cutoffs: { time: number, ep: number }[];
    pCutoffs: { time: number, ep: number }[];
    eventType: string;
    latestCutoff: { time: number, ep: number };
    rate: number | null;
    predictEP: number;
    predictEP2: number;
    startAt: number;
    startAtAll: number[];
    endAt: number;
    endAtAll: number[];
    status: 'not_start' | 'in_progress' | 'ended';
    isInitfull: boolean = false;
    event:Event;
    dailyIncrement = []
    currentGetDataTime
    //useHHWX = USE_HHWX_SOURCE_PREFER
    dataSourceName = USE_HHWX_SOURCE_PREFER ? 'HHWX' : 'Bestdori'
    constructor(eventId: number, server: Server, tier: number) {
        const tempEventData = new Event(eventId)
        //如果活动不存在，直接返回
        if (!tempEventData.isExist) {
            this.isExist = false;
            return
        }
        this.eventType = tempEventData.eventType
        this.eventId = eventId
        this.server = server
        this.event = tempEventData
        //如果该档线不在该服的档线列表中，直接返回
        if (!tierListOfServer[Server[server]].includes(tier)) {
            this.isExist = false;
            return
        }
        this.tier = tier
        this.isExist = true;
        this.startAtAll = this.event.startAt
        this.endAtAll = this.event.endAt
        this.startAt = this.event.startAt[server] || server!=Server.cn?this.event.startAt[server]:GetProbablyTimeDifference(this.eventId,getPresentEvent(this.server))
        this.endAt = this.event.endAt[server] || server!=Server.cn?this.event.endAt[server]:GetProbablyTimeDifference(this.eventId,getPresentEvent(this.server)) + (this.endAtAll[Server.jp] - this.startAtAll[Server.jp])
        //const tempEvent = new Event(this.eventId)
        this.currentGetDataTime = new Date().getTime()
        //状态
        var time = this.currentGetDataTime
        if (time < this.startAt) {
            this.status = 'not_start'
        }
        else if (time > this.endAt) {
            this.status = 'ended'
        }
        else {
            this.status = 'in_progress'
        }
    }
    async getFinalCutoffsData (forceReadCache:boolean = false ){
        const result = await getCutoffTrackerData({
            server: this.server,
            eventId: this.eventId,
            tier: this.tier,
            forceReadCache,
            validateFreshness: !forceReadCache,
            endAt: forceReadCache ? this.endAt : undefined,
        })
        if (!result) return null
        this.dataSourceName = result.sourceName
        //this.useHHWX = result.sourceName == 'HHWX'
        return result.data
    }
    async initFull() {
        if (this.isInitfull) {
            return
        }
        if (this.isExist == false) {
            return
        }
        let cutoffData
        let pCutoffData
        //如果cutoff的活动已经结束，则使用缓存
        const time = new Date().getTime()
        if (time < this.endAt + 1000 * 60 * 60 * 1) {
            cutoffData = await this.getFinalCutoffsData()
            if(!cutoffData){
                this.isExist = false;
                return
            }
            var pCutoffDataTmps = await this.readPredict2Data(this.tier)
            //console.log(cutoffResult)
            pCutoffData = pCutoffDataTmps==null?[]:JSON.parse(pCutoffDataTmps)    // 只针对千线进行预测
        }
        else {
            cutoffData = await this.getFinalCutoffsData(true)
            pCutoffData = cutoffData
        }
        if (cutoffData == undefined) {
            this.isExist = false;
            return
        }
        else if (cutoffData['result'] == false) {
            this.isExist = false;
            return
        }
        this.isExist = true;
        this.cutoffs = cutoffData['cutoffs'] as { time: number, ep: number }[]
        this.pCutoffs = pCutoffData['cutoffs'] as { time: number, ep: number }[]
        if (this.cutoffs.length == 0) {
            const event = new Event(this.eventId)
            this.latestCutoff = { time: event.startAt[this.server], ep: 0 }
            return
        }
        else {
            this.latestCutoff = this.cutoffs[this.cutoffs.length - 1]
        }
        //rate
        let rateDataList = mainAPI['rates'] as [{ server: number, type: string, tier: number, rate: number }]
        let rateData = rateDataList.find((element) => {
            return element.server == this.server && element.type == this.eventType && element.tier == this.tier
        }
        )
        if (rateData == undefined) {
            this.rate = null
        }
        else {
            this.rate = rateData.rate
        }
        this.getDailyIncrement()
        //console.log(this.dailyIncrement)
        if (this.status == 'in_progress') {
            this.predict()
            this.predict2()
        }
        this.isInitfull = true
    }
    predict(): number {
        if (this.isExist == false) {
            return
        }
        const event = new Event(this.eventId)
        let start_ts = Math.floor(event.startAt[this.server] / 1000)
        let end_ts = Math.floor(event.endAt[this.server] / 1000)
        let cutoff_ts: { time: number, ep: number }[] = []
        let maxEP = 0
        for (let i = 0; i < this.cutoffs.length; i++) {
            const element = this.cutoffs[i];
            if (element.ep>=maxEP){
                cutoff_ts.push({ time: Math.floor(element.time / 1000), ep: element.ep })
                maxEP = element.ep
            }
           
        }
        try {
            var result = predict(cutoff_ts, start_ts, end_ts, this.rate)
        } catch (e) {
            console.log(e)
            this.predictEP = 0
            return this.predictEP
        }
        this.predictEP = Math.floor(result.ep)
        return this.predictEP
    }
    predict2(): number {
        this.predictEP2 = (this.pCutoffs &&this.pCutoffs[this.pCutoffs.length-1]) ?this.pCutoffs[this.pCutoffs.length-1]['ep']:0
        return this.predictEP2
    }
    readPredict2Data(tier) {
        try{
            let filePathPredict = path.resolve(process.cwd(), `MYCX_1000/ycx${tier}-${this.server}.json`);
            return fs.readFileSync(filePathPredict, 'utf-8')
        }
        catch{
            return null;
        }
    }
    getPredictionHistory(): { time: number, ep: number }[] {
        if (this.isExist == false || !this.cutoffs) {
            return []
        }
        const event = new Event(this.eventId)
        const start_ts = Math.floor(event.startAt[this.server] / 1000)
        const end_ts = Math.floor(event.endAt[this.server] / 1000)
        const cutoff_ts: { time: number, ep: number }[] = []
        for (let i = 0; i < this.cutoffs.length; i++) {
            const element = this.cutoffs[i]
            cutoff_ts.push({ time: Math.floor(element.time / 1000), ep: element.ep })
        }
        const history: { time: number, ep: number }[] = []
        for (let i = 0; i < cutoff_ts.length; i++) {
            let result
            try {
                result = predict(cutoff_ts.slice(0, i + 1), start_ts, end_ts, this.rate)
            } catch (e) {
                continue
            }
            if (result && result.ep && !isNaN(result.ep) && result.ep !== 0) {
                history.push({ time: this.cutoffs[i].time, ep: Math.floor(result.ep) })
            }
        }
        return history
    }
    getDaysOfEvent(ts: number) {    // 天数从0开始。存在第0天。
        if (!this.startAt)  return  0;
        const offsetMs = getServerUtcOffset(this.server) * 60 * 60 * 1000
        const eventStartAtTime = normalizeTimestamp(this.startAt)
        //console.log(this.startAt)
        const timestamp = normalizeTimestamp(ts)

        const serverStartTime = eventStartAtTime + offsetMs

        const startDate = new Date(serverStartTime)

        const hour = startDate.getUTCHours()
        const minute = startDate.getUTCMinutes()
        const second = startDate.getUTCSeconds()
        const millisecond = startDate.getUTCMilliseconds()

        let firstDayEndServerTime =
            serverStartTime +
            ((86400000 + 4 * 60 * 60 * 1000)
                - hour * 60 * 60 * 1000
                - minute * 60 * 1000
                - second * 1000
                - millisecond)

        const firstDayEndTime = firstDayEndServerTime - offsetMs

        if (timestamp < firstDayEndTime) {
            return 0
        } else {
            return Math.ceil((timestamp - firstDayEndTime) / 86400000)
        }
    }
    getDailyIncrement(){
        let score:number[] = []
        let time:number[] = []
        if (!this.cutoffs || this.cutoffs.length === 0){
            return
        }
        for (const c of this.cutoffs) {
            const timestamp = normalizeTimestamp(c.time)
            const date = getDateByServerTimezone(timestamp, this.server)
            if ((this.server == Server.cn || this.server == Server.tw || this.server == Server.jp) && date.getUTCHours() === 3 && date.getUTCMinutes() === 45) {
                score.push(c.ep)
                time.push(timestamp)
            }
        }
        let dailyIncrement = []
        let dailyIncrementInvaildDays:number[]  = []
        let scoreFinal:number[] = []
        var j = 0   // 临时天数存放
        var cutoffLastDataDays = this.getDaysOfEvent(this.cutoffs[this.cutoffs.length-1].time)   // 最后一个数据的天数
        // 头处理
        if (score.length == 0){
            for (var i = 0;i<=this.getDaysOfEvent(this.cutoffs[this.cutoffs.length-1].time);i++){
                if (this.getDaysOfEvent(this.cutoffs[this.cutoffs.length-1].time) == 0){
                    scoreFinal.push(this.cutoffs[this.cutoffs.length-1].ep)
                    break
                }
                let avgIncrementValue = Math.round(((this.cutoffs[this.cutoffs.length-1].ep)/(this.getDaysOfEvent(this.cutoffs[this.cutoffs.length-1].time))))    // 计算丢失的天数的平均增量
                scoreFinal.push(Math.round(avgIncrementValue * (i+1)))  // 把丢失的天数的数据补全
                dailyIncrementInvaildDays.push(scoreFinal.length-1)  // 记录增量数据不完整的天数位置
                j++ // 增加一天
            }
        }
        
        for (var i = 0;i<score.length;i++){
            if (score.length == 0) break
            if (this.getDaysOfEvent(time[i]) == j){ // 如果当天相对于活动而言天数是i，说明数据完整
                if (this.getDaysOfEvent(time[i]) == 0){ // 如果是第0天，且有数据，说明第一天虽然不满24小时，但有数据了，就直接把第一天增量设为当天的ep
                    scoreFinal.push(score[i])
                    j++
                }
                else{       // 如果是第i天，且有数据，说明当天数据完整，直接用当天的ep减去前一天的ep就是当天的增量
                    scoreFinal.push(score[i])
                    j++
                }
            }else{  // i跟相对于getDaysOfEvent的结果不一致，说明当天数据不完整，进行插值计算
                // 当i = 0时，就说明要从0开始而不是score[i-1]开始插值
                if (this.getDaysOfEvent(time[i]) > j){  // 如果这个数据是大于标记天数的，则说明需要进行插值计算
                    let lostDays = this.getDaysOfEvent(time[i]) - j +1
                    let avgIncrementValue = Math.round((i==0?(score[i] - 0):(score[i] - score[i-1]))/lostDays)    // 计算丢失的天数的平均增量
                    for (var ld = 0;ld<lostDays;ld++){
                        scoreFinal.push(Math.round(i==0?0+ avgIncrementValue * (ld+1):score[i-1] + avgIncrementValue * (ld+1)))  // 把丢失的天数的数据补全
                        dailyIncrementInvaildDays.push(scoreFinal.length-1)  // 记录增量数据不完整的天数位置
                        j++ // 增加一天
                    }
                }
            }
        }
        // 尾处理 。当尾巴 this.getDaysOfEvent(time[time.length-1])不为1的时候，就说明尾是有多项数据缺失
        if (score.length != 0){
            for(var i = 0;i<cutoffLastDataDays - this.getDaysOfEvent(time[time.length-1]);i++){   // 如果tracker最后一个数据日期跟score最后一个数据的日期有差异，说名是尾巴，要处理
                if (score.length == 0) break
                let avgIncrementValue = Math.round(((this.cutoffs[this.cutoffs.length-1].ep - score[score.length-1]))/(cutoffLastDataDays - this.getDaysOfEvent(time[time.length-1])))    // 计算丢失的天数的平均增量
                scoreFinal.push(Math.round(score[score.length-1] + avgIncrementValue * (i+1)))  // 把丢失的天数的数据补全
                if(cutoffLastDataDays - this.getDaysOfEvent(time[time.length-1]) > 1)dailyIncrementInvaildDays.push(scoreFinal.length-1)
                j++ // 因该是没什么用的了，还是加一下吧
            }
        }
        for (var i = 0;i<scoreFinal.length;i++){   // 计算增量
            if (i == 0){
                dailyIncrement.push(`${Math.round(scoreFinal[i]/10000)}${dailyIncrementInvaildDays.includes(i) ? '!' : ''}`) 
            }
            else{
                dailyIncrement.push(`${Math.round((scoreFinal[i] - scoreFinal[i-1])/10000)}${dailyIncrementInvaildDays.includes(i) ? '!' : ''}` )
            }
        }
        this.dailyIncrement = dailyIncrement
    }
    getYesterdayIncrementRate(days?:number){    // 从0开始。
        if (!this.cutoffs || this.cutoffs.length === 0){
            return null
        }
        let lastCutoffTime = this.cutoffs[this.cutoffs.length-1].time
        // HHWX数据源会在快要结活的时候改为每15分钟抓取一次，因此需要主动规避
        let usePrevPoint = false
        let UTCMin =  getDateByServerTimezone(lastCutoffTime, this.server).getUTCMinutes()
        let UTCHour = getDateByServerTimezone(lastCutoffTime,this.server).getUTCHours()
       // console.log(UTCHour,UTCMin)
        let lengthLimit =2
        if (UTCMin < 3 || (UTCMin >= 25 && UTCMin <= 35)){
            lastCutoffTime = this.cutoffs[this.cutoffs.length-2].time,this.server
            usePrevPoint = true
        }
        if (UTCMin == 45 && UTCHour == 3) lengthLimit++
        let curEventDays = this.getDaysOfEvent(lastCutoffTime)
        //console.log(curEventDays)
        if (!days) days = curEventDays-1    // 如果没有传入任何参数，则是跟昨日进行对比
        if (days == -1){
            let maxIncrementDays = -1;
            let maxIncrementDaysValue =-1
            for(let i = 1;i<this.dailyIncrement.length-1;i++){  // 避开第一天跟最后一天
                //console.log(typeof(this.dailyIncrement[i]))
                if (typeof(this.dailyIncrement[i]) == 'string'){
                    if(this.dailyIncrement[i].includes('!')) continue
                    if (Number(this.dailyIncrement[i]) > maxIncrementDaysValue){
                        maxIncrementDays = i
                        maxIncrementDaysValue = Number(this.dailyIncrement[i])
                    }
                }
                if (typeof(this.dailyIncrement[i]) == 'number' && this.dailyIncrement[i] > maxIncrementDaysValue){
                    maxIncrementDays = i
                    maxIncrementDaysValue = this.dailyIncrement[i]
                }
            }
            days = maxIncrementDays
            if (days >= curEventDays-1) return null // 查过一次了，不用再查了
            //console.log(days)
        }
        if (days == 0) return null
        let lastCutoffEp = this.cutoffs[this.cutoffs.length-(usePrevPoint?2:1)].ep
        const dateNow = getDateByServerTimezone(lastCutoffTime, this.server)
        const lastestUtcHour = dateNow.getUTCHours()    // 给予补偿，时区问题。
        const lastestUtcMinutes = dateNow.getUTCMinutes()
        const faultTolerant = (ftd:Date,h:number,m:number)=>{
            let h1 = ftd.getUTCHours()
            let m1 = ftd.getUTCMinutes()
            if (h1==h && m1 == m) return true
            let timeFtd = h1*3600 + m1*60
            let queryTime = h *3600 + m*60
            if (Math.abs(timeFtd - queryTime) > 6*60) return true
        }
        // 当传入days参数后，只提取对应的那一段
        let daysEndRecord = new Map<number,number>()    // 上一天的3:45
        let daysCurRecord = new Map<number,number>()    // 这一天的日增
        let daysEndRecordBestResult = new Map<number,number>()    // 上一天的3:45
        let daysCurRecordBestResult = new Map<number,number>()    // 这一天的日增
        /*
        for (const c of this.cutoffs) {
            let allowPushFlag = false
            const timestamp = normalizeTimestamp(c.time)
            const d = this.getDaysOfEvent(timestamp)
            if (d== days || d == days-1){
                allowPushFlag = true
            }
            if (d== curEventDays || d == curEventDays-1 ){
                allowPushFlag = true
            }
            const date = getDateByServerTimezone(timestamp, this.server)
            if (allowPushFlag && (this.server == Server.cn || this.server == Server.tw || this.server == Server.jp) &&faultTolerant(date,3,45)) {
                daysEndRecord.set(d,c.ep)
            }
            if (allowPushFlag && (this.server == Server.cn || this.server == Server.tw || this.server == Server.jp) &&faultTolerant(date,lastestUtcHour,lastestUtcMinutes)) {
                daysCurRecord.set(d,c.ep)
            }
        }
            */
        for (const c of this.cutoffs){
            // 如果curEventDays是昨天呢？
            const timestamp = normalizeTimestamp(c.time)
            const d = this.getDaysOfEvent(timestamp)
            const date = getDateByServerTimezone(timestamp, this.server)
            if (d == days || d == curEventDays){     // 如果是对比天数
                let h1 = date.getUTCHours()
                let m1 = date.getUTCMinutes()
                let total =  Math.abs((lastestUtcHour*3600+(lastestUtcMinutes*60))-(h1*3600+m1*60))
                if (daysCurRecordBestResult.has(d)){
                    if (daysCurRecordBestResult.get(d)>= total){
                        daysCurRecordBestResult.set(d,total)
                        daysCurRecord.set(d,c.ep)
                    }
                }else{
                    daysCurRecordBestResult.set(d,total)
                }
            }
            if (d == days-1 || d == curEventDays-1){
                let h1 = date.getUTCHours()
                let m1 = date.getUTCMinutes()
                let total =  Math.abs((3*3600+(45*60))-(h1*3600+m1*60))
                if (daysEndRecordBestResult.has(d)){
                    if (daysEndRecordBestResult.get(d)>= total){
                        daysEndRecordBestResult.set(d,total)
                        daysEndRecord.set(d,c.ep)
                    }
                }else{
                    daysEndRecordBestResult.set(d,total)
                }
            }
        }
        /*
        console.log(daysEndRecord)
        console.log(daysCurRecord)
        console.log(daysEndRecordBestResult)
        console.log(daysCurRecordBestResult)
        */
        let warnFlags = false
        // 判断是否需要标记时间不准确
        let warnValue = 8*60    // 警告阈值8分钟
        if (daysEndRecordBestResult.get(days-1) > warnValue || daysEndRecordBestResult.get(curEventDays-1) > warnValue || 
            daysCurRecordBestResult.get(days) >warnValue || daysCurRecordBestResult.get(curEventDays) > warnValue
        ){
            warnFlags = true
        }
        // 此时score里边应该会有两个数据，一个是昨日3:45，一个是今日3:45的数据
        let TodaysIncrement = daysEndRecord.get(curEventDays-1)?(lastCutoffEp - daysEndRecord.get(curEventDays-1)):null
        let PreCmpDaysIncrement = (daysEndRecord.get(days-1) && daysCurRecord.get(days))?( daysCurRecord.get(days) - daysEndRecord.get(days-1) ):null
        if (TodaysIncrement == null || PreCmpDaysIncrement == null ) return null
        let rate:number = TodaysIncrement / PreCmpDaysIncrement
        let tips = '昨日'   
        if (days != curEventDays-1) tips = `Day${days+1}`     // days是从0开始的
        let result =  `${tips}同时刻日增${Math.round((PreCmpDaysIncrement)/10000)} 现在是${tips}的${Math.round(rate * 100)}%${rate*100>=100?'↑':'↓'}${warnFlags?' !':''}`
        //console.log(result)
        return result
    }
    changeScoreRateForCompare(rate:number){
        this.pCutoffs = structuredClone(this.cutoffs)
        for(let t of this.pCutoffs){
            t.ep = Math.round(t.ep * rate)
        }
        //this.pCutoffData = this.pCutoffs
        
    }
    getAnyCutoffSpeedByTime(ts:number=0){
        // 如果ts有明确的时间戳的，则以ts作为时间，查找该时间往前1小时的两个时间戳。
        if (this.cutoffs.length == 0) return 0
        
        let lastCutoffTime = ts?ts:this.cutoffs[this.cutoffs.length-1].time
        let targetIndex = ts?this.checkIfTsExist(lastCutoffTime):this.cutoffs.length-1
        // 如果ts存在就看一下他的坐标是什么。如果不存在就直接就是cutoff的最后一个坐标
        if (!targetIndex) return 0  // 检查这个时间戳是否存在，不存在就直接返回0
        let lastCutoffEp = this.cutoffs[targetIndex].ep
        let preCmpTime = this.cutoffs[targetIndex].time // 传入的时间
        let timePrevHour = (preCmpTime - 3600000)
        let prevHourIndex = this.findNearestTsIndex(timePrevHour)
        let prevHourEp = this.cutoffs[prevHourIndex].ep
        let prevHourTime = this.cutoffs[prevHourIndex].time
        if (prevHourIndex == 0 || ((lastCutoffTime - prevHourTime) > (3600000 *2))){
            // callback to old calc func
            console.log('callback to old logic')
            let currenetTs = this.findNearestTsIndex(ts)
            let EP_Old =  this.cutoffs[currenetTs].ep - this.cutoffs[currenetTs-1].ep
            let Time_Old =  this.cutoffs[currenetTs].time - this.cutoffs[currenetTs-1].time
            let Speed_Old = Math.round(EP_Old / Time_Old)
            return Speed_Old
        }
        console.log(timePrevHour)
        
        let EP = lastCutoffEp - prevHourEp
        let Time = (preCmpTime - prevHourTime) / (1000 * 3600)
        let Speed = Math.round(EP / Time)
        console.log('prevHourTime:',prevHourTime,'prevHourEp',prevHourEp,'lastCutoffTime',lastCutoffTime,'lastCutoffEp',lastCutoffEp)
        return Speed
    }
    checkIfTsExist(ts:number):number{
        if (this.cutoffs.length == 0) return 0;
        let left = 0
        let right = this.cutoffs.length-1
        while (left <= right) {
            let middle = Math.floor(left + ((right - left) / 2))
            if (ts < this.cutoffs[middle].time){
                // 需要往右边查找
                right = middle-1
            }else if (ts > this.cutoffs[middle].time){
                // 往左边找
                left = middle +1
            }else if (ts == this.cutoffs[middle].time){
                return middle //  这里直接返回middle，方便后续对比
            }
        }
        return 0
    }
    findNearestTsIndex(ts:number):number{   // 找最相似的
        if (this.cutoffs.length == 0) return -1;
        if (this.cutoffs.length == 1) return 0;
        let left = 0
        let right = this.cutoffs.length-1
        //console.log(right)
        let findIndex = -1
        //let findTs = this.cutoffs[this.cutoffs.length-1].time
        while (left <= right) {
            //if (left == right) return left  这个貌似不是最优，，，
            let middle = Math.floor(left + ((right - left) / 2))
            //console.log('middle:',middle)
            if (ts == this.cutoffs[middle].time){
                return middle // 相同的直接返回，虽然 概率不大
            }
            else if (ts < this.cutoffs[middle].time){
                // 需要往左边查找
                right = middle-1
            }else if (ts > this.cutoffs[middle].time){
                // 往右边找
                left = middle +1
            }
            //console.log('left:',left,'right',right)

        }
        // 结束后，比较left与right哪个更接近
        if (right<0) return 0
        if (left >= this.cutoffs.length) return this.cutoffs.length-1
        let absLeft = Math.abs(this.cutoffs[left].time - ts)
        let absRight = Math.abs(this.cutoffs[right].time - ts)
        
        if (absLeft < absRight){
            return left
        }else if(absLeft > absRight){
            return right
        }else if (absLeft == absRight){
            return left
        }
        return findIndex

        // 最喜欢天音了最喜欢天音了最喜欢天音了
    }
    getChartData(setStartToZero = false): { x: Date, y: number }[] {
        if (this.isExist == false) {
            return [];
        }
        let chartData: { x: Date, y: number }[] = [];
        if (setStartToZero) {
            let startTime = getDateByServerTimezone(this.server,this.startAt).getUTCHours()
            chartData.push({ x: new Date(3600*1000*startTime), y: 0 });    // 从第一天具体的小时开始
        } else {
            chartData.push({ x: new Date(this.startAt), y: 0 });
        }

        // 在访问 this.cutoffs[0].time 之前检查 this.cutoffs 是否存在且长度大于0
        let tempTime = this.cutoffs && this.cutoffs.length > 0 ? this.cutoffs[0].time : null;
        // 如果 tempTime 为 null，则后续逻辑应当考虑这种情况以避免错误
        let ep = -1
        for (let i = 0; i < this.cutoffs.length; i++) {
            const element = this.cutoffs[i];
            if (element.ep>=ep){ // 260730: 不记录比上一次ep少的数据
                ep = element.ep
            }else if (element.ep<ep){
                //console.log('EP异常：上一个EP是',ep,'现在EP是',element.ep,'差值',ep-element.ep)
                continue
            }
            if (setStartToZero) { 
                // 确保 tempTime 不为 null 才执行减法操作
                chartData.push({ x: tempTime ? new Date(element.time - this.startAt) : new Date(0), y: element.ep });
            } else {
                chartData.push({ x: new Date(element.time), y: element.ep });
            }
            tempTime = element.time;
        }
        return chartData;
    }
    getPredictChartData(setStartToZero = false): { x: Date, y: number }[] {
        if (this.isExist == false) {
            return [];
        }
        if (!this.pCutoffs) return []
        let chartData: { x: Date, y: number }[] = [];
        if (setStartToZero) {
            let startTime = getDateByServerTimezone(this.server,this.startAt).getUTCHours()
            chartData.push({ x: new Date(3600*1000*startTime), y: 0 });    // 从第一天具体的小时开始
        } else {
            chartData.push({ x: new Date(this.startAt), y: 0 });
        }

        // 在访问 this.cutoffs[0].time 之前检查 this.cutoffs 是否存在且长度大于0
        let tempTime = this.pCutoffs && this.pCutoffs.length > 0 ? this.pCutoffs[0].time : null;
        // 如果 tempTime 为 null，则后续逻辑应当考虑这种情况以避免错误

        for (let i = 0; i < this.pCutoffs.length; i++) {
            const element = this.pCutoffs[i];
            if (setStartToZero) {
                // 确保 tempTime 不为 null 才执行减法操作
                chartData.push({ x: tempTime ? new Date(element.time - this.startAt) : new Date(0), y: element.ep });
            } else {
                chartData.push({ x: new Date(element.time), y: element.ep });
            }
            tempTime = element.time;
        }
        return chartData;
    }

}
