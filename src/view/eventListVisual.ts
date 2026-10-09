import { Canvas, Image } from 'skia-canvas';
import { drawText } from '@/image/text';

/** Keep the complete ID, type and localized name on one line at normal size. */
export function drawEventListHeading(text: string, textSize = 25 * 3 / 4): Canvas {
    return drawText({ text: text.replace(/[\r\n]+/g, ' '), textSize, maxWidth: 500, forceSingleLine: true });
}

/** Append stamps directly to the card row, using the same thumbnail footprint. */
export function appendEventListRewardStamps(cards: Canvas, stamps: (Canvas | Image)[], lineHeight = 110): Canvas {
    if (stamps.length === 0) return cards;
    const textSize = lineHeight / 200 * 180;
    // drawCardIcon with a visible ID is 180 x 210, and drawCardListInList
    // scales its complete height to textSize. The actual portrait is 180 x 180.
    const thumbnailSize = textSize * 180 / 210;
    const spacing = lineHeight / 200 * 13;
    const thumbnailTop = (lineHeight - textSize) / 2;
    const canvas = new Canvas(
        Math.ceil(cards.width + stamps.length * (thumbnailSize + spacing)),
        Math.max(cards.height, lineHeight),
    );
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cards, 0, 0);
    for (let index = 0; index < stamps.length; index++) {
        const stamp = stamps[index];
        const scale = thumbnailSize / Math.max(stamp.width, stamp.height);
        const width = stamp.width * scale, height = stamp.height * scale;
        const x = cards.width + spacing + index * (thumbnailSize + spacing);
        ctx.drawImage(stamp,
            x + (thumbnailSize - width) / 2,
            thumbnailTop + (thumbnailSize - height) / 2,
            width, height,
        );
    }
    return canvas;
}
