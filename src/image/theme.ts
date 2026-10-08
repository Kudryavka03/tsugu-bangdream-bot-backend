import { CanvasRenderingContext2D, Image, Path2D, loadImage } from 'skia-canvas';
import { promises as fs } from 'fs';
import * as path from 'path';
import { assetsRootPath } from '@/config';

/**
 * Shared image tokens adapted from the official GBP guide:
 * https://bang-dream.bushimo.jp/guide/
 * Source selectors: .sub-Section, .sub-Section_Heading, .sub-Nav, .sw-Heading.
 * Keep game/attribute/difficulty colors supplied by callers separate from these
 * presentation defaults. Fonts stay bundled so rendering also works offline.
 */
export const GUIDE_THEME = Object.freeze({
    primary: '#ff3b72',
    primarySoft: '#ff79a9',
    keyBackground: '#5b5b5b',
    text: '#282828',
    muted: '#716868',
    surface: '#ffffff',
    surfaceTint: '#fff3f7',
    background: '#ededed',
    divider: '#eadde2',
    border: 'rgba(255, 59, 114, 0.14)',
    shadow: 'rgba(150, 0, 51, 0.10)',
    cardRadius: 20,
    labelRadius: 8,
    fontFamily: 'old, "Microsoft Yahei", sans-serif',
});

/** CSS 225deg uses projected rectangle corners to keep its 45-degree direction. */
export function guideGradient(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const halfSpan = (width + height) / 4;
    const gradient = ctx.createLinearGradient(centerX + halfSpan, centerY - halfSpan, centerX - halfSpan, centerY + halfSpan);
    gradient.addColorStop(0, GUIDE_THEME.primary);
    gradient.addColorStop(0.651, GUIDE_THEME.primary);
    gradient.addColorStop(0.8021, '#ff4379');
    gradient.addColorStop(1, GUIDE_THEME.primarySoft);
    return gradient;
}

// Original rounded star path from the guide's .sw-Heading_Icon SVG.
const guideStarPath = new Path2D('M.05 7.53c.077-.224.214-.425.398-.582.183-.157.407-.267.649-.317l5.74-1.154L9.775.67c.123-.204.3-.372.513-.49a1.459 1.459 0 0 1 1.405 0c.213.118.39.286.513.49l2.938 4.808 5.74 1.154c.24.053.463.163.646.32.183.158.321.356.401.578a1.27 1.27 0 0 1-.287 1.299L17.71 12.98l.608 5.546c.023.232-.017.464-.114.677-.097.213-.25.4-.443.541-.243.162-.531.25-.828.257a1.765 1.765 0 0 1-.573-.112l-5.37-2.34-5.368 2.276a1.47 1.47 0 0 1-1.385-.16 1.332 1.332 0 0 1-.457-.528 1.256 1.256 0 0 1-.117-.675l.608-5.546L.337 8.763a1.336 1.336 0 0 1-.303-.583 1.296 1.296 0 0 1 .016-.65Z');

/** Filled headings use the guide's rounded star; content accents use an outline. */
export function drawGuideStar(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, outline = false) {
    ctx.save();
    if (!outline) {
        ctx.translate(x - radius, y - radius * 10 / 11);
        ctx.scale(radius / 11, radius / 11);
        ctx.fillStyle = color;
        ctx.fill(guideStarPath);
        ctx.restore();
        return;
    }
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const length = i % 2 === 0 ? radius : radius * 0.48;
        const px = x + Math.cos(angle) * length;
        const py = y + Math.sin(angle) * length;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
    if (outline) {
        ctx.lineWidth = Math.max(1, radius * 0.1);
        ctx.strokeStyle = color;
        ctx.stroke();
    } else {
        ctx.fillStyle = color;
        ctx.fill();
    }
    ctx.restore();
}

let headingDotsImage: Promise<Image> | undefined;
function getHeadingDotsImage(): Promise<Image> {
    if (!headingDotsImage) {
        headingDotsImage = fs.readFile(path.join(assetsRootPath, 'BG', 'guide', 'section-heading-dots.png'))
            .then(buffer => loadImage(buffer))
            .catch(error => { headingDotsImage = undefined; throw error; });
    }
    return headingDotsImage;
}

/** Official PNG: right bottom / 125px auto no-repeat, with its native alpha. */
export async function drawGuideHeadingDots(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
    const image = await getHeadingDotsImage();
    const decorationWidth = 125;
    const decorationHeight = image.height * decorationWidth / image.width;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.drawImage(image, x + width - decorationWidth, y + height - decorationHeight, decorationWidth, decorationHeight);
    ctx.restore();
}

/** Fit a fixed-height heading without relying on Skia's maxWidth wrapping. */
export function drawGuideSingleLineText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
    const singleLine = String(text ?? '').replace(/[\r\n]+/g, ' ');
    ctx.save();
    ctx.textWrap = false;
    const width = ctx.measureText(singleLine).width;
    ctx.translate(x, y);
    ctx.scale(width > 0 ? Math.min(1, Math.max(1, maxWidth) / width) : 1, 1);
    ctx.fillText(singleLine, 0, 0);
    ctx.restore();
}
