import { Canvas } from 'skia-canvas';

interface DrawDottedLineOptions {
  width: number;
  height: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  radius: number;
  gap: number;
  color: string;
  lineWidth?: number;
  shadowColor?: string;
}

export function drawDottedLine(options: DrawDottedLineOptions): Canvas {
  const {
    width,
    height,
    startX,
    startY,
    endX,
    endY,
    color,
    lineWidth = 2,
    shadowColor = 'rgba(84, 62, 73, 0.08)',
  } = options;

  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext('2d');
  if (width <= 0 || height <= 0) return canvas;

  // Keep the existing Canvas dimensions so every caller retains exactly the
  // same layout. Legacy neutral dotted separators are mapped to the lighter
  // solid system separator used by the modern skin; semantic custom colors
  // remain untouched.
  const strokeColor = color.toLowerCase() === '#a8a8a8' ? '#E6DFE3' : color;
  const safeLineWidth = Math.max(1, lineWidth);
  const edgePadding = safeLineWidth / 2 + 1;
  const clampX = (value: number) => Math.max(edgePadding, Math.min(width - edgePadding, value));
  const clampY = (value: number) => Math.max(edgePadding, Math.min(height - edgePadding, value));
  const x1 = clampX(startX);
  const y1 = clampY(startY);
  const x2 = clampX(endX);
  const y2 = clampY(endY);
  const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
  const shadowOffsetX = horizontal ? 0 : 1;
  const shadowOffsetY = horizontal ? 1 : 0;

  ctx.save();
  ctx.lineCap = 'round';

  if (x1 === x2 && y1 === y2) {
    ctx.fillStyle = shadowColor;
    ctx.beginPath();
    ctx.arc(x1 + shadowOffsetX, y1 + shadowOffsetY, (safeLineWidth + 1) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(x1, y1, safeLineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return canvas;
  }

  // Cheap contact shadow: a second rounded stroke avoids the 5-10x cost of
  // shadowBlur on dense lists.
  ctx.beginPath();
  ctx.moveTo(x1 + shadowOffsetX, y1 + shadowOffsetY);
  ctx.lineTo(x2 + shadowOffsetX, y2 + shadowOffsetY);
  ctx.lineWidth = safeLineWidth + 1;
  ctx.strokeStyle = shadowColor;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = safeLineWidth;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
  ctx.restore();

  return canvas;
}
