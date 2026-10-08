import { Image, Canvas, loadImage, CanvasRenderingContext2D } from 'skia-canvas';
import { promises as fs } from 'fs';
import * as path from 'path';
import { assetsRootPath } from '@/config';
import { GUIDE_THEME } from './theme';

export type BackgroundStyle = 'guide' | 'legacy';
// The original warm background was selected after comparing both previews.
export const DEFAULT_BACKGROUND_STYLE: BackgroundStyle = 'legacy';

interface BGOptions {
  image?: Image | Canvas;
  text?: string;
  width: number;
  height: number;
  backgroundStyle?: BackgroundStyle;
}

interface BGEazyOptOptions {
  width: number;
  height: number;
  canvas?: Canvas;
  backgroundAlreadyFilled?: boolean;
  offsetRatio?: number;
  backgroundStyle?: BackgroundStyle;
}

const backgroundImages = new Map<string, Promise<Image>>();
function getBackgroundImage(filename: string): Promise<Image> {
  let pending = backgroundImages.get(filename);
  if (!pending) {
    pending = fs.readFile(path.join(assetsRootPath, 'BG', filename))
      .then(buffer => loadImage(buffer))
      .catch(error => { backgroundImages.delete(filename); throw error; });
    backgroundImages.set(filename, pending);
  }
  return pending;
}

export function getBackgroundColor(style: BackgroundStyle): string {
  return style === 'legacy' ? '#fef3ef' : GUIDE_THEME.background;
}

function fillPattern(
  ctx: CanvasRenderingContext2D, image: Image, width: number, height: number,
  scale: number, offsetX: number = 0, repetition: 'repeat' | 'repeat-y' = 'repeat',
) {
  const pattern = ctx.createPattern(image, repetition);
  if (!pattern) throw new Error('Failed to create background pattern');
  pattern.setTransform(scale, 0, 0, scale, offsetX, 0);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
}

/** The official body backgrounds, back to front, with their separate periods. */
async function drawOfficialGuide(ctx: CanvasRenderingContext2D, width: number, height: number, offsetRatio: number) {
  const profile = width <= 1024 ? 'sp' : 'pc';
  const [gradation, icons, text] = await Promise.all([
    getBackgroundImage(`guide/${profile}-gradation.png`),
    getBackgroundImage(`guide/${profile}-icon.png`),
    getBackgroundImage(`guide/${profile}-text.png`),
  ]);
  // Desktop CSS keeps the gradient at least 1920px wide, centred; mobile
  // scales it to 100% width. It repeats vertically, never horizontally.
  const gradientWidth = profile === 'pc' ? Math.max(1920, width) : width;
  fillPattern(ctx, gradation, width, height, gradientWidth / gradation.width, (width - gradientWidth) / 2, 'repeat-y');
  const iconScale = profile === 'pc' ? 912 / icons.width : Math.min(width / icons.width, height / icons.height);
  fillPattern(ctx, icons, width, height, iconScale, -offsetRatio * icons.width * iconScale);
  const textScale = Math.min(width / text.width, height / text.height);
  fillPattern(ctx, text, width, height, textScale);
}

/** Both styles are local assets and render directly onto the final canvas. */
export async function CreateBGEazyOpt({
  width, height, canvas, backgroundAlreadyFilled = false, offsetRatio = 0,
  backgroundStyle = DEFAULT_BACKGROUND_STYLE,
}: BGEazyOptOptions): Promise<Canvas> {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError(`Invalid background size: ${width}x${height}`);
  }
  const target = canvas ?? new Canvas(width, height);
  const ctx = target.getContext('2d');
  ctx.save();
  try {
    ctx.imageSmoothingEnabled = true;
    if (!backgroundAlreadyFilled) {
      ctx.fillStyle = getBackgroundColor(backgroundStyle);
      ctx.fillRect(0, 0, width, height);
    }
    const offset = ((offsetRatio % 1) + 1) % 1;
    if (backgroundStyle === 'legacy') {
      const texture = await getBackgroundImage('bg_object_big.png');
      const scale = width < 2000 ? texture.width / width : 1;
      fillPattern(ctx, texture, width, height, scale, -offset * texture.width * scale);
    } else {
      await drawOfficialGuide(ctx, width, height, offset);
    }
  } finally {
    ctx.restore();
  }
  return target;
}

export async function CreateBGEazy({ width, height, canv, backgroundStyle }: {
  width: number; height: number; canv: Canvas; backgroundStyle?: BackgroundStyle;
}) {
  await CreateBGEazyOpt({ width, height, canvas: canv, backgroundStyle });
}

/** Long guide images keep all three layers; legacy keeps its original light top. */
export async function CreateBGPure({ width, height, canvas, backgroundStyle = DEFAULT_BACKGROUND_STYLE }: {
  width: number; height: number; canvas: Canvas; backgroundStyle?: BackgroundStyle;
}): Promise<Canvas> {
  if (backgroundStyle !== 'legacy') return CreateBGEazyOpt({ width, height, canvas, backgroundStyle });
  const texture = await getBackgroundImage('bg_object_big.png');
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.fillStyle = getBackgroundColor(backgroundStyle);
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(texture, (width - texture.width) / 2, 0);
  ctx.restore();
  return canvas;
}

/** Explicit event/article artwork stays visible underneath a readable veil. */
export async function CreateBG({ image, text, width, height, backgroundStyle = DEFAULT_BACKGROUND_STYLE }: BGOptions): Promise<Canvas> {
  const canvas = await CreateBGEazyOpt({ width, height, backgroundStyle });
  if (!image) return canvas;
  const ctx = canvas.getContext('2d');
  ctx.save();
  const scale = Math.max(width / image.width, height / image.height);
  const scaledWidth = image.width * scale;
  const scaledHeight = image.height * scale;
  ctx.globalAlpha = 0.35;
  ctx.drawImage(image, (width - scaledWidth) / 2, (height - scaledHeight) / 2, scaledWidth, scaledHeight);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillRect(0, 0, width, height);
  if (text) {
    ctx.font = '700 62px Arial, sans-serif';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.translate(40, 180);
    ctx.rotate(-Math.PI / 10);
    ctx.strokeText(text, 0, 0, Math.max(1, width - 80));
  }
  ctx.restore();
  return canvas;
}
