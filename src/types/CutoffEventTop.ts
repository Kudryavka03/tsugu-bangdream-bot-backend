import { Server } from "@/types/Server";
import { Event } from '@/types/Event';
import { getCutoffEventTopData } from "@/api/cutoffDataSource";


export class CutoffEventTop{
    eventId:number;
    server:Server;
    startAt:number;
    endAt:number;
    status: 'not_start' | 'in_progress' | 'ended';
    isInitfull: boolean = false;
    isExist = false;
    dataSourceName = 'Bestdori';
    points:{
        time:number,
        uid:number,
        value:number
    }[];
    users:{
        uid:number,
        name:string,
        introduction:string,
        rank:number,
        sid:number,
        strained:number,
        degrees:number[]
        ranking:number,
        currentPt:number
    }[];
    constructor(eventId:number,server:Server){
        console.log(server)
        const event = new Event(eventId)
        if(!event.isExist){
            this.isExist = false;
            return;
        }
        this.eventId = eventId;
        this.server = server;
        this.isExist = true;
        this.startAt = event.startAt[server]
        this.endAt = event.endAt[server]
        var time = new Date().getTime()
        if (time < event.startAt[this.server]) {
            this.status = 'not_start';
        }
        else if (time > event.endAt[this.server]) {
            this.status = 'ended';
        }
        else {
            this.status = 'in_progress';
        }
    }
    async initFull(interval = 0){
        if (!this.isExist){
            return
        }
        if(this.isInitfull){
            return;
        }
        const result = await getCutoffEventTopData({
            server: this.server,
            eventId: this.eventId,
            interval,
            forceReadCache: this.status == 'ended',
            validateFreshness: this.status == 'ended',
            endAt: this.endAt,
        })
        if(!result || result.data == undefined){
            this.isExist = false;
            return;
        }
        this.dataSourceName = result.sourceName
        const topData = result.data
        this.isExist = true;
        this.points = topData['points'] as {
            time:number,
            uid:number,
            value:number
        }[];
        this.users = topData['users'] as {
            uid:number,
            name:string,
            introduction:string,
            rank:number,
            sid:number,
            strained:number,
            degrees:number[],
            ranking:number,
            currentPt:number
        }[];
        if(this.points.length == 0 || this.users.length == 0){//如果没有数据，返回不存在
            this.isExist = false
            return
        }
        var latestRanking = this.getLatestRanking();
        for(let i =0;i<this.users.length;i++){
            for(let j =0;j<latestRanking.length;j++){
                if(this.users[i].uid==latestRanking[j].uid){
                    this.users[i].ranking = j+1;
                    this.users[i].currentPt = latestRanking[j].point;
                    break;
                }
            }
        }
        this.isInitfull = true
    }
    getChartData(setStartToZero = false,playerId?:number):{[key:number]:{x:Date,y:number}[]}{
        if (this.isExist == false) {
            return;
        }
        var chartDate:{[key:number]:{x:Date,y:number}[]} = {};

        for(let i =0;i<this.points.length;i++){
            const element = this.points[i]
            if(playerId!=undefined){
                if (element.uid!=playerId) continue
            }
            if(!(element.uid in chartDate)){
                chartDate[element.uid] = [];
                if(setStartToZero){
                    chartDate[element.uid].push({x:new Date(0),y:0});
                    chartDate[element.uid].push({x:new Date(element.time-this.startAt),y:element.value});
                }
                else{
                    chartDate[element.uid].push({x:new Date(this.startAt),y:0});
                    chartDate[element.uid].push({x:new Date(element.time),y:element.value});
                }
            }
            else{
                if(setStartToZero){
                    chartDate[element.uid].push({x:new Date(element.time-this.startAt),y:element.value});
                }
                else{
                    chartDate[element.uid].push({x:new Date(element.time),y:element.value});
                }
            }
        }
        return chartDate;
    }
    getLatestRanking():{uid:number,point:number}[]{
        var result:{uid:number,point:number}[] =[]
        var index = this.points.length -10;
        while(index<this.points.length){
            const element = this.points[index];
            result.push({uid:element.uid,point:element.value});
            index ++;
        }
        result.sort((a,b)=>b.point-a.point)
        return result;
    }
    getUserByUid(id:number):{
        uid:number,
        name:string,
        introduction:string,
        rank:number,
        sid:number,
        strained:number,
        degrees:number[]
        ranking:number,
        currentPt:number
    }{
        for(let i =0;i<this.users.length;i++){
            if(this.users[i].uid==id){
                return this.users[i];
            }
        }
        return;
    }
    getUserNameById(id:number):string{
        for(let i =0;i<this.users.length;i++){
            if(this.users[i].uid==id){
                return this.users[i].name;
            }
        }
        return;
    }
    getUserAvgScoreById(id:number):number{
        if (!this.isInitfull) return 0
        let userRankingTable = this.points.filter(x=>x.uid==id).sort((a, b) => a.time - b.time)
        //console.log(userRankingTable.length)
        // 取25%~65%之间的分数
        let x = Math.round(userRankingTable.length * 0.25)
        let y = Math.round(userRankingTable.length * 0.65)
        let z = 0;
        let totalPoint = 0;
        for(let i =x;i<y;i++){
            let value = (userRankingTable[i].value - userRankingTable[i-1].value)
            
            if (((userRankingTable[i].time - userRankingTable[i-1].time) <= 2*60*1000) && value!=0 ){   // 反炸
                z++
                totalPoint+=value
            }
        }
        //console.log(totalPoint,z,Math.round(totalPoint / z))
        //console.log(Math.round(totalPoint / z))
        return Math.round(totalPoint / z)
    }
}
