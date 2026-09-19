import { Chart, registerables } from 'chart.js';
import { Chart as ChartJSNode } from 'chart.js/auto';
import { Canvas, FontLibrary, loadImage } from 'skia-canvas';
import 'chartjs-adapter-moment';
import { assetsRootPath } from '@/config';
import { assetErrorImageBuffer } from '@/image/utils';
import { detachCanvasForChartDestroy, disposeChartButKeepingCanvas } from './utils';
import { Server } from '@/types/Server';
import { getDateByServerTimezone } from './list/time';

// 2. 注册 Chart.js 所有组件
Chart.register(...registerables);

// 3. 强制使用 `basic` platform，避免 DOM 相关错误
// ChartJSNode.defaults.platform = 'basic';

// 4. 配置字体（如果有的话）
FontLibrary.use("old", [`${assetsRootPath}/Fonts/old.ttf`]);

// 5. 定义参数接口
interface drawTimeLineChartOptions {
  start: Date;
  end: Date;
  setStartToZero?: boolean;
  data: {
    datasets: any[];
  };
  server?:Server
}

const MAX_CHART_POINTS_PER_DATASET = 1000

function getChartPointX(point: any): number {
  return point.x instanceof Date ? point.x.getTime() : Number(point.x)
}

function downsampleLTTB<T extends { x: any; y: number }>(data: T[], threshold: number): T[] {
  if (threshold >= data.length || threshold < 3) return data
  const sampled: T[] = [data[0]]
  const bucketSize = (data.length - 2) / (threshold - 2)
  let anchorIndex = 0
  for (let i = 0; i < threshold - 2; i++) {
    const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1
    const avgRangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length)
    let avgX = 0
    let avgY = 0
    const avgCount = Math.max(1, avgRangeEnd - avgRangeStart)
    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      avgX += getChartPointX(data[j])
      avgY += data[j].y
    }
    avgX /= avgCount
    avgY /= avgCount

    const rangeStart = Math.floor(i * bucketSize) + 1
    const rangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length - 1)
    const anchorX = getChartPointX(data[anchorIndex])
    const anchorY = data[anchorIndex].y
    let maxArea = -1
    let selectedIndex = rangeStart
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs(
        (anchorX - avgX) * (data[j].y - anchorY) -
        (anchorX - getChartPointX(data[j])) * (avgY - anchorY)
      )
      if (area > maxArea) {
        maxArea = area
        selectedIndex = j
      }
    }
    sampled.push(data[selectedIndex])
    anchorIndex = selectedIndex
  }
  sampled.push(data[data.length - 1])
  return sampled
}

// 6. 主函数：生成时间轴图表
export async function drawTimeLineChart(
  { start, end, setStartToZero = false, data,server }: drawTimeLineChartOptions,
  displayLabel = false,widthNum:number = 800,heightNum:number =900
) {
  const width = widthNum;
  const height = heightNum;
  const chartDatasets = data.datasets.map((dataset: any) => ({
    ...dataset,
    data: Array.isArray(dataset.data)
      ? downsampleLTTB(dataset.data, MAX_CHART_POINTS_PER_DATASET)
      : dataset.data,
  }))
  const chartData = { ...data, datasets: chartDatasets }
  const weekMap = server== Server.jp?['日', '月', '火', '水', '木', '金', '土']:['日', '一', '二', '三', '四', '五', '六'];
  // 7. 创建 skia-canvas 实例
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext('2d');
  //console.log(start,end)
  // scales options
  let days = 0
  let xOptions = {}
  if (!setStartToZero){
    xOptions = {
          type: 'time',
          time: {
            unit: 'day',
          },
          min: start,
          max: end,
          display: !setStartToZero,
          ticks: {
            callback(value: any) {
              const date = getDateByServerTimezone(value,server);
              const month = date.getUTCMonth() + 1;
              const day = date.getUTCDate();
              const week = weekMap[date.getUTCDay()];
              return [`${month}/${day}`, week];
            },
          },
        }
  }else{
    xOptions = {
          type: 'time',
          time: {
            unit: 'day',
          },
          min: start,
          max: end,
          display: true,
          ticks: {
            callback(value: any) {
              const date = new Date(value);
              const day = date.getUTCDate();
              return [`Day${day+1}`];
            },
          },
        }
  }

  // 8. 计算 y 轴最大值
  let yMax = 0
  for (const dataset of chartDatasets) {
    for (const point of dataset.data ?? []) {
      if (Number.isFinite(point?.y) && point.y > yMax) yMax = point.y
    }
  }
  
  // 9. 配置 Chart.js 选项
  const options = {
    plugins: {
      legend: {
        labels: {
          font: {
            size: 20,
          },
        },
        display: displayLabel,
      },
    },
    scales: {
      x: xOptions,
      y: {
        min: 0,
        max: Math.floor((yMax + 1000) * 1.1), // 美观输出
      },
    },
  };

  // 10. Chart.js 配置
  const config = {
    type: 'line' as const,
    data: chartData,
    options: {
      ...options,
      responsive: false, // 重要：关闭 Chart.js 自适应模式
      animation: false,
    },
  };

  try {
    // 11. 生成 Chart.js 图表
    const chart = new Chart(ctx as any, config as any);
    detachCanvasForChartDestroy(chart)
    chart.destroy()
    // 12. 返回 skia-canvas 的 Image 对象
    return canvas
  } catch (e) {
    console.error(e);
    return loadImage(assetErrorImageBuffer);
  }
}

