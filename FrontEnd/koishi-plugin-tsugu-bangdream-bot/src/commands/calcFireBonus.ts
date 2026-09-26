import { Config, Server } from '../config'
import { getReplyFromBackend } from '../api/getReplyFromBackend'

const MAX_TOTAL_DRAWS = 1000
const MAX_FIRE_BONUS = 100
const MAX_GRAND_PRIZES = 100

export interface CalcFireBonusInput {
    totalDraws?: number
    fireBonus?: number
    grandPrizes?: number
}

export type CalcFireBonusParseResult =
    | { ok: true; value: CalcFireBonusInput }
    | { ok: false; error: string }

export function parseCalcFireBonusInput(text: string | undefined | null): CalcFireBonusParseResult {
    const tokens = String(text ?? '').trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) {
        return { ok: true, value: {} }
    }
    if (tokens.length < 3) {
        return failure('总抽数、火罐数、大奖数必须同时提供。')
    }
    if (tokens.length > 3) {
        return failure('参数过多，格式应为：火罐计算 <总抽数> <火罐数> <大奖数>。')
    }
    if (!tokens.every((token) => /^\d+$/.test(token))) {
        return failure('总抽数、火罐数、大奖数必须是非负整数。')
    }

    const [totalDraws, fireBonus, grandPrizes] = tokens.map(Number)
    if (totalDraws < 1 || totalDraws > MAX_TOTAL_DRAWS) {
        return failure(`总抽数必须在 1-${MAX_TOTAL_DRAWS} 之间。`)
    }
    if (fireBonus < 0 || fireBonus > MAX_FIRE_BONUS || fireBonus > totalDraws) {
        return failure(`火罐数必须在 0-${Math.min(MAX_FIRE_BONUS, totalDraws)} 之间。`)
    }
    if (grandPrizes < 0 || grandPrizes > MAX_GRAND_PRIZES || grandPrizes > totalDraws) {
        return failure(`大奖数必须在 0-${Math.min(MAX_GRAND_PRIZES, totalDraws)} 之间。`)
    }
    if (fireBonus + grandPrizes > totalDraws) {
        return failure('火罐数与大奖数之和不能超过总抽数')
    }
    if ((totalDraws + 1) * (fireBonus + 1) * (grandPrizes + 1) > 500000) {
        return failure('参数组合过大，请减小总抽数、火罐数或大奖数。')
    }

    return {
        ok: true,
        value: { totalDraws, fireBonus, grandPrizes },
    }
}

export async function commandCalcFireBonus(
    config: Config,
    mainServer: Server,
    input: CalcFireBonusInput,
): Promise<Array<Buffer | string>> {
    return await getReplyFromBackend(`${config.backendUrl}/calcFireBonus`, {
        mainServer,
        ...input,
        useEasyBG: config.useEasyBG,
        compress: config.compress,
    })
}

function failure(error: string): CalcFireBonusParseResult {
    return { ok: false, error }
}
