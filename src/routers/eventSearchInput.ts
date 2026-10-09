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
