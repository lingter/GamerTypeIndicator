import type {
  AssessmentState,
  Dimension,
  DimensionKey,
  DimensionState,
  Question,
} from '../types/schema';
import { likelihoodOf } from './queue';

/** 数值下限,避免后验被钉死到 0/1 导致后续题目无法再更新(贝叶斯对 0/1 极不敏感)。 */
const PROB_EPS = 1e-4;

/** 创建单维度的初始状态: 无信息先验 prob0=0.5。 */
export function createInitialDimensionState(key: DimensionKey): DimensionState {
  return { key, prob0: 0.5, evidence: 0 };
}

/** 初始化全局评测状态: 4 维度全部回到 0.5,绑定最终队列。 */
export function createInitialState(
  dimensions: readonly Dimension[],
  queue: readonly Question[],
): AssessmentState {
  const states = {} as Record<DimensionKey, DimensionState>;
  for (const d of dimensions) {
    states[d.key] = createInitialDimensionState(d.key);
  }
  return {
    dimensions: dimensions.slice(),
    states,
    // queue 在状态上以整体快照形式保留,引擎据此推进 cursor。
    queue: queue.slice(),
    answers: [],
    cursor: 0,
  };
}

export function updateDimensionProb(
  prior0: number,
  chosenIndex: 0 | 1,
  like: number,
): number {
  const priorI = 1 - prior0;

  // 命中 poles[0]: E 似然=like,I 似然=1-like。
  // 命中 poles[1]: E 似然=1-like,I 似然=like。
  const likelihoodE = chosenIndex === 0 ? like : 1 - like;
  const likelihoodI = chosenIndex === 0 ? 1 - like : like;

  const numerator = likelihoodE * prior0; // P(A|E)·P(E)
  const denominator = likelihoodE * prior0 + likelihoodI * priorI; // P(A)

  // denom 理论上 >0(因 prior 与似然均为正),但加防御避免极端数值除零。
  if (denominator <= 0) return prior0;

  let posterior = numerator / denominator;

  // 截断到 [PROB_EPS, 1-PROB_EPS],防止后验触底/触顶锁死后续更新。
  if (posterior < PROB_EPS) posterior = PROB_EPS;
  else if (posterior > 1 - PROB_EPS) posterior = 1 - PROB_EPS;

  return posterior;
}

export function applyAnswer(
  state: AssessmentState,
  question: Question,
  chosenIndex: 0 | 1,
): AssessmentState {
  // 1) 定位维度状态与维度元信息,拿到两个极的顺序。
  const dimState = state.states[question.dimension];
  const dim = state.dimensions.find((d) => d.key === question.dimension);
  if (!dimState || !dim) {
    throw new Error(`[bayes] 未知维度 ${question.dimension}`);
  }

  // 2) 取本选项的似然。
  const like = likelihoodOf(question, chosenIndex);

  // 3) 确认“命中哪个极”——用于落记答案轨迹(展示用),不参与概率计算本身。
  const chosenPoleId = dim.poles[chosenIndex].id;

  // 4) 记录更新前的 prob0,作为追溯链的一环。
  const prob0Before = dimState.prob0;

  // 5) 贝叶斯更新: 上一题的后验 → 本题的先验 → 本题的后验。
  const prob0After = updateDimensionProb(prob0Before, chosenIndex, like);

  // 6) 写回状态,完成“状态继承”。
  dimState.prob0 = prob0After;
  dimState.evidence += 1;
  state.answers.push({
    questionId: question.id,
    chosenPole: chosenPoleId,
    prob0Before,
    prob0After,
  });
  state.cursor += 1;

  return state;
}

export interface FinalVerdict {
  /** 由 4 维极 id 顺序拼接的结果码,用于查 results.json。 */
  code: string;
  /** 每维度的最终取向与概率,便于 UI 绘制倾向条。 */
  perDimension: Array<{
    key: DimensionKey;
    poleId: string;
    /** 用户属于命中极的概率:poles[0] 直接取 prob0,poles[1] 取 1-prob0。 */
    confidence: number;
  }>;
}

export function computeVerdict(state: AssessmentState): FinalVerdict {
  const perDimension: FinalVerdict['perDimension'] = [];
  let code = '';

  for (const dim of state.dimensions) {
    const ds = state.states[dim.key];
    // 命中 poles[0]?
    const hit0 = ds.prob0 >= 0.5;
    const poleId = hit0 ? dim.poles[0].id : dim.poles[1].id;
    const confidence = hit0 ? ds.prob0 : 1 - ds.prob0;
    code += poleId;
    perDimension.push({ key: dim.key, poleId, confidence });
  }

  return { code, perDimension };
}
