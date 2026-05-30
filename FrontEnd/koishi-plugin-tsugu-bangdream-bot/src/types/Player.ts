// @ts-nocheck
import * as getApi_1 from "../api/getApi";
import * as config_1 from "../config";
import * as Server_1 from "./Server";
/*
- mode=0 只从缓存取，无需等待队列立即返回缓存数据
- mode=1 同上立即返回缓存数据，但同时再放入队列请求服务器后台更新
- mode=2 放入队列等待新鲜数据，如果耗时过长就返回缓存数据
- mode=3 放入队列持续等待新鲜数据
*/
export class Player {
    constructor(playerId, server) {
        this.isExist = false;
        this.initError = false;
        this.isInitfull = false;
        this.playerId = playerId;
        this.server = server;
    }
    async initFull(useCache = false, mode = 2) {
        if (this.isInitfull) {
            return;
        }
        var cacheTime = useCache ? 1 / 0 : 0;
        try {
            var playerData = await (0, getApi_1.callAPIAndCacheResponse)(`${config_1.Bestdoriurl}/api/player/${Server_1.Server[this.server]}/${this.playerId}?mode=${mode}`, cacheTime);
        }
        catch {
            this.isExist = false;
            this.initError = true;
            return;
        }
        if (!playerData["result"] || playerData['data']['profile'] == null) {
            this.isExist = false;
            return;
        }
        this.isExist = true;
        this.cache = playerData['data']['cache'];
        this.time = playerData['data']['time'];
        this.profile = playerData['data']['profile'];
        /*
        //卡牌列表
        this.profile.cardList = []
        for (let i = 0; i < this.profile.mainDeckUserSituations.entries.length; i++) {
            const cardData = this.profile.mainDeckUserSituations.entries[i];
            var card = new Card(cardData.situationId)
            this.profile.cardList.push(card)
        }
        //插画
        this.profile.userIllust = this.getUserIllust()

        //修复新旧API难度信息不兼容问题
        if (this.profile.userMusicClearInfoMap == undefined) {
            const difficultyNameList = ['easy', 'normal', 'hard', 'expert', 'special'] //难度名称
            this.profile.userMusicClearInfoMap = { entries: {} }
            for (let i = 0; i < difficultyNameList.length; i++) {
                const difficultyName = difficultyNameList[i];
                this.profile.userMusicClearInfoMap.entries[difficultyName] = {
                    clearedMusicCount: 0,
                    fullComboMusicCount: 0,
                    allPerfectMusicCount: 0,
                }
            }
            if (this.profile['clearedMusicCountMap']?.['entries'] != undefined) {
                for (let i = 0; i < difficultyNameList.length; i++) {
                    const difficultyName = difficultyNameList[i];
                    const number = this.profile['clearedMusicCountMap']['entries'][difficultyName] || 0
                    this.profile.userMusicClearInfoMap.entries[difficultyName]['clearedMusicCount'] = number
                }
            }
            if (this.profile['fullComboMusicCountMap']?.['entries'] != undefined) {
                for (let i = 0; i < difficultyNameList.length; i++) {
                    const difficultyName = difficultyNameList[i];
                    const number = this.profile['fullComboMusicCountMap']['entries'][difficultyName] || 0
                    this.profile.userMusicClearInfoMap.entries[difficultyName]['fullComboMusicCount'] = number
                }
            }
            if (this.profile['allPerfectMusicCountMap']?.['entries'] != undefined) {
                for (let i = 0; i < difficultyNameList.length; i++) {
                    const difficultyName = difficultyNameList[i];
                    const number = this.profile['allPerfectMusicCountMap']['entries'][difficultyName] || 0
                    this.profile.userMusicClearInfoMap.entries[difficultyName]['allPerfectMusicCount'] = number
                }
            }
        }
        */
    }
}
