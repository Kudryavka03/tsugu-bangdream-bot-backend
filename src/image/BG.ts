import { createBlurredTrianglePattern } from "@/image/BG/BG_triangle";
import { scatterImages } from "@/image/BG/BG_starScatter";
import { drawTextOnCanvas } from "@/image/BG/BG_text";
import { loadImage, Image, Canvas } from 'skia-canvas';
import { assetsRootPath } from '@/config'
import * as path from 'path';
import { loadImageFromPath } from '@/image/utils';


interface BGOptions {
  image?: Image | Canvas | any;
  text?: string;
  width: number;
  height: number;
}

// 将图片等比例缩放并重复铺满整个画布,并且增加亮度
async function Spread(image: Image, width: number, height: number, brightness: number): Promise<Buffer> {
  const canvas: Canvas = new Canvas(width, height);
  const ctx = canvas.getContext('2d');

  // 调整亮度
  const brightenedImage = await adjustBrightness(image, brightness);

  // 计算缩放后的尺寸
  const { scaledWidth, scaledHeight } = getScaledDimensions(brightenedImage, width, height);

  // 绘制图像
  for (let y = 0; y < height; y += scaledHeight) {
    for (let x = 0; x < width; x += scaledWidth) {
      ctx.drawImage(brightenedImage, x, y, scaledWidth, scaledHeight);
    }
  }

  return await canvas.toBuffer('png');
}

async function adjustBrightness(image: Image, brightness: number): Promise<Image> {
  const canvas = new Canvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const factor = brightness / 255;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] + 255 * factor);     // Red
    data[i + 1] = Math.min(255, data[i + 1] + 255 * factor); // Green
    data[i + 2] = Math.min(255, data[i + 2] + 255 * factor); // Blue
    // Alpha (data[i + 3]) remains unchanged
  }

  ctx.putImageData(imageData, 0, 0);

  return await loadImage(await canvas.toBuffer('png'));
}

function getScaledDimensions(image: Image, targetWidth: number, targetHeight: number): { scaledWidth: number, scaledHeight: number } {
  const imageAspectRatio = image.width / image.height;
  const canvasAspectRatio = targetWidth / targetHeight;
  let scaledWidth: number, scaledHeight: number;

  if (imageAspectRatio > canvasAspectRatio) {
    scaledWidth = targetWidth;
    scaledHeight = image.height * (targetWidth / image.width);
  } else {
    scaledHeight = targetHeight;
    scaledWidth = image.width * (targetHeight / image.height);
  }

  return { scaledWidth, scaledHeight };
}

var star: Image[] = [];

var defaultBGTexture: Image;
let defaultBGTexturePromise: Promise<Image> | undefined;

function getDefaultBGTexture(): Promise<Image> {
  if (defaultBGTexture) {
    return Promise.resolve(defaultBGTexture);
  }

  if (!defaultBGTexturePromise) {
    defaultBGTexturePromise = loadImageFromPath(path.join(assetsRootPath, "/BG/bg_object_big.png"))
      .then((image) => {
        defaultBGTexture = image;
        return image;
      })
      .catch((error) => {
        // Allow a later request to retry if the initial preload failed.
        defaultBGTexturePromise = undefined;
        throw error;
      });
  }

  return defaultBGTexturePromise;
}

async function loadImageOnce() {
  const [star1, star2] = await Promise.all([
    loadImageFromPath(path.join(assetsRootPath, "/BG/star1.png")),
    loadImageFromPath(path.join(assetsRootPath, "/BG/star2.png")),
    getDefaultBGTexture(),
  ]);
  star.push(star1, star2);
}
loadImageOnce()

export async function CreateBGEazy({
  width, height
}) {
  const texture = defaultBGTexture ?? await getDefaultBGTexture();
  const bgColor = '#fef3ef'
  const canvas: Canvas = new Canvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  if (width < 2000) {
    var ratio = texture.width / width
  }
  else {
    ratio = 1
  }
  //将图片等比例缩放并重复铺满整个画布
  let x = 0,
    y = 0;
  const defaultValue = 0 - (Math.random() * texture.width * ratio);
  while (y < height) {
    x = defaultValue
    while (x < width) {
      ctx.drawImage(texture, x, y, texture.width * ratio, texture.height * ratio);
      x += texture.width * ratio;
    }
    y += texture.height * ratio;
  }
  return (canvas)
}

interface BGEazyOptOptions {
  width: number;
  height: number;
  /** Draw directly onto an existing final canvas to avoid a full-size temporary canvas. */
  canvas?: Canvas;
  /** Skip the solid-color fill when the target canvas has already been initialized. */
  backgroundAlreadyFilled?: boolean;
  /** Optional deterministic horizontal offset in the range [0, 1). */
  offsetRatio?: number;
}

/**
 * High-performance version of CreateBGEazy.
 *
 * It uses one native Skia pattern fill instead of a JavaScript tiling loop and
 * can draw directly onto the final canvas, avoiding an extra full-canvas copy.
 */
export async function CreateBGEazyOpt({
  width,
  height,
  canvas,
  backgroundAlreadyFilled = false,
  offsetRatio,
}: BGEazyOptOptions): Promise<Canvas> {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError(`Invalid background size: ${width}x${height}`);
  }

  const texture = defaultBGTexture ?? await getDefaultBGTexture();
  const target = canvas ?? new Canvas(width, height);
  const ctx = target.getContext('2d');

  ctx.save();
  try {
    // The legacy background canvas uses smoothing by default. Preserve that
    // appearance when drawing onto output.ts, whose context disables it.
    ctx.imageSmoothingEnabled = true;

    if (!backgroundAlreadyFilled) {
      ctx.fillStyle = '#fef3ef';
      ctx.fillRect(0, 0, width, height);
    }

    const scale = width < 2000 ? texture.width / width : 1;
    const pattern = ctx.createPattern(texture, 'repeat');
    if (!pattern) {
      throw new Error('Failed to create the easy-background texture pattern');
    }

    const normalizedOffset = offsetRatio == null
      ? Math.random()
      : ((offsetRatio % 1) + 1) % 1;
    pattern.setTransform(scale, 0, 0, scale, -normalizedOffset * texture.width * scale, 0);
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  }
  finally {
    ctx.restore();
  }

  return target;
}
export async function CreateBGPure({  // 只画一点点()
  width,height,canvas
}) {
  //const bgColor = '#fef3ef'
  const ctx = canvas.getContext('2d');
  const texture = defaultBGTexture ?? await getDefaultBGTexture();
  //ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  /*
  if (width < 2000) {
    var ratio = texture.width / width
  }
  else {
    ratio = 1
  }
    */
   var ratio = 1
  //只绘制上半部分
  let x = 0,
    y = 0;
  // 检查原始输入的width，然后确定尽可能的多团
  let lessWidth = canvas.width - texture.width
  console.log(canvas.width,texture.width)
  
  var defaultValue = 0
  if (lessWidth <=0){
    // 当贴图宽度大于 实际输出宽度
    defaultValue = 0 - (Math.random() * Math.abs(lessWidth) * ratio)
  } else if (lessWidth>0){
    defaultValue = Math.round(lessWidth) * Math.random()
  }
  //const defaultValue = 0 - (Math.random() * texture.width * ratio);
  ctx.drawImage(texture, defaultValue, y, texture.width * ratio, texture.height * ratio);
  return (canvas)
}

export async function CreateBG({
  image,
  text,
  width,
  height,

}: BGOptions): Promise<Canvas> {
  //将图片铺满画面，并且增加20亮度
  const BG = await Spread(image, width, height, 20);
  const BGimage = await loadImage(BG);

  //给图片增加三角形纹理
  const canvas = await createBlurredTrianglePattern({
    image: BGimage,
    blurRadius: 100,
    triangleSize: 200,
    brightnessDifference: 0.04,
  });


  //添加随机星星
  for (let i = 0; i < star.length; i++) {
    await scatterImages({
      canvas,
      image: star[i],
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      density: 0.00001,
      angleRange: 72,
      sizeRange: [25, 75],
    })
  }

  //添加背景文字
  drawTextOnCanvas(canvas, {
    text: text ??= 'BanG Dream!',
    fontSize: 150,
    angle: 15,
    lineSpacing: 50,
    letterSpacing: 100,
    strokeWidth: 3,
    skewAngle: -12,
    opacity: 0.5,
    scaleX: 0.8,
  })
  return (canvas)
}
