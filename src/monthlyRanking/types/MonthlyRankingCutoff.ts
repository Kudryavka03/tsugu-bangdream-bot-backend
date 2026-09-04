import { callAPIAndCacheResponse } from '@/api/getApi';
import { MonthlyRanking } from '@/types/MonthlyRanking';
import { Server } from '@/types/Server';
import { predict } from '@/api/cutoff.cjs'
import { getDateByServerTimezone, getServerUtcOffset, normalizeTimestamp } from '@/components/list/time';
import { Bestdoriurl } from '@/config';
import {
    cnMonthlyCutoffCacheKey,
    fetchCnMonthlyCutoffs,
    fetchCnMonthlyCutoffsBatch,
    isCnMonthlyServer,
    isCnMonthlyTier,
} from '@/monthlyRanking/cn/cnMonthlyRanking';

type MonthlyRankingBorderPoint = {
    time: number;
    ep: number;
};

type MonthlyRankingBorderResponse = {
    result: boolean;
    cutoffs: MonthlyRankingBorderPoint[];
};

type MonthlyRankingTopPoint = {
    timestamp: number;
    uid: number;
    value: number;
};

type MonthlyRankingPlayer = {
    uid: number;
    name: string;
    introduction: string;
    rank: number;
    sid: number;
    strained: number;
    degrees: number[];
};

type MonthlyRankingTopResponse = {
    points: MonthlyRankingTopPoint[];
    users: MonthlyRankingPlayer[];
};

export class MonthlyRankingCutoff {
    monthlyRankingId: number;
    server: Server;
    tier: number;
    isExist = false;
    cutoffs: { time: number, ep: number }[];
    latestCutoff: { time: number, ep: number };
    predictEP: number;
    startAt: number;
    endAt: number;
    status: 'not_start' | 'in_progress' | 'ended';
    isInitfull: boolean = false;
    dailyIncrement = [];
    monthlyRanking: MonthlyRanking;
    currentGetDataTime: number;

    constructor(monthlyRankingId: number, server: Server, tier: number) {
        this.monthlyRankingId = monthlyRankingId;
        this.server = server;
        this.tier = tier;
        this.monthlyRanking = new MonthlyRanking(monthlyRankingId);

        if (!this.monthlyRanking.isExist) {
            this.isExist = false;
            return;
        }

        if (!isCnMonthlyServer(server)) {
            this.isExist = false;
            return;
        }

        if (!isCnMonthlyTier(tier)) {
            this.isExist = false;
            return;
        }

        const startAt = this.monthlyRanking.startAt[server];
        const endAt = this.monthlyRanking.endAt[server];
        if (startAt == null || endAt == null) {
            this.isExist = false;
            return;
        }

        this.startAt = startAt;
        this.endAt = endAt;
        this.currentGetDataTime = Date.now();
        this.isExist = tier > 0;

        const time = Date.now();
        if (time < this.startAt) {
            this.status = 'not_start';
        } else if (time > this.endAt) {
            this.status = 'ended';
        } else {
            this.status = 'in_progress';
        }
    }

    getMonthlyRankingName(server: Server): string {
        return this.monthlyRanking.monthlyRankingName[server] ?? this.monthlyRanking.monthlyRankingName.find(Boolean) ?? `月榜${ this.monthlyRankingId }`;
    }

    async initFull(preloaded?: MonthlyRankingBorderResponse) {
        if (this.isInitfull || !this.isExist) {
            return;
        }

        const cutoffData = preloaded ?? await this.getFinalCutoffsData();
        this.applyCutoffData(cutoffData);
    }

    applyCutoffData(cutoffData: MonthlyRankingBorderResponse | undefined) {
        if (this.isInitfull || !this.isExist) {
            return;
        }
        if (!cutoffData || cutoffData.result === false) {
            this.isExist = false;
            return;
        }

        this.cutoffs = cutoffData.cutoffs as { time: number, ep: number }[];
        if (this.cutoffs.length === 0) {
            this.latestCutoff = { time: this.startAt, ep: 0 };
            this.isInitfull = true;
            return;
        }

        this.latestCutoff = this.cutoffs[this.cutoffs.length - 1];
        this.getDailyIncrement();
        if (this.status === 'in_progress') {
            this.predict();
        }
        this.isInitfull = true;
    }

    /** 并行批量初始化，同一批请求只打一次网络 */
    static async initFullBatch(cutoffs: MonthlyRankingCutoff[], forceReadCache: boolean = false): Promise<void> {
        const pending = cutoffs.filter((c) => c.isExist && !c.isInitfull);
        if (pending.length === 0) {
            return;
        }

        const batchData = await fetchCnMonthlyCutoffsBatch(
            pending.map((c) => ({ eventId: c.monthlyRankingId, tier: c.tier })),
            forceReadCache,
        );

        for (const cutoff of pending) {
            const key = cnMonthlyCutoffCacheKey(cutoff.monthlyRankingId, cutoff.tier);
            cutoff.applyCutoffData(batchData.get(key));
        }
    }

    async getFinalCutoffsData(forceReadCache: boolean = false): Promise<MonthlyRankingBorderResponse | undefined> {
        if (isCnMonthlyServer(this.server)) {
            return await fetchCnMonthlyCutoffs(this.monthlyRankingId, this.tier, forceReadCache);
        }
        const ttl = forceReadCache ? Infinity : 0;
        try {
            return await callAPIAndCacheResponse(
                `${ Bestdoriurl }/api/monthlyRanking/border?server=${ <number>this.server }&monthlyId=${ this.monthlyRankingId }&tier=${ this.tier }`,
                ttl,
                3
            ) as MonthlyRankingBorderResponse;
        } catch {
            return undefined;
        }
    }

    predict(): number {
        if (this.isExist === false || !this.cutoffs || this.cutoffs.length === 0) {
            this.predictEP = 0;
            return this.predictEP;
        }

        const last = this.cutoffs[this.cutoffs.length - 1];

        // 如果月榜已经结束，预测值直接等于当前最终分数
        if (last.time >= this.endAt) {
            this.predictEP = last.ep;
            return this.predictEP;
        }

        // 统一转换时间戳为秒 (以对齐回归算法的输入)
        const start_ts = Math.floor(this.startAt / 1000);
        const end_ts = Math.floor(this.endAt / 1000);
        const cutoff_ts: { time: number, ep: number }[] = [];

        for (let i = 0; i < this.cutoffs.length; i++) {
            const element = this.cutoffs[i];
            cutoff_ts.push({
                time: Math.floor(element.time / 1000),
                ep: element.ep
            });
        }

        // 动态计算适用于月榜的 rate
        let currentRateFactor = 0;
        if (this.cutoffs.length >= 5) {
            const lastPoint = cutoff_ts[cutoff_ts.length - 1];

            // 寻找 1 小时前的点（3600秒）
            const oneHourAgoTime = lastPoint.time - 3600;
            let prevPoint = cutoff_ts[0];
            for (let i = cutoff_ts.length - 1; i >= 0; i--) {
                if (cutoff_ts[i].time <= oneHourAgoTime) {
                    prevPoint = cutoff_ts[i];
                    break;
                }
            }

            const dtCurrent = (lastPoint.time - prevPoint.time) / 3600; // 小时
            const dtTotal = (lastPoint.time - start_ts) / 3600; // 小时

            if (dtCurrent > 0 && dtTotal > 0) {
                const speedCurrent = (lastPoint.ep - prevPoint.ep) / dtCurrent; // 最近1小时时速(EP/h)
                const speedTotal = (lastPoint.ep - cutoff_ts[0].ep) / dtTotal;   // 全局平均时速(EP/h)

                // 如果最近 1 小时时速大于全局平均，说明在冲刺，计算冲刺斜率贡献
                if (speedTotal > 0 && speedCurrent > speedTotal) {
                    // 将时速增量转化为相较于总进度的百分比影响，给到回归方程作为修正因子
                    currentRateFactor = ((speedCurrent - speedTotal) / speedTotal) * 0.05;
                    // 限制最大修正幅度，防止 1min 级抖动导致 rate 冲天
                    currentRateFactor = Math.min(currentRateFactor, 0.2);
                }
            }
        }

        // 调用回归预测函数
        try {
            // 全局声明或引入的 predict 算法
            const result = predict(cutoff_ts, start_ts, end_ts, currentRateFactor);

            if (result && !isNaN(result.ep)) {
                this.predictEP = Math.floor(result.ep);
            } else {
                this.predictEP = last.ep;
            }
        } catch (e) {
            console.error("Monthly Ranking Predict Error: ", e);
            // 发生异常时执行原有的平滑线性线性外推
            const prev = this.cutoffs[Math.max(this.cutoffs.length - 60, 0)]; // 取1小时前
            const timeSpan = Math.max((last.time - prev.time) / (1000 * 3600), 1 / 60);
            const fallbackRate = (last.ep - prev.ep) / timeSpan;
            const remainHour = Math.max((this.endAt - last.time) / (1000 * 3600), 0);
            this.predictEP = Math.floor(last.ep + fallbackRate * remainHour);
        }

        return this.predictEP;
    }

    getDaysOfEvent(ts: number) {
        const offsetMs = getServerUtcOffset(this.server) * 60 * 60 * 1000;
        const eventStartAtTime = normalizeTimestamp(this.startAt);
        const timestamp = normalizeTimestamp(ts);
        const serverStartTime = eventStartAtTime + offsetMs;
        const startDate = new Date(serverStartTime);

        const hour = startDate.getUTCHours();
        const minute = startDate.getUTCMinutes();
        const second = startDate.getUTCSeconds();
        const millisecond = startDate.getUTCMilliseconds();

        const firstDayEndServerTime =
            serverStartTime +
            ((86400000 + 4 * 60 * 60 * 1000)
                - hour * 60 * 60 * 1000
                - minute * 60 * 1000
                - second * 1000
                - millisecond);

        const firstDayEndTime = firstDayEndServerTime - offsetMs;

        if (timestamp < firstDayEndTime) {
            return 0;
        }
        return Math.ceil((timestamp - firstDayEndTime) / 86400000);
    }

    preProcessCutoff(){ // 数据预处理
        if (this.status == "ended"){
            let finalValue = this.cutoffs.at(-1).ep
            for(let i = this.cutoffs.length-1;i>0;i--){
                if (this.cutoffs[i].time > this.endAt){
                    this.cutoffs.pop()
                    continue
                }
                if (this.cutoffs[i].ep > finalValue){
                    this.cutoffs[i].ep = finalValue
                    continue
                }
                if (this.cutoffs[i].ep <= finalValue){
                    break
                }
            }
        }
    }
    getDailyIncrement(divisor: number = 10000){
        this.preProcessCutoff()
        if (!Number.isFinite(divisor) || divisor <= 0) divisor = 10000
        let score:number[] = []
        let time:number[] = []
        if (!this.cutoffs || this.cutoffs.length === 0){
            return
        }
        let nearest345Ts: { score: number; time: number }[] = [];
        let daysFlags = -1
        
        for (const c of this.cutoffs) {
            const timestamp = normalizeTimestamp(c.time)
            const date = getDateByServerTimezone(timestamp, this.server)

            if ((this.server == Server.cn || this.server == Server.tw || this.server == Server.jp)&&date.getUTCHours() === 3 ) {
                let utcmin = date.getUTCMinutes()
                if (utcmin ===45){
                    console.log('find 3:45',timestamp,c.ep)
                    score.push(c.ep)
                    time.push(timestamp)
                    nearest345Ts = []
                    daysFlags = -1
                    continue
                }else{
                    if (utcmin > (45-5) &&  utcmin <(45+5)){    // 10分钟的容错
                        nearest345Ts.push({score:c.ep,time:timestamp})
                        daysFlags = date.getUTCDay()
                    }else if (utcmin > (45+10)){
                        if (daysFlags!=-1 && nearest345Ts.length!=0){
                            let absLess =Infinity
                            let t345 = new Date(nearest345Ts[0].time).setUTCMinutes(45)
                            let TimeFind = -1
                            let ValueFind = -1
                            t345 = new Date(t345).setUTCMilliseconds(0)
                            if (nearest345Ts.length==0) daysFlags=-1
                            if (nearest345Ts.length==1){
                                score.push(nearest345Ts[0].score)
                                time.push(nearest345Ts[0].time)
                                nearest345Ts=[]
                                daysFlags=-1
                            }else if(daysFlags!=-1){
                                //console.log(nearest345Ts)
                                // 查找最接近3:45的
                                nearest345Ts.forEach(x=>{
                                    let t = Math.abs(t345-x.time)
                                    if (t <=absLess){
                                        TimeFind = x.time
                                        ValueFind = x.score
                                    }
                                })
                                //console.log(ValueFind,TimeFind)
                                ValueFind>0?score.push(ValueFind):null
                                TimeFind>0?time.push(TimeFind):null
                                daysFlags=-1
                                nearest345Ts=[]
                            }
                        }
                        daysFlags=-1
                    }
                }

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
                    dailyIncrement.push(`${Math.round(scoreFinal[i]/divisor)}${dailyIncrementInvaildDays.includes(i) ? '!' : ''}`)
            }
            else{
                    dailyIncrement.push(`${Math.round((scoreFinal[i] - scoreFinal[i-1])/divisor)}${dailyIncrementInvaildDays.includes(i) ? '!' : ''}` )
            }
        }
        this.dailyIncrement = dailyIncrement
        //this.dailyIncrementOriginData = scoreFinal
    }

    getYesterdayIncrementRate() {
        if (!this.cutoffs || this.cutoffs.length === 0) {
            return '无数据';
        }

        // 1. 获取最新一个数据点及其服务器本地时间
        const lastCutoffIndex = this.cutoffs.length - 1;
        const lastCutoffTime = this.cutoffs[lastCutoffIndex].time;
        const lastCutoffEp = this.cutoffs[lastCutoffIndex].ep;

        const dateNow = getDateByServerTimezone(lastCutoffTime, this.server);
        const targetHour = dateNow.getUTCHours();
        const targetMinute = dateNow.getUTCMinutes();

        const curEventDays = this.getDaysOfEvent(lastCutoffTime);

        const score4AM: number[] = []; // 存储每天 4 点的数据
        const scoreCurrentTime: number[] = []; // 存储每天同时刻（当前时分）的数据

        // 2. 遍历筛选数据
        for (const c of this.cutoffs) {
            const timestamp = normalizeTimestamp(c.time);
            const d = this.getDaysOfEvent(timestamp);

            // 只关注最近 3 天内的数据（前天、昨天、今天）
            if (d < (curEventDays - 2)) {
                continue;
            }

            const date = getDateByServerTimezone(timestamp, this.server);
            const h = date.getUTCHours();
            const m = date.getUTCMinutes();

            // 筛选凌晨 4 点的结算点
            if (h === 4 && m === 0) {
                score4AM.push(c.ep);
            }

            // 筛选与当前最新点“同华里（时:分）”的数据点
            if (h === targetHour && m === targetMinute) {
                scoreCurrentTime.push(c.ep);
            }
        }

        // 3. 校验数据完整性
        // 理想情况下，score4AM 应包含：昨天4点、今天4点 (长度至少为2)
        // scoreCurrentTime 应包含：昨天同时刻、今天当前时刻 (长度至少为2)
        if (score4AM.length < 2 || scoreCurrentTime.length < 2) {
            return '数据缺失';
        }

        // 拿到最近两个周期的结算点
        const today4AMEp = score4AM[score4AM.length - 1];
        const yesterday4AMEp = score4AM[score4AM.length - 2];

        const todayCurrentEp = scoreCurrentTime[scoreCurrentTime.length - 1];
        const yesterdayCurrentEp = scoreCurrentTime[scoreCurrentTime.length - 2];

        // 今日截止到目前的增量 = 当前分数 - 今天凌晨4点分数
        const TodaysIncrement = todayCurrentEp - today4AMEp;

        // 昨天同时刻的整天增量 = 昨天同时刻分数 - 昨天凌晨4点分数
        const YesterdaysIncrement = yesterdayCurrentEp - yesterday4AMEp;

        // 4. 计算速率比值
        const rate: number = YesterdaysIncrement !== 0 ? TodaysIncrement / YesterdaysIncrement : 1;

        return `昨天同时刻日增${ Math.round(YesterdaysIncrement) } 现在是昨天的${ Math.round(rate * 100) }%${ rate * 100 >= 100 ? '↑' : '↓' }`;
    }

    getChartData(setStartToZero = false): { x: Date, y: number }[] {
        if (this.isExist == false) {
            return [];
        }
        const chartData: { x: Date, y: number }[] = [];
        if (setStartToZero) {
            chartData.push({ x: new Date(0), y: 0 });
        } else {
            chartData.push({ x: new Date(this.startAt), y: 0 });
        }

        let tempTime = this.cutoffs && this.cutoffs.length > 0 ? this.cutoffs[0].time : null;
        for (let i = 0; i < this.cutoffs.length; i++) {
            const element = this.cutoffs[i];
            if (setStartToZero) {
                chartData.push({ x: tempTime ? new Date(element.time - this.startAt) : new Date(0), y: element.ep });
            } else {
                chartData.push({ x: new Date(element.time), y: element.ep });
            }
            tempTime = element.time;
        }
        return chartData;
    }
}

export class MonthlyRankingCutoffTop {
    monthlyRankingId: number;
    server: Server;
    startAt: number;
    endAt: number;
    status: 'not_start' | 'in_progress' | 'ended';
    isInitfull: boolean = false;
    isExist = false;
    points: {
        time: number,
        uid: number,
        value: number
    }[];
    users: {
        uid: number,
        name: string,
        introduction: string,
        rank: number,
        sid: number,
        strained: number,
        degrees: number[]
        ranking: number,
        currentPt: number
    }[];
    monthlyRanking: MonthlyRanking;

    constructor(monthlyRankingId: number, server: Server) {
        this.monthlyRankingId = monthlyRankingId;
        this.server = server;
        this.monthlyRanking = new MonthlyRanking(monthlyRankingId);
        if (!this.monthlyRanking.isExist) {
            this.isExist = false;
            return;
        }
        const startAt = this.monthlyRanking.startAt[server];
        const endAt = this.monthlyRanking.endAt[server];
        if (startAt == null || endAt == null) {
            this.isExist = false;
            return;
        }
        this.startAt = startAt;
        this.endAt = endAt;
        this.isExist = true;
        const time = Date.now();
        if (time < this.startAt) {
            this.status = 'not_start';
        } else if (time > this.endAt) {
            this.status = 'ended';
        } else {
            this.status = 'in_progress';
        }
    }

    getMonthlyRankingName(server: Server): string {
        return this.monthlyRanking.monthlyRankingName[server] ?? this.monthlyRanking.monthlyRankingName.find(Boolean) ?? `月榜${ this.monthlyRankingId }`;
    }

    async initFull(interval = 3600000) {
        if (!this.isExist || this.isInitfull) {
            return;
        }
        const topData = await callAPIAndCacheResponse(`${ Bestdoriurl }/api/monthlyRanking/top?server=${ <number>this.server }&monthlyId=${ this.monthlyRankingId }`, 0, 3) as MonthlyRankingTopResponse;
        if (topData == undefined) {
            this.isExist = false;
            return;
        }
        this.points = (topData.points ?? []).map((point) => ({
            time: point.timestamp,
            uid: point.uid,
            value: point.value,
        })).sort((a, b) => a.time - b.time || a.uid - b.uid);
        this.users = (topData.users ?? []).map((user) => ({
            ...user,
            ranking: 0,
            currentPt: 0,
        }));
        if (this.points.length == 0 || this.users.length == 0) {
            this.isExist = false;
            return;
        }

        const latestRanking = this.getLatestRanking();
        for (let i = 0; i < this.users.length; i++) {
            for (let j = 0; j < latestRanking.length; j++) {
                if (this.users[i].uid == latestRanking[j].uid) {
                    this.users[i].ranking = j + 1;
                    this.users[i].currentPt = latestRanking[j].point;
                    break;
                }
            }
        }
        this.isInitfull = true;
    }

    getChartData(setStartToZero = false): { [key: number]: { x: Date, y: number }[] } {
        if (this.isExist == false) {
            return;
        }
        const chartDate: { [key: number]: { x: Date, y: number }[] } = {};
        for (let i = 0; i < this.points.length; i++) {
            const element = this.points[i];
            if (!(element.uid in chartDate)) {
                chartDate[element.uid] = [];
                if (setStartToZero) {
                    chartDate[element.uid].push({ x: new Date(0), y: 0 });
                    chartDate[element.uid].push({ x: new Date(element.time - this.startAt), y: element.value });
                } else {
                    chartDate[element.uid].push({ x: new Date(this.startAt), y: 0 });
                    chartDate[element.uid].push({ x: new Date(element.time), y: element.value });
                }
            } else {
                if (setStartToZero) {
                    chartDate[element.uid].push({ x: new Date(element.time - this.startAt), y: element.value });
                } else {
                    chartDate[element.uid].push({ x: new Date(element.time), y: element.value });
                }
            }
        }
        return chartDate;
    }

    getLatestRanking(): { uid: number, point: number }[] {
        const result: { uid: number, point: number }[] = [];
        const index = Math.max(this.points.length - 10, 0);
        for (let i = index; i < this.points.length; i++) {
            const element = this.points[i];
            result.push({ uid: element.uid, point: element.value });
        }
        result.sort((a, b) => b.point - a.point);
        return result;
    }

    getUserByUid(id: number): {
        uid: number,
        name: string,
        introduction: string,
        rank: number,
        sid: number,
        strained: number,
        degrees: number[]
        ranking: number,
        currentPt: number
    } {
        for (let i = 0; i < this.users.length; i++) {
            if (this.users[i].uid == id) {
                return this.users[i];
            }
        }
        return;
    }

    getUserNameById(id: number): string {
        for (let i = 0; i < this.users.length; i++) {
            if (this.users[i].uid == id) {
                return this.users[i].name;
            }
        }
        return;
    }
}

