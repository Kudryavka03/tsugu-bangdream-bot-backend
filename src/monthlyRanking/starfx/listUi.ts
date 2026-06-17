/**
 * StarFreedomX 月榜 UI 适配层：不修改 @/components/list，在此提供兼容接口。
 */
import { drawList as drawListAsync, line } from '@/components/list';
import { drawDottedLine } from '@/image/dottedLine';
import { Canvas, Image } from 'skia-canvas';

export { line };

export const STARFX_PRESET_COLORS = [
    { r: 254, g: 65, b: 111 },
    { r: 179, g: 49, b: 255 },
    { r: 64, g: 87, b: 227 },
    { r: 68, g: 197, b: 39 },
    { r: 255, g: 255, b: 81 },
    { r: 0, g: 132, b: 255 },
    { r: 240, g: 128, b: 128 },
    { r: 60, g: 179, b: 113 },
    { r: 255, g: 165, b: 0 },
    { r: 106, g: 90, b: 205 },
];

export async function drawList(...args: Parameters<typeof drawListAsync>) {
    return drawListAsync(...args);
}

export function drawListMerge(
    imageList: Array<Canvas | Image>,
    maxWidth: number = 800,
    drawLine: boolean = false,
    align: 'top' | 'bottom' | 'center' = 'top',
    widthList?: number[],
): Canvas {
    let finalWidthList: number[];
    if (widthList && widthList.length === imageList.length) {
        finalWidthList = widthList;
    } else {
        finalWidthList = Array(imageList.length).fill(maxWidth / imageList.length);
    }
    const totalWidth = finalWidthList.reduce((sum, w) => sum + w, 0);

    let maxHeight = 0;
    for (let i = 0; i < imageList.length; i++) {
        const element = imageList[i];
        if (element && element.height > maxHeight) {
            maxHeight = element.height;
        }
    }
    const canvas = new Canvas(totalWidth, maxHeight);
    const ctx = canvas.getContext('2d');
    let x = 0;
    const divider: Canvas = drawDottedLine({
        width: 10,
        height: canvas.height,
        startX: 5,
        startY: 5,
        endX: 5,
        endY: canvas.height - 5,
        radius: 2,
        gap: 10,
        color: '#a8a8a8',
    });
    for (let i = 0; i < imageList.length; i++) {
        const element = imageList[i];
        if (element) {
            let y;
            if (align == 'top') y = 0;
            else if (align == 'bottom') y = maxHeight - element.height;
            else y = (maxHeight - element.height) / 2;
            ctx.drawImage(element, x, y);
            if (drawLine && i > 0) {
                ctx.drawImage(divider, x - 5, 0);
            }
        }
        x += finalWidthList[i];
    }
    return canvas;
}
