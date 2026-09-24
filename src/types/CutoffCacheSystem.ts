// 档线缓存系统。

import { preferredCutoffDataSourceName } from "@/config";
import { Cutoff } from "./Cutoff";
import { getEventListByDisplayServerListTimeRange } from "./Event";
import { Server } from "./Server";
import { promises as fs } from "fs";
import path from "path";

const cacheListFile = path.resolve(process.cwd(), "subscript-cache-list.txt");
const cacheKeyPattern = /^S(\d+)E(\d+)T(\d+)D(\d+)$/;
export class CacheStatus {
    server: Server;
    eventId: number;
    tier: number;
    prevUpdate:number
    constructor(server:Server,eventId:number,tier:number,ttl:number){
        this.server = server
        this.eventId = eventId
        this.tier = tier
        this.prevUpdate = new Date().getTime()
    }
}
// 注册档线 缓存档线
export class CacheOptions {
    server: Server;             // 服务器
    eventId: number;            // 活动列表
    tier: number;               // 档线
    ttl: number;                // 过期时间，即更新时间单位s
    prevUpdate:number=0;          // 上一次更新的日期
    //cutoffData:any;             // 档线数据
    dataSourceName?: string;    // 缓存的source
    removeFlags:false           // 是否被移除
    id:number                   // 当前缓存id
    cutoffObj:Cutoff
    constructor(server:Server,eventId:number,tier:number,ttl:number){
        this.server = server
        this.eventId = eventId
        this.tier = tier
        this.ttl = ttl
        this.prevUpdate = new Date().getTime()
        this.cutoffObj = new Cutoff(this.eventId,this.server,this.tier)
        this.fetchNewData()
    }
    async fetchNewData(){
        const update = function(){
            let cutoff = new Cutoff(this.eventId,this.server,this.tier)
            cutoff.initFull()
            this.cutoffObj = null
            this.cutoffObj = cutoff
            this.prevUpdate = new Date().getTime()
        }
        if (preferredCutoffDataSourceName != 'StarFx' && (new Date().getTime() - this.prevUpdate)>15*60*1000){  // 非高精度源应该要15分钟后才能更新一次
            update()
        }else if (preferredCutoffDataSourceName == 'StarFx'){
            update()
        }
    }
    getData(): Cutoff {
        // 复制一个
        const copy = structuredClone(this.cutoffObj);
        Object.setPrototypeOf(copy, Cutoff.prototype);
        if (copy.event) {
            Object.setPrototypeOf(copy.event, Event.prototype);
        }
        return copy;
    }
};

let subscriptCacheMap = new Map<string,CacheOptions>()
let ttl = 60        // 秒（）
let runStatus = false
export async function addSubscriptCache(server:Server,eventId:number,tier:number,ttl:number,isLoad=false){
    const key = makeCacheKey(server, eventId, tier, ttl);
    subscriptCacheMap.set(
        key,
        new CacheOptions(server, eventId, tier, ttl),
    );
    if (!isLoad) await saveSubscriptCacheList();
}

export async function delSubscriptCache(server:Server,eventId:number,tier:number){
    const key = makeCacheKey(server, eventId, tier, ttl);
    if (subscriptCacheMap.has(key)) subscriptCacheMap.delete(key)
    await saveSubscriptCacheList()
}

export async function saveSubscriptCacheList(): Promise<void> {
    const content = [...subscriptCacheMap.keys()].join("\n");
    await fs.writeFile(cacheListFile, content, "utf8");
}

export async function loadSubscriptCacheList(){
    let content: string;

    try {
        content = await fs.readFile(cacheListFile, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
    }

    // 先检查完整个文件，避免格式错误时只恢复一部分。
    const entries = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const configs = entries.map((key) => {
        const match = cacheKeyPattern.exec(key);
        if (!match) throw new Error(`无效的档线缓存 key：${key}`);

        return {
            server: Number(match[1]) as Server,
            eventId: Number(match[2]),
            tier: Number(match[3]),
            cacheTtl: Number(match[4]),
        };
    });

    subscriptCacheMap.clear();
    for (const config of configs) {
        addSubscriptCache(
            config.server,
            config.eventId,
            config.tier,
            config.cacheTtl,
            true    // 加载阶段
        );
    }
}

async function updateSubscriptCache(): Promise<void> {
    const tasks: Promise<void>[] = [];
    subscriptCacheMap.forEach((item, key) => {
        if (item.removeFlags) {
            subscriptCacheMap.delete(key);
            return;
        }
        tasks.push(item.fetchNewData());
    });
    await Promise.all(tasks);
}
export function hasSubscriptCache(server:Server,eventId:number,tier:number):boolean{
    const key = makeCacheKey(server, eventId, tier, ttl);
    return subscriptCacheMap.has(key)
}
export function readSubscriptCache(server:Server,eventId:number,tier:number):Cutoff{
    const key = makeCacheKey(server, eventId, tier, ttl);
    if (subscriptCacheMap.has(key)){
        return subscriptCacheMap.get(key).getData()
    }
    else{
        return null
    }
}
export function readSubscriptCacheStatusTotal(){
    let status:CacheStatus[] =[]
    subscriptCacheMap.forEach((key)=>status.push(new CacheStatus(key.server,key.eventId,key.tier,key.ttl)))
    return status
}
export async function runSubscriptCache(){
    if (runStatus) return;
    runStatus = true;
    await loadSubscriptCacheList()
    setInterval(async () => {
        try {
            await updateSubscriptCache();
        } catch (error) {
            console.error(error);
        }
    }, ttl * 1000);
}

function makeCacheKey(
    server: Server,
    eventId: number,
    tier: number,
    cacheTtl: number,
): string {
    return `S${server}E${eventId}T${tier}D${cacheTtl}`;
}

