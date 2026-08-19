import { getTrackerTopData, TrackerTopDataType } from '@/api/trackerTopData';
import { getDateByServerTimezone, normalizeTimestamp } from '@/components/list/time';
import { Server } from '@/types/Server';

export type TrackerTopPoint = {
    time: number;
    uid: number;
    value: number;
};

export type TrackerTopUser = {
    uid: number;
    name: string;
    introduction: string;
    rank: number;
    sid: number;
    strained: number;
    degrees: number[];
    ranking: number;
    currentPt: number;
};

export type TrackerTop10Options = {
    eventId: number;
    server: Server;
    type: TrackerTopDataType;
    songId?: number;
    startAt?: number;
    endAt?: number;
};

/** Build a tier cutoff series from the complete ranking snapshots. */
export function getTopTierCutoffs(
    points: Array<{ time: number, uid: number, value: number }>,
    tier: number = 10,  // 应该读取相同的第十位
): { time: number, ep: number }[] {
    const pointGroups = new Map<number, Array<{ uid: number, value: number }>>();
    let timeFlags = 0
    const result: { time: number, ep: number }[] = [];
    let maxIndex = 10
    let maxIndexFlags = 0
    for (let index = 1;index<points.length;index++){
        if (points[index].time!=timeFlags){
            maxIndexFlags = 0
            timeFlags = points[index].time
        }
         maxIndexFlags++
        if (maxIndexFlags == maxIndex){
            result.push({time:points[index].time, ep:points[index].value })
            index+=9
            continue
        }
       
        if (index == points.length-1){
            result.push({time:points[index].time, ep:points[index].value })
            continue
        }

    }
    result.sort((a, b) =>a.time -b.time);
    /*
    console.log(maxIndex)
    for(let a of result){
        let t = getDateByServerTimezone(a.time,Server.cn)
        if (t.getUTCHours() == 3 && t.getUTCMinutes()==45){
            console.log(a)
        }
    }
        */
    return result;
    
}

/** HHWX topdata representation used by the monthly and song T10 pages. */
export class TrackerTop10 {
    eventId: number;
    server: Server;
    type: TrackerTopDataType;
    songId?: number;
    startAt: number;
    endAt: number;
    status: 'not_start' | 'in_progress' | 'ended';
    isInitfull = false;
    isExist = true;
    points: TrackerTopPoint[] = [];
    users: TrackerTopUser[] = [];

    constructor(options: TrackerTop10Options) {
        this.eventId = options.eventId;
        this.server = options.server;
        this.type = options.type;
        this.songId = options.songId;
        this.startAt = options.startAt ?? 0;
        this.endAt = options.endAt ?? 0;
        this.status = this.getStatus();
    }

    private getStatus(): 'not_start' | 'in_progress' | 'ended' {
        const time = Date.now();
        if (this.startAt && time < this.startAt) return 'not_start';
        if (this.endAt && time > this.endAt) return 'ended';
        return 'in_progress';
    }

    async initFull(): Promise<void> {
        if (this.isInitfull || !this.isExist) return;

        const result = await getTrackerTopData({
            server: this.server,
            eventId: this.eventId,
            type: this.type,
            songId: this.songId,
        });
        if (!result) {
            this.isExist = false;
            return;
        }

        this.points = (result.points ?? [])
            .filter(point => point && point.uid != undefined && point.value != undefined)
            .map(point => ({
                time: normalizeTimestamp(point.time),
                uid: Number(point.uid),
                value: Number(point.value),
            }))
            .filter(point => Number.isFinite(point.time) && Number.isFinite(point.uid) && Number.isFinite(point.value))
            .sort((a, b) => a.time - b.time);
        this.users = (result.users ?? [])
            .filter(user => user && user.uid != undefined)
            .map(user => ({
                uid: Number(user.uid),
                name: user.name ?? '',
                introduction: user.introduction ?? '',
                rank: Number(user.rank ?? 0),
                sid: Number(user.sid ?? 0),
                strained: Number(user.strained ?? 0),
                degrees: Array.isArray(user.degrees) ? user.degrees.map(Number) : [],
                ranking: 0,
                currentPt: 0,
            }));

        if (this.points.length === 0 || this.users.length === 0) {
            this.isExist = false;
            return;
        }

        if (!this.startAt) this.startAt = this.points[0].time;
        if (!this.endAt) this.endAt = this.points[this.points.length - 1].time;
        this.status = this.getStatus();

        const latestRanking = this.getLatestRanking();
        if (latestRanking.length < 10) {
            this.isExist = false;
            return;
        }
        for (let i = 0; i < this.users.length; i++) {
            for (let j = 0; j < latestRanking.length; j++) {
                if (this.users[i].uid === latestRanking[j].uid) {
                    this.users[i].ranking = j + 1;
                    this.users[i].currentPt = latestRanking[j].point;
                    break;
                }
            }
        }
        this.isInitfull = true;
    }

    getChartData(setStartToZero = false, playerId?: number): { [key: number]: { x: Date, y: number }[] } {
        const chartDate: { [key: number]: { x: Date, y: number }[] } = {};
        for (let i = 0; i < this.points.length; i++) {
            const element = this.points[i];
            if (playerId != undefined && element.uid !== playerId) continue;
            if (!(element.uid in chartDate)) {
                chartDate[element.uid] = [];
                if (setStartToZero) {
                    chartDate[element.uid].push({ x: new Date(0), y: 0 });
                    chartDate[element.uid].push({ x: new Date(element.time - this.startAt), y: element.value });
                }
                else {
                    chartDate[element.uid].push({ x: new Date(this.startAt), y: 0 });
                    chartDate[element.uid].push({ x: new Date(element.time), y: element.value });
                }
            }
            else if (setStartToZero) {
                chartDate[element.uid].push({ x: new Date(element.time - this.startAt), y: element.value });
            }
            else {
                chartDate[element.uid].push({ x: new Date(element.time), y: element.value });
            }
        }
        return chartDate;
    }

    getLatestRanking(): { uid: number, point: number }[] {
        if (this.points.length === 0) return [];

        const pointGroups = new Map<number, { uid: number, point: number }[]>();
        for (const point of this.points) {
            if (!pointGroups.has(point.time)) pointGroups.set(point.time, []);
            pointGroups.get(point.time).push({ uid: point.uid, point: point.value });
        }
        const times = [...pointGroups.keys()].sort((a, b) => b - a);
        for (const time of times) {
            const result = pointGroups.get(time);
            if (result.length < 10) continue;
            result.sort((a, b) => b.point - a.point);
            return result.slice(0, 10);
        }
        return [];
    }

    getUserByUid(id: number): TrackerTopUser {
        for (let i = 0; i < this.users.length; i++) {
            if (this.users[i].uid === id) return this.users[i];
        }
        return undefined;
    }

    getUserNameById(id: number): string {
        const user = this.getUserByUid(id);
        return user?.name ?? id.toString();
    }
}
