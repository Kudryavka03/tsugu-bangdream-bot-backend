import { Canvas } from 'skia-canvas';
import { drawTimeLineChart } from '@/components/chart_Timeline';
import { getPresetColor } from '@/types/Color';
import { drawList } from '@/components/list';
import { stackImage } from '@/components/utils';
import { Server } from '@/types/Server';
import { Song } from '@/types/Song';

export interface CutoffSongChartPoint {
    time: number;
    ep: number;
}

export interface CutoffSongChartEntry {
    song: Song;
    t1List: CutoffSongChartPoint[];
    tierList: CutoffSongChartPoint[];
    currentT1: number;
}

function toChartData(
    points: CutoffSongChartPoint[],
    startAt: number,
): { x: Date; y: number }[] {
    const chartData: { x: Date; y: number }[] = [{ x: new Date(startAt), y: 0 }];
    for (const point of points) {
        chartData.push({ x: new Date(point.time), y: point.ep });
    }
    return chartData;
}

function toHorizontalLineData(
    y: number,
    startAt: number,
    endAt: number,
): { x: Date; y: number }[] {
    return [
        { x: new Date(startAt), y },
        { x: new Date(endAt), y },
    ];
}

export async function drawCutoffSongChart(
    entries: CutoffSongChartEntry[],
    tier: number,
    startAt: number,
    endAt: number,
    server: Server,
) {
    if (entries.length === 0) {
        return new Canvas(1, 1);
    }

    const datasets: object[] = [];
    const legendList = [];
    const onlyOne = entries.length === 1;

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const tempColor = getPresetColor(i);
        const songLabel = entry.song.musicTitle[server] || `歌曲${entry.song.songId}`;

        if (tier === 1) {
            const labelName = onlyOne ? 'T1' : `${songLabel} T1`;
            legendList.push(await drawList({
                content: [tempColor.generateColorBlock(0.8), labelName],
                textSize: 20,
            }));
            datasets.push({
                label: labelName,
                data: toChartData(entry.t1List, startAt),
                borderWidth: 5,
                borderColor: [tempColor.getRGBA(1)],
                backgroundColor: [tempColor.getRGBA(0.2)],
                pointBackgroundColor: tempColor.getRGBA(1),
                pointBorderColor: tempColor.getRGBA(1),
                fill: onlyOne,
            });
            continue;
        }

        const t1Label = onlyOne ? 'T1 参考线' : `${songLabel} T1 参考线`;
        legendList.push(await drawList({
            content: [tempColor.generateColorBlock(0.4), t1Label],
            textSize: 20,
        }));
        datasets.push({
            label: t1Label,
            data: toHorizontalLineData(entry.currentT1, startAt, endAt),
            borderWidth: 4,
            borderColor: [tempColor.getRGBA(0.6)],
            backgroundColor: [tempColor.getRGBA(0.6)],
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            borderDash: [20, 10],
        });

        const tierLabel = onlyOne ? `T${tier}` : `${songLabel} T${tier}`;
        legendList.push(await drawList({
            content: [tempColor.generateColorBlock(0.8), tierLabel],
            textSize: 20,
        }));
        datasets.push({
            label: tierLabel,
            data: toChartData(entry.tierList, startAt),
            borderWidth: 5,
            borderColor: [tempColor.getRGBA(1)],
            backgroundColor: [tempColor.getRGBA(0.2)],
            pointBackgroundColor: tempColor.getRGBA(1),
            pointBorderColor: tempColor.getRGBA(1),
            fill: false,
        });
    }

    const time = Date.now();
    if (time < endAt) {
        const tempColor = getPresetColor(0);
        datasets.push({
            label: '当前时间',
            borderColor: [tempColor.getRGBA(1)],
            backgroundColor: [tempColor.getRGBA(1)],
            data: [{ x: new Date(time), y: 0 }],
            fill: false,
            pointRadius: 10,
            pointHoverRadius: 15,
            showLine: false,
        });
    }

    const all = [stackImage(legendList)];
    all.push(await drawTimeLineChart({
        data: { datasets },
        start: new Date(startAt),
        end: new Date(endAt),
        setStartToZero: false,
        server,
    }) as Canvas);
    return stackImage(all);
}
