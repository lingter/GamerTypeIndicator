/**
 * 答题主卡片：一题一页。
 *
 * 渲染职责（对应需求“根据 currentIndex 读取当前题，渲染题目文本与双选项”）：
 *   1. 从 store 取 queue[currentIndex]，渲染 scenario 背景 + prompt + 双 option 按钮。
 *   2. 点击 option → handleAnswer(i)；store 推进 currentIndex 后，motion key 变化，
 *      由 AnimatePresence 触发“旧卡左滑出 + 新卡右滑入淡入”。
 *
 * 动画说明：
 *   - 用 currentIndex 作 motion.div 的 key；key 改变时 AnimatePresence 让旧节点 exit、新节点 enter。
 *   - custom={1} 传给 variants，表示“前进”方向（左出右入）。
 *   - mode="popLayout"：旧卡退出时不占位，新卡可立即进场，避免双卡碰撞的跳动。
 *   - 选项按钮单独有 hover/tap 微动效（scale），与卡片层切换解耦。
 *
 * 防误触：切换动画进行中（0.32s）禁用按钮，避免连点跳题。用 ref + 状态锁实现。
 */
import { useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuizStore } from '../store/quizStore';
import { cardVariants, cardTransition } from './motion';

export default function QuizCard() {
  const queue = useQuizStore((s) => s.queue);
  const currentIndex = useQuizStore((s) => s.currentIndex);
  const dimensions = useQuizStore((s) => s.dimensions);
  const handleAnswer = useQuizStore((s) => s.handleAnswer);

  // 动画进行中的锁，防止用户在卡片切换期间连点选项跳题。
  const [animating, setAnimating] = useState(false);
  const lockTimer = useRef<number | null>(null);

  const lock = useCallback(() => {
    setAnimating(true);
    if (lockTimer.current) window.clearTimeout(lockTimer.current);
    // 锁定时长略大于动画时长，确保 exit 完全结束后再放行。
    lockTimer.current = window.setTimeout(() => setAnimating(false), 360);
  }, []);

  const question = queue[currentIndex];
  if (!question) return null;

  const dim = dimensions.find((d) => d.key === question.dimension);
  const dimLabel = dim?.label ?? question.dimension;
  // 仅当处于情景段时显示“情景模拟”标签；非情景题段显示“直觉问答”。
  const phaseTag = question.type === 'scenario' ? '情景模拟' : '直觉问答';

  const onPick = (i: 0 | 1) => {
    if (animating) return;
    lock();
    handleAnswer(i);
  };

  return (
    <div className="relative w-full">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={currentIndex}
          custom={1}
          variants={cardVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={cardTransition}
          className="flex w-full flex-col gap-6"
        >
          {/* 维度标签 + 阶段标签 */}
          <div className="flex items-center gap-2 text-xs tracking-wide opacity-60">
            <span className="rounded-full border border-white/15 px-2 py-0.5">
              {dimLabel}
            </span>
            <span className="rounded-full border border-white/15 px-2 py-0.5">
              {phaseTag}
            </span>
          </div>

          {/* 情境背景（仅情景题展示） */}
          {question.type === 'scenario' && question.scenario && (
            <p className="rounded-lg bg-white/5 p-4 text-sm leading-relaxed text-white/70">
              {question.scenario}
            </p>
          )}

          {/* 题干 */}
          <h2 className="text-2xl font-semibold leading-snug text-white">
            {question.prompt}
          </h2>

          {/* 双选项 */}
          <div className="mt-2 flex flex-col gap-3">
            {question.options.map((opt, i) => (
              <motion.button
                key={i}
                type="button"
                disabled={animating}
                whileHover={{ scale: animating ? 1 : 1.01 }}
                whileTap={{ scale: animating ? 1 : 0.985 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                onClick={() => onPick(i as 0 | 1)}
                className="rounded-xl border border-white/15 bg-white/[0.03] p-5 text-left text-lg text-white/90 transition-colors duration-200 hover:border-white/40 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {opt.text}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
