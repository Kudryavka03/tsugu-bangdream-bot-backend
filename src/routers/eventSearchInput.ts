// 只识别完整的搜索词，避免将活动名称中的 n / now 当作占位符。
const currentEventAlias = /^(?:now|现在|n)$/i;
const comparison = /(^|\s)(<=|>=|==|=|<|>)\s*(now|现在|n|\d+)?(?=\s|$)/gi;

export function hasCurrentEventReference(input: string): boolean {
    if (currentEventAlias.test(input.trim())) return true;
    return Array.from(input.matchAll(comparison)).some(match =>
        !match[3] || currentEventAlias.test(match[3]));
}

export function resolveCurrentEventReferences(input: string, eventId?: number): string {
    const text = input.trim()
        .replace(/&gt;|＞/gi, '>')
        .replace(/&lt;|＜/gi, '<')
        .replace(/＝/g, '=')
        .replace(/≥/g, '>=')
        .replace(/≤/g, '<=');
    if (currentEventAlias.test(text)) return eventId == null ? text : String(eventId);
    return text.replace(comparison, (whole, prefix, operator, operand) => {
        if (operand && !currentEventAlias.test(operand)) return `${prefix}${operator}${operand}`;
        return eventId == null ? whole : `${prefix}${operator}${eventId}`;
    });
}
export enum requireStatus{
    prev,
    current,
    next,
    latest
} 
export function getRequireCommand(inputOri: unknown): requireStatus | null{
    if (typeof inputOri == 'string'){
        let input = inputOri.trim().toLowerCase().replace('一','1')
        if (input=='--'||input=='-'||input=='——'||input=='u'||input=='up'||input=='p'||input=='prev'||input=='f'||input=='front'||input=='上'||input=='前'||input.includes('前1')||input.includes('上1')){
            return requireStatus.prev
        }
        if (input=='++'||input=='+'||input=='十'||input=='d'||input=='down'||input=='next'||input=='下'||input=='后'||input.includes('下1')||input.includes('后1')){
             return requireStatus.next
        }
        if (input=='l'||input=='latest'||input=='late'||input=='lastest'||input=='last'||input.includes('最新')){
            return requireStatus.latest
        }
    }
    return null
}
export function getRequireOffset(
    inputOri: unknown
): number | null {
    if (typeof inputOri !== 'string') return null;

    // 只将完整的带符号整数识别为偏移，保留普通 ID、日期和关键词查询。
    const match = inputOri.trim().match(/^(\+|-|十|——)\s*(\d+)$/);
    if (!match) return null;

    const value = Number(match[2]);
    if (!Number.isSafeInteger(value)) return null;

    return match[1] === '+' || match[1] === '十' ? value : -value;
}
