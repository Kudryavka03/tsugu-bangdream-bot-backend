import { Canvas, Image, CanvasRenderingContext2D } from 'skia-canvas';
import { setFontStyle } from '@/image/text';
import { drawDecoratedImage, inheritSurfaceDecorations, registerSurfaceDecorations, titleMatchedRoundedRectPath } from '@/image/surfaceShadow';
import { GUIDE_THEME, guideGradient, drawGuideHeadingDots, drawGuideSingleLineText } from '@/image/theme';

interface datablockOptions {
    list: Array<Canvas | Image>;
    BG?: boolean;
    topLeftText?: string;
    opacity?: number;
    maxWidth?: number;
}

const HEADING_SIZE = 70;

/** Shared guide section: rounded white body and an attached gradient heading. */
async function drawBlockSurface(
    canvas: Canvas, ctx: CanvasRenderingContext2D,
    width: number, height: number, opacity: number,
    heading?: string, verticalHeading = false,
) {
    ctx.save();
    titleMatchedRoundedRectPath(ctx, 50, 0, width, height, GUIDE_THEME.cardRadius);
    ctx.clip();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = GUIDE_THEME.surface;
    ctx.fillRect(50, 0, width, height);
    ctx.globalAlpha = 1;
    if (heading !== undefined) {
        const headingWidth = verticalHeading ? HEADING_SIZE : width;
        const headingHeight = verticalHeading ? height : HEADING_SIZE;
        ctx.fillStyle = guideGradient(ctx, 50, 0, headingWidth, headingHeight);
        ctx.fillRect(50, 0, headingWidth, headingHeight);
        if (verticalHeading) {
            // Rotate the same official background with the side heading.
            ctx.save();
            ctx.translate(50, height);
            ctx.rotate(-Math.PI / 2);
            await drawGuideHeadingDots(ctx, 0, 0, height, HEADING_SIZE);
            ctx.restore();
        } else {
            await drawGuideHeadingDots(ctx, 50, 0, headingWidth, headingHeight);
        }
        setFontStyle(ctx, 34, 'old');
        ctx.fillStyle = GUIDE_THEME.surface;
        ctx.textBaseline = 'middle';
        if (verticalHeading) {
            ctx.translate(50 + HEADING_SIZE / 2, height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            drawGuideSingleLineText(ctx, heading, 0, 0, height - 70);
        } else {
            drawGuideSingleLineText(ctx, heading, 85, HEADING_SIZE / 2, width - 70);
        }
    }
    ctx.restore();
    registerSurfaceDecorations(canvas, [{
        x: 50, y: 0, width, height,
        radius: GUIDE_THEME.cardRadius,
        cornerStyle: 'title-matched',
        border: false,
    }]);
}

/** Preserve the established +200px width, 50px padding and 70px heading slot. */
export async function drawDatablock({
    list, BG = true, topLeftText, opacity = 0.9,
}: datablockOptions): Promise<Canvas> {
    // Legacy callers pass null when a gacha has no section title.
    const heading = topLeftText == null ? undefined : topLeftText;
    const headingHeight = BG && heading !== undefined ? HEADING_SIZE : 0;
    const contentHeight = list.reduce((sum, image) => sum + image.height, 0);
    const maxW = list.reduce((width, image) => Math.max(width, image.width), 0);
    const height = contentHeight + (BG ? 100 : 0) + headingHeight;
    const canvas = new Canvas(maxW + 200, height);
    const ctx = canvas.getContext('2d');
    if (BG) await drawBlockSurface(canvas, ctx, maxW + 100, height, opacity, heading);

    let y = (BG ? 50 : 0) + headingHeight;
    const x = BG ? 100 : 0;
    for (const image of list) {
        if (BG) {
            // Nested decorations must be baked onto an opaque parent body.
            drawDecoratedImage(ctx, image, x, y);
        } else {
            ctx.drawImage(image, x, y);
            inheritSurfaceDecorations(canvas, image, x, y);
        }
        y += image.height;
    }
    return canvas;
}

/** Horizontal layout keeps its legacy child coordinates and outer dimensions. */
export async function drawDatablockHorizontal({
    list, BG = true, topLeftText, opacity = 0.9,
}: datablockOptions): Promise<Canvas> {
    const heading = topLeftText == null ? undefined : topLeftText;
    const headingWidth = BG && heading !== undefined ? HEADING_SIZE : 0;
    const contentWidth = list.reduce((sum, image) => sum + image.width, 0);
    const maxH = list.reduce((height, image) => Math.max(height, image.height), 0);
    const width = contentWidth + (BG ? 200 : 0) + headingWidth;
    const height = maxH + 100;
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext('2d');
    if (BG) {
        // One connected surface avoids the old title's fixed 380px side tab
        // and the body being drawn 50px below the bottom of the canvas.
        await drawBlockSurface(canvas, ctx, width - 100, height, opacity, heading, true);
    }
    let x = (BG ? 100 : 0) + headingWidth;
    for (const image of list) {
        if (BG) drawDecoratedImage(ctx, image, x, 50);
        else {
            ctx.drawImage(image, x, 50);
            inheritSurfaceDecorations(canvas, image, x, 50);
        }
        x += image.width;
    }
    return canvas;
}
