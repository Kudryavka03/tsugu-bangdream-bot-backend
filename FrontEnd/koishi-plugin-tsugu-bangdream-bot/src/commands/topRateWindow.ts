import { Server } from '../types/Server';

// Match the server time zones used by the backend's activity charts.
const serverUtcOffset: Record<Server, number> = {
    [Server.jp]: 9,
    [Server.en]: 0,
    [Server.tw]: 8,
    [Server.cn]: 8,
    [Server.kr]: 9,
};

type ActivityTimeWindow = { from?: number; to?: number };
type ActivityTimeInputWindow = { from?: string; to?: string };
type CalendarDate = { year: number; month: number; day: number };
type ClockTime = { hour: number; minute: number; second: number };
type TimeInput = { date?: CalendarDate; time?: ClockTime };

const datePattern = String.raw`(?:\d{4}[./-])?\d{1,2}[./-]\d{1,2}`;
const clockPattern = String.raw`(?:\d{1,2}(?::\d{1,2}(?::\d{1,2})?)?|\d{3,4})`;
const boundaryPattern = String.raw`(?:${datePattern}(?:[T\s]+${clockPattern})?|${clockPattern})`;
const rangePattern = new RegExp(String.raw`^(${boundaryPattern})\s*-\s*(${boundaryPattern})$`, 'i');
const fullDateTimePattern = new RegExp(String.raw`^\d{4}[./-]\d{1,2}[./-]\d{1,2}(?:[T\s]+${clockPattern})?$`, 'i');

export function splitActivityTimeRange(text: string): Required<ActivityTimeInputWindow> | undefined {
    const input = text.normalize('NFKC').trim();
    // A single ISO date must not be read as a clock followed by a short date.
    if (fullDateTimePattern.test(input)) return undefined;
    const range = rangePattern.exec(input);
    return range ? { from: range[1].trim(), to: range[2].trim() } : undefined;
}

export function joinActivityTimeRangeArgs(args: string[]): string[] {
    const joined: string[] = [];
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        const next = args[index + 1];
        if (next === '-' && args[index + 2] !== undefined) {
            const range = `${arg}-${args[index + 2]}`;
            if (splitActivityTimeRange(range)) {
                joined.push(range);
                index += 2;
                continue;
            }
        }
        joined.push(arg);
    }
    return joined;
}

export function resolveActivityTimeWindow(options: ActivityTimeInputWindow, range: ActivityTimeInputWindow | undefined, server: Server) {
    if (range && (options.from !== undefined || options.to !== undefined)) {
        return { ok: false as const, error: '错误: 时间范围请使用「开始-结束」或 --from / --to 中的一种写法' };
    }
    const { from, to } = range ?? options;
    return parseActivityTimeWindow(from, to, server);
}

export function parseActivityTimeWindow(fromText: string | undefined, toText: string | undefined, server: Server, now = new Date()):
    { ok: true; value: ActivityTimeWindow } | { ok: false; error: string } {
    const offsetMs = serverUtcOffset[server] * 3_600_000;
    const localNow = new Date(now.getTime() + offsetMs);
    const today = { year: localNow.getUTCFullYear(), month: localNow.getUTCMonth() + 1, day: localNow.getUTCDate() };
    const start = fromText === undefined ? undefined : parseTimeInput(fromText, today.year);
    const end = toText === undefined ? undefined : parseTimeInput(toText, today.year);
    const from = start && toTimestamp(start, end?.date ?? today, offsetMs, false);
    const to = end && toTimestamp(end, start?.date ?? today, offsetMs, true);
    if (fromText !== undefined && from === undefined) {
        return { ok: false, error: timeFormatError('--from') };
    }
    if (toText !== undefined && to === undefined) {
        return { ok: false, error: timeFormatError('--to') };
    }
    if (from !== undefined && to !== undefined && from >= to) {
        return { ok: false, error: '错误: 开始时间必须早于结束时间' };
    }
    return { ok: true, value: { from, to } };
}

function parseTimeInput(text: string, currentYear: number): TimeInput | undefined {
    const source = text.normalize('NFKC').trim();
    const match = /^(?:(\d{4})[./-])?(\d{1,2})[./-](\d{1,2})(?:(?:T|\s+)(.+))?$/i.exec(source);
    if (!match) {
        const time = parseClockTime(source);
        return time && { time };
    }
    const [, yearText = String(currentYear), monthText, dayText, clockText] = match;
    const date = { year: Number(yearText), month: Number(monthText), day: Number(dayText) };
    const utcDate = new Date(Date.UTC(date.year, date.month - 1, date.day));
    if (utcDate.getUTCFullYear() !== date.year || utcDate.getUTCMonth() + 1 !== date.month || utcDate.getUTCDate() !== date.day) {
        return undefined;
    }
    if (!clockText) return { date };
    const time = parseClockTime(clockText);
    return time && { date, time };
}

function parseClockTime(text: string): ClockTime | undefined {
    const match = /^(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?$/.exec(text)
        ?? /^(\d{1,2})(\d{2})$/.exec(text);
    if (!match) return undefined;
    const [, hours, minutes = '0', seconds = '0'] = match;
    const hour = Number(hours);
    const minute = Number(minutes);
    const second = Number(seconds);
    if (hour > 24 || minute > 59 || second > 59 || (hour === 24 && (minute !== 0 || second !== 0))) return undefined;
    return { hour, minute, second };
}

function toTimestamp(input: TimeInput, fallbackDate: CalendarDate, offsetMs: number, endOfDate: boolean): number | undefined {
    const { year, month, day } = input.date ?? fallbackDate;
    const { hour, minute, second } = input.time ?? { hour: endOfDate ? 24 : 0, minute: 0, second: 0 };
    const timestamp = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs;
    return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : undefined;
}

function timeFormatError(option: string): string {
    return `错误: ${option} 请填写服务器日期或时刻，例如 15:00、11.21、2026-11-21T15:00 或 "11.21 15:00"`;
}
