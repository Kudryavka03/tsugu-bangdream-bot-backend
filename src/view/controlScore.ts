import { Canvas } from 'skia-canvas'
import { Event } from '@/types/Event'
import { Server } from '@/types/Server'
import { serverNameFullList } from '@/config'
import { ControlScoreCalculation, ControlScoreEventType } from '@/types/controlScore'
import { drawTitle } from '@/components/title'
import { drawDatablock } from '@/components/dataBlock'
import { drawList, drawListMerge, line } from '@/components/list'
import { drawText, drawTextMeasureText } from '@/image/text'
import { drawRoundedRectWithText } from '@/image/drawRect'
import { outputFinalBuffer } from '@/image/output'

const LIST_WIDTH = 800
const DEFAULT_ALTERNATIVE_PAGE_SIZE = 6

export async function drawControlScore(
    event: Event,
    mainServer: Server,
    calculation: ControlScoreCalculation,
    alternativePage: number,
    alternativePageSize: number,
    useEasyBG: boolean,
    compress: boolean,
): Promise<Array<Buffer | string>> {
    const all: Canvas[] = [
        await drawTitle(serverNameFullList[mainServer], '控分助手'),
        await makeEventBlock(event, mainServer),
        await makeConditionBlock(event, mainServer, calculation),
    ]

    if (calculation.error || calculation.plans.length > 0) {
        all.push(await makeResultBlock(calculation))
    }

    let alternativeHint: string | undefined
    if (calculation.alternatives.length > 0) {
        const pageSize = alternativePageSize || DEFAULT_ALTERNATIVE_PAGE_SIZE
        const totalPages = Math.max(1, Math.ceil(calculation.alternatives.length / pageSize))
        const page = Math.min(Math.max(alternativePage || 1, 1), totalPages)
        all.push(await makeAlternativesBlock(calculation, page, pageSize, totalPages))

        if (totalPages > 1) {
            alternativeHint = `替代加成倍率共 ${calculation.alternatives.length} 种，当前为第 ${page}/${totalPages} 页。可在指令末尾添加“第${page < totalPages ? page + 1 : page}页”查看。`
        }
    }

    let eventBGImage
    if (!useEasyBG) {
        try {
            eventBGImage = await event.getEventBGImage()
        }
        catch (e) {
            eventBGImage = undefined
        }
    }

    const buffer = await outputFinalBuffer({
        imageList: all,
        useEasyBG,
        BGimage: eventBGImage,
        text: calculation.eventTypeName,
        compress,
    })

    return alternativeHint ? [buffer, alternativeHint] : [buffer]
}

async function makeEventBlock(event: Event, mainServer: Server): Promise<Canvas> {
    const eventName = event.eventName?.[mainServer]
        || event.eventName?.find((name) => name != null && name !== '')
        || `活动 ${event.eventId}`

    return await drawDatablock({
        list: [
            drawList({
                key: '活动',
                text: eventName,
                maxWidth: LIST_WIDTH,
            }),
            line,
            drawList({
                key: '类型',
                text: `${event.getTypeName()}  ID: ${event.eventId}`,
                maxWidth: LIST_WIDTH,
            }),
        ],
        topLeftText: '活动信息',
    })
}

async function makeConditionBlock(
    event: Event,
    mainServer: Server,
    calculation: ControlScoreCalculation,
): Promise<Canvas> {
    const details: Canvas[] = [
        drawListMerge([
            drawList({ key: '目标PT', text: formatNumber(calculation.targetPt), maxWidth: LIST_WIDTH }),
            drawList({ key: '加成', text: `${formatNumber(calculation.bonusRate)}%`, maxWidth: LIST_WIDTH }),
        ], LIST_WIDTH, true),
    ]

    switch (calculation.eventType) {
        case ControlScoreEventType.mission:
            details.push(drawListMerge([
                drawList({
                    key: '支援综合力',
                    text: formatNumber(calculation.supportBand),
                    maxWidth: LIST_WIDTH,
                }),
                drawList({
                    key: '支援PT',
                    text: formatNumber(Math.floor(calculation.supportBand / 3000)),
                    maxWidth: LIST_WIDTH,
                }),
            ], LIST_WIDTH, true))
            break
        case ControlScoreEventType.cp:
            details.push(drawList({
                key: '模式',
                text: calculation.cpClear ? '清CP（挑战Live）' : '自由演出',
                maxWidth: LIST_WIDTH,
            }))
            break
        case ControlScoreEventType.team:
            details.push(drawListMerge([
                drawList({
                    key: '结果',
                    text: calculation.isWin ? '胜利 (+125)' : '失败 (+0)',
                    maxWidth: LIST_WIDTH,
                }),
                drawList({
                    key: '排名',
                    text: calculation.easyMode ? '精简模式（仅第1/5名）' : '完整模式（全部排名）',
                    maxWidth: LIST_WIDTH,
                }),
            ], LIST_WIDTH, true))
            break
        case ControlScoreEventType.match:
            details.push(drawList({
                key: '排名',
                text: calculation.easyMode ? '精简模式（仅第1/5名）' : '完整模式（全部排名）',
                maxWidth: LIST_WIDTH,
            }))
            break
        case ControlScoreEventType.medley:
            details.push(drawList({
                key: '说明',
                text: '分数为1/2/3首歌曲的总分',
                maxWidth: LIST_WIDTH,
            }))
            break
    }

    details.push(line)
    details.push(drawList({
        key: '服务器',
        text: `${serverNameFullList[mainServer]}  |  ${event.eventId}`,
        maxWidth: LIST_WIDTH,
    }))
    details.push(drawInlineList('公式', calculation.formula, 24, 12))

    return await drawDatablock({
        list: details,
        topLeftText: '计算条件',
    })
}

async function makeResultBlock(calculation: ControlScoreCalculation): Promise<Canvas> {
    const list: Canvas[] = []

    if (calculation.error) {
        list.push(drawList({
            key: '结论',
            text: calculation.error,
            maxWidth: LIST_WIDTH,
        }))
        list.push(line)
        list.push(drawList({
            key: '最低PT',
            text: formatNumber(calculation.ptMin),
            maxWidth: LIST_WIDTH,
        }))
        return await drawDatablock({ list, topLeftText: '计算结果' })
    }

    for (let i = 0; i < calculation.plans.length; i++) {
        const plan = calculation.plans[i]
        const warnings = plan.tooLarge
            ? '\n提示：该分数超过活动分数上限，建议降低加成倍率。'
            : ''
        list.push(drawList({
            key: `方案${i + 1}`,
            text: `${plan.label}\n达成分数：${formatNumber(plan.scoreMin)} ~ ${formatNumber(plan.scoreMax)}\n实际PT：${formatNumber(plan.actualPt)}\n${plan.detail}${warnings}`,
            maxWidth: LIST_WIDTH,
        }))
        if (i < calculation.plans.length - 1) {
            list.push(line)
        }
    }

    return await drawDatablock({ list, topLeftText: '计算结果' })
}

async function makeAlternativesBlock(
    calculation: ControlScoreCalculation,
    page: number,
    pageSize: number,
    totalPages: number,
): Promise<Canvas> {
    const start = (page - 1) * pageSize
    const alternatives = calculation.alternatives.slice(start, start + pageSize)
    const list: Canvas[] = [
        drawList({
            key: '结论',
            text: `当前加成无法直接达成，可使用以下替代加成。所有方案均得到 ${formatNumber(calculation.targetPt)} PT。`,
            maxWidth: LIST_WIDTH,
        }),
        line,
    ]

    for (let i = 0; i < alternatives.length; i++) {
        const alternative = alternatives[i]
        list.push(drawInlineList(
            `${alternative.rate}%`,
            `使用 ${alternative.fire} 火 · 达成分数 ${formatNumber(alternative.scoreMin)} ~ ${formatNumber(alternative.scoreMax)}`,
            24,
            14,
        ))
        if (i < alternatives.length - 1) {
            list.push(line)
        }
    }

    list.push(line)
    list.push(drawList({
        key: '页码',
        text: `第 ${page}/${totalPages} 页 · 共 ${calculation.alternatives.length} 种`,
        maxWidth: LIST_WIDTH,
    }))

    return await drawDatablock({
        list,
        topLeftText: '替代加成倍率',
    })
}




function drawInlineList(
    key: string,
    text: string,
    preferredTextSize: number,
    minimumTextSize: number,
): Canvas {
    const keyImage = drawRoundedRectWithText({
        text: key,
        textSize: 22,
    })
    const availableWidth = LIST_WIDTH - keyImage.width - 24
    let textSize = preferredTextSize
    while (textSize > minimumTextSize && drawTextMeasureText(text, textSize, 'old') > availableWidth) {
        textSize--
    }

    const textImage = drawText({
        text,
        textSize,
        maxWidth: availableWidth,
        lineHeight: textSize + 10,
        forceSingleLine: true,
    })
    const height = Math.max(keyImage.height, textImage.height)
    const canvas = new Canvas(LIST_WIDTH, height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(keyImage, 0, (height - keyImage.height) / 2)
    ctx.drawImage(textImage, keyImage.width + 12, (height - textImage.height) / 2)
    return canvas
}

function formatNumber(value: number): string {
    return value.toLocaleString('zh-CN')
}

export default drawControlScore
