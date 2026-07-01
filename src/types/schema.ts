/**
 * 类型定义：question（题目）与 result（评测结果）的数据结构。
 *
 * 数据契约说明：
 * - 题目文件见 src/data/questions.json，结果文件见 src/data/results.json。
 * - 两个文件均由运行时加载；类型在此集中声明，保证引擎层与数据层解耦。
 * - 题目数组先由引擎“按维度分组 → 拆分情景/非情景 → 各自洗牌 → 拼成 40 题队列”后使用。
 */

/* ------------------------------------------------------------------ */
/* 维度模型                                                            */
/* ------------------------------------------------------------------ */

/**
 * 四个维度的 key（仿 MBTI 的四轴）。
 * - 维度名仅为占位，后续会替换为面向游戏场景的命名，但 key 保持稳定。
 */
export type DimensionKey = 'D1' | 'D2' | 'D3' | 'D4';

/** 单个维度由对立的两个极（Pole）构成，如 Extrovert / Introvert。 */
export interface DimensionPole {
  /** 极的唯一标识，建议使用短大写串，如 'E' / 'I'。 */
  id: string;
  /** 极的人类可读名称，如“外向型”。 */
  label: string;
  /** 极的简要描述，用于结果卡片展示。 */
  description: string;
}

/** 一个完整维度：含两个对立极。 */
export interface Dimension {
  key: DimensionKey;
  label: string;
  /** 两个极；order[0] 与 order[1] 的顺序必须与题目中 0/1 选项的语义一致。 */
  poles: [DimensionPole, DimensionPole];
}

/* ------------------------------------------------------------------ */
/* 题目模型 (questions.json)                                           */
/* ------------------------------------------------------------------ */

/**
 * 题目类型。
 * - 'scenario'：游戏化情境题（共 28 题）。题干描述一个游戏内场景，两个选项
 *   代表玩家在该情境下的不同行为倾向。
 * - 'plain'：非情境题（共 12 题），用于直接询问偏好。
 */
export type QuestionType = 'scenario' | 'plain';

/** 一个可选项：用户看到的文字 + 该选项在所属维度上对哪个极投“证据”。 */
export interface QuestionOption {
  /** 选项展示文案。 */
  text: string;
  /**
   * 本选项命中的极 id（对应 Dimension.poles[].id）。
   * 当用户选择本项时，视为观察到一个支持该极的证据 A。
   */
  pole: string;
  /**
   * 似然强度 P(A|E)：当用户真实属于该极时，选择本题的概率。
   * 约束：0 < value <= 1，缺省时引擎按 0.8 处理。
   * 设计成可选字段，便于后续文案阶段再精调每题的区分度。
   */
  likelihood?: number;
}

/** 题目实体。 */
export interface Question {
  /** 稳定 ID，用于追因与日志。 */
  id: string;
  /** 'scenario' | 'plain'，驱动情景/非情景分组。 */
  type: QuestionType;
  /** 所属维度。单一维度共 10 题。 */
  dimension: DimensionKey;
  /** 情境题的设定背景（仅 'scenario' 有意义，plain 可留空串）。 */
  scenario?: string;
  /** 题干。 */
  prompt: string;
  /**
   * 双选项。约定 length === 2，且两个 option 的 pole 必须是同一维度下
   * 两个不同极 —— 这样一题就能在该维度上产生一次“对立证据”。
   */
  options: [QuestionOption, QuestionOption];
}

/* ------------------------------------------------------------------ */
/* 结果模型 (results.json)                                             */
/* ------------------------------------------------------------------ */

/**
 * 结果实体的复合 key：由各维度得分更高的极组成，如 "ESTJ" 风格的 4 字母串。
 * 引擎拿到最终后验后，取每个维度概率更高的极拼成 code，再去 results 里查表。
 */
export type ResultCode = string;

/** 单个结果类型。 */
export interface ResultProfile {
  /** 与 4 维极拼接结果一一对应，如 "EINT"。 */
  code: ResultCode;
  /** 结果昵称，如“探索者”。 */
  title: string;
  /** 结果长文案，后续阶段补充。 */
  description: string;
  /** 该结果在游戏行为上的典型特征列表（占位，后续补充）。 */
  photo: string;
  /** 推荐的游戏玩法/职业方向（占位）。 */
  recommend: string[];
}

export interface DimensionState {
  key: DimensionKey;
  /** 0~1，用户属于 poles[0] 的概率。 */
  prob0: number;
  /** 该维度已累积的证据次数。 */
  evidence: number;
}

/** 全局评测状态：4 个维度 + 已答题轨迹。 */
export interface AssessmentState {
  /** 由 questions.json 的 Dimension.poles 推导而来的维度元信息快照。 */
  dimensions: Dimension[];
  /** 每维度一份贝叶斯状态。 */
  states: Record<DimensionKey, DimensionState>;
  /** 当前的 40 题队列（洗牌 + 拼接后的最终顺序）。 */
  queue: Question[];
  /** 已作答记录，便于复盘。 */
  answers: Array<{
    questionId: string;
    /** 选择命中的极 id。 */
    chosenPole: string;
    /** 作答前该维度属于 poles[0] 的概率，用于追溯更新链。 */
    prob0Before: number;
    /** 作答后该维度属于 poles[0] 的概率。 */
    prob0After: number;
  }>;
  /** 队列中下一题的下标，对应 queue[answered.length]。 */
  cursor: number;
}
