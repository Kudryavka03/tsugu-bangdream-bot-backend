import { BasicPlatform, ChartConfiguration, ChartItem } from 'chart.js';
import { Chart } from 'chart.js/auto';
import 'chartjs-adapter-moment';
import { Canvas } from 'skia-canvas';
import { getDateByServerTimezone } from '@/components/list/time';
import { detachCanvasForChartDestroy } from '@/components/utils';
import { GUIDE_THEME } from '@/image/theme';
import { Server } from '@/types/Server';

export function drawCutoffScatterChart(points: { x: number; y: number }[], server: Server, { begin, end }: { begin: number; end: number }): Canvas {
    const canvas = new Canvas(800, 480);
    const showTime = end - begin <= 3 * 24 * 60 * 60_000;
    const font = { family: GUIDE_THEME.fontFamily, size: 16 };
    const axisStyle = {
        border: { color: GUIDE_THEME.border },
        grid: { color: GUIDE_THEME.divider, drawTicks: false },
    };
    const tickStyle = { color: GUIDE_THEME.muted, font, padding: 8 };
    const titleStyle = { color: GUIDE_THEME.text, font, display: true };
    const config: ChartConfiguration<'scatter'> = {
        type: 'scatter',
        platform: BasicPlatform,
        data: {
            datasets: [{
                data: points,
                pointBackgroundColor: GUIDE_THEME.primary,
                pointBorderWidth: 0,
                pointRadius: points.length > 800 ? 2 : 3,
            }],
        },
        options: {
            responsive: false,
            animation: false,
            parsing: false,
            normalized: true,
            plugins: { legend: { display: false } },
            layout: { padding: 8 },
            scales: {
                x: {
                    ...axisStyle,
                    type: 'time',
                    time: { minUnit: 'minute' },
                    min: begin,
                    max: end,
                    title: { ...titleStyle, text: '记录时间（服务器时区）' },
                    ticks: {
                        ...tickStyle,
                        maxRotation: 0,
                        maxTicksLimit: 8,
                        callback(value) {
                            const date = getDateByServerTimezone(value, server);
                            const day = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
                            const hours = String(date.getUTCHours()).padStart(2, '0');
                            const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                            return showTime ? [day, `${hours}:${minutes}`] : day;
                        },
                    },
                },
                y: {
                    ...axisStyle,
                    type: 'linear',
                    grace: '8%',
                    title: { ...titleStyle, text: '分数变动（Pt）' },
                    ticks: { ...tickStyle, precision: 0, maxTicksLimit: 7, callback: value => String(Math.round(Number(value))) },
                },
            },
        },
    };
    const chart = new Chart(canvas.getContext('2d') as unknown as ChartItem, config);
    detachCanvasForChartDestroy(chart);
    chart.destroy();
    return canvas;
}
