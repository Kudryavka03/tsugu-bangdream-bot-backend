import { callAPIAndCacheResponse } from '@/api/getApi';
import mainAPI from '@/types/_Main';
import { Bestdoriurl, HHWX_Url, USE_HHWX_SOURCE_PREFER, extraUrl, tierListOfServer } from '@/config';
import { Server } from '@/types/Server';
import { Event } from '@/types/Event';
import { predict } from '@/api/cutoff.cjs'
import * as fs from 'fs';
import path from 'path'

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
    useHHWX = USE_HHWX_SOURCE_PREFER
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
        this.startAt = this.event.startAt[server]
        this.endAt = this.event.endAt[server]
        //const tempEvent = new Event(this.eventId)
        this.currentGetDataTime = new Date().getTime()
        //状态
        var time = this.currentGetDataTime
        if (time < this.startAtAll[this.server]) {
            this.status = 'not_start'
        }
        else if (time > this.endAtAll[this.server]) {
            this.status = 'ended'
        }
        else {
            this.status = 'in_progress'
        }
    }
    getFinalApiUrl (reverse:boolean){
        if (this.server != Server.cn){  // 非国服不使用hhwx
            this.useHHWX = false
            return Bestdoriurl
        }
        return !reverse?(this.useHHWX?HHWX_Url:Bestdoriurl):(this.useHHWX?Bestdoriurl:HHWX_Url)
    }
    async getFinalCutoffsData (forceReadCache:boolean = false ){
        if (!forceReadCache){
            try{
                this.useHHWX = USE_HHWX_SOURCE_PREFER?true:false
                return await callAPIAndCacheResponse(`${this.getFinalApiUrl(false)}/api/tracker/data?server=${<number>this.server}&event=${this.eventId}&tier=${this.tier}`,0,3,false)

            }
            catch{
                this.useHHWX = USE_HHWX_SOURCE_PREFER?false:true
                return await callAPIAndCacheResponse(`${this.getFinalApiUrl(true)}/api/tracker/data?server=${<number>this.server}&event=${this.eventId}&tier=${this.tier}`,0,3,false)
            }
        }else{
            this.useHHWX = false    // 对于历史档线数据可以直接使用Bestdori而不是hhwx
            try{
                return await callAPIAndCacheResponse(`${this.getFinalApiUrl(false)}/api/tracker/data?server=${<number>this.server}&event=${this.eventId}&tier=${this.tier}`,1/0,3,true)
            }
            catch{
                return await callAPIAndCacheResponse(`${this.getFinalApiUrl(true)}/api/tracker/data?server=${<number>this.server}&event=${this.eventId}&tier=${this.tier}`,1/0,3,true)
            }
        }
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
        var forceUseCache = true
        //如果cutoff的活动已经结束，则使用缓存
        const time = new Date().getTime()
        if (time < this.endAt + 1000 * 60 * 60 * 1) {
            var dateNow = Date.now()
            cutoffData = await this.getFinalCutoffsData()
            if (this.server == Server.cn && dateNow - cutoffData["cutoffs"][cutoffData["cutoffs"].length-1].time >= 2700000){   // 对数据进行实时性检查，如果不通过则使用另一个数据源数据.确保服务器时间对齐东八区
                this.useHHWX = !this.useHHWX
                cutoffData = await this.getFinalCutoffsData()
            }
            var pCutoffDataTmps = await this.readPredict2Data(this.tier)
            //console.log(cutoffResult)
            pCutoffData = pCutoffDataTmps==null?cutoffData:JSON.parse(pCutoffDataTmps)    // 只针对千线进行预测
        }
        else {
            cutoffData = await this.getFinalCutoffsData(true)
            //console.log(cutoffData["cutoffs"].length)
            // 检查缓存是否合法
            if (cutoffData["cutoffs"].length!=0 && this.endAt - cutoffData["cutoffs"][cutoffData["cutoffs"].length-1].time >410000 ){
                cutoffData = await this.getFinalCutoffsData()
            } //如果最后一个记录的时间减去endAt，校验如果差距太大就要更新
            //cutoffData = await callAPIAndCacheResponse(`${extraUrl}/cutoffs?server=${<number>this.server}&event=${this.eventId}&tier=${this.tier}`, 1 / 0,3,true)
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
        console.log(this.dailyIncrement)
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
        for (let i = 0; i < this.cutoffs.length; i++) {
            const element = this.cutoffs[i];
            cutoff_ts.push({ time: Math.floor(element.time / 1000), ep: element.ep })
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
        this.predictEP2 = this.pCutoffs[this.pCutoffs.length-1]['ep']
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
    getDailyIncrement(){
        let eventStartAtTime = this.startAt
        let eventEndAtTime = this.endAt
        let score:number[] = []
        let time:number[] = []

        for (var c of this.cutoffs){
            let timeStampStr = c.time
            var date = new Date(timeStampStr)
            if (date.getHours() == 3 && date.getMinutes() == 45){
                score.push(c.ep)
                time.push(timeStampStr)
            }
        }

        let dailyIncrement:number[] = []
        if (score.length < 2) {
            if (score.length < 1 && (time[0] - eventStartAtTime) < (86400000 * 0.7)){
                dailyIncrement.push(Math.round((this.cutoffs[this.cutoffs.length-1].ep)/10000))
            }
            else{
                dailyIncrement.push(Math.round((score[0])/10000))
                dailyIncrement.push(Math.round((this.cutoffs[this.cutoffs.length-1].ep - score[0])/10000) )
            }
            this.dailyIncrement = dailyIncrement
            return  
        }
        if ((time[0] - eventStartAtTime) < (86400000 * 0.7)){
            dailyIncrement.push(Math.round(score[0] / 10000))

        }else{
            // 假设第一天为13小时：13/24
            let t = time[0] - eventStartAtTime 
            let total_days =  t / 86400000
            let first_days_ratio =  (13/24)
            let first_day_ep = Math.round((score[0] / total_days * first_days_ratio) / 10000)
            dailyIncrement.push(first_day_ep)
            for(var i = 0;i< Math.floor(total_days - first_days_ratio);i++){   // 假如第一天没数据，第二天没数据，第三天有数据，这里只算第二天
                dailyIncrement.push(Math.round(((score[0] - first_day_ep) / total_days) / 10000))
            }
        }
        for(let i = 0;i<score.length-1;i++){
            if (time[i+1] - time[i] > 86520000){
                let zeroPaddingCount = Math.round((time[i+1] - time[i]) / 86280000)   // 两分钟误差，用于计算中间究竟空了多少天。最终结果返回两天，那么中间就空了两天，那么就计算平均值
                for(var zpc = 0;zpc<zeroPaddingCount;zpc++){
                    let avgIncrementValue = Math.round(((score[i+1] - score[i])/10000)/zeroPaddingCount)
                    dailyIncrement.push(avgIncrementValue)
                }
            }   // 两分钟容错,如果大于两分钟，就表明数据不可信
            else{
                dailyIncrement.push(Math.round((score[i+1] - score[i])/10000))
            }
        }
        // 最后再加入最后一刻的增速，这里同样要计算是否大于一天
        // 假如3/14有数据，3/15没数据，3/16没数据，3/17有数据，并且是最后一天
        // 3/14 3:45 ~ 3/17 7:15    此时ratio将会是3.2~3.3左右。
        if (this.status == "ended") this.currentGetDataTime = this.endAt
        let ratio = (this.currentGetDataTime - time[time.length-1]) / 86400000

        if (ratio > 1.8){
            let totalLostDays = Math.floor(ratio)    // 向下取整
            if (ratio - totalLostDays > 0.8) totalLostDays++
            let zeroPaddingCount = Math.round(ratio)
            for (var zpc = 0;zpc < Math.floor(ratio);zpc++){
                dailyIncrement.push(Math.round(((this.cutoffs[this.cutoffs.length-1].ep - score[score.length - 1])/10000)/ratio))
            }
            dailyIncrement.push(Math.round(((this.cutoffs[this.cutoffs.length-1].ep - score[score.length - 1])/10000)* ( Math.ceil(ratio) - ratio )))
        }else{
            dailyIncrement.push(Math.round(((this.cutoffs[this.cutoffs.length-1].ep - score[score.length - 1])/10000)))
        }
        this.dailyIncrement = dailyIncrement
    }
    getChartData(setStartToZero = false): { x: Date, y: number }[] {
        if (this.isExist == false) {
            return [];
        }
        let chartData: { x: Date, y: number }[] = [];
        if (setStartToZero) {
            chartData.push({ x: new Date(0), y: 0 });
        } else {
            chartData.push({ x: new Date(this.startAt), y: 0 });
        }

        // 在访问 this.cutoffs[0].time 之前检查 this.cutoffs 是否存在且长度大于0
        let tempTime = this.cutoffs && this.cutoffs.length > 0 ? this.cutoffs[0].time : null;
        // 如果 tempTime 为 null，则后续逻辑应当考虑这种情况以避免错误

        for (let i = 0; i < this.cutoffs.length; i++) {
            const element = this.cutoffs[i];
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
        let chartData: { x: Date, y: number }[] = [];
        if (setStartToZero) {
            chartData.push({ x: new Date(0), y: 0 });
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