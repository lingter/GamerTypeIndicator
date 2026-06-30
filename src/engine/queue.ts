/**
 * 队列构建：读取题目 → 拆分情景/非情景 → 各自洗牌 → 拼成指定长度的最终队列。
 *
 * 模块化边界：本模块只负责“出题顺序”，不碰概率计算（见 bayesian.ts），
 * 也不碰 DOM/框架。可被任意前端/CLI/测试复用。
 */
import type { DimensionKey, Question, QuestionType } from '../types/schema';

/** 默认似然：题目 option 没写 likelihood 时使用。区分度 0.8 是经验值。 */
export const DEFAULT_LIKELIHOOD = 0.8;

/**
 * 队列拼接策略。
 * - grouped：先放全部情景题，再放全部非情景题；段内各自洗牌。
 *   👉 用于阶段三“情景题答完(第28题)→过渡提示→非情景题”的分段体验，
 *      保证情景题集中在 0..scenario-1。
 * - interleaved：两段合并后再整体打散一次，避免连续同类型造成疲劳。
 *   向后兼容保留；如未来想做“类型穿插”体验可切回此策略。
 */
export type QueueStrategy = 'grouped' | 'interleaved';

/* ------------------------------------------------------------------ */
/* 内部工具                                                            */
/* ------------------------------------------------------------------ */

/**
 * Fisher–Yates 洗牌（in-place 的纯函数副本版本）。
 * - 不直接 mutate 入参，返回一个新数组，便于函数式调用与测试。
 * - 提供 rng 注入点：默认 Math.random；测试时可传入确定性 PRNG 做快照。
 */
function shuffle<T>(input: readonly T[], rng: () => number = Math.random): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j] as T;
    arr[j] = tmp as T;
  }
  return arr;
}

/** 按 type 过滤，返回子集（不改动原数组顺序，洗牌在下一步做）。 */
function partitionByType(questions: readonly Question[]) {
  const scenario: Question[] = [];
  const plain: Question[] = [];
  for (const q of questions) {
    if (q.type === 'scenario') scenario.push(q);
    else plain.push(q);
  }
  return { scenario, plain };
}

/** 断言题目分布满足约定，违反时抛错 —— 早失败比静默截断好。 */
function assertDistribution(
  scenarioCount: number,
  plainCount: number,
  expected: QuestionDistribution,
) {
  if (scenarioCount !== expected.scenario) {
    throw new Error(
      `[queue] 情景题数量不匹配：期望 ${expected.scenario}，实际 ${scenarioCount}`,
    );
  }
  if (plainCount !== expected.plain) {
    throw new Error(
      `[queue] 非情景题数量不匹配：期望 ${expected.plain}，实际 ${plainCount}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 公共 API                                                            */
/* ------------------------------------------------------------------ */

/** 题目分布契约：40 题 = 28 情景 + 12 非情景。 */
export interface QuestionDistribution {
  /** 情景题数量。 */
  scenario: number;
  /** 非情景题数量。 */
  plain: number;
}

/** 默认分布。 */
export const DEFAULT_DISTRIBUTION: QuestionDistribution = {
  scenario: 28,
  plain: 12,
};

/** 默认队列策略：分段（情景题在前，适配阶段三的过渡提示切分点）。 */
export const DEFAULT_STRATEGY: QueueStrategy = 'grouped';

/**
 * 构建完整 40 题队列的核心入口。
 *
 * 步骤（对应需求三点）：
 * 1. 读取并分离情景题与非情景题（partitionByType）。
 * 2. 两组各自独立洗牌（shuffle），保证同一维度内的题目顺序随机，
 *    但情景题与非情景题的相对顺序由第 3 步决定。
 * 3. 拼接：默认采用“交错穿插”策略——把洗牌后的情景题在前、非情景题在后，
 *    再整体打散一次，避免一整段同类型题目造成答题疲劳。
 *    （如需“情景题优先”或“分组”等其它策略，可在此扩展。）
 *
 * @param questions 原始题目全集（含情景与非情景）。
 * @param distribution 期望的题量分布，默认 28+12。
 * @param strategy 拼接策略，默认 'grouped'（情景段在前）。
 * @param rng 注入式随机源，默认 Math.random；测试可传确定性函数。
 * @returns 最终答题队列，长度 = scenario + plain。
 */
export function buildQueue(
  questions: readonly Question[],
  distribution: QuestionDistribution = DEFAULT_DISTRIBUTION,
  strategy: QueueStrategy = DEFAULT_STRATEGY,
  rng: () => number = Math.random,
): Question[] {
  // 1) 分离
  const { scenario, plain } = partitionByType(questions);

  // 校验：实际数据必须与约定分布一致，否则后续维度配额会错乱。
  assertDistribution(scenario.length, plain.length, distribution);

  // 2) 各自洗牌
  const shuffledScenario = shuffle(scenario, rng);
  const shuffledPlain = shuffle(plain, rng);

  // 3) 按策略拼接
  if (strategy === 'interleaved') {
    // 合并后再整体打散一次（兼容旧体验）。
    return shuffle([...shuffledScenario, ...shuffledPlain], rng);
  }
  // grouped 默认：情景题段在前 [0..scenario-1]，非情景题段紧随其后。
  // 这样 currentIndex === distribution.scenario 即为“情景段结束”的自然切分点。
  return [...shuffledScenario, ...shuffledPlain];
}

/**
 * 校验单维度的题目配额。
 * - 需求约定：4 维度 × 10 题/维度 = 40 题。
 * - 违反约束时抛错，便于在数据接入阶段及早暴露文案配比错误。
 */
export function assertPerDimension(
  questions: readonly Question[],
  keys: readonly DimensionKey[],
  expectedPerDimension = 10,
): void {
  for (const dk of keys) {
    const n = questions.filter((q) => q.dimension === dk).length;
    if (n !== expectedPerDimension) {
      throw new Error(
        `[queue] 维度 ${dk} 题目数为 ${n}，期望 ${expectedPerDimension}`,
      );
    }
  }
}

/** 遍历题目 + 默认似然回填选项，供引擎层用统一接口读取 P(A|E)。 */
export function likelihoodOf(q: Question, optionIndex: 0 | 1): number {
  return q.options[optionIndex].likelihood ?? DEFAULT_LIKELIHOOD;
}

export type { QuestionType };
