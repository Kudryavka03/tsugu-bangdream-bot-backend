/*
 * Measure how skia-canvas' export threads interact with the Node main thread.
 *
 * Run one process per SKIA_CANVAS_THREADS value, e.g.:
 *   $env:SKIA_CANVAS_THREADS=8; npx ts-node -r tsconfig-paths/register scripts/benchThreads.ts --runs=15
 *
 * For the real "查活动 310" pipeline (drawEventDetail -> outputFinalBuffer) the
 * script reports:
 *   - exportMs: wall time of the final toBuffer('jpeg') call made by output.ts
 *   - workMs:   duration of a fixed CPU-bound busy loop run on the MAIN thread
 *               while that export is in flight (contention probe)
 *   - lagMs:    event-loop timer lag (5 ms ticker) while the runs are in flight
 *   - sync export runs for comparison (toBufferSync blocks the main thread)
 *
 * Prints a single RESULT line with JSON so several pool sizes can be compared.
 */

import * as os from 'os';
import { Canvas } from 'skia-canvas';
// Type-only import: erased at runtime so it does not load the module early.
import type { Server as ServerType } from '@/types/Server';

// Initialize the Skia thread pool in the main thread using the environment
// value, then hide the variable from Piscina workers. A worker would otherwise
// try to build the (process-global) pool a second time and panic with
// GlobalPoolAlreadyInitialized - the same reason src/boot.ts deletes it.
const engineThreads = new Canvas(2, 2).engine.threads;
delete process.env.SKIA_CANVAS_THREADS;

const { globalDefaultServer } = require('@/config') as typeof import('@/config');
const { Server } = require('@/types/Server') as typeof import('@/types/Server');
const mainAPI = (require('@/types/_Main') as typeof import('@/types/_Main')).default;
const { drawEventDetail } = require('@/view/eventDetail') as typeof import('@/view/eventDetail');

const argv = process.argv.slice(2);
function argValue(name: string, fallback: string): string {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
}

const eventId = parseInt(argValue('event', '310'), 10);
const runs = parseInt(argValue('runs', '15'), 10);
const syncRuns = parseInt(argValue('sync-runs', '3'), 10);
const targetWorkMs = parseFloat(argValue('work-ms', '40'));
const servers = argValue('servers', '') ? parseServers() : globalDefaultServer;

function parseServers(): ServerType[] {
    const byName: Record<string, ServerType> = {
        jp: Server.jp, en: Server.en, tw: Server.tw, cn: Server.cn, kr: Server.kr,
    };
    return argValue('servers', '').split(',').map((name) => byName[name.trim().toLowerCase()]);
}

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return NaN;
    const pos = (sorted.length - 1) * p;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function stats(values: number[]) {
    const sorted = values.slice().sort((a, b) => a - b);
    return {
        n: values.length,
        min: sorted[0],
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        max: sorted[sorted.length - 1],
    };
}

// CPU-bound work used to probe main-thread contention. Mixes trig and memory
// writes so it cannot be optimised away.
const scratch = new Float64Array(1024);
function busyWork(iterations: number): number {
    let acc = 0;
    for (let i = 0; i < iterations; i++) {
        const j = i & 1023;
        scratch[j] = Math.sin(i * 0.001) + acc * 0.5;
        acc += scratch[j] * 1e-9;
    }
    return acc;
}

function calibrateIterations(targetMs: number): number {
    let n = 20000;
    for (;;) {
        const t0 = process.hrtime.bigint();
        busyWork(n);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        if (ms >= targetMs) return Math.max(1, Math.round(n * (targetMs / ms)));
        n *= 2;
    }
}

class Ticker {
    private timer: NodeJS.Timeout | null = null;
    private last = 0n;
    private intervalMs = 5;
    readonly lags: number[] = [];

    start() {
        this.lags.length = 0;
        this.last = process.hrtime.bigint();
        this.timer = setInterval(() => {
            const now = process.hrtime.bigint();
            const elapsed = Number(now - this.last) / 1e6;
            this.last = now;
            this.lags.push(Math.max(0, elapsed - this.intervalMs));
        }, this.intervalMs);
    }

    stop(): number[] {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        return this.lags.slice();
    }
}

async function main() {
    const apiWaitStart = Date.now();
    while (!(mainAPI as any)['events'] || !(mainAPI as any)['metaCache']) {
        if (Date.now() - apiWaitStart > 120000) throw new Error('mainAPI did not finish loading within 120 s');
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const iterations = calibrateIterations(targetWorkMs);

    // Baseline: same busy loop on an idle machine (no export in flight).
    const baselineWorkMs: number[] = [];
    const baselineTicker = new Ticker();
    baselineTicker.start();
    for (let i = 0; i < runs; i++) {
        const t0 = process.hrtime.bigint();
        busyWork(iterations);
        baselineWorkMs.push(Number(process.hrtime.bigint() - t0) / 1e6);
        await new Promise((resolve) => setImmediate(resolve));
    }
    const baselineLag = baselineTicker.stop();

    // The final export in output.ts is exactly the jpeg+downsample+quality call.
    const proto = Canvas.prototype as any;
    const originalToBuffer = proto.toBuffer;
    type Mode = 'async-work' | 'async-idle' | 'sync';
    let runMode: Mode = 'async-work';
    let lastExportMs = NaN;
    let lastWorkMs = NaN;
    let lastSizeKb = 0;

    proto.toBuffer = function (format: string = 'png', opts: any = {}) {
        const options = typeof opts === 'number' ? { quality: opts } : (opts || {});
        const fmt = String(format).toLowerCase();
        const isJpeg = fmt.startsWith('jpeg') || fmt.startsWith('jpg');
        if (!(isJpeg && options.downsample === true && typeof options.quality === 'number')) {
            return originalToBuffer.call(this, format, opts);
        }

        const canvas = this;
        const t0 = process.hrtime.bigint();
        const released = runMode === 'sync'
            ? Promise.resolve(canvas.toBufferSync(format, opts))
            : originalToBuffer.call(canvas, format, opts);

        // Probe main-thread throughput while the export is in flight.
        lastWorkMs = NaN;
        if (runMode !== 'async-idle') {
            const w0 = process.hrtime.bigint();
            busyWork(iterations);
            lastWorkMs = Number(process.hrtime.bigint() - w0) / 1e6;
        }

        return released.then((buffer: Buffer) => {
            lastExportMs = Number(process.hrtime.bigint() - t0) / 1e6;
            lastSizeKb = Math.round(buffer.length / 1024);
            return buffer;
        });
    };

    const results: any = {
        engineThreads,
        iterations,
        eventId,
        servers: servers.map((s) => Server[s]),
        asyncWork: null as any,
        asyncIdle: null as any,
        sync: null as any,
    };

    try {
        // Warmup (not measured).
        for (let i = 0; i < 2; i++) await drawEventDetail(eventId, servers, true, true);

        const phases: Array<{ mode: Mode; key: string; count: number }> = [
            { mode: 'async-work', key: 'asyncWork', count: runs },
            { mode: 'async-idle', key: 'asyncIdle', count: runs },
            { mode: 'sync', key: 'sync', count: syncRuns },
        ];
        for (const phase of phases) {
            runMode = phase.mode;
            const count = phase.count;
            const exportMs: number[] = [];
            const workMs: number[] = [];
            const totalMs: number[] = [];
            const sizeKb: number[] = [];
            const ticker = new Ticker();
            ticker.start();
            for (let i = 0; i < count; i++) {
                const t0 = process.hrtime.bigint();
                await drawEventDetail(eventId, servers, true, true);
                totalMs.push(Number(process.hrtime.bigint() - t0) / 1e6);
                exportMs.push(lastExportMs);
                workMs.push(lastWorkMs);
                sizeKb.push(lastSizeKb);
            }
            const lag = ticker.stop();
            const workP50 = workMs.length > 0 ? stats(workMs).p50 : NaN;
            results[phase.key] = {
                runs: count,
                exportMs: stats(exportMs),
                workMs: stats(workMs),
                totalMs: stats(totalMs),
                lagMs: stats(lag),
                workSlowdownVsBaseline: workP50 / stats(baselineWorkMs).p50,
                sizeKb: sizeKb[sizeKb.length - 1],
            };
        }
    } finally {
        proto.toBuffer = originalToBuffer;
    }

    results.baseline = { workMs: stats(baselineWorkMs), lagMs: stats(baselineLag) };
    results.cpus = os.cpus().length;
    console.log('RESULT ' + JSON.stringify(results));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
