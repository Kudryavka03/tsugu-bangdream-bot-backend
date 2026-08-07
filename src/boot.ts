import { Canvas } from "skia-canvas";

// 修复bat下设置skia渲染线程的问题
const threads = new Canvas(1, 1).engine.threads;
console.log(`[Skia] threads=${threads}`);
delete process.env.SKIA_CANVAS_THREADS;

require('./app');