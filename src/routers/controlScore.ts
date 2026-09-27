import express, { Request, Response } from 'express'
import { body } from 'express-validator'
import { Event, getPresentEvent } from '@/types/Event'
import { isServer, Server } from '@/types/Server'
import { middleware } from '@/routers/middleware'
import { listToBase64 } from '@/routers/utils'
import {
    calculateControlScore,
    getControlScoreEventType,
} from '@/types/controlScore'
import { drawControlScore } from '@/view/controlScore'

const MAX_TARGET_PT = 2000000000
const MAX_SUPPORT_BAND = 10000000

const router = express.Router()

router.post('/', [
    body('mainServer').custom((value) => {
        if (!isServer(value)) throw new Error('mainServer must be a Server')
        return true
    }),
    body('targetPt').isInt({ min: 0, max: MAX_TARGET_PT }),
    body('eventId').optional().isInt({ min: 1 }),
    body('bonusRate').optional().isFloat({ min: 0, max: 425 }),
    body('supportBand').optional().isInt({ min: 0, max: MAX_SUPPORT_BAND }),
    body('cpClear').optional().isBoolean(),
    body('isWin').optional().isBoolean(),
    body('easyMode').optional().isBoolean(),
    body('alternativePage').optional().isInt({ min: 1, max: 10000 }),
    body('alternativePageSize').optional().isInt({ min: 1, max: 6 }),
    body('useEasyBG').optional().isBoolean(),
    body('compress').optional().isBoolean(),
], middleware, async (req: Request, res: Response) => {
    try {
        const mainServer = Number(req.body.mainServer) as Server
        const targetPt = Number(req.body.targetPt)
        const eventId = req.body.eventId == undefined ? undefined : Number(req.body.eventId)
        const resolvedEvent = eventId == undefined
            ? getPresentEvent(mainServer)
            : new Event(eventId)

        if (!resolvedEvent || !resolvedEvent.isExist) {
            res.send(listToBase64([`错误: 活动不存在${eventId == undefined ? '，当前服务器也没有可用活动' : `: ${eventId}`}`]))
            return
        }

        const eventType = getControlScoreEventType(resolvedEvent.eventType)
        if (eventType == undefined) {
            res.send(listToBase64([`错误: 暂不支持活动类型 ${resolvedEvent.eventType}`]))
            return
        }

        const calculation = calculateControlScore(eventType, {
            targetPt,
            bonusRate: req.body.bonusRate == undefined ? 0 : Number(req.body.bonusRate),
            supportBand: req.body.supportBand == undefined ? 282000 : Number(req.body.supportBand),
            cpClear: req.body.cpClear ?? false,
            isWin: req.body.isWin ?? true,
            easyMode: req.body.easyMode ?? true,
        })

        const result = await drawControlScore(
            resolvedEvent,
            mainServer,
            calculation,
            req.body.alternativePage == undefined ? 1 : Number(req.body.alternativePage),
            req.body.alternativePageSize == undefined ? 6 : Number(req.body.alternativePageSize),
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

export { router as controlScoreRouter }
