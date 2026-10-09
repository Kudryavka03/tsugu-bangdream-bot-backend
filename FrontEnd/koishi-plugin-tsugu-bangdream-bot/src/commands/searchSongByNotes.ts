export interface NoteCountSearchInput {
    noteCount: number
    searchText: string
}

export type NoteCountParseResult =
    | { ok: true; value: NoteCountSearchInput }
    | { ok: false; error: string }

const usage = '格式：物量查曲 <非负整数或整数加法>\n示例：物量查曲 1000+0+0+1+2'

export function parseNoteCountInput(input: string | undefined | null): NoteCountParseResult {
    const text = String(input ?? '').trim()
    if (!text) return failure('缺少物量。')
    if (!/^\d+(?:\s*\+\s*\d+)*$/.test(text)) {
        return failure('物量必须是非负整数，或用 + 连接的非负整数；加号两侧可以留空格。')
    }

    let noteCount = 0
    for (const term of text.split('+')) {
        const value = Number(term.trim())
        if (!Number.isSafeInteger(value) || !Number.isSafeInteger(noteCount + value)) {
            return failure(`物量及相加后的总数不能超过 ${Number.MAX_SAFE_INTEGER}。`)
        }
        noteCount += value
    }
    return { ok: true, value: { noteCount, searchText: `note${noteCount}` } }
}

function failure(message: string): NoteCountParseResult {
    return { ok: false, error: `错误: ${message}\n${usage}` }
}
