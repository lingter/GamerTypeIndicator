/**
 * 过渡提示页：情景段答完（第 28 题）后、非情景段首题展示前的“中场提示”。
 *
 * 触发条件（store 内判定）：
 *   - queue 为 grouped 策略、情景题满 28 时，handleAnswer 将 currentIndex 推到 28
 *     且仍有后续非情景题 ⇒ phase 切到 'transition'。
 *   - 占位小题库（<28 情景）不会进入此页。
 *
 * 交互：用户点“继续” → continueAfterTransition() → phase 回 'answering'，
 * App 随即渲染 queue[28]（非情景段首题）。
 *
 * 视觉：极简文案 + 单按钮；用 overlayVariants 做淡入抬升，与卡片切换区分层级。
 */
import { motion } from 'framer-motion';
import { useQuizStore } from '../store/quizStore';
import { overlayVariants, overlayTransition } from './motion';

export default function TransitionOverlay() {
  const continueAfterTransition = useQuizStore((s) => s.continueAfterTransition);
  const scenarioCount = useQuizStore((s) => s.scenarioCount);

  return (
    <motion.div
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={overlayTransition}
      className="flex w-full max-w-md flex-col items-center gap-8 text-center"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">
          Phase Complete
        </p>
        <h2 className="text-3xl font-semibold text-white">
          情景模拟结束
        </h2>
        <p className="text-lg text-white/70">
          已完成 {scenarioCount} 道情境题。
        </p>
        <p className="mt-2 text-base text-white/60">
          接下来是直觉问答 —— 抛开具体场景，
          <br />
          凭直觉回答关于你本真的偏好。
        </p>
      </div>

      <motion.button
        type="button"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        onClick={continueAfterTransition}
        className="rounded-full bg-white px-8 py-3 text-base font-medium text-neutral-900 transition-colors duration-200 hover:bg-white/90"
      >
        继续
      </motion.button>
    </motion.div>
  );
}
