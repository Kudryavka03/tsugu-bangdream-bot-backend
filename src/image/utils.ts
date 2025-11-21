import * as fs from 'fs';
import * as path from 'path';
import { Canvas, loadImage, Image } from 'skia-canvas';
import svg2img from 'svg2img';

const assetsRootPath: string = path.join(__dirname, '../../assets');

export const assetErrorImageBuffer = fs.readFileSync(`${assetsRootPath}/err.png`)

import {Worker,MessageChannel,MessagePort,SHARE_ENV} from 'node:worker_threads';

//const jsonWorker = new Worker('./jsonWorker.js');
const workerPath = path.resolve(__dirname, "../readFileWorker.js");
const readFileWorker = new Worker(workerPath); // 如果需要debug new Worker(workerPath,{execArgv: ['--inspect=9233']})
const pending = new Map();
readFileWorker.on('message', msg => {
  const { id, result, error } = msg;
  const handler = pending.get(id);
  if (!handler) return;

  if (error) handler.reject(new Error(error));
  else handler.resolve(result);

  pending.delete(id);
});

async function callWorker<T>(action: string, text: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = Math.random();
    pending.set(id, { resolve, reject });

    readFileWorker.postMessage({ id, action, text });
  });
}


export async function loadImageFromPath(path: string): Promise<Image> {
    //判断文件是否存在
    if (!await callWorker<boolean>('exist',path)) {
        return loadImage(assetErrorImageBuffer);
    }
    //const buffer = await callWorker<Buffer>('readFile',path);
    return await loadImage(Buffer.from(await callWorker<Uint8Array>('readFile',path)));
}

async function existsAsync(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadImageFromPath0(path: string): Promise<Image> {
  //判断文件是否存在
  if (!fs.existsSync(path)) {
      return loadImage(assetErrorImageBuffer);
  }
  const buffer = fs.readFileSync(path);
  return await loadImage(buffer);
}


//指定字体，字号，文本，获取文本宽度
export function getTextWidth(text: string, textSize: number, font: string) {
    const canvas = new Canvas(1, 1);
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Cannot create canvas context");
    }

    context.font = `${textSize}px ${font}`;
    const metrics = context.measureText(text);

    return metrics.width;
}

export function convertSvgToPngBuffer(svgBuffer: Buffer): Promise<Buffer> {
  //console.trace()
    return new Promise((resolve, reject) => {
      // 将 SVG buffer 转换为字符串
      const svgString = svgBuffer.toString('utf-8');
  
      // 使用 svg2img 将 SVG 字符串转换为 PNG buffer
      svg2img(svgString, (error, buffer) => {
        if (error) {
          return reject(new Error(`Failed to convert SVG to PNG: ${error.message}`));
        }
        resolve(buffer);
      });
    });
  }