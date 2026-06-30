/**
 * 应用根组件：按 phase 路由三种视图。
 *
 * 阶段三状态机：
 *   phase === 'answering'  → 顶栏进度条 + QuizCard（一题一页 + 卡片切换动效）
 *   phase === 'transition'  → TransitionOverlay（情景段→非情景段的中场提示）
 *   phase === 'finished'   → ResultView（4 字母结果 + 置信度条）
 *
 * 初始化在挂载时执行一次（读 JSON → 构建队列 → 置先验）。
 */
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuizStore } from './store/quizStore';
import QuizCard from './components/QuizCard';
import TransitionOverlay from './components/TransitionOverlay';
import ResultPage from './components/ResultPage';
import { overlayTransition } from './components/motion';

export default function App() {
  const status = useQuizStore((s) => s.status);
  const error = useQuizStore((s) => s.error);
  const phase = useQuizStore((s) => s.phase);
  const queue = useQuizStore((s) => s.queue);
  const currentIndex = useQuizStore((s) => s.currentIndex);
  const scenarioCount = useQuizStore((s) => s.scenarioCount);
  const initQuiz = useQuizStore((s) => s.initQuiz);

  useEffect(() => {
    void initQuiz();
  }, [initQuiz]);

  // 加载/错误态。
  if (status === 'idle' || status === 'loading') {
    return <FullPage>加载题库…</FullPage>;
  }
  if (status === 'error') {
    return <FullPage>初始化失败：{error}</FullPage>;
  }

  // 结算态。
  if (phase === 'finished') {
    return (
      <Shell>
        <ResultPage />
      </Shell>
    );
  }

  // 过渡提示态：情景段→非情景段。
  if (phase === 'transition') {
    return (
      <Shell>
        <AnimatePresence mode="wait">
          <motion.div
            key="transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={overlayTransition}
            className="flex w-full items-center justify-center"
          >
            <TransitionOverlay />
          </motion.div>
        </AnimatePresence>
      </Shell>
    );
  }

  // 答题态。
  const total = queue.length || 1;
  const progress = Math.min(currentIndex / total, 1) * 100;

  return (
    <Shell>
      <div className="flex w-full max-w-xl flex-col gap-8">
        {/* 进度条 */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-xs text-white/50">
            <span>
              {currentIndex < scenarioCount ? '情景模拟' : '直觉问答'}
            </span>
            <span>
              {Math.min(currentIndex, total)} / {total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-white/70"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>

        {/* 一题一页卡片 */}
        <QuizCard />
      </div>
    </Shell>
  );
}

/** 全局暗色背景容器。 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center overflow-hidden bg-neutral-950 px-6 py-12 text-neutral-100">
      {children}
    </div>
  );
}

function FullPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-neutral-950 p-6 text-neutral-100">
      {children}
    </div>
  );
}
