import { useEffect, useRef } from 'react';
// 按需引入 echarts：仅为雷达图 + tooltip + canvas 渲染打包，减小首屏体积。
// echarts/core 提供类型完整的 init/use/use/EChartsCoreOption，比 'echarts' 总入口更稳。
import * as echarts from 'echarts/core';
import { RadarChart as EChartsRadar } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { Dimension } from '../types/schema';
import type { QuizResult } from '../store/quizStore';

// 注册所需模块（仅雷达图相关，tree-shaking 友好）。
echarts.use([EChartsRadar, TooltipComponent, CanvasRenderer]);

interface Props {
  /** 维度元信息（含每维度两极的 label）。 */
  dimensions: Dimension[];
  /** 终局结果：含每维度命中极 id 与置信度。 */
  result: QuizResult;
}

export default function RadarChart({ dimensions, result }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    chart.setOption(buildOption(dimensions, result));

    // 自适应：窗口/容器尺寸变化时重绘（移动端旋转、弹窗缩放等场景）。
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    // ResizeObserver：海报容器由隐藏→可见、父级 flex 变化时也能及时 resize，
    // 避免 ECharts 用旧尺寸初始化导致图形与标签错位。
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);

    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [dimensions, result]);

  // 命中极变化时刷新数据（同一生命周期内 result 引用变更）。
  useEffect(() => {
    chartRef.current?.setOption(buildOption(dimensions, result));
  }, [dimensions, result]);

  return (
    <div
      ref={ref}
      // 固定正方形比例容器：4 轴雷达在正方形里居中最稳，避免宽高不等导致椭圆错位。
      // 移动端宽度自适应，桌面端上限 360px。
      style={{ width: '100%', height: 'clamp(260px, 88vw, 360px)' }}
    />
  );
}

function buildOption(dimensions: Dimension[], result: QuizResult): echarts.EChartsCoreOption {
  // 1) 拼 indicator：每维度一条轴，轴名带命中极小注。
  const indicator: Array<{ name: string; max: number }> = [];
  const value: number[] = [];

  for (const dim of dimensions) {
    const pole0 = dim.poles[0];
    const pole1 = dim.poles[1];
    const pd = result.perDimension.find((d) => d.key === dim.key);
    const confidence = pd ? Math.round(pd.confidence * 100) : 50;
    const hitPoleId = pd?.poleId ?? pole0.id;
    const hitPoleLabel = hitPoleId === pole0.id ? pole0.label : pole1.label;

    indicator.push({ name: `${dim.label}\n${hitPoleLabel}`, max: 100 });
    value.push(confidence);
  }

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      confine: true,
      valueFormatter: (v: unknown) => `${v}%`,
    },
    radar: {
      indicator,
      // 严格居中 + 60% 半径：4 轴正方形布局下标签四周等距，不会贴边/错位。
      radius: '60%',
      center: ['50%', '50%'],
      axisName: {
        fontSize: 12,
        color: '#e5e5e5',
        padding: [4, 6],
        // 换行后的轴名（维度名 + 命中极）居中对齐，视觉更整齐。
        lineHeight: 16,
      },
      splitNumber: 4,
      splitLine: { lineStyle: { color: '#3a3a3a' } },
      splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.04)'] } },
      axisLine: { lineStyle: { color: '#4a4a4a' } },
    },
    series: [
      {
        type: 'radar',
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { color: '#ffffff', width: 2 },
        itemStyle: { color: '#ffffff' },
        areaStyle: { color: 'rgba(255,255,255,0.22)' },
        emphasis: {
          lineStyle: { width: 3 },
          areaStyle: { color: 'rgba(255,255,255,0.35)' },
        },
        data: [{ value, name: '倾向' }],
      },
    ],
  };
}
