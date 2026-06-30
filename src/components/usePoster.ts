/**
 * 海报生成 hook：用 html2canvas 把指定 DOM 节点转成图片。
 *
 * 关键兼容处理：
 * 1. html2canvas 不支持 Tailwind v4 的 oklch() 色彩 —— ResultPage 的海报节点
 *    全程用内联 style 的 hex/rgb 色，不依赖 Tailwind 颜色类（布局类如 flex/p-4 不受影响）。
 * 2. ECharts 是 canvas 渲染。html2canvas 默认会把目标节点内的 canvas 元素一起截图，
 *    这里配置 `foreignObjectRendering: false` 走 DOM 克隆路径，canvas 会以
 *    toDataURL 形式被复制进克隆；如遇个别版本异常，调用方传入 scale 提升清晰度。
 *
 * 移动端适配：
 * - scale 用 devicePixelRatio（DPR），保证视网膜屏海报清晰；上限 3 防止内存爆炸。
 * - 先按节点实际渲染尺寸截图，再做下载，避免用窗口尺寸导致裁剪。
 */
import { useCallback, useState } from 'react';
import type { Options } from 'html2canvas';

// 动态 import html2canvas：减小首屏体积，且仅在用户点“生成报告”时才加载。
type CaptureState = 'idle' | 'capturing' | 'done' | 'error';

export interface UsePosterResult {
  state: CaptureState;
  /** 生成的海报 dataURL（PNG）；state==='done' 时有值。 */
  dataUrl: string | null;
  error: string | null;
  /** 生成海报。target 为要截图的 DOM 节点。 */
  capture: (target: HTMLElement) => Promise<string | null>;
  /** 下载海报到本地。 */
  download: (filename?: string) => void;
  /** 清理（关弹窗、重置状态）。 */
  reset: () => void;
}

export function usePoster(): UsePosterResult {
  const [state, setState] = useState<CaptureState>('idle');
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(async (target: HTMLElement): Promise<string | null> => {
    setState('capturing');
    setError(null);
    try {
      // 先等节点内所有图片加载完成，避免海报里角色立绘截成空白。
      await waitImagesLoaded(target);

      const { default: html2canvas } = await import('html2canvas');
      const dpr = Math.min(window.devicePixelRatio || 1, 3);

      const options: Partial<Options> = {
        // 提升清晰度；移动端 DPR 直接映射为 scale。
        scale: dpr * 1.5,
        // 海报背景统一深色，避免透明背景下出现黑/白边。
        backgroundColor: '#0a0a0a',
        // 走 DOM 克隆路径，确保 canvas(ECharts) 被纳入截图。
        useCORS: true,
        logging: false,
        // 窗口尺寸回退，避免某些环境下 width/height 探测为 0。
        windowWidth: target.offsetWidth,
        windowHeight: target.offsetHeight,
      };

      const canvas = await html2canvas(target, options as Options);
      const url = canvas.toDataURL('image/png');
      setDataUrl(url);
      setState('done');
      return url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setState('error');
      return null;
    }
  }, []);

  const download = useCallback(
    (filename = 'gamebti-report.png') => {
      if (!dataUrl) return;
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [dataUrl],
  );

  const reset = useCallback(() => {
    setState('idle');
    setDataUrl(null);
    setError(null);
  }, []);

  return { state, dataUrl, error, capture, download, reset };
}

/**
 * 等待节点内所有 <img> 加载完成（complete 且 naturalWidth>0）。
 * - 已加载的立即 resolve；未加载的挂 onload/onerror，超时 2s 兜底放行
 *   （避免某张图卡住导致海报永远生成不出来）。
 * - onerror 也算“结束”，让海报走图片 onError 的兜底文字而非一直等。
 */
function waitImagesLoaded(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  if (imgs.length === 0) return Promise.resolve();
  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve();
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          // 超时兜底：2s 后强制放行，不阻塞海报生成。
          window.setTimeout(done, 2000);
        }),
    ),
  ).then(() => undefined);
}
