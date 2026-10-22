import { getRequireCommand, getRequireOffset, requireStatus } from './eventSearchInput';

export function parseBirthdayOffset(input: string): number | null {
    const offset = getRequireOffset(input);
    if (offset !== null) return offset;
    const command = getRequireCommand(input);
    if (command === requireStatus.next) return 1;
    if (command === requireStatus.prev) return -1;
    if (command === requireStatus.latest) return 0;
    return null;
}

export function parseCharacterBirthday(input: string): { month: number; day: number } | null {
    const text = input.trim();
    const match = text.match(/^(\d{1,2})\s*\.\s*(\d{1,2})$/)
        || text.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/)
        || text.match(/^(\d{1,2})(\d{2})$/);
    if (!match) {
        return null;
    }

    const month = Number(match[1]);
    const day = Number(match[2]);
    // 使用闰年校验月日，生日查询不依赖当前年份。
    const date = new Date(Date.UTC(2000, month - 1, day));
    if (date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
        return null;
    }
    return { month, day };
}
