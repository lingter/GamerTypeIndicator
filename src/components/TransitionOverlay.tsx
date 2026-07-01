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
