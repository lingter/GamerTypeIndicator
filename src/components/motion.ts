/**
 * 动画参数集中定义：阶段三的卡片切换、过渡页、结果页都从这里取 variants。
 *
 * 设计意图：
 * - “一题一页”切换 = AnimatePresence 旧卡片向左滑出 + 新卡片从右滑入并淡入。
 *   direction 用 +1（前进）：旧卡 exit 向左、新卡 enter 从右。
 *   （本期无“后退”需求；如后续加回退，把 direction 改 -1 即左右镜像即可。）
 * - 时长 0.32s 是“能感知但不拖沓”的经验值；easing 用 cubic-bezier 模拟轻微惯性。
 */
import type { Variants } from 'framer-motion';

/** 缓动：略带减速的 easeOut，给滑入一个“落位”感。 */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** 卡片横向偏移量（px）。 */
const SLIDE_DISTANCE = 64;

/**
 * 卡片切换 variants。
 * - enter: 起始位在右侧 +透明，进场后归位 +不透明。
 * - center: 稳定态。
 * - exit:   向左滑出 +淡出。
 *
 * 用 currentIndex 作为 motion key，AnimatePresence 检测到 key 变化即触发 exit↔enter。
 */
export const cardVariants: Variants = {
  enter: (dir: number) => ({
    x: dir * SLIDE_DISTANCE,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x: -dir * SLIDE_DISTANCE,
    opacity: 0,
  }),
};

/** 卡片过渡时长与缓动（enter/exit 共用）。 */
export const cardTransition = {
  duration: 0.32,
  ease: EASE_OUT,
};

/** 过渡提示页 variants：从下方淡入抬升，弱于卡片切换以区分层级。 */
export const overlayVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -16 },
};

export const overlayTransition = {
  duration: 0.4,
  ease: EASE_OUT,
};

/** 结果页 variants：整体淡入 + 轻微缩放回弹。 */
export const resultVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1 },
};

export const resultTransition = {
  duration: 0.5,
  ease: EASE_OUT,
};
