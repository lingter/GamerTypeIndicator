/**
 * ECharts 雷达图：展示四维度的倾向置信度。
 *
 * 设计（4 轴方案，已修复旧 8 轴错位问题）：
 * - 每个维度一条轴，轴名用维度 label（战斗/节奏/社交/风险），共 4 轴，呈正方形对角分布。
 * - 每条轴的值 = 该维度命中极的置信度（0~100）。
 *   雷达形状越“满”说明各维倾向越强；形状偏向哪一角，对应维度越极致。
 * - 旧版用 8 轴（每维度两极各一轴）会在小容器里挤掉轴名且图形错位，
 *   4 轴方案是标准 MBTI 雷达，标签与图形永远居中对齐，不会错位。
 *
 * html2canvas 兼容：
 * - Tailwind v4 默认 oklch() 色彩空间，html2canvas 无法解析会抛错。
 *   ECharts 自身用 Canvas 渲染，但被海报截图时仍以 canvas 快照处理；
 *   所有 color 配置统一用 #hex / rgb()，避开 oklch。
 *
 * 移动端适配：
 * - 容器用 100% 宽 + 固定比例高度；ECharts 自适应 resize（含 ResizeObserver）。
 */
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

/**
 * 构造 ECharts option（4 轴方案）。
 *
 * 轴布局（indicator）：4 个维度各一条轴，轴名 = 维度 label，max 100。
 *   4 轴默认在 0°/90°/180°/270° 正交分布，呈正方形。
 *
 * 数据（series.data[0].value）：每维取命中极置信度（0~100）。
 *
 * 配色全部 hex/rgb，规避 oklch：
 *   - 命中区填充 rgba(255,255,255,0.22)，描边 #ffffff，在深色海报上醒目。
 *   - 轴线/分割线用低对比灰，避免喧宾夺主。
 *
 * 关键防错位参数：
 *   - radius: '60%' + center: ['50%', '50%']：严格居中，给四周标签留出空间。
 *   - axisName.formatter：轴名后附置信度百分比，信息量更高且不依赖 tooltip。
 *   - axisName 颜色/字号固定，padding 避免标签压到分割圈。
 */
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
