// drawLinegraphChart.ts

import { Chart, ChartOptions, registerables } from 'chart.js';
import { Chart as ChartJSNode } from 'chart.js/auto';
import { Canvas, FontLibrary, loadImage } from 'skia-canvas';
import { assetsRootPath } from '@/config';
import { assetErrorImageBuffer } from '@/image/utils';
import { detachCanvasForChartDestroy, disposeChartButKeepingCanvas } from './utils';
import { GUIDE_THEME } from '@/image/theme';

// 1. 注册 Chart.js 组件
Chart.register(...registerables);

// 2. 设定 Chart.js 运行在 Node.js 模式
// ChartJSNode.defaults.platform = 'basic';

// 3. 载入字体
FontLibrary.use("old", [`${assetsRootPath}/Fonts/old.ttf`]);

// 4. 画布大小
const width = 800;
const height = 800;

// 5. 生成柱状图
export async function drawLinegraphChart(data: any) {
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext('2d');

    const options: ChartOptions<'bar'> = {
        color: GUIDE_THEME.text,
        font: {
            family: GUIDE_THEME.fontFamily,
            size: 16,
        },
        elements: {
            bar: {
                // Dataset colors keep priority over these presentation defaults.
                backgroundColor: GUIDE_THEME.primarySoft,
                borderColor: GUIDE_THEME.primary,
                borderRadius: 8,
            },
        },
        plugins: {
            legend: {
                display: false,
                labels: {
                    color: GUIDE_THEME.text,
                    font: { family: GUIDE_THEME.fontFamily },
                },
            },
            tooltip: {
                backgroundColor: GUIDE_THEME.surface,
                titleColor: GUIDE_THEME.text,
                bodyColor: GUIDE_THEME.text,
                borderColor: GUIDE_THEME.border,
                borderWidth: 1,
                titleFont: { family: GUIDE_THEME.fontFamily },
                bodyFont: { family: GUIDE_THEME.fontFamily },
                cornerRadius: 8,
            },
        },
        scales: {
            x: {
                border: { color: GUIDE_THEME.border },
                grid: { color: GUIDE_THEME.divider, drawTicks: false },
                ticks: {
                    color: GUIDE_THEME.muted,
                    font: { family: GUIDE_THEME.fontFamily, size: 16 },
                    padding: 10,
                },
            },
            y: {
                border: { color: GUIDE_THEME.border },
                grid: { color: GUIDE_THEME.divider, drawTicks: false },
                ticks: {
                    color: GUIDE_THEME.muted,
                    font: { family: GUIDE_THEME.fontFamily, size: 16 },
                    padding: 10,
                },
            },
        },
    };

    const config = {
        type: 'bar' as const,
        data,
        options: {
            ...options,
            responsive: false, // 关闭自适应，避免 DOM 依赖
            animation: false,
        },
    };

    try {
        // 6. 生成图表
        const chart = new Chart(ctx as any, config as any);
        detachCanvasForChartDestroy(chart)
        chart.destroy()
        // 7. 返回 skia-canvas 的 Image 对象
        return canvas;
    } catch (e) {
        console.log(e);
        return loadImage(assetErrorImageBuffer);
    }
}
