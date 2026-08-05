const FIRE_RECOVERY_SECONDS = 30 * 60
const DEFAULT_RECOVERY_SECONDS = FIRE_RECOVERY_SECONDS
const LOGIN_EARLY_SECONDS = 5 * 60

export type FullFireServer = 'jp' | 'en' | 'tw' | 'cn' | 'kr'

export interface FullFireInput {
    currentFire: number
    remainingSeconds: number
    server: FullFireServer
}

export type FullFireParseResult =
    | { ok: true; value: FullFireInput }
    | { ok: false; error: string }

const SERVER_ALIASES: Record<string, FullFireServer> = {
    jp: 'jp',
    'jp服': 'jp',
    日服: 'jp',
    en: 'en',
    'en服': 'en',
    国际服: 'en',
    英服: 'en',
    tw: 'tw',
    'tw服': 'tw',
    台服: 'tw',
    繁中服: 'tw',
    cn: 'cn',
    'cn服': 'cn',
    国服: 'cn',
    简中服: 'cn',
    kr: 'kr',
    'kr服': 'kr',
    韩服: 'kr',
}

export function parseFullFireInput(text: string | undefined | null): FullFireParseResult {
    const tokens = String(text ?? '').trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) {
        return failure('必须输入当前游戏内剩余的火值。')
    }
    if (!/^\d+$/.test(tokens[0])) {
        return failure('火值必须是整数。')
    }
    if (tokens.length > 3) {
        return failure('参数过多，格式应为：满火计算 <当前火值> [回一火剩余时间] [服务器名]。')
    }

    const currentFire = Number(tokens[0])
    let server: FullFireServer = 'cn'
    let remainingSeconds = DEFAULT_RECOVERY_SECONDS
    let hasTime = false
    let hasServer = false

    for (const token of tokens.slice(1)) {
        const parsedServer = parseServer(token)
        if (parsedServer) {
            if (hasServer) return failure('只能指定一个服务器。')
            server = parsedServer
            hasServer = true
            continue
        }

        const parsedTime = parseRecoveryTime(token)
        if (parsedTime !== null) {
            if (hasTime) return failure('只能指定一个回火时间。')
            remainingSeconds = parsedTime
            hasTime = true
            continue
        }

        return failure(`无法识别参数“${token}”。时间示例：0130、1:30、1：30；服务器示例：cn、jp。`)
    }

    const maxFire = getMaxFire(server)
    if (!Number.isSafeInteger(currentFire) || currentFire < 0 || currentFire >= maxFire) {
        return failure(`${server} 服的火值范围只能是 0-${maxFire - 1}。`)
    }

    return {
        ok: true,
        value: { currentFire, remainingSeconds, server },
    }
}

export function parseRecoveryTime(text: string): number | null {
    const source = text.trim().replace(/：/g, ':')
    let minutes: number
    let seconds: number

    const colonMatch = source.match(/^(\d+):([0-5]?\d)$/)
    if (colonMatch) {
        minutes = Number(colonMatch[1])
        seconds = Number(colonMatch[2])
    }
    else {
        const compactMatch = source.match(/^(\d{1,2})([0-5]\d)$/)
        if (compactMatch) {
            minutes = Number(compactMatch[1])
            seconds = Number(compactMatch[2])
        }
        else {
            const chineseMatch = source.match(/^(?:(\d+)分(?:钟)?)?(?:(\d+)秒)?$/)
            if (!chineseMatch || (!chineseMatch[1] && !chineseMatch[2])) return null
            minutes = Number(chineseMatch[1] ?? 0)
            seconds = Number(chineseMatch[2] ?? 0)
            if (seconds >= 60) return null
        }
    }

    const totalSeconds = minutes * 60 + seconds
    if (totalSeconds > FIRE_RECOVERY_SECONDS) return null
    return totalSeconds
}

export function calculateFullFireTime(input: FullFireInput, now = new Date()): Date {
    const firesToRecover = getMaxFire(input.server) - input.currentFire
    const secondsUntilFull = input.remainingSeconds + (firesToRecover - 1) * FIRE_RECOVERY_SECONDS
    return new Date(now.getTime() + secondsUntilFull * 1000)
}

export function commandCalcFullFire(text: string | undefined | null, now = new Date()): string {
    const parsed = parseFullFireInput(text)
    if (parsed.ok === false) return `错误: ${parsed.error}`

    const input = parsed.value
    const fullFireTime = calculateFullFireTime(input, now)
    const loginTime = new Date(fullFireTime.getTime() - LOGIN_EARLY_SECONDS * 1000)

    return [
        `以 ${formatDateTime(now)}（服务器当前时间）为基准，在 ${input.server} 服剩余 ${input.currentFire} 火，且在 ${formatDuration(input.remainingSeconds)} 后回一火的情况下：`,
        `预计 ${formatDateTime(fullFireTime)} 时火将会回满。`,
        `建议提前 5 分钟（${formatDateTime(loginTime)}）登入游戏清火。`,
    ].join('\n')
}

export function getMaxFire(server: FullFireServer): number {
    return server === 'cn' ? 25 : 10
}

function parseServer(text: string): FullFireServer | null {
    return SERVER_ALIASES[text.trim().toLowerCase()] ?? null
}

function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function formatDateTime(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function failure(error: string): FullFireParseResult {
    return { ok: false, error }
}
