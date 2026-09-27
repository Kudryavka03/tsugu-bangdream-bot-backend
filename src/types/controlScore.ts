export enum ControlScoreEventType {
    mission = 1,
    cp = 2,
    ex = 3,
    team = 4,
    medley = 5,
    match = 6,
}

export const CONTROL_SCORE_EVENT_TYPE_NAME: Record<ControlScoreEventType, string> = {
    [ControlScoreEventType.mission]: '任务Live',
    [ControlScoreEventType.cp]: 'CP Live',
    [ControlScoreEventType.ex]: 'EX Live',
    [ControlScoreEventType.team]: '5v5 Live',
    [ControlScoreEventType.medley]: '组曲Live',
    [ControlScoreEventType.match]: '对邦Live',
}

const BESTDORI_EVENT_TYPE_MAP: Record<string, ControlScoreEventType> = {
    mission_live: ControlScoreEventType.mission,
    challenge: ControlScoreEventType.cp,
    live_try: ControlScoreEventType.ex,
    festival: ControlScoreEventType.team,
    medley: ControlScoreEventType.medley,
    versus: ControlScoreEventType.match,
}

const SCORE_MAX: Record<ControlScoreEventType, number> = {
    [ControlScoreEventType.mission]: 3500000,
    [ControlScoreEventType.cp]: 3500000,
    [ControlScoreEventType.ex]: 3500000,
    [ControlScoreEventType.team]: 3500000,
    [ControlScoreEventType.medley]: 2500000,
    [ControlScoreEventType.match]: 3500000,
}

const SCORE_MIN_DEATH = 0
const SCORE_MIN = 10000
const SCORE_MIN_MEDLEY = 18500
const MAX_BONUS_RATE = 425
const FIRE_LABEL: Record<number, string> = {
    1: '0火',
    5: '1火',
    10: '2火',
    15: '3火',
}

export interface ControlScoreOptions {
    targetPt: number
    bonusRate: number
    supportBand: number
    cpClear: boolean
    isWin: boolean
    easyMode: boolean
}

export interface ControlScorePlan {
    kind: 'ok' | 'warn' | 'error'
    label: string
    scoreMin: number
    scoreMax: number
    actualPt: number
    detail: string
    tooLarge?: boolean
}

export interface ControlScoreAlternative {
    rate: number
    fireRate: number
    fire: number
    scoreMin: number
    scoreMax: number
    actualPt: number
}

export interface ControlScoreCalculation {
    eventType: ControlScoreEventType
    eventTypeName: string
    targetPt: number
    bonusRate: number
    supportBand: number
    cpClear: boolean
    isWin: boolean
    easyMode: boolean
    ptMin: number
    scoreMax: number
    formula: string
    plans: ControlScorePlan[]
    alternatives: ControlScoreAlternative[]
    error?: string
}

export function getControlScoreEventType(eventType: string): ControlScoreEventType | undefined {
    return BESTDORI_EVENT_TYPE_MAP[eventType]
}

export function calculateControlScore(
    eventType: ControlScoreEventType,
    options: ControlScoreOptions,
): ControlScoreCalculation {
    switch (eventType) {
        case ControlScoreEventType.mission:
            return buildCalculation(
                eventType,
                options,
                calculateMission(options.targetPt, options.bonusRate, options.supportBand),
            )
        case ControlScoreEventType.cp:
            return buildCalculation(
                eventType,
                options,
                options.cpClear
                    ? calculateCpClear(options.targetPt)
                    : calculateCpNormal(options.targetPt, options.bonusRate),
            )
        case ControlScoreEventType.ex:
            return buildCalculation(eventType, options, calculateEx(options.targetPt, options.bonusRate))
        case ControlScoreEventType.team:
            return buildCalculation(eventType, options, calculateTeam(options.targetPt, options.isWin, options.easyMode))
        case ControlScoreEventType.medley:
            return buildCalculation(eventType, options, calculateMedley(options.targetPt))
        case ControlScoreEventType.match:
            return buildCalculation(eventType, options, calculateMatch(options.targetPt, options.easyMode))
    }
}

interface CalculationCore {
    ptMin: number
    scoreMax: number
    formula: string
    plans: ControlScorePlan[]
    alternatives?: ControlScoreAlternative[]
    error?: string
}

function buildCalculation(
    eventType: ControlScoreEventType,
    options: ControlScoreOptions,
    core: CalculationCore,
): ControlScoreCalculation {
    return {
        eventType,
        eventTypeName: CONTROL_SCORE_EVENT_TYPE_NAME[eventType],
        targetPt: options.targetPt,
        bonusRate: options.bonusRate,
        supportBand: options.supportBand,
        cpClear: options.cpClear,
        isWin: options.isWin,
        easyMode: options.easyMode,
        ptMin: core.ptMin,
        scoreMax: core.scoreMax,
        formula: core.formula,
        plans: core.plans,
        alternatives: core.alternatives ?? [],
        error: core.error,
    }
}

function calculateMission(targetPt: number, bonusRate: number, supportBand: number): CalculationCore {
    const uprate = 1 + bonusRate / 100
    const supportNum = Math.floor(supportBand / 3000)
    const ptMinSingle = 120 + supportNum
    const fireRate = chooseFireRate(targetPt, ptMinSingle, 120, uprate)
    const ptMin = ptMinSingle * fireRate
    const scoreMax = SCORE_MAX[ControlScoreEventType.mission]
    const formula = 'PT = (floor(分数 / 15000) + 120) × (1 + 加成%) + floor(支援综合力 / 3000)'

    if (targetPt < ptMin) {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: `目标PT (${formatNumber(targetPt)}) 低于最低可获取PT (${formatNumber(ptMin)})。`,
        }
    }

    const effectiveTarget = targetPt / fireRate
    const rangeLower = effectiveTarget - supportNum
    const scoreLower = Math.ceil(rangeLower / uprate - 120)
    const scoreUpper = Math.ceil((rangeLower + 1) / uprate - 120 - 1)

    if (scoreLower !== scoreUpper) {
        const alternatives = findAlternativeRates(targetPt, 120, 15000, supportNum, scoreMax)
        if (alternatives.length === 0) {
            return {
                ptMin,
                scoreMax,
                formula,
                plans: [],
                error: '目标PT不可达，且没有可行的替代加成倍率。',
            }
        }
        return { ptMin, scoreMax, formula, plans: [], alternatives }
    }

    const scoreFinal = scoreLower * 15000
    const scoreStatus = scoreCheck(scoreFinal, SCORE_MIN_DEATH, scoreMax)
    if (scoreStatus === 'too_small') {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: '目标PT不可达，所需分数低于最低可行分数。',
        }
    }

    const actualPt = Math.floor((Math.floor(scoreFinal / 15000 + 120) * uprate + supportNum) * fireRate)
    return {
        ptMin,
        scoreMax,
        formula,
        plans: [{
            kind: scoreStatus === 'too_large' ? 'warn' : 'ok',
            label: `任务Live · ${FIRE_LABEL[fireRate]}`,
            scoreMin: scoreFinal,
            scoreMax: scoreFinal + 14999,
            actualPt,
            detail: `加成 ${formatNumber(bonusRate)}% · 支援综合力 ${formatNumber(supportBand)} · ${FIRE_LABEL[fireRate]}`,
            tooLarge: scoreStatus === 'too_large',
        }],
    }
}

function calculateEx(targetPt: number, bonusRate: number): CalculationCore {
    const uprate = 1 + bonusRate / 100
    const ptMinSingle = 130
    const fireRate = chooseFireRate(targetPt, ptMinSingle, 130, uprate)
    const ptMin = ptMinSingle * fireRate
    const scoreMax = SCORE_MAX[ControlScoreEventType.ex]
    const formula = 'PT = floor(分数 / 26000 + 130) × (1 + 加成%)'

    if (targetPt < ptMin) {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: `目标PT (${formatNumber(targetPt)}) 低于最低可获取PT (${formatNumber(ptMin)})。`,
        }
    }

    const effectiveTarget = targetPt / fireRate
    const scoreLower = Math.ceil(effectiveTarget / uprate - 130)
    const scoreUpper = Math.ceil((effectiveTarget + 1) / uprate - 130 - 1)

    if (scoreLower !== scoreUpper) {
        const alternatives = findAlternativeRates(targetPt, 130, 26000, 0, scoreMax)
        if (alternatives.length === 0) {
            return {
                ptMin,
                scoreMax,
                formula,
                plans: [],
                error: '目标PT不可达，且没有可行的替代加成倍率。',
            }
        }
        return { ptMin, scoreMax, formula, plans: [], alternatives }
    }

    const scoreFinal = scoreLower * 26000
    const scoreStatus = scoreCheck(scoreFinal, SCORE_MIN_DEATH, scoreMax)
    if (scoreStatus === 'too_small') {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: '目标PT不可达，所需分数低于最低可行分数。',
        }
    }

    const actualPt = Math.floor((Math.floor(scoreFinal / 26000 + 130) * uprate) * fireRate)
    return {
        ptMin,
        scoreMax,
        formula,
        plans: [{
            kind: scoreStatus === 'too_large' ? 'warn' : 'ok',
            label: `EX Live · ${FIRE_LABEL[fireRate]}`,
            scoreMin: scoreFinal,
            scoreMax: scoreFinal + 25999,
            actualPt,
            detail: `加成 ${formatNumber(bonusRate)}% · ${FIRE_LABEL[fireRate]}`,
            tooLarge: scoreStatus === 'too_large',
        }],
    }
}

function calculateCpNormal(targetPt: number, bonusRate: number): CalculationCore {
    const uprate = 1 + bonusRate / 100
    const ptMinSingle = 70
    const fireRate = chooseFireRate(targetPt, ptMinSingle, 70, uprate)
    const ptMin = ptMinSingle * fireRate
    const scoreMax = SCORE_MAX[ControlScoreEventType.cp]
    const formula = '自由模式：PT = floor(分数 / 50000 + 70) × (1 + 加成%)'

    if (targetPt < ptMin) {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: `目标PT (${formatNumber(targetPt)}) 低于最低可获取PT (${formatNumber(ptMin)})。`,
        }
    }

    const effectiveTarget = targetPt / fireRate
    const scoreLower = Math.ceil(effectiveTarget / uprate - 70)
    const scoreUpper = Math.ceil((effectiveTarget + 1) / uprate - 70 - 1)

    if (scoreLower !== scoreUpper) {
        const alternatives = findAlternativeRates(targetPt, 70, 50000, 0, scoreMax)
        if (alternatives.length === 0) {
            return {
                ptMin,
                scoreMax,
                formula,
                plans: [],
                error: '目标PT不可达，自由模式下没有可行的替代加成倍率。',
            }
        }
        return { ptMin, scoreMax, formula, plans: [], alternatives }
    }

    const scoreFinal = scoreLower * 50000
    const scoreStatus = scoreCheck(scoreFinal, SCORE_MIN_DEATH, scoreMax)
    if (scoreStatus === 'too_small') {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: '目标PT不可达，所需分数低于最低可行分数。',
        }
    }

    const actualPt = Math.floor((Math.floor(scoreFinal / 50000 + 70) * uprate) * fireRate)
    return {
        ptMin,
        scoreMax,
        formula,
        plans: [{
            kind: scoreStatus === 'too_large' ? 'warn' : 'ok',
            label: `CP Live · 自由 · ${FIRE_LABEL[fireRate]}`,
            scoreMin: scoreFinal,
            scoreMax: scoreFinal + 49999,
            actualPt,
            detail: `加成 ${formatNumber(bonusRate)}% · ${FIRE_LABEL[fireRate]}`,
            tooLarge: scoreStatus === 'too_large',
        }],
    }
}

function calculateCpClear(targetPt: number): CalculationCore {
    const cpRates = [1, 2, 4, 8]
    const basicSingleScore = 3250
    const baseSingleNum = 450
    const ptMin = basicSingleScore + Math.floor(SCORE_MIN / baseSingleNum)
    const scoreMax = SCORE_MAX[ControlScoreEventType.cp]
    const formula = '清CP：PT = (floor(分数 / 450) + 3250) × CP倍率'

    if (targetPt < ptMin) {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: `目标PT (${formatNumber(targetPt)}) 低于清CP最低可获取PT (${formatNumber(ptMin)})。`,
        }
    }

    const plans: ControlScorePlan[] = []
    for (const cpRate of cpRates) {
        const scoreFloat = targetPt / cpRate - basicSingleScore
        const available = getAvailableDirectScore(scoreFloat, targetPt, basicSingleScore, cpRate)
        if (!available.ok) continue

        const scoreFinal = available.score * baseSingleNum
        const scoreStatus = scoreCheck(scoreFinal, SCORE_MIN, scoreMax)
        if (scoreStatus === 'too_small') continue

        plans.push({
            kind: scoreStatus === 'too_large' ? 'warn' : 'ok',
            label: `CP Live · 清CP (${cpRate * 200}CP)`,
            scoreMin: scoreFinal,
            scoreMax: scoreFinal + baseSingleNum - 1,
            actualPt: (Math.floor(available.score) + basicSingleScore) * cpRate,
            detail: `消耗 ${cpRate * 200} CP`,
            tooLarge: scoreStatus === 'too_large',
        })
    }

    if (plans.length === 0) {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: '目标PT不可达，任何CP消耗量都无法精确匹配。',
        }
    }
    return { ptMin, scoreMax, formula, plans }
}

function calculateTeam(targetPt: number, isWin: boolean, easyMode: boolean): CalculationCore {
    const bonusScore = isWin ? 125 : 0
    const teamContribute = [125, 117, 110, 105, 100]
    const extraNum = 50
    const baseNum = 6500
    const ptMin = bonusScore + teamContribute[4]
    const scoreMax = SCORE_MAX[ControlScoreEventType.team]
    const formula = 'PT = floor(分数 / 6500) + 50 + 输赢奖励 + 队内排名奖励'

    if (targetPt < ptMin) {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: `目标PT (${formatNumber(targetPt)}) 低于最低可获取PT (${formatNumber(ptMin)})。`,
        }
    }

    const plans: ControlScorePlan[] = []
    for (let i = 0; i < teamContribute.length; i++) {
        if (easyMode && i !== 0 && i !== 4) continue

        const rank = i + 1
        const contribution = teamContribute[i]
        const scoreFloat = targetPt - extraNum - bonusScore - contribution
        const available = getAvailableDirectScore(
            scoreFloat,
            targetPt,
            extraNum + bonusScore + contribution,
        )
        if (!available.ok) continue

        const scoreFinal = available.score * baseNum
        const scoreStatus = scoreCheck(scoreFinal, SCORE_MIN_DEATH, scoreMax)
        if (scoreStatus === 'too_small') continue

        plans.push({
            kind: scoreStatus === 'too_large' ? 'warn' : 'ok',
            label: `5v5 · ${isWin ? '胜利' : '失败'} · 队内第${rank}名`,
            scoreMin: scoreFinal,
            scoreMax: scoreFinal + baseNum - 1,
            actualPt: Math.floor(available.score) + extraNum + bonusScore + contribution,
            detail: `队伍成绩 ${isWin ? '胜利' : '失败'} · 队内第${rank}名 (+${contribution})`,
            tooLarge: scoreStatus === 'too_large',
        })
    }

    if (plans.length === 0) {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: '目标PT不可达，所有排名组合均无法精确匹配。',
        }
    }
    return { ptMin, scoreMax, formula, plans }
}

function calculateMedley(targetPt: number): CalculationCore {
    const basicScore = [30, 65, 100]
    const baseNum = 18500
    const ptMin = basicScore[0] + Math.floor(SCORE_MIN_MEDLEY / baseNum)
    const scoreMax = SCORE_MAX[ControlScoreEventType.medley]
    const formula = 'PT = floor(总分 / 18500) + 基础分 (1/2/3首对应30/65/100)'

    if (targetPt < ptMin) {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: `目标PT (${formatNumber(targetPt)}) 低于最低可获取PT (${formatNumber(ptMin)})。`,
        }
    }

    const plans: ControlScorePlan[] = []
    for (let song = 0; song < 3; song++) {
        const basic = basicScore[song]
        const scoreFloat = targetPt - basic
        const available = getAvailableDirectScore(scoreFloat, targetPt, basic)
        if (!available.ok) continue

        const scoreFinal = available.score * baseNum
        const scoreStatus = scoreCheck(scoreFinal, SCORE_MIN_MEDLEY, scoreMax * (song + 1))
        if (scoreStatus === 'too_small') continue

        plans.push({
            kind: scoreStatus === 'too_large' ? 'warn' : 'ok',
            label: `组曲Live · ${song + 1}首`,
            scoreMin: scoreFinal,
            scoreMax: scoreFinal + baseNum - 1,
            actualPt: Math.floor(available.score) + basic,
            detail: `完成 ${song + 1} 首歌曲 · 分数为多首总分`,
            tooLarge: scoreStatus === 'too_large',
        })
    }

    if (plans.length === 0) {
        return {
            ptMin,
            scoreMax,
            formula,
            plans: [],
            error: '目标PT不可达，所有歌曲数组合均无法精确匹配。',
        }
    }
    return { ptMin, scoreMax, formula, plans }
}

function calculateMatch(targetPt: number, easyMode: boolean): CalculationCore {
    const rankingScore = [200, 173, 146, 123, 100]
    const baseNum = 6500
    const baseSingleNum = 9750
    const basicSingleNum = 100
    const scoreMax = SCORE_MAX[ControlScoreEventType.match]
    const formula = '自由：PT = floor(分数 / 9750) + 100；对邦：PT = floor(分数 / 6500) + 排名奖励'
    const plans: ControlScorePlan[] = []

    const ptMinFree = basicSingleNum + Math.floor(SCORE_MIN / baseSingleNum)
    if (targetPt >= ptMinFree) {
        const scoreFloat = targetPt - basicSingleNum
        const available = getAvailableDirectScore(scoreFloat, targetPt, basicSingleNum)
        if (available.ok) {
            const scoreFinal = available.score * baseSingleNum
            const scoreStatus = scoreCheck(scoreFinal, SCORE_MIN, scoreMax)
            if (scoreStatus !== 'too_small') {
                plans.push({
                    kind: scoreStatus === 'too_large' ? 'warn' : 'ok',
                    label: '对邦 · 自由演出',
                    scoreMin: scoreFinal,
                    scoreMax: scoreFinal + baseSingleNum - 1,
                    actualPt: Math.floor(available.score) + basicSingleNum,
                    detail: '自由模式，需要将活动加成控制在0%',
                    tooLarge: scoreStatus === 'too_large',
                })
            }
        }
    }

    const ptMatchMin = rankingScore[4]
    if (targetPt >= ptMatchMin) {
        for (let i = 0; i < rankingScore.length; i++) {
            if (easyMode && i !== 0 && i !== 4) continue

            const rank = i + 1
            const rankScore = rankingScore[i]
            const scoreFloat = targetPt - rankScore
            const available = getAvailableDirectScore(scoreFloat, targetPt, rankScore)
            if (!available.ok) continue

            const scoreFinal = available.score * baseNum
            const scoreStatus = scoreCheck(scoreFinal, SCORE_MIN_DEATH, scoreMax)
            if (scoreStatus === 'too_small') continue

            plans.push({
                kind: scoreStatus === 'too_large' ? 'warn' : 'ok',
                label: `对邦 · 排名第${rank}名`,
                scoreMin: scoreFinal,
                scoreMax: scoreFinal + baseNum - 1,
                actualPt: Math.floor(available.score) + rankScore,
                detail: `对邦模式 · 第${rank}名 (+${rankScore})`,
                tooLarge: scoreStatus === 'too_large',
            })
        }
    }

    if (plans.length === 0) {
        return {
            ptMin: Math.min(ptMinFree, ptMatchMin),
            scoreMax,
            formula,
            plans: [],
            error: '目标PT不可达，自由模式和对邦模式均无法精确匹配。',
        }
    }
    return { ptMin: Math.min(ptMinFree, ptMatchMin), scoreMax, formula, plans }
}

function chooseFireRate(targetPt: number, ptMinSingle: number, basicScore: number, uprate: number): number {
    if (targetPt <= 500) return 1

    for (const fireRate of [15, 10, 5]) {
        if (targetPt % fireRate !== 0) continue
        if (targetPt < ptMinSingle * fireRate) continue
        if (targetPt / fireRate < basicScore * uprate) continue
        return fireRate
    }
    return 1
}

function getAvailableDirectScore(
    scoreFloat: number,
    targetPt: number,
    extraScore: number,
    multiplier: number = 1,
): { ok: true; score: number } | { ok: false } {
    if (Math.abs(scoreFloat - Math.round(scoreFloat)) < 1e-9) {
        return { ok: true, score: Math.round(scoreFloat) }
    }

    const scoreFloor = Math.floor(scoreFloat)
    if (targetPt === (scoreFloor + extraScore) * multiplier) {
        return { ok: true, score: scoreFloor }
    }

    const scoreCeil = Math.ceil(scoreFloat)
    if (targetPt === (scoreCeil + extraScore) * multiplier) {
        return { ok: true, score: scoreCeil }
    }
    return { ok: false }
}

function scoreCheck(score: number, min: number, max: number): 'too_small' | 'too_large' | 'ok' {
    if (score < min) return 'too_small'
    if (score > max) return 'too_large'
    return 'ok'
}

function findAlternativeRates(
    targetPt: number,
    basicScore: number,
    baseNum: number,
    supportNum: number,
    scoreMax: number,
    rateMaxConfig: number = MAX_BONUS_RATE,
): ControlScoreAlternative[] {
    const maxN = Math.floor(scoreMax / baseNum)
    const alternatives: ControlScoreAlternative[] = []
    const fireRates = [1, 5, 10, 15]
    const fireByRate: Record<number, number> = { 1: 0, 5: 1, 10: 2, 15: 3 }

    for (const fireRate of fireRates) {
        if (targetPt % fireRate !== 0) continue

        const basePt = targetPt / fireRate
        const effectiveTarget = basePt - supportNum
        if (effectiveTarget <= 0) continue

        for (let n = 0; n <= maxN; n++) {
            const bonus = n + basicScore
            if (bonus <= 0) continue

            const rateMin = Math.ceil(effectiveTarget * 100 / bonus - 100)
            const rateMax = Math.floor(((effectiveTarget + 1) * 100) / bonus - 100 - 1e-9)
            const rateStart = Math.max(0, rateMin)
            const rateEnd = Math.min(rateMaxConfig, rateMax)

            for (let rate = rateStart; rate <= rateEnd; rate++) {
                const uprate = 1 + rate / 100
                if (Math.floor(bonus * uprate) !== effectiveTarget) continue

                const scoreFinal = n * baseNum
                if (scoreFinal < SCORE_MIN_DEATH || scoreFinal > scoreMax) continue

                alternatives.push({
                    rate,
                    fireRate,
                    fire: fireByRate[fireRate],
                    scoreMin: scoreFinal,
                    scoreMax: scoreFinal + baseNum - 1,
                    actualPt: (Math.floor(bonus * uprate) + supportNum) * fireRate,
                })
            }
        }
    }

    alternatives.sort((a, b) => a.fire - b.fire || a.scoreMin - b.scoreMin)
    return alternatives
}

function formatNumber(value: number): string {
    return value.toLocaleString('zh-CN')
}
