import mainAPI from '@/types/_Main'
import { callAPIAndCacheResponse } from '@/api/getApi'
import { Image, loadImage } from 'skia-canvas'
import { downloadFileCache } from '@/api/downloadFileCache'
import { formatNumber } from '@/types/utils';
import { Bestdoriurl, globalDefaultServer } from "@/config"
import pLimit from 'p-limit'

let characterDataCache = {}
const characterBirthdayLoader = pLimit(4)
const characterBirthdayRequests = new Map<string, Promise<object>>()
export type CharacterBirthday = { month: number, day: number, characterIds: number[] }

function parseCharacterBirthday(birthday: unknown): { month: number, day: number } | null {
    if (birthday == null || birthday === '') return null
    const timestamp = Number(birthday)
    if (!Number.isFinite(timestamp)) return null
    // Bestdori stores birthdays at midnight in Japan time.
    const date = new Date(timestamp + 9 * 60 * 60 * 1000)
    if (!Number.isFinite(date.getTime())) return null
    const month = date.getUTCMonth() + 1
    const day = date.getUTCDate()
    const check = new Date(Date.UTC(2000, month - 1, day))
    return check.getUTCMonth() + 1 === month && check.getUTCDate() === day
        ? { month, day } : null
}

async function loadCharacterBirthdayList(): Promise<CharacterBirthday[]> {
    const groups = new Map<string, CharacterBirthday>()
    await Promise.all(Object.keys(mainAPI['characters']).map(async characterId => {
        let data = characterDataCache[characterId]
        if (data === undefined) {
            let request = characterBirthdayRequests.get(characterId)
            if (!request) {
                request = characterBirthdayLoader(async () => {
                    const loaded = await new Character(Number(characterId)).getData(false)
                    characterDataCache[characterId] = loaded
                    return loaded
                }).finally(() => characterBirthdayRequests.delete(characterId))
                characterBirthdayRequests.set(characterId, request)
            }
            data = await request
        }
        const parsed = parseCharacterBirthday(data?.profile?.birthday)
        if (!parsed) return
        const key = `${parsed.month}-${parsed.day}`
        let group = groups.get(key)
        if (!group) {
            group = { ...parsed, characterIds: [] }
            groups.set(key, group)
        }
        group.characterIds.push(Number(characterId))
    }))
    return Array.from(groups.values())
        .map(group => ({ ...group, characterIds: group.characterIds.sort((a, b) => a - b) }))
        .sort((a, b) => a.month - b.month || a.day - b.day)
}

export async function getCharacterBirthdayList(): Promise<CharacterBirthday[]> {
    // Rebuild from current master keys so newly added or removed characters are reflected.
    // Individual character detail responses remain cached and in-flight requests are shared.
    return loadCharacterBirthdayList()
}

export async function getCharacterIdsByBirthday(month: number, day: number): Promise<number[]> {
    const group = (await getCharacterBirthdayList()).find(item => item.month === month && item.day === day)
    return group ? [...group.characterIds] : []
}

function birthdayDate(year: number, birthday: CharacterBirthday): Date | null {
    const date = new Date(Date.UTC(year, birthday.month - 1, birthday.day))
    return date.getUTCMonth() + 1 === birthday.month && date.getUTCDate() === birthday.day ? date : null
}

function utcCalendarDate(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export async function getCharacterBirthdayByOffset(date: Date, offset: number): Promise<CharacterBirthday | null> {
    if (!Number.isSafeInteger(offset)) return null
    const list = await getCharacterBirthdayList()
    if (list.length === 0) return null
    const today = utcCalendarDate(date)
    if (offset === 0) {
        const todaysGroup = list.find(item => item.month === today.getUTCMonth() + 1 && item.day === today.getUTCDate())
        return todaysGroup ?? getNearestCharacterBirthday(date)
    }

    const direction = offset > 0 ? 1 : -1
    // The Gregorian calendar repeats every 400 years. Reducing very large
    // offsets keeps the search bounded while preserving occurrence order.
    const cycleOccurrenceCount = list.reduce((count, group) => count + (group.month === 2 && group.day === 29 ? 97 : 400), 0)
    const steps = (Math.abs(offset) - 1) % cycleOccurrenceCount + 1
    const events: Array<{ date: Date, group: CharacterBirthday }> = []
    const firstYear = direction > 0 ? today.getUTCFullYear() : today.getUTCFullYear() - 400
    const lastYear = direction > 0 ? today.getUTCFullYear() + 400 : today.getUTCFullYear()
    for (let year = firstYear; year <= lastYear; year++) {
        for (const group of list) {
            const candidate = birthdayDate(year, group)
            if (candidate && (direction > 0 ? candidate > today : candidate < today)) {
                events.push({ date: candidate, group })
            }
        }
    }
    events.sort((a, b) => direction > 0
        ? a.date.getTime() - b.date.getTime()
        : b.date.getTime() - a.date.getTime())
    return events[steps - 1]?.group ?? null
}

export async function getNearestCharacterBirthday(date: Date): Promise<CharacterBirthday | null> {
    const list = await getCharacterBirthdayList()
    if (list.length === 0) return null
    const target = utcCalendarDate(date)
    let bestGroup: CharacterBirthday | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    let bestIsFuture = false
    for (const group of list) {
        // Eight years covers the longest gap between real leap days (e.g. 2096 to 2104).
        for (let year = target.getUTCFullYear() - 8; year <= target.getUTCFullYear() + 8; year++) {
            const occurrence = birthdayDate(year, group)
            if (!occurrence) continue
            const delta = occurrence.getTime() - target.getTime()
            const distance = Math.abs(delta)
            const isFuture = delta >= 0
            if (distance < bestDistance || (distance === bestDistance && isFuture && !bestIsFuture)) {
                bestGroup = group
                bestDistance = distance
                bestIsFuture = isFuture
            }
        }
    }
    return bestGroup
}

export class Character {
    characterId: number;
    data: object;
    characterType: string;
    characterName: Array<string | null>;
    firstName: Array<string | null>;
    lastName: Array<string | null>;
    nickname: Array<string | null>;
    bandId: number;
    colorCode: string;
    sdAssetBundleName: string;
    defaultCostumeId: number;
    ruby: Array<string | null>;
    isExist: boolean = false;
    profile: {
        characterVoice: Array<string | null>;
        favoriteFood: Array<string | null>;
        hatedFood: Array<string | null>;
        hobby: Array<string | null>;
        selfIntroduction: Array<string | null>;
        school: Array<string | null>;
        schoolCls: Array<string | null>;
        schoolYear: string[];
        part: string;
        birthday: string;
        constellation: string;
        height: number;
    };
    isInitFull: boolean = false;

    constructor(characterId: number) {
        var characterData = mainAPI["characters"][characterId.toString()];
        if (characterData == undefined) {
            this.isExist = false;
            return
        }

        this.characterId = characterId;
        this.data = characterData;
        this.characterName = this.data["characterName"];
        this.firstName = this.data["firstName"];
        this.lastName = this.data["lastName"];
        this.nickname = this.data["nickname"];
        this.bandId = this.data["bandId"];

        this.isExist = true;
    }
    async initFull(useCache: boolean = true) {
        if (this.isInitFull) {
            return
        }
        if (this.isExist == false) {
            return
        }
        this.isExist = true;
        if (characterDataCache[this.characterId.toString()] != undefined && !useCache) {
            var characterData = characterDataCache[this.characterId.toString()]
        }
        else {
            var characterData = await this.getData(useCache)
            characterDataCache[this.characterId.toString()] = characterData
        }
        this.data = characterData
        this.characterType = characterData["characterType"];
        this.characterName = characterData["characterName"];
        this.firstName = characterData["firstName"];
        this.lastName = characterData["lastName"];
        this.nickname = characterData["nickname"];
        this.bandId = characterData["bandId"];
        this.colorCode = characterData["colorCode"];
        this.sdAssetBundleName = characterData["sdAssetBundleName"];
        this.defaultCostumeId = characterData["defaultCostumeId"];
        this.ruby = characterData["ruby"];
        this.profile = characterData["profile"];
        //修复学年类型错误
        for (var i = 0; i < this.profile.schoolYear.length; i++) {
            if(this.profile.schoolYear[i] != null){
                this.profile.schoolYear[i] = this.profile.schoolYear[i].toString()
            }
        }

        //缓存数据
        if (characterDataCache[this.characterId.toString()] == undefined) {
            characterDataCache[this.characterId.toString()] = characterData
        }
        this.isInitFull = true;
    }
    async getData(update: boolean = true) {
        var time = update ? 0 : 1 / 0
        var cardData = await callAPIAndCacheResponse(`${Bestdoriurl}/api/characters/${this.characterId}.json`, time,1,false,0)
        return cardData
    }
    async getIcon(): Promise<Image> {
        const iconBuffer = await downloadFileCache(`${Bestdoriurl}/res/icon/chara_icon_${this.characterId}.png`)
        return (await loadImage(iconBuffer))
    }
    async getIllustration(): Promise<Image> {
        const illustrationBuffer = await downloadFileCache(`${Bestdoriurl}/assets/jp/ui/character_kv_image/${formatNumber(this.characterId, 3)}_rip/image.png`)
        return (await loadImage(illustrationBuffer))
    }
    async getNameBanner(): Promise<Image> {
        const nameBannerBuffer = await downloadFileCache(`${Bestdoriurl}/assets/jp/character_name_rip/name_top_chr${formatNumber(this.characterId, 2)}.png`)
        return (await loadImage(nameBannerBuffer))
    }
    getCharacterName(): Array<string | null> {
        const characterNameList = []
        for (let i = 0; i < this.characterName.length; i++) {
            const element = this.characterName[i];
            if (this.nickname[i] != null) {
                characterNameList.push(`${this.nickname[i]} (${element})`)
            }
            else {
                characterNameList.push(element)
            }
        }
        return characterNameList
    }

}

