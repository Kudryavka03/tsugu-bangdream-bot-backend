import { Canvas } from 'skia-canvas'
import { drawTitle } from '@/components/title'
import { serverNameFullList } from '@/config'
import { CutoffEventTop } from '@/types/CutoffEventTop'
import { Event } from '@/types/Event'
import { Server } from '@/types/Server'
import { drawEventDatablock } from '@/components/dataBlock/event'
import { drawDatablock } from '@/components/dataBlock'
import { outputFinalBuffer } from '@/image/output'
import { drawListMerge } from '@/components/list'
import { drawDottedLine } from '@/image/dottedLine'
import { logger } from '@/logger'
import { drawText } from '@/image/text'
import { drawTips } from '@/components/tips'
import { getDateByServerTimezone, getServerUtcOffset, normalizeTimestamp } from '@/components/list/time'
import { GUIDE_THEME } from '@/image/theme'
import { labelEventTopRooms } from '@/view/cutoffEventTop'
import type { TopRateTimeWindow } from '@/types/topRateSpeedWindow'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const TEXT_SIZE = 28
const LINE_HEIGHT = 36
const MUTED_DELTA = '#B4B4B4'
const ROOM_COLORS = [
    '#D1001F',
    '#0047E0',
    '#087A12',
    '#E85D04',
    '#6B21A8',
    '#0F6E8C',
    '#B4236A',
    '#3F6212',
]

interface MinutePoint {
    time: number
    uid: number
    value: number
}

export interface MinuteSpeedColumn {
    uid: number
    score: number
    cells: string[]
}

export interface MinuteSpeedTable {
    minutes: number[]
    players: MinuteSpeedColumn[]
    changeGroups: number[][]
}

export function resolveMinuteSpeedRange(
    eventStart: number,
    eventEnd: number,
    status: 'not_start' | 'in_progress' | 'ended',
    range?: TopRateTimeWindow,
    now = Date.now(),
): { from: number; to: number } | string {
    const start = normalizeTimestamp(eventStart)
    const end = normalizeTimestamp(eventEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return '错误: 活动时间无效'
    const from = range?.from
    const to = range?.to
    if ((from != null && !Number.isFinite(from)) || (to != null && !Number.isFinite(to))) return '错误: 统计时间无效'
    if (from != null && to != null && from >= to) return '错误: 开始时间须早于结束时间'
    if (from != null && to != null && to - from > HOUR_MS) return '错误: 统计时段最长为 1 小时'

    const endCap = status === 'ended' ? end : Math.min(end, now)
    let windowFrom: number
    let windowTo: number
    if (from == null && to == null) {
        windowTo = endCap
        windowFrom = windowTo - HOUR_MS
    } else if (from == null) {
        windowTo = Math.min(to, endCap)
        windowFrom = windowTo - HOUR_MS
    } else if (to == null) {
        windowFrom = Math.max(from, start)
        windowTo = Math.min(windowFrom + HOUR_MS, endCap)
    } else {
        windowFrom = from
        windowTo = to
    }
    windowFrom = Math.max(windowFrom, start)
    windowTo = Math.min(windowTo, endCap)
    if (windowTo <= start || windowFrom >= end) return '错误: 所选时段不在活动时间内'
    if (!(windowFrom < windowTo)) return '错误: 所选时段还没有前十记录'
    return { from: windowFrom, to: windowTo }
}

function minuteStart(time: number, offsetMs: number): number {
    return Math.floor((time + offsetMs) / MINUTE_MS) * MINUTE_MS - offsetMs
}

export function buildMinuteSpeedTable(points: MinutePoint[], offsetMs: number, from: number, to: number): MinuteSpeedTable | string {
    const latestTime = new Map<string, number>()
    const scores = new Map<number, Map<number, number>>()
    for (const point of points) {
        const time = normalizeTimestamp(point.time)
        if (!Number.isFinite(time) || time < from - 2 * MINUTE_MS || time > to) continue
        if (!Number.isFinite(point.uid) || !Number.isFinite(point.value) || point.value < 0) continue
        const minute = minuteStart(time, offsetMs)
        const key = `${minute}:${point.uid}`
        const previousTime = latestTime.get(key)
        if (previousTime != null && previousTime > time) continue
        latestTime.set(key, time)
        let minuteScores = scores.get(minute)
        if (!minuteScores) {
            minuteScores = new Map()
            scores.set(minute, minuteScores)
        }
        minuteScores.set(point.uid, point.value)
    }

    const minutes = [...scores.keys()].sort((a, b) => a - b)
    const minuteIndex = new Map(minutes.map((minute, index) => [minute, index]))
    const shown = minutes.filter(minute => minute > from && minute <= to)
    if (shown.length === 0) return '错误: 所选时段内没有前十记录'

    const endMinute = shown[shown.length - 1]
    const endScores = scores.get(endMinute)
    const players = [...endScores.entries()]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, 10)
        .map(([uid, score]) => ({ uid, score, cells: [] as string[] }))
    if (players.length === 0) return '错误: 所选时段内没有前十记录'

    const changeGroups: number[][] = []
    for (const minute of shown) {
        const index = minuteIndex.get(minute)
        const previousMinute = index > 0 ? minutes[index - 1] : undefined
        const currentScores = scores.get(minute)
        const previousScores = previousMinute == null ? undefined : scores.get(previousMinute)
        const gap = previousMinute == null || minute - previousMinute > MINUTE_MS
        const changed: number[] = []
        for (const player of players) {
            const current = currentScores?.get(player.uid)
            const previous = previousScores?.get(player.uid)
            if (current == null || previous == null) {
                player.cells.push('---')
                continue
            }
            const diff = current - previous
            if (previousScores && current !== previous) changed.push(player.uid)
            player.cells.push(gap ? (diff >= 0 ? `(+${diff})` : `(${diff})`) : String(diff))
        }
        if (changed.length > 0 && changed.length < 11) changeGroups.push(changed)
    }

    return { minutes: shown, players, changeGroups }
}

function formatServerParts(time: number, server: Server) {
    const date = getDateByServerTimezone(time, server)
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: String(date.getUTCHours()).padStart(2, '0'),
        minute: String(date.getUTCMinutes()).padStart(2, '0'),
    }
}

function formatServerDate(time: number, server: Server): string {
    const parts = formatServerParts(time, server)
    return `${parts.year}/${parts.month}/${parts.day}`
}

function formatServerDateTime(time: number, server: Server): string {
    const parts = formatServerParts(time, server)
    return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`
}

function formatRowTime(time: number, endTime: number, server: Server): string {
    const parts = formatServerParts(time, server)
    const clock = `${parts.hour}:${parts.minute}`
    return formatServerDate(time, server) === formatServerDate(endTime, server) ? clock : `${parts.month}/${parts.day} ${clock}`
}

function drawSingleLine(text: string, color: string): Canvas {
    return drawText({
        text,
        textSize: TEXT_SIZE,
        maxWidth: 1,
        lineHeight: LINE_HEIGHT,
        color,
        forceSingleLine: true,
    })
}

function isQuietDelta(text: string): boolean {
    return text === '---' || text === '0' || text === '(+0)' || text === '(0)'
}

function colorForRoom(room: string): string {
    const match = /^房间([A-Z])$/.exec(room)
    if (!match) return GUIDE_THEME.text
    return ROOM_COLORS[(match[1].charCodeAt(0) - 65) % ROOM_COLORS.length]
}

function centerRow(images: Canvas[], widths: number[]): Canvas {
    const height = images.reduce((max, image) => Math.max(max, image.height), 0) + 8
    const cells = images.map((image, index) => {
        const canvas = new Canvas(widths[index], height)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(image, Math.round((widths[index] - image.width) / 2), Math.round((height - image.height) / 2))
        return canvas
    })
    const width = widths.reduce((sum, column) => sum + column, 0)
    return drawListMerge(cells, width, true, 'center', widths)
}

export function composeMinuteSpeedList(
    server: Server,
    table: MinuteSpeedTable,
    names: string[],
    rooms: string[],
): { list: Canvas[]; width: number } {
    const endMinute = table.minutes[table.minutes.length - 1]
    const labelColor = GUIDE_THEME.muted
    const textColor = GUIDE_THEME.text
    const columnColors = rooms.map(colorForRoom)
    const roomImages = [drawSingleLine('房间', labelColor), ...rooms.map((room, index) => drawSingleLine(room, columnColors[index]))]
    const uidImages = [drawSingleLine('UID', labelColor), ...table.players.map((player, index) => drawSingleLine(String(player.uid), columnColors[index]))]
    const scoreImages = [drawSingleLine(formatServerDate(endMinute, server), labelColor), ...table.players.map((player, index) => drawSingleLine(String(player.score), columnColors[index]))]
    const timeRows = [...table.minutes].reverse().map((minute, rowIndex) => {
        const sourceIndex = table.minutes.length - 1 - rowIndex
        return [
            drawSingleLine(formatRowTime(minute, endMinute, server), textColor),
            ...table.players.map((player, index) => {
                const text = player.cells[sourceIndex]
                return drawSingleLine(text, isQuietDelta(text) ? MUTED_DELTA : columnColors[index])
            }),
        ]
    })

    const singleLineWidths = roomImages.map((image, index) => Math.max(
        image.width,
        uidImages[index].width,
        scoreImages[index].width,
        ...timeRows.map(row => row[index].width),
    ))
    const nameFloor = drawSingleLine('六个汉字宽度', textColor).width
    const nameMaxWidth = Math.max(nameFloor, ...singleLineWidths.slice(1))
    const nameImages = [
        drawSingleLine('昵称', labelColor),
        ...names.map((name, index) => drawText({
            text: name,
            textSize: TEXT_SIZE,
            maxWidth: nameMaxWidth,
            lineHeight: LINE_HEIGHT,
            color: columnColors[index],
        })),
    ]
    const widths = singleLineWidths.map((width, index) => Math.ceil(Math.max(width, nameImages[index].width)) + 24)
    const playerWidth = Math.max(...widths.slice(1))
    const columnWidths = [widths[0], ...table.players.map(() => playerWidth)]
    const width = columnWidths.reduce((sum, column) => sum + column, 0)
    const line = drawDottedLine({
        width,
        height: 22,
        startX: 8,
        startY: 11,
        endX: width - 8,
        endY: 11,
        radius: 2,
        gap: 10,
        color: GUIDE_THEME.divider,
    })
    const rows = [
        centerRow(roomImages, columnWidths),
        centerRow(uidImages, columnWidths),
        centerRow(nameImages, columnWidths),
        centerRow(scoreImages, columnWidths),
        ...timeRows.map(row => centerRow(row, columnWidths)),
    ]
    const list = [rows[0], line, rows[1], line, rows[2], line, rows[3], line, line]
    for (let index = 4; index < rows.length; index++) {
        list.push(rows[index], line)
    }
    return { list, width }
}

export async function drawEventTopMinuteSpeed(
    eventId: number,
    mainServer: Server,
    compress: boolean,
    range?: TopRateTimeWindow,
): Promise<Array<Buffer | string>> {
    const serverName = serverNameFullList[mainServer]
    const cutoff = new CutoffEventTop(eventId, mainServer)
    if (!cutoff.isExist || cutoff.status === 'not_start' || !Number.isFinite(cutoff.startAt) || !Number.isFinite(cutoff.endAt)) {
        return [`错误：${serverName} 活动 ${eventId} 不存在或尚未开始`]
    }
    const window = resolveMinuteSpeedRange(cutoff.startAt, cutoff.endAt, cutoff.status, range)
    if (typeof window === 'string') return [window]

    await cutoff.initFull(0)
    if (!cutoff.isExist || !cutoff.points?.length) return ['该活动的前十榜单数据不足']

    const table = buildMinuteSpeedTable(
        cutoff.points,
        getServerUtcOffset(mainServer) * HOUR_MS,
        window.from,
        window.to,
    )
    if (typeof table === 'string') return [table]

    const names = table.players.map(player => {
        const name = cutoff.getUserNameById(player.uid)
        return name && name.trim() ? name : String(player.uid)
    })
    const rooms = labelEventTopRooms(table.changeGroups, table.players.map(player => player.uid))
    const { list, width } = composeMinuteSpeedList(mainServer, table, names, rooms)
    const firstMinute = table.minutes[0]
    const lastMinute = table.minutes[table.minutes.length - 1]
    const eventInfo = drawEventDatablock(new Event(eventId), [mainServer]).catch(error => {
        logger('drawEventDatablock error:', error)
        return null
    })
    const [title, block, tips, event] = await Promise.all([
        drawTitle('分速表', `${serverName} 活动 ${eventId}`),
        drawDatablock({ list }),
        drawTips({
            text: [
                `统计时段：${formatServerDateTime(firstMinute, mainServer)} 至 ${formatServerDateTime(lastMinute, mainServer)}（服务器时间）`,
                '每格是这一分钟的分数减去上一分钟的分数。0 表示没有变化，--- 表示没有这条前十记录。',
                '括号表示中间少了采样，括号里是距上一条记录的分数差。',
                '同一颜色是同一个房间，颜色按出分节奏估计。玩家中途换房时，房间可能估不准。',
            ].join('\n'),
            maxWidth: Math.max(width, 900),
        }),
        eventInfo,
    ])
    const images = event ? [title, block, tips, event] : [title, block, tips]
    return [await outputFinalBuffer({ imageList: images, useEasyBG: true, compress })]
}
