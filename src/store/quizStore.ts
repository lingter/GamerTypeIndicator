/**
 * 全局状态管理（Zustand）。
 *
 * 分层契约：
 *   数据层 (questions.json / dimensions.json / results.json)
 *     → 引擎层 (engine/queue.ts + engine/bayesian.ts)   ← 第一阶段，纯函数
 *       → store 层 (本文件)                              ← 第一阶段之上的薄封装
 *         → UI 层 (App.tsx 等 React 组件)
 *
 * store 的职责仅限：
 *   1. 持有「对 UI 有意义的派生状态」——队列、进度、四维先验、终局结果。
 *   2. 把 UI 事件转译成对引擎纯函数的调用，再把结果写回自身。
 * store 不实现任何贝叶斯运算——所有概率更新都委托给 engine/bayesian.ts，
 * 保证引擎可独立测试、可被 CLI/其它前端复用。
 *
 * 字段语义与第一阶段一致：
 *   - prob0：单维度属于 poles[0] 的概率；P(poles[0])=prob0, P(poles[1])=1-prob0。
 *   - 初始先验 0.5（无信息先验），由 createInitialState 设定。
 */
import { create } from 'zustand';
import type {
  AssessmentState,
  Dimension,
  DimensionKey,
  Question,
  ResultProfile,
} from '../types';
import {
  applyAnswer,
  buildQueue,
  computeVerdict,
  createInitialState,
  DEFAULT_DISTRIBUTION,
  DEFAULT_STRATEGY,
  type QuestionDistribution,
  type QueueStrategy,
} from '../engine';

/**
 * 终局结果视图：把引擎的 FinalVerdict 与 results.json 的文案合并为一个对象，
 * 供 UI 一次性渲染结果页。
 */
export interface QuizResult {
  /** 4 字母结果码（各维度命中极 id 拼接），如 "BAAA"。 */
  code: string;
  /** 命中的结果档案；查表未命中时为 null（UI 可走兜底文案）。 */
  profile: ResultProfile | null;
  /** 每维度的命中极与置信度，用于结果页倾向条。 */
  perDimension: Array<{
    key: DimensionKey;
    /** 命中极 id。 */
    poleId: string;
    /** 用户属于命中极的概率（0.5~1）。 */
    confidence: number;
  }>;
}

/**
 * 答题流程的阶段。
 * - 'answering'  正常答题中。
 * - 'transition' 情景段答完的过渡提示页（用户点“继续”后回到 'answering'）。
 * - 'finished'   全部答完，展示结果。
 *
 * 仅在分布策略为 grouped 且题库满 28 情景题时，'transition' 才会触发；
 * 占位小题库（<28 情景）下不会进入过渡页，保证阶段二行为不变。
 */
export type QuizPhase = 'answering' | 'transition' | 'finished';

/** 数据加载适配器：生产用 fetch，测试可注入 mock。 */
export interface DataProvider {
  readDimensions(): Promise<Dimension[]>;
  readQuestions(): Promise<Question[]>;
  readResults(): Promise<ResultProfile[]>;
}

/** store 的对外形态：状态 + 三个 Action（initQuiz / handleAnswer / getFinalResult）。 */
export interface QuizStore {
  /* —— 状态 —— */
  /** 维度元信息（来自 dimensions.json）。 */
  dimensions: Dimension[];
  /** 最终答题队列（40 题，由引擎 shuffle 拼接而来）。 */
  queue: Question[];
  /** 当前题目下标，对应 queue[currentIndex]；答完即等于 queue.length。 */
  currentIndex: number;
  /** 四维当前先验/后验概率：key=维度, value 属于 poles[0] 的概率。 */
  priors: Record<DimensionKey, number>;
  /** 引擎内部完整状态（保留引用以复用引擎 API，不直接渲染）。 */
  engineState: AssessmentState | null;
  /** 终局结果；未完成时为 null。 */
  finalResult: QuizResult | null;
  /** 初始化状态机：'idle' | 'loading' | 'ready' | 'error'。 */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** 初始化错误信息（status==='error' 时有值）。 */
  error: string | null;
  /** 当前答题流程阶段（answering / transition / finished）。 */
  phase: QuizPhase;
  /** 阶段三过渡提示页的下标阈值：情景题数量。currentIndex 抵达此值即暂停。 */
  scenarioCount: number;

  /* —— Actions —— */
  /** 初始化题库与概率：加载数据 → 构建 40 题队列 → 各维度先验置 0.5。 */
  initQuiz: (
    provider?: DataProvider,
    /** 题量分布；默认 28 情景 + 12 非情景。题库未补齐时可传实际分布做冒烟。 */
    distribution?: QuestionDistribution,
  ) => Promise<void>;
  /** 提交一题选择：调用贝叶斯更新 + currentIndex+1；情景段末自动进过渡页，末题后自动结算。 */
  handleAnswer: (optionIndex: 0 | 1) => void;
  /** 结算：比较四维概率，输出 4 字母结果 + 命中文案。 */
  getFinalResult: () => QuizResult | null;
  /** 过渡页“继续”：从过渡态回到 answering，展示非情景段第一题。 */
  continueAfterTransition: () => void;
  /** 重置回未开始状态（便于「再测一次」）。 */
  reset: () => void;
}

/**
 * 默认数据加载器：从 Vite 打包入口读 JSON。
 * - import json 依赖 tsconfig.resolveJsonModule（已开）+ Vite 原生支持。
 * - 生产构建会把 JSON 内联进 chunk，无运行时网络请求。
 */
export const defaultProvider: DataProvider = {
  async readDimensions() {
    const m = await import('../config/dimensions.json');
    return m.default.dimensions as Dimension[];
  },
  async readQuestions() {
    const m = await import('../data/questions.json');
    return m.default as Question[];
  },
  async readResults() {
    const m = await import('../data/results.json');
    return m.default.profiles as ResultProfile[];
  },
};

export const useQuizStore = create<QuizStore>((set, get) => ({
  dimensions: [],
  queue: [],
  currentIndex: 0,
  priors: { D1: 0.5, D2: 0.5, D3: 0.5, D4: 0.5 },
  engineState: null,
  finalResult: null,
  status: 'idle',
  error: null,
  phase: 'answering',
  scenarioCount: 0,

  /* ---------------- initQuiz ---------------- */
  async initQuiz(provider = defaultProvider, distribution) {
    set({ status: 'loading', error: null });
    try {
      const [dimensions, questions, results] = await Promise.all([
        provider.readDimensions(),
        provider.readQuestions(),
        provider.readResults(),
      ]);

      // 引擎：构建 40 题队列。
      // - 题库补齐前（当前仅 2 题占位）按实际数量构造分布，跳过 28+12 严格校验；
      //   题库接入后直接用 DEFAULT_DISTRIBUTION，引擎会强校验 28 情景 + 12 非情景。
      const dist: QuestionDistribution =
        distribution ??
        (questions.length >= DEFAULT_DISTRIBUTION.scenario + DEFAULT_DISTRIBUTION.plain
          ? DEFAULT_DISTRIBUTION
          : {
              scenario: questions.filter((q) => q.type === 'scenario').length,
              plain: questions.filter((q) => q.type === 'plain').length,
            });

      const queue = buildQueue(questions, dist, DEFAULT_STRATEGY);

      // 引擎：初始化状态，prob0 全 0.5。
      const engineState = createInitialState(dimensions, queue);
      const priors: Record<DimensionKey, number> = {
        D1: engineState.states.D1.prob0,
        D2: engineState.states.D2.prob0,
        D3: engineState.states.D3.prob0,
        D4: engineState.states.D4.prob0,
      };

      // 把 results 也挂到 store 闭包内（通过模块级缓存供 getFinalResult 用）。
      cachedResults = results;

      set({
        dimensions,
        queue,
        currentIndex: 0,
        priors,
        engineState,
        finalResult: null,
        status: 'ready',
        error: null,
        phase: 'answering',
        scenarioCount: dist.scenario,
      });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  /* ---------------- handleAnswer ---------------- */
  handleAnswer(optionIndex) {
    const { engineState, queue, currentIndex, scenarioCount } = get();
    if (!engineState) throw new Error('[store] 未初始化，请先 initQuiz()');
    if (currentIndex >= queue.length) return; // 越界保护

    const question = queue[currentIndex]!;

    // 委托引擎做贝叶斯更新：上一题后验 → 本题先验 → 本题后验，
    // 引擎内部会维护 evidence、answers 轨迹并推进 cursor。
    applyAnswer(engineState, question, optionIndex);

    // 把引擎的最新 prob0 同步到 store 的 priors（UI 订阅用）。
    const priors: Record<DimensionKey, number> = {
      D1: engineState.states.D1.prob0,
      D2: engineState.states.D2.prob0,
      D3: engineState.states.D3.prob0,
      D4: engineState.states.D4.prob0,
    };

    const nextIndex = currentIndex + 1;
    const isLast = nextIndex >= queue.length;

    // 分段过渡逻辑（仅 grouped 策略 + 完整 28 情景题库时触发）：
    // - nextIndex 恰好等于情景题数量 ⇒ 情景段刚结束，暂停进入过渡提示页。
    // - 占位小题库（scenarioCount < nextIndex，即无后续非情景题）不触发。
    const atTransitionBoundary =
      scenarioCount > 0 && nextIndex === scenarioCount && !isLast;

    if (isLast) {
      // 最后一题答完自动结算，UI 无需显式调 getFinalResult。
      const finalResult = computeFinal(engineState);
      set({ priors, currentIndex: nextIndex, finalResult, phase: 'finished' });
      return;
    }
    if (atTransitionBoundary) {
      // 不前进到下一题的视觉渲染，由过渡页接管；currentIndex 仍 +1，
      // continueAfterTransition 时直接展示 queue[nextIndex]（即非情景段首题）。
      set({ priors, currentIndex: nextIndex, phase: 'transition' });
      return;
    }
    set({ priors, currentIndex: nextIndex, phase: 'answering' });
  },

  /* ---------------- continueAfterTransition ---------------- */
  continueAfterTransition() {
    // 仅当处于过渡态时有效；切回 answering，下一帧即渲染非情景段首题。
    if (get().phase !== 'transition') return;
    set({ phase: 'answering' });
  },

  /* ---------------- getFinalResult ---------------- */
  getFinalResult() {
    const { engineState } = get();
    if (!engineState) return null;
    if (get().finalResult) return get().finalResult;
    const result = computeFinal(engineState);
    set({ finalResult: result, phase: 'finished' });
    return result;
  },

  /* ---------------- reset ---------------- */
  reset() {
    cachedResults = null;
    set({
      dimensions: [],
      queue: [],
      currentIndex: 0,
      priors: { D1: 0.5, D2: 0.5, D3: 0.5, D4: 0.5 },
      engineState: null,
      finalResult: null,
      status: 'idle',
      error: null,
      phase: 'answering',
      scenarioCount: 0,
    });
  },
}));

/* ---------------- 内部工具 ---------------- */

/** results.json 读出的结果缓存，供 computeFinal 查表。 */
let cachedResults: ResultProfile[] | null = null;

/** 调引擎得 verdict，再与 cachedResults 查表，合成 UI 用的 QuizResult。 */
function computeFinal(state: AssessmentState): QuizResult {
  const verdict = computeVerdict(state);
  const profile = cachedResults
    ? cachedResults.find((p) => p.code === verdict.code) ?? null
    : null;
  return {
    code: verdict.code,
    profile,
    perDimension: verdict.perDimension,
  };
}
