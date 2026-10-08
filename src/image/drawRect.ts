import { Canvas, FontLibrary } from 'skia-canvas';
import { assetsRootPath } from '@/config';
import { getTextWidth } from '@/image/utils';
import { CornerRadius, CornerStyle, titleMatchedRoundedRectPath } from '@/image/surfaceShadow';
import { GUIDE_THEME } from '@/image/theme';
FontLibrary.use("old",[`${assetsRootPath}/Fonts/old.ttf`])

interface RoundedRect {
  width: number;
  height: number;
  radius?: CornerRadius;
  cornerStyle?: CornerStyle;
  color?: string;
  opacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
}

// 画圆角矩形
export function drawRoundedRect({
  width,
  height,
  radius = GUIDE_THEME.cardRadius,
  color = GUIDE_THEME.surface,
  opacity = 0.9,
  strokeColor = GUIDE_THEME.border,
  strokeWidth = 0,
  cornerStyle = 'legacy',
}: RoundedRect): Canvas {
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext("2d");

  if (typeof radius === "number") {
    radius = [radius, radius, radius, radius];
  }

  if (cornerStyle === 'title-matched') {
    titleMatchedRoundedRectPath(ctx, 0, 0, width, height, radius);
  }
  else {
    ctx.beginPath();
    ctx.moveTo(radius[0], 0);
    ctx.lineTo(width - radius[1], 0);
    ctx.quadraticCurveTo(width, 0, width, radius[1]);
    ctx.lineTo(width, height - radius[2]);
    ctx.quadraticCurveTo(width, height, width - radius[2], height);
    ctx.lineTo(radius[3], height);
    ctx.quadraticCurveTo(0, height, 0, height - radius[3]);
    ctx.lineTo(0, radius[0]);
    ctx.quadraticCurveTo(0, 0, radius[0], 0);
    ctx.closePath();
  }

  if (opacity!=1)ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.fill();

  if (strokeWidth > 0) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = strokeColor;

    if (cornerStyle === 'title-matched') {
      const inset = strokeWidth / 2;
      const insetRadius = radius.map((value) => Math.max(0, value - inset)) as CornerRadius;
      titleMatchedRoundedRectPath(ctx, inset, inset, width - strokeWidth, height - strokeWidth, insetRadius);
    }
    else {
      ctx.beginPath();
      ctx.moveTo(radius[0], strokeWidth / 2);
      ctx.lineTo(width - radius[1], strokeWidth / 2);
      ctx.quadraticCurveTo(
        width - strokeWidth / 2,
        strokeWidth / 2,
        width - strokeWidth / 2,
        radius[1]
      );
      ctx.lineTo(width - strokeWidth / 2, height - radius[2]);
      ctx.quadraticCurveTo(
        width - strokeWidth / 2,
        height - strokeWidth / 2,
        width - radius[2],
        height - strokeWidth / 2
      );
      ctx.lineTo(radius[3], height - strokeWidth / 2);
      ctx.quadraticCurveTo(
        strokeWidth / 2,
        height - strokeWidth / 2,
        strokeWidth / 2,
        height - radius[3]
      );
      ctx.lineTo(strokeWidth / 2, radius[0]);
      ctx.quadraticCurveTo(
        strokeWidth / 2,
        strokeWidth / 2,
        radius[0],
        strokeWidth / 2
      );
      ctx.closePath();
    }

    ctx.stroke();
  }

  return canvas;
}



type textAlign = "left" | "right" | "center" | "start" | "end";
interface RoundedRectWithText {
  width?: number,
  height?: number,
  radius?: number,
  color?: string,
  opacity?: number,
  strokeColor?: string,
  strokeWidth?: number
  font?: string,
  text: string,
  textColor?: string,
  textSize: number,
  textAlign?: textAlign
}

//画圆角矩形并填充文字
export function drawRoundedRectWithText(options: RoundedRectWithText): Canvas {
  // Shared keys retain their solid fill and the project's original gray palette.
  // Explicit game, difficulty and stat colors keep their existing label style.
  const themeLabel = options.color === undefined;
  const {
    text,
    font = "old",
    textColor = GUIDE_THEME.surface,
    textSize,
    textAlign = "center",
    height = textSize * 4 / 3,
    width = getTextWidth(text, textSize, font) + height,
    radius = height / 2,
    color = GUIDE_THEME.keyBackground,
    opacity = 1,
    strokeColor = color,
    strokeWidth = 0
  } = options;
  const canvas = drawRoundedRect({
    width, height, radius, color, opacity, strokeColor, strokeWidth,
    cornerStyle: themeLabel ? 'title-matched' : 'legacy',
  });
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = textColor;
  ctx.textBaseline = "alphabetic";
  ctx.font = `${textSize}px ${font === 'old' ? GUIDE_THEME.fontFamily : font + ', "Microsoft Yahei", sans-serif'}`;

  let x = 0, y = 0;
  if (textAlign === "left" || textAlign === "start") {
    x = themeLabel ? height / 2 : radius;
  } else if (textAlign === "right" || textAlign === "end") {
    x = width - (themeLabel ? height / 2 : radius);
  }
  else if (textAlign === "center") {
    x = width / 2;
  }

  y = height / 2 + textSize / 3;

  ctx.textAlign = textAlign;
  ctx.fillText(text, x, y);

  return canvas;
}
