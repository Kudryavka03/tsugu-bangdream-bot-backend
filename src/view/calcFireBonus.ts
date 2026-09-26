import { Canvas, CanvasRenderingContext2D } from 'skia-canvas'
import { Event } from '@/types/Event'
import { Server } from '@/types/Server'
import { serverNameFullList } from '@/config'
import { drawTitle } from '@/components/title'
import { drawDatablock } from '@/components/dataBlock'
import { drawEventDatablock } from '@/components/dataBlock/event'
import { drawList, drawListMerge, drawListTextWithImages, line } from '@/components/list'
import { drawText } from '@/image/text'
import { outputFinalBuffer } from '@/image/output'
import { FireBonusCalculator } from '@/types/calcFireBonus'

const TABLE_WIDTH = 800
const TABLE_ROW_HEIGHT = 52
const TABLE_LABEL_WIDTH = 112
const TABLE_MAX_COLUMNS = 11
const HEADER_COLOR_LEFT = '#5b5b5b'
const HEADER_COLOR_RIGHT = '#ea4e73'
const ROW_COLOR_EVEN = '#ffffff'
const ROW_COLOR_ODD = '#f1f1f1'

interface FireBonusTableRow {
    remainingFireBonus: number
    boxChangeDraws: number
}

interface FireBonusStrategyResult {
    ratio: number
    multiplier: number
    rows: FireBonusTableRow[]
}

export async function drawCalcFireBonus(
    event: Event,
    mainServer: Server,
    totalDraws: number,
    fireBonus: number,
    grandPrizes: number,
    useDefaultEventId: boolean,
    useEasyBG: boolean,
    compress: boolean,
): Promise<Array<Buffer | string>> {
    const oneKeyResult = calculateStrategy(totalDraws, fireBonus, grandPrizes, true)
    const normalResult = calculateStrategy(totalDraws, fireBonus, grandPrizes, false)
    const all: Canvas[] = [
        await drawTitle(serverNameFullList[mainServer], '火罐抽取计算'),
    ]

    if (useDefaultEventId) {
        try {
            all.push(await drawEventDatablock(event, [mainServer]))
        }
        catch (e) {
            // 活动图头不可用时继续输出计算条件，不影响计算结果。
        }
    }

    all.push(await makeConditionBlock(event, mainServer, totalDraws, fireBonus, grandPrizes))
    all.push(await makeStrategyBlock('一键抽取', oneKeyResult, true))
    all.push(await makeStrategyBlock('非一键抽取', normalResult, false))

    let BGimage = undefined
    if (!useEasyBG) {
        try {
            BGimage = await event.getEventBGImage()
        }
        catch (e) {
            // 活动背景不可用时退回默认背景，不影响计算结果。
        }
    }

    const buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG,
        BGimage,
        text: event.getTypeName(),
        compress,
    })

    return [buffer]
}

function calculateStrategy(totalDraws: number, fireBonus: number, grandPrizes: number, oneKey: boolean): FireBonusStrategyResult {
    const calculator = new FireBonusCalculator(totalDraws, fireBonus, grandPrizes, oneKey)
    const ratio = calculator.run()
    const rows: FireBonusTableRow[] = []

    for (let remainingFireBonus = fireBonus; remainingFireBonus >= 0; remainingFireBonus--) {
        let boxChangeDraws = -1
        for (let remainingDraws = 0; remainingDraws <= totalDraws; remainingDraws++) {
            if (remainingDraws >= remainingFireBonus && calculator.choice[remainingDraws][remainingFireBonus][0] === 0) {
                boxChangeDraws = remainingDraws
                break
            }
        }
        rows.push({ remainingFireBonus, boxChangeDraws })
    }

    return {
        ratio,
        multiplier: ratio === 0 ? Number.POSITIVE_INFINITY : 1 / ratio,
        rows,
    }
}

async function makeConditionBlock(
    event: Event,
    mainServer: Server,
    totalDraws: number,
    fireBonus: number,
    grandPrizes: number,
): Promise<Canvas> {
    const eventName = event.eventName?.[mainServer]
        || event.eventName?.find((name) => name != null && name !== '')
        || `活动 ${event.eventId}`
    const list: Canvas[] = [
        await drawList({
            key: '活动',
            text: eventName,
            maxWidth: TABLE_WIDTH,
        }),
        line,
        drawListMerge([
            await drawList({ key: '总抽数', text: totalDraws.toString(), maxWidth: TABLE_WIDTH }),
            await drawList({ key: '火罐数', text: fireBonus.toString(), maxWidth: TABLE_WIDTH }),
            await drawList({ key: '大奖数', text: grandPrizes.toString(), maxWidth: TABLE_WIDTH }),
        ], TABLE_WIDTH, true),
    ]

    return await drawDatablock({ list, topLeftText: '计算条件' })
}

async function makeStrategyBlock(topLeftText: string, result: FireBonusStrategyResult, oneKey: boolean): Promise<Canvas> {
    const list: Canvas[] = [
        drawListTextWithImages({
            key: '最佳倍率',
            content: [drawText({
                text: `1抽 ≈ ${formatNumber(result.ratio)}火罐 ｜ 1火罐 ≈ ${formatNumber(result.multiplier)}抽`,
                textSize: 28,
                lineHeight: 38,
                maxWidth: TABLE_WIDTH,
                forceSingleLine: true,
            })],
            lineSpacing: 20,
            maxWidth: TABLE_WIDTH,
        }),
        ...makeHorizontalTables(result.rows),
    ]

    return await drawDatablock({
        list,
        topLeftText,
        opacity: oneKey ? 1 : 0.96,
    })
}

function makeHorizontalTables(rows: FireBonusTableRow[]): Canvas[] {
    const tables: Canvas[] = []
    for (let start = 0; start < rows.length; start += TABLE_MAX_COLUMNS) {
        tables.push(makeHorizontalTable(rows.slice(start, start + TABLE_MAX_COLUMNS)))
    }
    return tables
}

function makeHorizontalTable(rows: FireBonusTableRow[]): Canvas {
    const canvas = new Canvas(TABLE_WIDTH, TABLE_ROW_HEIGHT * 2)
    const ctx = canvas.getContext('2d')
    const valueWidth = (TABLE_WIDTH - TABLE_LABEL_WIDTH) / rows.length

    ctx.fillStyle = HEADER_COLOR_LEFT
    ctx.fillRect(0, 0, TABLE_LABEL_WIDTH, TABLE_ROW_HEIGHT)
    for (let i = 0; i < rows.length; i++) {
        const x = TABLE_LABEL_WIDTH + i * valueWidth
        ctx.fillStyle = i % 2 === 0 ? ROW_COLOR_EVEN : ROW_COLOR_ODD
        ctx.fillRect(x, 0, valueWidth, TABLE_ROW_HEIGHT)
    }
    drawCellText(ctx, '剩余火罐', 0, 0, TABLE_LABEL_WIDTH, TABLE_ROW_HEIGHT, '#ffffff', 24)
    for (let i = 0; i < rows.length; i++) {
        const x = TABLE_LABEL_WIDTH + i * valueWidth
        drawCellText(ctx, rows[i].remainingFireBonus.toString(), x, 0, valueWidth, TABLE_ROW_HEIGHT, '#505050', 24)
    }

    ctx.fillStyle = ROW_COLOR_EVEN
    ctx.fillRect(0, TABLE_ROW_HEIGHT, TABLE_WIDTH, TABLE_ROW_HEIGHT)
    ctx.fillStyle = HEADER_COLOR_RIGHT
    ctx.fillRect(0, TABLE_ROW_HEIGHT, TABLE_LABEL_WIDTH, TABLE_ROW_HEIGHT)
    drawCellText(ctx, '换箱抽数', 0, TABLE_ROW_HEIGHT, TABLE_LABEL_WIDTH, TABLE_ROW_HEIGHT, '#ffffff', 24)
    for (let i = 0; i < rows.length; i++) {
        const x = TABLE_LABEL_WIDTH + i * valueWidth
        const noSwitch = rows[i].boxChangeDraws < 0
        drawCellText(
            ctx,
            noSwitch ? '不换' : rows[i].boxChangeDraws.toString(),
            x,
            TABLE_ROW_HEIGHT,
            valueWidth,
            TABLE_ROW_HEIGHT,
            noSwitch ? '#9a9a9a' : '#505050',
            24,
        )
    }

    ctx.strokeStyle = 'rgba(90, 90, 90, 0.24)'
    ctx.lineWidth = 1
    for (let i = 1; i < rows.length; i++) {
        const x = TABLE_LABEL_WIDTH + i * valueWidth
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, TABLE_ROW_HEIGHT * 2)
        ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(TABLE_LABEL_WIDTH, 0)
    ctx.lineTo(TABLE_LABEL_WIDTH, TABLE_ROW_HEIGHT * 2)
    ctx.stroke()

    ctx.fillStyle = '#d9d9d9'
    ctx.fillRect(0, TABLE_ROW_HEIGHT - 1, TABLE_WIDTH, 1)
    return canvas
}

function drawCellText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    textSize: number,
) {
    const textImage = drawText({
        text,
        textSize,
        lineHeight: height,
        maxWidth: width,
        color,
        forceSingleLine: true,
    })
    ctx.drawImage(
        textImage,
        x + (width - textImage.width) / 2,
        y + (height - textImage.height) / 2,
    )
}

function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return '∞'
    return value.toFixed(4)
}

export default drawCalcFireBonus
