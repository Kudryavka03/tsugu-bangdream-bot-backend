import { Config, Server } from '../config'
import { getReplyFromBackend } from '../api/getReplyFromBackend'

const MAX_TARGET_PT = 2000000000
const MAX_BONUS_RATE = 425
const MAX_SUPPORT_BAND = 10000000
const MAX_ALTERNATIVE_PAGE = 10000

const SERVER_ALIASES: Record<string, string> = {
    jp: 'jp',
    '日': 'jp',
    '日服': 'jp',
    en: 'en',
    '国际': 'en',
    '国际服': 'en',
    tw: 'tw',
    '台': 'tw',
    '台服': 'tw',
    cn: 'cn',
    '国': 'cn',
    '国服': 'cn',
    kr: 'kr',
    '韩': 'kr',
    '韩服': 'kr',
}

export interface ControlScoreInput {
    targetPt: number
    bonusRate?: number
    eventId?: number
    supportBand?: number
    cpClear?: boolean
    isWin?: boolean
    easyMode?: boolean
    alternativePage?: number
    serverName?: string
}

export type ControlScoreParseResult =
    | { ok: true; value: ControlScoreInput }
    | { ok: false; error: string }

export const CONTROL_SCORE_GUIDE = [
    '请按以下格式使用控分：',
    '控分 <目标PT> [加成%] [活动ID] [支援综合力] [模式] [服务器] [第N页]',
    '示例：',
    '控分 947',
    '控分 947 120',
    '控分 947 120 300',
    '控分 947 活动300 加成120 支援282000',
    '控分 947 120 300 清CP',
    '当前活动可省略活动ID，活动类型会由后端根据活动ID自动判断。',
].join('\n')

export async function commandControlScore(
    config: Config,
    mainServer: Server,
    input: ControlScoreInput,
): Promise<Array<Buffer | string>> {
    const { serverName, ...payload } = input
    return await getReplyFromBackend(`${config.backendUrl}/controlScore`, {
        mainServer,
        ...payload,
        useEasyBG: config.useEasyBG,
        compress: config.compress,
    })
}

export function parseControlScoreInput(text: string | undefined | null): ControlScoreParseResult {
    const tokens = String(text ?? '').trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) {
        return failure(`错误: 缺少目标PT。\n${CONTROL_SCORE_GUIDE}`)
    }

    let targetPt: number | undefined
    let bonusRate: number | undefined
    let eventId: number | undefined
    let supportBand: number | undefined
    let alternativePage: number | undefined
    let serverName: string | undefined
    let cpClear: boolean | undefined
    let isWin: boolean | undefined
    let easyMode: boolean | undefined
    const positionalNumbers: number[] = []

    for (const rawToken of tokens) {
        const token = normalizeToken(rawToken)

        const targetMatch = token.match(/^(?:目标|target|pt)(?:=|:)?(\d+)$/i)
        if (targetMatch) {
            const value = Number(targetMatch[1])
            if (targetPt !== undefined) return duplicateFailure('目标PT')
            targetPt = value
            continue
        }

        const eventMatch = token.match(/^(?:活动|event|eventid|id)(?:=|:)?(\d+)$/i)
        if (eventMatch) {
            if (eventId !== undefined) return duplicateFailure('活动ID')
            eventId = Number(eventMatch[1])
            continue
        }

        const bonusMatch = token.match(/^(?:加成|bonus)(?:=|:)?(\d+(?:\.\d+)?)%?$/i)
        if (bonusMatch) {
            if (bonusRate !== undefined) return duplicateFailure('加成倍率')
            bonusRate = Number(bonusMatch[1])
            continue
        }

        const supportMatch = token.match(/^(?:支援|support)(?:=|:)?(\d+)$/i)
        if (supportMatch) {
            if (supportBand !== undefined) return duplicateFailure('支援乐队综合力')
            supportBand = Number(supportMatch[1])
            continue
        }

        const pageMatch = token.match(/^(?:第)?(\d+)页$/) || token.match(/^页(?:=|:)?(\d+)$/)
        if (pageMatch) {
            if (alternativePage !== undefined) return duplicateFailure('页码')
            alternativePage = Number(pageMatch[1])
            continue
        }

        if (SERVER_ALIASES[token] !== undefined) {
            if (serverName !== undefined) return duplicateFailure('服务器')
            serverName = SERVER_ALIASES[token]
            continue
        }

        if (['清cp', '清cp模式', '挑战', '挑战live'].includes(token)) {
            cpClear = true
            continue
        }
        if (['自由', '自由模式', '自由演出'].includes(token)) {
            cpClear = false
            continue
        }
        if (['胜利', '赢'].includes(token)) {
            isWin = true
            continue
        }
        if (['失败', '输'].includes(token)) {
            isWin = false
            continue
        }
        if (['精简', '精简模式'].includes(token)) {
            easyMode = true
            continue
        }
        if (['完整', '完整模式', '全部', '全部排名'].includes(token)) {
            easyMode = false
            continue
        }

        if (/^\d+(?:\.\d+)?%$/.test(token)) {
            if (bonusRate !== undefined) return duplicateFailure('加成倍率')
            bonusRate = Number(token.slice(0, -1))
            continue
        }
        if (/^\d+$/.test(token)) {
            positionalNumbers.push(Number(token))
            continue
        }

        return failure(`错误: 无法识别参数“${rawToken}”。\n${CONTROL_SCORE_GUIDE}`)
    }

    if (targetPt === undefined) {
        if (positionalNumbers.length === 0) {
            return failure(`错误: 缺少目标PT。\n${CONTROL_SCORE_GUIDE}`)
        }
        targetPt = positionalNumbers.shift()
    }

    const optionalNumbers: Array<{
        name: string
        set: (value: number) => void
        value: number | undefined
    }> = [
        { name: '加成倍率', value: bonusRate, set: (value) => { bonusRate = value } },
        { name: '活动ID', value: eventId, set: (value) => { eventId = value } },
        { name: '支援乐队综合力', value: supportBand, set: (value) => { supportBand = value } },
    ]

    for (const value of positionalNumbers) {
        const slot = optionalNumbers.find((item) => item.value === undefined)
        if (!slot) {
            return failure(`错误: 参数过多。\n${CONTROL_SCORE_GUIDE}`)
        }
        slot.set(value)
        slot.value = value
    }

    if (!Number.isSafeInteger(targetPt) || targetPt < 0 || targetPt > MAX_TARGET_PT) {
        return failure(`错误: 目标PT必须是0-${MAX_TARGET_PT}之间的整数。\n${CONTROL_SCORE_GUIDE}`)
    }
    if (bonusRate !== undefined && (!Number.isFinite(bonusRate) || bonusRate < 0 || bonusRate > MAX_BONUS_RATE)) {
        return failure(`错误: 加成倍率必须在0%-${MAX_BONUS_RATE}%之间。若想填写活动ID，请使用“活动<ID>”。`)
    }
    if (eventId !== undefined && (!Number.isSafeInteger(eventId) || eventId < 1)) {
        return failure('错误: 活动ID必须是正整数。')
    }
    if (supportBand !== undefined && (!Number.isSafeInteger(supportBand) || supportBand < 0 || supportBand > MAX_SUPPORT_BAND)) {
        return failure(`错误: 支援乐队综合力必须在0-${MAX_SUPPORT_BAND}之间。`)
    }
    if (alternativePage !== undefined && (!Number.isSafeInteger(alternativePage) || alternativePage < 1 || alternativePage > MAX_ALTERNATIVE_PAGE)) {
        return failure(`错误: 页码必须在1-${MAX_ALTERNATIVE_PAGE}之间。`)
    }

    return {
        ok: true,
        value: {
            targetPt,
            bonusRate,
            eventId,
            supportBand,
            cpClear,
            isWin,
            easyMode,
            alternativePage,
            serverName,
        },
    }
}

function normalizeToken(token: string): string {
    return token
        .replace(/[,，]/g, '')
        .replace(/％/g, '%')
        .toLowerCase()
}

function duplicateFailure(name: string): ControlScoreParseResult {
    return failure(`错误: ${name}重复填写了。`)
}

function failure(error: string): ControlScoreParseResult {
    return { ok: false, error }
}
