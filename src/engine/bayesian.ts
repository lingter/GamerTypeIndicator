/**
 * 贝叶斯状态机：评估引擎核心。
 *
 * 模型设计（对照需求公式）:
 *   P(E|A) = P(A|E)·P(E) / [ P(A|E)·P(E) + P(A|I)·P(I) ]
 *
 * 将逐题拆解:
 *   - E / I : 单维度上的两个对立极。下文统一记作 poles[0]（“E 极”）与 poles[1]（“I 极”）。
 *   - A : “用户在某题中选择了某个选项”这一观察事件。
 *   - P(E)、P(I) : 作答前的先验，二者满足 P(E)+P(I)=1。
 *   - P(A|E)、P(A|I) : 似然，即“当用户真实属于某极时，做出这次选择的概率”。
 *
 * 关键决策——用单标量 prob0 表示先验/后验:
 *   - 因 P(I)=1-P(E)，只需存 P(E)（即 prob0）即可唯一确定二维分布。
 *   - poles[0] ↔ E ↔ prob0，poles[1] ↔ I ↔ (1-prob0)。
 *   - 每题更新后,新的 prob0 即新的后验,直接作为下一题的先验——状态继承天然成立。
 *
 * 初始先验（Initial Prior）:
 *   - 采用“无信息先验（uninformative prior）”: prob0 = 0.5。
 *   - 物理含义: 评测开始前,认为用户属于任一极的概率均等,不引入领域偏见。
 *   - 这样首题的更新完全由该题的似然比决定,公平对待每个维度。
 *   - 如未来需要“基于冷启动问卷/历史结果的弱先验”,把 0.5 换成对应值即可,
 *     引擎结构无需改动。
 *
 * 似然如何取值:
 *   - 每个选项自带 likelihood=P(A|命中极),由题目标注(questions.json option.likelihood)。
 *   - 选择命中 poles[0] 时: P(A|E)=option.likelihood, P(A|I)=1-P(A|E) 之补。
 *     但更严谨的做法是: 对立极的似然取“补”并不一定准确(二者应满足全概率约束,
 *     而非简单互补)。本实现采用题面标注的 likelihood 作为命中极似然,
 *     对立极似然用 (1 - 命中极likelihood) 近似,满足:
 *       P(A) = P(A|E)·P(E) + P(A|I)·P(I) 且 0<=P(A|.)<=1。
 *   - likelihood 缺省值见 queue.DEFAULT_LIKELIHOOD。
 */
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

/**
 * 在“给定先前先验 + 一题一选”下,按贝叶斯公式更新单维度后验。
 *
 * 推导(以“用户选中的选项命中 poles[0]”为例):
 *   先验: P(E)=prior0, P(I)=1-prior0
 *   命中 poles[0] ⇒ P(A|E)=like, P(A|I)=(1-like)
 *   归一化分母 P(A)= like·prior0 + (1-like)·(1-prior0)
 *   后验 P(E|A)= like·prior0 / P(A)
 * 若命中 poles[1],则 E 与 I 的角色互换:
 *   P(A|E)=(1-like), P(A|I)=like
 *   P(E|A)= (1-like)·prior0 / [(1-like)·prior0 + like·(1-prior0)]
 *
 * @param prior0    作答前该维度属于 poles[0] 的概率。
 * @param chosenIndex 用户在本题选中的 option 下标(0/1)。
 * @param like      该选项的似然 P(A|命中极)。
 * @returns 作答后属于 poles[0] 的概率,作为下一题的先验。
 */
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

/**
 * 主更新函数: 对一道题的选择进行状态继承式更新。
 *
 * @param state     当前评测状态(会被就地修改并返回,便于链式推进)。
 * @param question  当前作答的题目(必须来自 state.queue)。
 * @param chosenIndex 用户选择(0 或 1)。
 * @returns 同一 state 引用(已更新),便于 UI 直接订阅状态对象。
 *
 * 副作用:
 *   - states[dimension].prob0 更新为先验→后验;
 *   - evidence +1;
 *   - answers 追加一条带 before/after 概率的轨迹;
 *   - cursor 前进一位。
 */
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

/**
 * 终局判定: 在所有题答完后,对每个维度取后验更高的极,拼出结果 code。
 *   - prob0  ≥ 0.5 ⇒ 命中 poles[0] 的 id;
 *   - prob0  <  0.5 ⇒ 命中 poles[1] 的 id。
 * 平局(理论概率极低)默认取 poles[0],并在返回体里标注。
 */
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
