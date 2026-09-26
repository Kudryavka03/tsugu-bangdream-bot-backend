import express from 'express'
import { body } from 'express-validator'
import { Request, Response } from 'express'
import { middleware } from '@/routers/middleware'
import { listToBase64 } from '@/routers/utils'
import { getServerByServerId, isServer, Server } from '@/types/Server'
import { Event, getPresentEvent } from '@/types/Event'
import { drawCalcFireBonus } from '@/view/calcFireBonus'

const router = express.Router()

const MAX_TOTAL_DRAWS = 1000
const MAX_FIRE_BONUS = 100
const MAX_GRAND_PRIZES = 100
const MAX_TABLE_CELLS = 500000

router.post('/', [
    body('mainServer').custom((value) => { if (!isServer(value)) throw new Error('mainServer must be a Server'); return true }),
    body('eventId').optional().isInt({ min: 1 }),
    body('totalDraws').optional().isInt({ min: 1, max: MAX_TOTAL_DRAWS }),
    body('fireBonus').optional().isInt({ min: 0, max: MAX_FIRE_BONUS }),
    body('grandPrizes').optional().isInt({ min: 0, max: MAX_GRAND_PRIZES }),
    body('useEasyBG').optional().isBoolean(),
    body('compress').optional().isBoolean(),
], middleware, async (req: Request, res: Response) => {
    try {
        const mainServer = getServerByServerId(req.body.mainServer)
        const eventId = req.body.eventId == undefined ? undefined : Number(req.body.eventId)
        const totalDraws = req.body.totalDraws == undefined ? undefined : Number(req.body.totalDraws)
        const fireBonus = req.body.fireBonus == undefined ? undefined : Number(req.body.fireBonus)
        const grandPrizes = req.body.grandPrizes == undefined ? undefined : Number(req.body.grandPrizes)
        const parameterList = [totalDraws, fireBonus, grandPrizes]
        const providedParameterCount = parameterList.filter((value) => value != undefined).length

        if (providedParameterCount > 0 && providedParameterCount < parameterList.length) {
            res.send(listToBase64(['错误: 总抽数、火罐数、大奖数必须同时提供']))
            return
        }

        if (providedParameterCount === parameterList.length && !isValidCombination(totalDraws, fireBonus, grandPrizes)) {
            res.send(listToBase64(['错误: 参数组合不合法，请检查总抽数、火罐数、大奖数']))
            return
        }

        const result = await commandCalcFireBonus(
            mainServer,
            totalDraws,
            fireBonus,
            grandPrizes,
            eventId,
            req.body.useEasyBG ?? true,
            req.body.compress ?? true,
        )
        res.send(listToBase64(result))
    }
    catch (e) {
        console.error(e)
        res.status(500).send({ status: 'failed', data: '内部错误' })
    }
})

export async function commandCalcFireBonus(
    mainServer: Server,
    totalDraws?: number,
    fireBonus?: number,
    grandPrizes?: number,
    eventId?: number,
    useEasyBG: boolean = true,
    compress: boolean = true,
): Promise<Array<Buffer | string>> {
    const useDefaultEventId = eventId == undefined
    let resolvedEventId = eventId
    if (resolvedEventId == undefined) {
        const presentEvent = getPresentEvent(mainServer)
        if (!presentEvent) {
            return [`错误: ${mainServer} 当前没有可用活动`]
        }
        resolvedEventId = presentEvent.eventId
    }

    const event = new Event(resolvedEventId)
    if (!event.isExist) {
        return [`错误: 活动不存在: ${resolvedEventId}`]
    }

    const useDefaultParameters = totalDraws == undefined
    let resolvedTotalDraws = totalDraws
    let resolvedFireBonus = fireBonus
    let resolvedGrandPrizes = grandPrizes

    if (useDefaultParameters) {
        if (event.eventType === 'festival') {
            resolvedTotalDraws = 230
            resolvedFireBonus = 10
            resolvedGrandPrizes = 1
        }
        else {
            resolvedTotalDraws = 180
            resolvedFireBonus = 10
            resolvedGrandPrizes = 1
        }
    }

    if (!isValidCombination(resolvedTotalDraws, resolvedFireBonus, resolvedGrandPrizes)) {
        return ['错误: 总抽数、火罐数、大奖数必须为非负整数，火罐数与大奖数之和不能超过总抽数，且参数组合不能过大']
    }

    return await drawCalcFireBonus(
        event,
        mainServer,
        resolvedTotalDraws,
        resolvedFireBonus,
        resolvedGrandPrizes,
        useDefaultEventId,
        useEasyBG,
        compress,
    )
}

function isValidCombination(totalDraws?: number, fireBonus?: number, grandPrizes?: number): boolean {
    if (!Number.isSafeInteger(totalDraws) || !Number.isSafeInteger(fireBonus) || !Number.isSafeInteger(grandPrizes)) {
        return false
    }
    if (totalDraws < 1 || totalDraws > MAX_TOTAL_DRAWS) {
        return false
    }
    if (fireBonus < 0 || fireBonus > MAX_FIRE_BONUS || fireBonus > totalDraws) {
        return false
    }
    if (grandPrizes < 0 || grandPrizes > MAX_GRAND_PRIZES || grandPrizes > totalDraws) {
        return false
    }
    if (fireBonus + grandPrizes > totalDraws) {
        return false
    }
    return (totalDraws + 1) * (fireBonus + 1) * (grandPrizes + 1) <= MAX_TABLE_CELLS
}

export { router as calcFireBonusRouter }
