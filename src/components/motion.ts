import type { Variants } from 'framer-motion';

/** 缓动：略带减速的 easeOut，给滑入一个“落位”感 */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** 卡片横向偏移量（px） */
const SLIDE_DISTANCE = 64;

/** 卡片切换 variants */
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
