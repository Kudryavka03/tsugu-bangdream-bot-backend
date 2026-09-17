import { Canvas, CanvasRenderingContext2D, Image } from 'skia-canvas';

export type CornerRadius = number | [number, number, number, number];
export type CornerStyle = 'legacy' | 'title-matched';

export const CARD_CORNER_RADIUS = 35;

export interface SurfaceDecoration {
    x: number;
    y: number;
    width: number;
    height: number;
    radius?: CornerRadius;
    cornerStyle?: CornerStyle;
    shadow?: boolean;
    border?: boolean;
}

interface RoundedImageOptions {
    radius?: number;
    shadow?: boolean;
    border?: boolean;
    borderColor?: string;
}

const decorations = new WeakMap<object, SurfaceDecoration[]>();
const logicalHeights = new WeakMap<object, number>();

const SHADOW_PADDING = 16;
const surfaceShadowAtlases = new Map<string, ShadowAtlas>();

interface ShadowAtlas {
    canvas: Canvas;
    radius: number;
    size: number;
    sliceStart: number;
    sliceEnd: number;
}

function normalizeRadius(radius: CornerRadius, width: number, height: number): [number, number, number, number] {
    const maxRadius = Math.max(0, Math.min(width, height) / 2);
    const values = typeof radius === 'number' ? [radius, radius, radius, radius] : radius;
    return values.map((value) => Math.max(0, Math.min(value, maxRadius))) as [number, number, number, number];
}

export function roundedRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: CornerRadius,
): void {
    const [topLeft, topRight, bottomRight, bottomLeft] = normalizeRadius(radius, width, height);
    ctx.beginPath();
    ctx.moveTo(x + topLeft, y);
    ctx.lineTo(x + width - topRight, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + topRight);
    ctx.lineTo(x + width, y + height - bottomRight);
    ctx.quadraticCurveTo(x + width, y + height, x + width - bottomRight, y + height);
    ctx.lineTo(x + bottomLeft, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - bottomLeft);
    ctx.lineTo(x, y + topLeft);
    ctx.quadraticCurveTo(x, y, x + topLeft, y);
    ctx.closePath();
}

// Cubic approximation of a true circular quarter arc. This matches the
// original title.png silhouette much more closely than the legacy quadratic.
export function titleMatchedRoundedRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: CornerRadius,
): void {
    const [topLeft, topRight, bottomRight, bottomLeft] = normalizeRadius(radius, width, height);
    const kappa = 0.5522847498307936;
    ctx.beginPath();
    ctx.moveTo(x + topLeft, y);
    ctx.lineTo(x + width - topRight, y);
    ctx.bezierCurveTo(
        x + width - topRight + topRight * kappa, y,
        x + width, y + topRight - topRight * kappa,
        x + width, y + topRight,
    );
    ctx.lineTo(x + width, y + height - bottomRight);
    ctx.bezierCurveTo(
        x + width, y + height - bottomRight + bottomRight * kappa,
        x + width - bottomRight + bottomRight * kappa, y + height,
        x + width - bottomRight, y + height,
    );
    ctx.lineTo(x + bottomLeft, y + height);
    ctx.bezierCurveTo(
        x + bottomLeft - bottomLeft * kappa, y + height,
        x, y + height - bottomLeft + bottomLeft * kappa,
        x, y + height - bottomLeft,
    );
    ctx.lineTo(x, y + topLeft);
    ctx.bezierCurveTo(
        x, y + topLeft - topLeft * kappa,
        x + topLeft - topLeft * kappa, y,
        x + topLeft, y,
    );
    ctx.closePath();
}

function createSurfaceShadowAtlas(cornerStyle: CornerStyle, radius: number): ShadowAtlas {
    const core = radius * 2 + 2;
    const size = core + SHADOW_PADDING * 2;
    const sliceStart = SHADOW_PADDING + radius;
    const sliceEnd = sliceStart + 2;
    const atlas = new Canvas(size, size);
    const ctx = atlas.getContext('2d');
    const path = cornerStyle === 'title-matched' ? titleMatchedRoundedRectPath : roundedRectPath;

    const drawShadowPass = (color: string, blur: number, offsetX: number, offsetY: number) => {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.shadowOffsetX = offsetX;
        ctx.shadowOffsetY = offsetY;
        ctx.fillStyle = '#ffffff';
        path(ctx, SHADOW_PADDING, SHADOW_PADDING, core, core, radius);
        ctx.fill();
        ctx.restore();
    };

    drawShadowPass('rgba(67, 45, 58, 0.11)', 9, 0, 0);
    drawShadowPass('rgba(67, 45, 58, 0.07)', 3, 1, 2);

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000000';
    path(ctx, SHADOW_PADDING, SHADOW_PADDING, core, core, radius);
    ctx.fill();
    ctx.restore();

    return { canvas: atlas, radius, size, sliceStart, sliceEnd };
}

function getSurfaceShadowAtlas(cornerStyle: CornerStyle, radius: number): ShadowAtlas {
    const key = `${cornerStyle}:${radius}`;
    let atlas = surfaceShadowAtlases.get(key);
    if (!atlas) {
        atlas = createSurfaceShadowAtlas(cornerStyle, radius);
        surfaceShadowAtlases.set(key, atlas);
    }
    return atlas;
}

function drawNineSliceShadow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    cornerStyle: CornerStyle,
    requestedRadius: number,
): void {
    if (width <= 0 || height <= 0) return;

    const atlas = getSurfaceShadowAtlas(cornerStyle, requestedRadius);
    const radius = Math.min(atlas.radius, width / 2, height / 2);
    const sourceX = [0, atlas.sliceStart, atlas.sliceEnd, atlas.size];
    const sourceY = sourceX;
    const destinationX = [x - SHADOW_PADDING, x + radius, x + width - radius, x + width + SHADOW_PADDING];
    const destinationY = [y - SHADOW_PADDING, y + radius, y + height - radius, y + height + SHADOW_PADDING];

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
            if (row === 1 && column === 1) continue;

            const sourceWidth = sourceX[column + 1] - sourceX[column];
            const sourceHeight = sourceY[row + 1] - sourceY[row];
            const destinationWidth = destinationX[column + 1] - destinationX[column];
            const destinationHeight = destinationY[row + 1] - destinationY[row];
            if (destinationWidth <= 0 || destinationHeight <= 0) continue;

            ctx.drawImage(
                atlas.canvas,
                sourceX[column],
                sourceY[row],
                sourceWidth,
                sourceHeight,
                destinationX[column],
                destinationY[row],
                destinationWidth,
                destinationHeight,
            );
        }
    }
    ctx.restore();
}

export function registerSurfaceDecorations<T extends Canvas>(canvas: T, newDecorations: SurfaceDecoration[]): T {
    if (newDecorations.length === 0) return canvas;
    const existing = decorations.get(canvas) ?? [];
    decorations.set(canvas, existing.concat(newDecorations));
    return canvas;
}

export function getSurfaceDecorations(source: Canvas | Image): readonly SurfaceDecoration[] {
    return decorations.get(source) ?? [];
}

export function registerLogicalHeight<T extends Canvas>(canvas: T, height: number): T {
    logicalHeights.set(canvas, height);
    return canvas;
}

export function getLogicalHeight(source: Canvas | Image): number {
    return logicalHeights.get(source) ?? source.height;
}

export function inheritSurfaceDecorations(
    target: Canvas,
    source: Canvas | Image,
    offsetX: number,
    offsetY: number,
    scaleX: number = 1,
    scaleY: number = 1,
): void {
    const inherited = getSurfaceDecorations(source);
    if (inherited.length === 0) return;

    const radiusScale = Math.min(Math.abs(scaleX), Math.abs(scaleY));
    registerSurfaceDecorations(target, inherited.map((item) => ({
        ...item,
        x: offsetX + item.x * scaleX,
        y: offsetY + item.y * scaleY,
        width: item.width * scaleX,
        height: item.height * scaleY,
        radius: typeof item.radius === 'number'
            ? item.radius * radiusScale
            : item.radius?.map((value) => value * radiusScale) as CornerRadius,
    })));
}

export function drawSurfaceShadows(
    ctx: CanvasRenderingContext2D,
    source: Canvas | Image,
    offsetX: number,
    offsetY: number,
    scaleX: number = 1,
    scaleY: number = 1,
): void {
    const radiusScale = Math.min(Math.abs(scaleX), Math.abs(scaleY));
    for (const item of getSurfaceDecorations(source)) {
        if (item.shadow === false) continue;
        const cornerStyle = item.cornerStyle ?? 'legacy';
        const radius = item.radius ?? (cornerStyle === 'title-matched' ? CARD_CORNER_RADIUS : 25);
        const requestedRadius = (typeof radius === 'number'
            ? radius
            : Math.max(...radius)) * radiusScale;
        drawNineSliceShadow(
            ctx,
            offsetX + item.x * scaleX,
            offsetY + item.y * scaleY,
            item.width * scaleX,
            item.height * scaleY,
            cornerStyle,
            requestedRadius,
        );
    }
}

export function drawSurfaceBorders(
    ctx: CanvasRenderingContext2D,
    source: Canvas | Image,
    offsetX: number,
    offsetY: number,
    scaleX: number = 1,
    scaleY: number = 1,
): void {
    const radiusScale = Math.min(Math.abs(scaleX), Math.abs(scaleY));
    for (const item of getSurfaceDecorations(source)) {
        if (!item.border) continue;

        const cornerStyle = item.cornerStyle ?? 'legacy';
        const radius = item.radius ?? (cornerStyle === 'title-matched' ? CARD_CORNER_RADIUS : 25);
        const scaledRadius = typeof radius === 'number'
            ? radius * radiusScale
            : radius.map((value) => value * radiusScale) as CornerRadius;
        const x = offsetX + item.x * scaleX;
        const y = offsetY + item.y * scaleY;
        const width = item.width * scaleX;
        const height = item.height * scaleY;

        ctx.save();
        ctx.strokeStyle = 'rgba(150, 83, 111, 0.14)';
        ctx.lineWidth = 1;
        const path = cornerStyle === 'title-matched' ? titleMatchedRoundedRectPath : roundedRectPath;
        path(ctx, x + 0.5, y + 0.5, width - 1, height - 1, scaledRadius);
        ctx.stroke();
        ctx.restore();
    }
}

export function drawDecoratedImage(
    ctx: CanvasRenderingContext2D,
    source: Canvas | Image,
    x: number,
    y: number,
    width: number = source.width,
    height: number = source.height,
): void {
    const scaleX = width / source.width;
    const scaleY = height / source.height;
    drawSurfaceShadows(ctx, source, x, y, scaleX, scaleY);
    ctx.drawImage(source, x, y, width, height);
    drawSurfaceBorders(ctx, source, x, y, scaleX, scaleY);
}

export function drawRoundedImage(
    ctx: CanvasRenderingContext2D,
    image: Canvas | Image,
    x: number,
    y: number,
    width: number,
    height: number,
    {
        radius = Math.max(6, Math.min(22, Math.min(width, height) * 0.08)),
        shadow = true,
        border = true,
        borderColor = 'rgba(130, 76, 102, 0.22)',
    }: RoundedImageOptions = {},
): void {
    const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));

    if (shadow) {
        ctx.save();
        ctx.fillStyle = 'rgba(58, 34, 48, 0.09)';
        titleMatchedRoundedRectPath(ctx, x + 1, y + 2, width, height, safeRadius);
        ctx.fill();
        ctx.fillStyle = 'rgba(58, 34, 48, 0.045)';
        titleMatchedRoundedRectPath(ctx, x + 2, y + 4, width, height, safeRadius);
        ctx.fill();
        ctx.restore();
    }

    ctx.save();
    titleMatchedRoundedRectPath(ctx, x, y, width, height, safeRadius);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();

    if (border) {
        ctx.save();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        titleMatchedRoundedRectPath(ctx, x + 0.5, y + 0.5, width - 1, height - 1, Math.max(0, safeRadius - 0.5));
        ctx.stroke();
        ctx.restore();
    }
}
