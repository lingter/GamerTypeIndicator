/**
 * 冒烟测试：用 src/data/questions.json 的实际题库跑通整条管线。
 * 运行: npx tsx src/engine/__smoke__.ts
 *
 * 验证点：
 * 1) 队列长度 = 40，分组策略下前 28 为情景题、后 12 为非情景题。
 * 2) 各维度 prob0 初始 0.5；逐题更新后状态继承。
 * 3) 全选 index 0（命中 poles[0]=A 极）→ 终局 code 应为 "AAAA"。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import type {
  AssessmentState,
  Dimension,
  Question,
  ResultProfile,
} from '../types/schema';
import {
  applyAnswer,
  buildQueue,
  computeVerdict,
  createInitialState,
  DEFAULT_DISTRIBUTION,
  DEFAULT_STRATEGY,
} from './index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf-8')) as T;

function main() {
  // 1) 加载数据（实际题库 40 题 + 4 维度 + 结果表）。
  const dimensionsConfig = readJson<{ dimensions: Dimension[] }>(
    resolve(__dirname, '../config/dimensions.json'),
  );
  const questions = readJson<Question[]>(
    resolve(__dirname, '../data/questions.json'),
  );
  const results = readJson<{ profiles: ResultProfile[] }>(
    resolve(__dirname, '../data/results.json'),
  );

  // 2) 构建队列：默认 28 情景 + 12 非情景，grouped 策略（情景段在前）。
  const queue = buildQueue(questions, DEFAULT_DISTRIBUTION, DEFAULT_STRATEGY);
  console.log('[smoke] queue length =', queue.length, '(expect 40)');

  // 段性校验：前 28 全情景，后 12 全非情景。
  const first28Scenario = queue.slice(0, 28).every((q) => q.type === 'scenario');
  const last12Plain = queue.slice(28).every((q) => q.type === 'plain');
  console.log('[smoke] 前28全情景:', first28Scenario, '后12全非情景:', last12Plain);

  // 3) 初始化状态：4 维度 prob0 均为 0.5。
  let state: AssessmentState = createInitialState(
    dimensionsConfig.dimensions,
    queue,
  );
  console.log(
    '[smoke] initial prob0:',
    Object.fromEntries(
      Object.entries(state.states).map(([k, v]) => [k, v.prob0]),
    ),
  );

  // 4) 逐题作答：全部选 index 0（命中 poles[0]=A 极），演示状态继承。
  for (let i = 0; i < queue.length; i++) {
    state = applyAnswer(state, queue[i]!, 0);
  }
  console.log(
    '[smoke] after all 40 questions, prob0:',
    Object.fromEntries(
      Object.entries(state.states).map(([k, v]) => [
        k,
        v.prob0.toFixed(4),
      ]),
    ),
  );
  console.log('[smoke] evidence per dim:',
    Object.fromEntries(
      Object.entries(state.states).map(([k, v]) => [k, v.evidence]),
    ),
  );

  // 5) 终局判定 + 结果查表。
  const verdict = computeVerdict(state);
  console.log('[smoke] verdict code =', verdict.code, '(expect AAAA due to all-A picks)');
  console.log(
    '[smoke] perDimension =',
    verdict.perDimension.map((d) => `${d.key}:${d.poleId}@${(d.confidence * 100).toFixed(0)}%`).join(' '),
  );

  const matched = results.profiles.find((p) => p.code === verdict.code);
  if (matched) {
    console.log('[smoke] matched result =', matched.title);
  } else {
    console.log('[smoke] no exact match for code', verdict.code);
  }
}

main();
