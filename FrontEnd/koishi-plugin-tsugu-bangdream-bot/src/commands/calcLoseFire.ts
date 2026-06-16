// @ts-nocheck
import * as getReply from "../api/getReplyFromBackend"
import { getFuzzySearchResult } from "../api/fuzzySearch"

const DEFAULT_COMPARE_SONG = '325'
const DEFAULT_DIFFICULTY = 3
const DIFFICULTY_ALIAS_MAP = {
    easy: 0,
    ez: 0,
    简单: 0,
    简: 0,
    normal: 1,
    nm: 1,
    普通: 1,
    普: 1,
    hard: 2,
    hd: 2,
    困难: 2,
    困: 2,
    expert: 3,
    ex: 3,
    专家: 3,
    专: 3,
    special: 4,
    sp: 4,
    特殊: 4,
    特: 4,
}

export async function commandCalcLoseFire(config, mainServer, song1, song2, diff1, diff2) {
    return await getReply.getReplyFromBackend(`${config.backendUrl}/calcLoseFire`, {
        mainServer,
        song1,
        song2,
        diff1,
        diff2,
        useEasyBG: config.useEasyBG,
        compress: config.compress
    })
}

export async function parseCalcLoseFireInput(config, text) {
    if (!text) return null
    const source = text.trim()
    const tokens = source.split(/\s+/).filter(Boolean)

    if (tokens.length >= 4) {
        const diff1 = await parseDifficulty(config, tokens[1])
        const diff2 = await parseDifficulty(config, tokens[3])
        if (diff1 !== undefined && diff2 !== undefined) {
            return {
                song1: tokens[0],
                diff1,
                song2: tokens.slice(2, 3).join(' '),
                diff2,
            }
        }
    }

    if (tokens.length === 2 && isInteger(tokens[0]) && isInteger(tokens[1])) {
        return {
            song1: tokens[0],
            diff1: DEFAULT_DIFFICULTY,
            song2: tokens[1],
            diff2: DEFAULT_DIFFICULTY,
        }
    }

    const parts = source
        .split(/\s+(?:vs|VS|和|与|對|对|对比|比较)\s+|[,，/|]+/)
        .map((item) => item.trim())
        .filter(Boolean)

    if (parts.length < 2) {
        const song = await parseSongPart(config, source)
        if (!song) return null

        return {
            song1: song.song,
            diff1: song.diff ?? DEFAULT_DIFFICULTY,
            song2: DEFAULT_COMPARE_SONG,
            diff2: DEFAULT_DIFFICULTY,
        }
    }

    const song1 = await parseSongPart(config, parts[0])
    const song2 = await parseSongPart(config, parts.slice(1).join(' '))
    if (!song1 || !song2) return null

    return {
        song1: song1.song,
        diff1: song1.diff ?? DEFAULT_DIFFICULTY,
        song2: song2.song,
        diff2: song2.diff ?? DEFAULT_DIFFICULTY,
    }
}

async function parseSongPart(config, text) {
    const tokens = text.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return null
    if (tokens.length === 1) {
        return {
            song: text.trim(),
            diff: undefined,
        }
    }

    const lastDiff = await parseDifficulty(config, tokens[tokens.length - 1])
    if (lastDiff !== undefined && tokens.length > 1) {
        return {
            song: tokens.slice(0, -1).join(' '),
            diff: lastDiff,
        }
    }

    const firstDiff = await parseDifficulty(config, tokens[0])
    if (firstDiff !== undefined && tokens.length > 1) {
        return {
            song: tokens.slice(1).join(' '),
            diff: firstDiff,
        }
    }

    return {
        song: text.trim(),
        diff: undefined,
    }
}

async function parseDifficulty(config, text) {
    if (text === undefined || text === null) return undefined
    const normalized = String(text).trim().toLowerCase()
    if (/^[0-4]$/.test(normalized)) return Number(normalized)
    if (DIFFICULTY_ALIAS_MAP[normalized] !== undefined) return DIFFICULTY_ALIAS_MAP[normalized]
    if (isInteger(text)) return undefined

    const result = await getFuzzySearchResult(config, normalized)
    if (result && result['difficulty'] && result['difficulty'].length > 0) {
        return result['difficulty'][0]
    }

    return undefined
}

function isInteger(text) {
    return /^-?[0-9]+$/.test(String(text))
}

export { commandCalcLoseFire }
