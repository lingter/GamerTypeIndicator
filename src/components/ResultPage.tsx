/**
 * 结果页 ResultPage（阶段四）。
 *
 * 分两层：
 * 1) 海报捕获区 (posterRef)：所有视觉元素用「内联 hex/rgb 色」渲染 ——
 *    因为 Tailwind v4 默认 oklch() 色彩，html2canvas 解析 oklch 会抛
 *    "Attempting to parse an unsupported color function"。
 *    布局相关 class（flex / p-4 / rounded / grid 等）不含颜色，可正常使用；
 *    凡是带颜色的属性一律走 style 内联，保证海报截图万无一失。
 * 2) 交互区（生成按钮 + 预览弹窗）：用 Tailwind 颜色类无妨，不参与截图。
 *
 * 内容排版（对应需求）：
 * - 性格 code（4 字母）+ 游戏角色图占位 + 判词 title + 描述 description
 * - 雷达图（ECharts，展示四维两极概率）
 * - traits 特征 / recommendations 推荐
 * - 底部「生成专属成分报告」按钮 → html2canvas 截图 → 预览弹窗（长按保存 / 下载）
 */
import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useQuizStore } from '../store/quizStore';
import RadarChart from './RadarChart';
import { usePoster } from './usePoster';
import { resultVariants, resultTransition } from './motion';

// 海报配色（内联用，全部 hex/rgb，规避 oklch）。
const C = {
  bg: '#0a0a0a',
  card: '#161616',
  cardBorder: '#2a2a2a',
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.62)',
  textDim: 'rgba(255,255,255,0.38)',
  accent: '#ffffff',
  divider: 'rgba(255,255,255,0.08)',
  chipBg: 'rgba(255,255,255,0.06)',
  chipBorder: 'rgba(255,255,255,0.14)',
  portraitBg: 'rgba(255,255,255,0.04)',
  portraitBorder: 'rgba(255,255,255,0.18)',
  nameTagBg: 'rgba(0,0,0,0.55)',
};

export default function ResultPage() {
  const finalResult = useQuizStore((s) => s.finalResult);
  const dimensions = useQuizStore((s) => s.dimensions);
  const reset = useQuizStore((s) => s.reset);
  const initQuiz = useQuizStore((s) => s.initQuiz);

  const posterRef = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [portraitError, setPortraitError] = useState(false);
  const poster = usePoster();

  if (!finalResult) return null;

  const onGenerate = async () => {
    if (!posterRef.current) return;
    const url = await poster.capture(posterRef.current);
    if (url) setShowPreview(true);
  };

  const onRestart = () => {
    reset();
    void initQuiz();
  };

  // 角色立绘路径：public/characters/{code}.svg，base:'./' 下 dev 与构建产物均同源可加载。
  const portraitSrc = `${import.meta.env.BASE_URL}characters/${finalResult.code}.png`;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      {/* —— 海报捕获区（全内联色） —— */}
      <motion.div
        variants={resultVariants}
        initial="hidden"
        animate="visible"
        transition={resultTransition}
        ref={posterRef}
        style={{
          backgroundColor: C.bg,
          color: C.text,
          width: '100%',
          // 海报固定宽度，移动端随容器、桌面端上限 448px。
          maxWidth: '448px',
          borderRadius: '20px',
          padding: '28px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          border: `1px solid ${C.cardBorder}`,
        }}
      >
        {/* 顶部标识 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', letterSpacing: '0.25em', color: C.textDim }}>
            GamerTypeIndicator
          </span>
          <span style={{ fontSize: '12px', color: C.textDim }}>
            游戏性格评测
          </span>
        </div>

        {/* code + 判词 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '52px', fontWeight: 700, letterSpacing: '0.18em', lineHeight: 1, color: C.accent }}>
            {finalResult.code}
          </div>
          <div style={{ fontSize: '22px', fontWeight: 600, color: C.text }}>
            {finalResult.profile?.title ?? '结果文案待补充'}
          </div>
        </div>

        {/* 角色立绘 + 角色名 */}
        <div
          style={{
            width: '100%',
            aspectRatio: '4 / 3',
            borderRadius: '14px',
            overflow: 'hidden',
            position: 'relative',
            backgroundColor: C.portraitBg,
            border: `1px solid ${C.portraitBorder}`,
          }}
        >
          {portraitError ? (
            // 图片加载失败兜底：回退到 code 文字，保证海报不崩坏。
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: C.textDim,
                fontSize: '16px',
                letterSpacing: '0.2em',
              }}
            >
              {finalResult.code}
            </div>
          ) : (
            <img
              src={portraitSrc}
              alt={`${finalResult.code} 角色立绘`}
              onError={() => setPortraitError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
          {/* 角色名标签：底部半透明条，内联色 */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: '8px 14px',
              backgroundColor: C.nameTagBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 400, fontStyle: 'italic', color: '#d3d3d3' }}>
              {finalResult.profile?.photo ?? '未知角色'}
            </span>
          </div>
        </div>

        {/* 判词/描述 */}
        <p style={{ fontSize: '14px', lineHeight: 1.7, color: C.textMuted, textAlign: 'center', margin: 0 }}>
          {finalResult.profile?.description ?? '（结果描述文案后续阶段补充）'}
        </p>

        {/* 雷达图 */}
        <div style={{ backgroundColor: C.card, borderRadius: '14px', padding: '8px 4px 4px' }}>
          <RadarChart dimensions={dimensions} result={finalResult} />
        </div>

        {/* 四维命中概览（内联色） */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {finalResult.perDimension.map((d) => {
            const dim = dimensions.find((x) => x.key === d.key);
            const pct = Math.round(d.confidence * 100);
            return (
              <div key={d.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: C.textMuted }}>
                  <span>{dim?.label ?? d.key}</span>
                  <span>极 {d.poleId} · {pct}%</span>
                </div>
                <div style={{ height: '6px', width: '100%', borderRadius: '3px', backgroundColor: C.chipBg, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, backgroundColor: C.accent, borderRadius: '3px' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* 推荐游戏（新增） */}
        {finalResult.profile?.recommend && finalResult.profile.recommend.length > 0 && (
          <Block
            label="推荐游戏"
            items={finalResult.profile.recommend}
            muted={C.textMuted}
            dim={C.textDim}
            chipBg={C.chipBg}
            chipBorder={C.chipBorder}
          />
        )}

        {/* 底部水印 */}
        <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: '10px', textAlign: 'center', fontSize: '11px', color: C.textDim }}>
          GamerTypeIndicator · 你的游戏人格成分报告
        </div>
      </motion.div>

      {/* —— 交互区（Tailwind 颜色类，不参与截图） —— */}
      <div className="flex w-full flex-col gap-3">
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          onClick={onGenerate}
          disabled={poster.state === 'capturing'}
          className="rounded-full bg-white px-6 py-3.5 text-sm font-medium text-neutral-900 transition-colors duration-200 hover:bg-white/90 disabled:opacity-50"
        >
          {poster.state === 'capturing' ? '生成中…' : '生成专属成分报告'}
        </motion.button>
        <button
          type="button"
          onClick={onRestart}
          className="rounded-full border border-white/20 px-6 py-3 text-sm text-white/80 transition-colors duration-200 hover:bg-white/5"
        >
          再测一次
        </button>
        {poster.state === 'error' && (
          <p className="text-center text-xs text-red-400">海报生成失败：{poster.error}</p>
        )}
      </div>

      {/* 海报预览弹窗 */}
      {showPreview && poster.dataUrl && (
        <PreviewDialog
          dataUrl={poster.dataUrl}
          onClose={() => {
            setShowPreview(false);
            poster.reset();
          }}
          onDownload={() => poster.download(`gamebti-${finalResult.code}.png`)}
        />
      )}
    </div>
  );
}

/** traits / recommendations 小区块（颜色全内联）。 */
function Block(props: {
  label: string;
  items: string[];
  muted: string;
  dim: string;
  chipBg: string;
  chipBorder: string;
}) {
  return (
    <div>
      <div style={{ fontSize: '12px', color: props.dim, marginBottom: '6px' }}>{props.label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {props.items.map((t, i) => (
          <span
            key={i}
            style={{
              fontSize: '12px',
              color: props.muted,
              backgroundColor: props.chipBg,
              border: `1px solid ${props.chipBorder}`,
              borderRadius: '999px',
              padding: '4px 10px',
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * 海报预览弹窗：展示生成的图片 + 下载 / 关闭。
 * - 移动端：图片宽度 100%，弹窗纵向铺满；提示“长按图片保存”。
 * - 桌面端：居中卡片，提供下载按钮。
 */
function PreviewDialog(props: { dataUrl: string; onClose: () => void; onDownload: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={props.onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-neutral-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={props.dataUrl}
          alt="GameBTI 成分报告"
          className="max-h-[70vh] w-auto rounded-lg object-contain"
        />
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-sm text-white/80">长按图片可保存到相册</p>
          <p className="text-xs text-white/40">或点击下方按钮下载</p>
        </div>
        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={props.onDownload}
            className="flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-neutral-900"
          >
            下载图片
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-full border border-white/20 px-4 py-2.5 text-sm text-white/80"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
