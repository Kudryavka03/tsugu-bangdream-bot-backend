/*
 * Benchmark `Canvas.toBuffer('jpeg', ...)` export parameters on the real
 * canvas produced by the "查活动 310" pipeline
 * (drawEventDetail -> outputFinalCanv -> outputFinalBuffer).
 *
 * The canvas is rendered exactly once; every parameter combination is then
 * encoded from that same in-memory canvas, so the numbers below isolate the
 * JPEG export cost (rendering is reported separately).
 *
 * Full option list (https://skia-canvas.org/api/canvas#tobuffer):
 *   toBuffer(format, { page, matte, density, msaa, quality, outline, downsample, colorType })
 *   defaults: density=1, quality=0.92, msaa=true (4x), outline=false,
 *             downsample=false (4:4:4), colorType='rgba'.
 * The MD5 column shows which of these actually change the produced bytes.
 *
 * Note: on Node 24 + skia-canvas 3.0.x the native module can report a
 * non-zero exit code while tearing down at process exit (0xC0000409 on
 * Windows). Reports are written before that happens.
 *
 * Run with:
 *   $env:UV_THREADPOOL_SIZE=48; npx ts-node -r tsconfig-paths/register scripts/benchJpegParams.ts
 *
 * Options:
 *   --event=310        event id, default 310
 *   --runs=15          timed runs per parameter set, default 15
 *   --warmup=2         untimed runs before each set, default 2
 *   --servers=cn,jp    displayed server list, default = globalDefaultServer
 *   --probe            quick check: canvas info, png/jpeg timing, msaa probe, then exit
 *   --e2e=5            also time N full drawEventDetail calls (warm end to end)
 *   --skip-matrix      skip the parameter matrix (useful together with --e2e)
 *   --gpu-bench=15     compare the CPU renderer against the GPU renderer (N runs each)
 *   --out=PerfLog      directory for the JSON report / reference PNG
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Canvas, Image, loadImage } from 'skia-canvas';
// config must be loaded before Server: the two modules form a cycle and
// config.ts dereferences the Server enum while it is being imported.
import { globalDefaultServer } from '@/config';
import { Server } from '@/types/Server';
import mainAPI from '@/types/_Main';
import { drawEventDetail } from '@/view/eventDetail';

type ExportFormat = 'jpeg' | 'jpg';

interface Options {
    quality: number;
    downsample: boolean;
    matte?: string;
    msaa?: number | boolean;
    density?: number;
    page?: number;
    outline?: boolean;
    colorType?: string;
    format?: ExportFormat;
    sync?: boolean;
    note?: string;
}

interface RunResult {
    label: string;
    options: Options;
    runs: number;
    timesMs: number[];
    minMs: number;
    p50Ms: number;
    meanMs: number;
    p95Ms: number;
    maxMs: number;
    bufferSize: number;
    bufferMd5: string;
    psnrDb: number | null;
}

const argv = process.argv.slice(2);
function argValue(name: string, fallback: string): string {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
}
function hasFlag(name: string): boolean {
    return argv.includes(`--${name}`);
}

const eventId = parseInt(argValue('event', '310'), 10);
const runs = parseInt(argValue('runs', '15'), 10);
const warmupRuns = parseInt(argValue('warmup', '2'), 10);
const outDir = path.resolve(argValue('out', 'PerfLog'));
const probeOnly = hasFlag('probe');
const skipMatrix = hasFlag('skip-matrix');
const e2eRuns = parseInt(argValue('e2e', '0'), 10);
const gpuBenchRuns = parseInt(argValue('gpu-bench', '0'), 10);

function parseServers(): Server[] {
    const raw = argValue('servers', '');
    if (!raw) return globalDefaultServer;
    const byName: Record<string, Server> = {
        jp: Server.jp, en: Server.en, tw: Server.tw, cn: Server.cn, kr: Server.kr,
    };
    return raw.split(',').map((name) => {
        const server = byName[name.trim().toLowerCase()];
        if (server === undefined) throw new Error(`unknown server "${name}"`);
        return server;
    });
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return NaN;
    if (sorted.length === 1) return sorted[0];
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function describe(options: Options): string {
    const parts = [`q=${options.quality}`, `ds=${options.downsample}`];
    if (options.density !== undefined) parts.push(`density=${options.density}`);
    if (options.matte !== undefined) parts.push(`matte=${options.matte}`);
    if (options.msaa !== undefined) parts.push(`msaa=${options.msaa}`);
    if (options.page !== undefined) parts.push(`page=${options.page}`);
    if (options.outline !== undefined) parts.push(`outline=${options.outline}`);
    if (options.colorType !== undefined) parts.push(`colorType=${options.colorType}`);
    if (options.format !== undefined) parts.push(`format=${options.format}`);
    if (options.sync) parts.push('sync');
    return parts.join(' ');
}

function toBufferOptions(options: Options): any {
    const opts: any = { quality: options.quality, downsample: options.downsample };
    if (options.density !== undefined) opts.density = options.density;
    if (options.matte !== undefined) opts.matte = options.matte;
    if (options.msaa !== undefined) opts.msaa = options.msaa;
    if (options.page !== undefined) opts.page = options.page;
    if (options.outline !== undefined) opts.outline = options.outline;
    if (options.colorType !== undefined) opts.colorType = options.colorType;
    return opts;
}

function summarize(label: string, options: Options, times: number[], buffer: Buffer, psnrDb: number | null): RunResult {
    const sorted = times.slice().sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    return {
        label,
        options,
        runs: times.length,
        timesMs: times,
        minMs: sorted[0],
        p50Ms: percentile(sorted, 0.5),
        meanMs: mean,
        p95Ms: percentile(sorted, 0.95),
        maxMs: sorted[sorted.length - 1],
        bufferSize: buffer.length,
        bufferMd5: crypto.createHash('md5').update(buffer).digest('hex'),
        psnrDb,
    };
}

async function timeEncode(canvas: Canvas, options: Options): Promise<{ times: number[]; buffer: Buffer }> {
    const format = options.format ?? 'jpeg';
    const toBufferOpts = toBufferOptions(options);

    for (let i = 0; i < warmupRuns; i++) {
        if (options.sync) canvas.toBufferSync(format, toBufferOpts);
        else await canvas.toBuffer(format, toBufferOpts);
    }

    const times: number[] = [];
    let buffer: Buffer = Buffer.alloc(0);
    for (let i = 0; i < runs; i++) {
        const t0 = process.hrtime.bigint();
        buffer = options.sync
            ? canvas.toBufferSync(format, toBufferOpts)
            : await canvas.toBuffer(format, toBufferOpts);
        const t1 = process.hrtime.bigint();
        times.push(Number(t1 - t0) / 1e6);
    }
    return { times, buffer };
}

// skia-canvas refuses getImageData() on any canvas above 2^24 pixels (about
// 16.7 MP) and the event 310 canvas is 17.9 MP, so compare band by band:
// each band is cropped into a small scratch canvas before reading pixels back.
function psnrBetweenImages(reference: Image, actual: Image, scratch: Canvas): number {
    const width = Math.min(Math.floor(reference.width), Math.floor(actual.width));
    const height = Math.min(Math.floor(reference.height), Math.floor(actual.height));
    const bandHeight = Math.max(1, Math.min(height, Math.floor(4_000_000 / width)));
    const scratchCtx = scratch.getContext('2d');
    let squaredError = 0;
    let channels = 0;
    for (let y = 0; y < height; y += bandHeight) {
        const h = Math.min(bandHeight, height - y);
        scratchCtx.clearRect(0, 0, width, h);
        scratchCtx.drawImage(reference, 0, y, width, h, 0, 0, width, h);
        const referenceBand = scratchCtx.getImageData(0, 0, width, h).data as Uint8ClampedArray;
        scratchCtx.clearRect(0, 0, width, h);
        scratchCtx.drawImage(actual, 0, y, width, h, 0, 0, width, h);
        const actualBand = scratchCtx.getImageData(0, 0, width, h).data as Uint8ClampedArray;
        for (let i = 0; i < referenceBand.length; i += 4) {
            for (let c = 0; c < 3; c++) {
                const diff = referenceBand[i + c] - actualBand[i + c];
                squaredError += diff * diff;
                channels++;
            }
        }
    }
    const mse = squaredError / channels;
    if (mse === 0) return Infinity;
    return 10 * Math.log10((255 * 255) / mse);
}



function formatMs(value: number): string {
    return value.toFixed(1);
}

function formatKb(bytes: number): string {
    return (bytes / 1024).toFixed(0);
}

interface RendererRun {
    renderer: 'cpu' | 'gpu';
    index: number;
    totalMs: number;
    renderMs: number;
    encodeMs: number;
    bufferSize: number;
    bufferMd5: string;
    engine: string;
}

function statsOf(values: number[]) {
    const sorted = values.slice().sort((a, b) => a - b);
    return {
        min: sorted[0],
        p50: percentile(sorted, 0.5),
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        p95: percentile(sorted, 0.95),
        max: sorted[sorted.length - 1],
    };
}

// Compare the production pipeline (drawEventDetail -> outputFinalBuffer with the
// optimal JPEG options) with the final canvas on the CPU renderer vs the GPU.
// output.ts does exactly one assignment, `tempcanv.gpu = useGpu`, so the gpu
// setter is redirected here; every other canvas keeps its constructor default.
async function runGpuBench(runCount: number, outDirPath: string, reportBase: string): Promise<void> {
    const servers = parseServers();
    let forcedGpu: boolean | undefined;
    const gpuDescriptor = Object.getOwnPropertyDescriptor(Canvas.prototype, 'gpu');
    if (!gpuDescriptor || !gpuDescriptor.set || !gpuDescriptor.get) throw new Error('Canvas.gpu accessor not found');

    Object.defineProperty(Canvas.prototype, 'gpu', {
        configurable: true,
        enumerable: gpuDescriptor.enumerable,
        get: gpuDescriptor.get,
        set(this: Canvas, value: boolean) {
            gpuDescriptor.set!.call(this, forcedGpu === undefined ? value : forcedGpu);
        },
    });

    const proto = Canvas.prototype as any;
    const originalToBuffer = proto.toBuffer;
    let lastEncodeMs = NaN;
    let lastEngine = '';
    let lastSize = 0;
    let lastMd5 = '';
    let lastFormat = '';
    let lastOptions: any = null;

    // Record the final JPEG export made by outputFinalBuffer, then pass through.
    proto.toBuffer = function (format: string = 'png', opts: any = {}) {
        const options = typeof opts === 'number' ? { quality: opts } : (opts || {});
        const fmt = String(format).toLowerCase();
        const isJpeg = fmt.startsWith('jpeg') || fmt.startsWith('jpg');
        if (!(isJpeg && options.downsample === true && typeof options.quality === 'number')) {
            return originalToBuffer.call(this, format, opts);
        }
        const canvas = this;
        lastEngine = JSON.stringify(canvas.engine);
        lastFormat = String(format);
        lastOptions = options;
        const t0 = process.hrtime.bigint();
        return originalToBuffer.call(canvas, format, opts).then((buffer: Buffer) => {
            lastEncodeMs = Number(process.hrtime.bigint() - t0) / 1e6;
            lastSize = buffer.length;
            lastMd5 = crypto.createHash('md5').update(buffer).digest('hex');
            return buffer;
        });
    };

    const runs: RendererRun[] = [];
    const failures: Array<{ renderer: string; index: number; message: string }> = [];
    const lastBuffers: Record<string, Buffer> = {};
    const engineByRenderer: Record<string, string> = {};

    try {
        for (const renderer of ['cpu', 'gpu'] as const) {
            forcedGpu = renderer === 'gpu';
            console.log(`[bench] renderer=${renderer}: warmup x${warmupRuns} ...`);
            for (let i = 0; i < warmupRuns; i++) {
                try {
                    await drawEventDetail(eventId, servers, true, true);
                } catch (e) {
                    failures.push({ renderer, index: -1, message: (e as Error).message });
                    break;
                }
            }
            for (let i = 0; i < runCount; i++) {
                const t0 = process.hrtime.bigint();
                try {
                    const result = await drawEventDetail(eventId, servers, true, true);
                    const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
                    const buffer = Buffer.isBuffer(result[0]) ? (result[0] as Buffer) : Buffer.alloc(0);
                    const entry: RendererRun = {
                        renderer,
                        index: i + 1,
                        totalMs,
                        renderMs: totalMs - lastEncodeMs,
                        encodeMs: lastEncodeMs,
                        bufferSize: buffer.length || lastSize,
                        bufferMd5: lastMd5,
                        engine: lastEngine,
                    };
                    runs.push(entry);
                    if (buffer.length) lastBuffers[renderer] = buffer;
                    engineByRenderer[renderer] = lastEngine;
                    console.log(`[bench] ${renderer} ${i + 1}/${runCount}: total ${formatMs(entry.totalMs)} ms ` +
                        `(render ${formatMs(entry.renderMs)} + encode ${formatMs(entry.encodeMs)}), ` +
                        `${formatKb(entry.bufferSize)} KB, engine=${entry.engine}`);
                } catch (e) {
                    const message = (e as Error).message;
                    failures.push({ renderer, index: i + 1, message });
                    console.log(`[bench] ${renderer} ${i + 1}/${runCount}: FAILED - ${message}`);
                    break;
                }
            }
        }
    } finally {
        proto.toBuffer = originalToBuffer;
        Object.defineProperty(Canvas.prototype, 'gpu', gpuDescriptor);
    }

    const lines: string[] = [];
    lines.push(`# Renderer benchmark - event ${eventId} (查活动 ${eventId})`);
    lines.push('');
    lines.push(`- date: ${new Date().toISOString()}`);
    lines.push(`- node: ${process.version} (UV_THREADPOOL_SIZE=${process.env.UV_THREADPOOL_SIZE ?? 'unset'})`);
    lines.push(`- cpu: ${os.cpus()[0]?.model ?? 'unknown'} (${os.cpus().length} threads)`);
    lines.push(`- servers: ${servers.map((s) => Server[s]).join(', ')}`);
    lines.push(`- runs per renderer: ${runCount} timed + ${warmupRuns} warmup`);
    lines.push(`- jpeg options used by outputFinalBuffer: ${JSON.stringify(lastOptions)} (format ${lastFormat})`);
    lines.push('');
    lines.push('| renderer | runs | total p50 (ms) | total min (ms) | total p95 (ms) | total max (ms) | render p50 (ms) | encode p50 (ms) | size (KB) | md5 | engine |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const renderer of ['cpu', 'gpu']) {
        const rs = runs.filter((r) => r.renderer === renderer);
        if (rs.length === 0) {
            const fail = failures.find((f) => f.renderer === renderer);
            lines.push(`| ${renderer} | 0 | failed | - | - | - | - | - | - | - | ${fail ? fail.message : 'n/a'} |`);
            continue;
        }
        const total = statsOf(rs.map((r) => r.totalMs));
        const render = statsOf(rs.map((r) => r.renderMs));
        const encode = statsOf(rs.map((r) => r.encodeMs));
        lines.push(`| ${renderer} | ${rs.length} | ${formatMs(total.p50)} | ${formatMs(total.min)} | ` +
            `${formatMs(total.p95)} | ${formatMs(total.max)} | ${formatMs(render.p50)} | ${formatMs(encode.p50)} | ` +
            `${formatKb(rs[rs.length - 1].bufferSize)} | ${rs[rs.length - 1].bufferMd5.slice(0, 8)} | ${engineByRenderer[renderer]} |`);
    }
    if (failures.length > 0) {
        lines.push('');
        lines.push('## Failures');
        for (const f of failures) lines.push(`- ${f.renderer} run ${f.index}: ${f.message}`);
    }
    if (lastBuffers['cpu'] && lastBuffers['gpu']) {
        const cpuImage = await loadImage(lastBuffers['cpu']);
        const gpuImage = await loadImage(lastBuffers['gpu']);
        const scratch = new Canvas(Math.floor(cpuImage.width), Math.min(Math.floor(cpuImage.height), 4000));
        const psnr = psnrBetweenImages(cpuImage, gpuImage, scratch);
        lines.push('');
        lines.push(`- CPU vs GPU output: PSNR ${Number.isFinite(psnr) ? psnr.toFixed(2) + ' dB' : 'identical'}, ` +
            `same md5: ${lastBuffers['cpu'].equals(lastBuffers['gpu'])}`);
    }

    const report = lines.join('\n');
    console.log('\n' + report);
    fs.writeFileSync(`${reportBase}-renderer.md`, report);
    fs.writeFileSync(`${reportBase}-renderer.json`, JSON.stringify({ eventId, servers, runs, failures, engineByRenderer }, null, 2));
    console.log(`[bench] renderer report written to ${reportBase}-renderer.md / .json`);
}

async function main() {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportBase = path.join(outDir, `jpeg-bench-event${eventId}-${stamp}`);

    // The main API tables load asynchronously on module import; drawEventDetail
    // needs them (same as a request arriving on a warm server).
    const apiWaitStart = Date.now();
    while (!(mainAPI as any)['events'] || !(mainAPI as any)['metaCache']) {
        if (Date.now() - apiWaitStart > 120000) throw new Error('mainAPI did not finish loading within 120 s');
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.log(`[bench] mainAPI ready after ${((Date.now() - apiWaitStart) / 1000).toFixed(1)} s`);

    if (gpuBenchRuns > 0) {
        await runGpuBench(gpuBenchRuns, outDir, reportBase);
        return;
    }

    // ---------------------------------------------------------------------
    // 1. Render the real "查活动 310" canvas once.
    //    The final JPEG export is short-circuited so the async canvas survives
    //    and can be re-encoded below with different options.
    // ---------------------------------------------------------------------
    const proto = Canvas.prototype as any;
    const originalToBuffer = proto.toBuffer;
    let finalCanvas: Canvas | null = null;
    let interceptedOptions: any = null;

    proto.toBuffer = function (format: string = 'png', opts: any = {}) {
        const options = typeof opts === 'number' ? { quality: opts } : (opts || {});
        const isJpeg = String(format).toLowerCase() === 'jpeg' || String(format).toLowerCase() === 'jpg';
        if (isJpeg && options.downsample === true && typeof options.quality === 'number') {
            finalCanvas = this;
            interceptedOptions = options;
            return Promise.resolve(Buffer.alloc(0));
        }
        return originalToBuffer.call(this, format, opts);
    };

    const servers = parseServers();
    console.log(`[bench] rendering 查活动 ${eventId} (servers=${servers.map((s) => Server[s]).join(',')}) ...`);
    const renderStart = process.hrtime.bigint();
    try {
        const result = await drawEventDetail(eventId, servers, true, true);
        console.log(`[bench] drawEventDetail returned ${result.length} item(s)`);
    } finally {
        proto.toBuffer = originalToBuffer;
    }
    const renderMs = Number(process.hrtime.bigint() - renderStart) / 1e6;
    if (!finalCanvas) throw new Error('final canvas was not captured - outputFinalBuffer layout changed?');

    const canvas: Canvas = finalCanvas;
    // Canvas dimensions may be fractional (text metrics); pixel buffers need integers.
    const pixelWidth = Math.floor(canvas.width);
    const pixelHeight = Math.floor(canvas.height);
    const pixels = pixelWidth * pixelHeight;
    console.log(`[bench] canvas = ${canvas.width} x ${canvas.height} (${(pixels / 1e6).toFixed(2)} MP), ` +
        `render = ${formatMs(renderMs)} ms, intercepted export options = ${JSON.stringify(interceptedOptions)}`);

    // Lossless reference for the PSNR column. Images are used (not canvases)
    // because reading pixels back is only possible below the 2^24 pixel cap.
    const referencePng = await canvas.toBuffer('png');
    const referenceImage = await loadImage(referencePng);
    const bandHeight = Math.max(1, Math.min(pixelHeight, Math.floor(4_000_000 / pixelWidth)));
    const scratchCanvas = new Canvas(pixelWidth, bandHeight);
    fs.writeFileSync(`${reportBase}-reference.png`, referencePng);
    console.log(`[bench] reference png = ${formatKb(referencePng.length)} KB -> ${reportBase}-reference.png`);

    if (probeOnly) {
        const pngTimes: number[] = [];
        for (let i = 0; i < 3; i++) {
            const t0 = process.hrtime.bigint();
            await canvas.toBuffer('png');
            pngTimes.push(Number(process.hrtime.bigint() - t0) / 1e6);
        }
        console.log(`[bench] png encode x3 = ${pngTimes.map(formatMs).join(', ')} ms`);
        const single = await timeEncode(canvas, { quality: 0.55, downsample: true });
        const probeImage = await loadImage(single.buffer);
        const psnr = psnrBetweenImages(referenceImage, probeImage, scratchCanvas);
        console.log(`[bench] probe jpeg q=0.55 ds=true: ${formatMs(single.times[0])} ms, ` +
            `${formatKb(single.buffer.length)} KB, psnr = ${psnr.toFixed(2)} dB`);
        // msaa is a render option; check whether it changes the raster export at all.
        const msaaHashes: string[] = [];
        for (const msaa of [false, 2, 4, 8]) {
            const msaaBuffer = await canvas.toBuffer('jpeg', { quality: 0.55, downsample: true, msaa });
            msaaHashes.push(`msaa=${msaa}:${crypto.createHash('md5').update(msaaBuffer).digest('hex').slice(0, 8)}`);
        }
        console.log(`[bench] msaa probe: ${msaaHashes.join(' ')}`);
        return;
    }

    // ---------------------------------------------------------------------
    // 2. Parameter sets.
    //    (a) quality x downsample full factorial
    //    (b) every remaining toBuffer option on top of the production setting
    // ---------------------------------------------------------------------
    const configs: Options[] = [];
    if (!skipMatrix) {
        for (const quality of [0.45, 0.5, 0.55, 0.6, 0.65, 0.7]) {
            for (const downsample of [true, false]) {
                configs.push({ quality, downsample });
            }
        }

        const base: Options = { quality: 0.55, downsample: true };
        configs.push({ ...base, matte: '#fef3ef', note: 'matte: bg under transparent pixels' });
        configs.push({ ...base, matte: '#000000', note: 'matte: different color, same expectation' });
        configs.push({ ...base, msaa: false, note: 'msaa: shader AA instead of 4x MSAA' });
        configs.push({ ...base, msaa: 2 });
        configs.push({ ...base, msaa: 8 });
        configs.push({ ...base, page: 1, note: 'page: single-page canvas' });
        configs.push({ ...base, outline: true, note: 'outline: SVG-only option' });
        configs.push({ ...base, colorType: 'rgb', note: 'colorType: raw-only option' });
        configs.push({ ...base, format: 'jpg', note: 'format alias for jpeg' });
        configs.push({ ...base, density: 2, note: 'density 2x: 4x the pixels' });
        configs.push({ ...base, sync: true, note: 'toBufferSync instead of async toBuffer' });
        configs.push(
            { ...base, matte: '#fef3ef', msaa: 8, page: 1, outline: true, colorType: 'rgb' },
        );
    }

    // Warm up the encoder once before the first timed set.
    await canvas.toBuffer('jpeg', { quality: 0.55, downsample: true });

    const results: RunResult[] = [];
    const benchmarkStart = process.hrtime.bigint();

    for (const options of configs) {
        const label = describe(options);
        const { times, buffer } = await timeEncode(canvas, options);

        // Density > 1 produces a different resolution, so PSNR against the
        // density-1 reference is only meaningful at density 1.
        let psnr: number | null = null;
        if ((options.density ?? 1) === 1) {
            const decodedImage = await loadImage(buffer);
            psnr = psnrBetweenImages(referenceImage, decodedImage, scratchCanvas);
        }

        const result = summarize(label, options, times, buffer, psnr);
        results.push(result);
        console.log(`[bench] ${label.padEnd(56)} p50 ${formatMs(result.p50Ms).padStart(7)} ms  ` +
            `min ${formatMs(result.minMs).padStart(7)} ms  size ${formatKb(result.bufferSize).padStart(5)} KB  ` +
            `psnr ${psnr === null ? ' n/a' : psnr.toFixed(2).padStart(5)} dB  md5 ${result.bufferMd5.slice(0, 8)}`);
    }
    const benchmarkMs = Number(process.hrtime.bigint() - benchmarkStart) / 1e6;

    // ---------------------------------------------------------------------
    // 2b. Optional end-to-end timing of the real command path (render + export).
    // ---------------------------------------------------------------------
    const e2eTimes: number[] = [];
    const e2eSizes: number[] = [];
    for (let i = 0; i < e2eRuns; i++) {
        const t0 = process.hrtime.bigint();
        const result = await drawEventDetail(eventId, servers, true, true);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        const bytes = Buffer.isBuffer(result[0]) ? (result[0] as Buffer).length : 0;
        e2eTimes.push(ms);
        e2eSizes.push(bytes);
        console.log(`[bench] e2e ${i + 1}/${e2eRuns}: ${formatMs(ms)} ms, ${formatKb(bytes)} KB`);
    }

    // ---------------------------------------------------------------------
    // 3. Report.
    // ---------------------------------------------------------------------
    const baseline = results.find((r) => r.options.quality === 0.55 && r.options.downsample === true
        && r.options.density === undefined && r.options.matte === undefined && r.options.msaa === undefined
        && r.options.page === undefined && r.options.outline === undefined && r.options.colorType === undefined
        && r.options.format === undefined && !r.options.sync);
    const lines: string[] = [];
    lines.push(`# JPEG export benchmark - event ${eventId} (查活动 ${eventId})`);
    lines.push('');
    lines.push(`- date: ${new Date().toISOString()}`);
    lines.push(`- node: ${process.version} (UV_THREADPOOL_SIZE=${process.env.UV_THREADPOOL_SIZE ?? 'unset'})`);
    lines.push(`- cpu: ${os.cpus()[0]?.model ?? 'unknown'} (${os.cpus().length} threads)`);
    lines.push(`- skia: ${JSON.stringify(canvas.engine)}`);
    lines.push(`- canvas: ${canvas.width} x ${canvas.height} = ${(pixels / 1e6).toFixed(2)} MP`);
    lines.push(`- servers: ${servers.map((s) => Server[s]).join(', ')}`);
    lines.push(`- render once (drawEventDetail): ${formatMs(renderMs)} ms`);
    lines.push(`- renders per set: ${runs} timed + ${warmupRuns} warmup`);
    lines.push(`- total benchmark time: ${(benchmarkMs / 1000).toFixed(1)} s`);
    if (e2eTimes.length > 0) {
        const sortedE2e = e2eTimes.slice().sort((a, b) => a - b);
        lines.push(`- warm end-to-end (drawEventDetail + jpeg export) x${e2eTimes.length}: ` +
            `min ${formatMs(sortedE2e[0])} ms, median ${formatMs(percentile(sortedE2e, 0.5))} ms, ` +
            `mean ${formatMs(e2eTimes.reduce((a, b) => a + b, 0) / e2eTimes.length)} ms, ` +
            `size ${formatKb(e2eSizes[e2eSizes.length - 1])} KB`);
    }
    lines.push('');
    lines.push('| options | p50 (ms) | min (ms) | p95 (ms) | max (ms) | size (KB) | PSNR (dB) | md5 | same as baseline |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of results) {
        const same = baseline ? (r.bufferMd5 === baseline.bufferMd5 ? 'yes' : 'no') : '-';
        lines.push(`| ${r.label} | ${formatMs(r.p50Ms)} | ${formatMs(r.minMs)} | ${formatMs(r.p95Ms)} | ` +
            `${formatMs(r.maxMs)} | ${formatKb(r.bufferSize)} | ${r.psnrDb?.toFixed(2) ?? 'n/a'} | ` +
            `${r.bufferMd5.slice(0, 8)} | ${same} |`);
    }
    lines.push('');
    const report = lines.join('\n');
    console.log('\n' + report);

    fs.writeFileSync(`${reportBase}.json`, JSON.stringify({
        eventId,
        canvas: { width: canvas.width, height: canvas.height, pixels },
        renderMs,
        runs,
        warmupRuns,
        benchmarkMs,
        engine: canvas.engine,
        results,
        e2e: { runs: e2eTimes.length, timesMs: e2eTimes, bufferSizes: e2eSizes },
        referencePngBytes: referencePng.length,
    }, null, 2));
    fs.writeFileSync(`${reportBase}.md`, report);
    console.log(`[bench] report written to ${reportBase}.md / .json`);
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
