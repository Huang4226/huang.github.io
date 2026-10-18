/**
 * AI 基准测试：AI 执红 vs 随机走子，统计胜率与单步耗时（验收 AI-01 的证据）。
 *
 * 用法：vite-node scripts/ai-bench.ts [局数=20] [单步时限ms=250] [最大深度=3]
 */
import { randomMove } from '../src/ai';
import { searchBestMove } from '../src/ai/search';
import { createInitialState } from '../src/core/state';
import { playMove } from '../src/rules/session';
import { classicTopology } from '../src/topology/classic';

const GAMES = Number(process.argv[2] ?? 20);
const TIME_MS = Number(process.argv[3] ?? 250);
const MAX_DEPTH = Number(process.argv[4] ?? 3);

const topo = classicTopology;
let wins = 0;
let losses = 0;
let draws = 0;
let aiMoves = 0;
let aiMs = 0;
let maxAiMs = 0;

for (let g = 1; g <= GAMES; g++) {
  let state = createInitialState('classic', topo);
  let plies = 0;
  while (state.status === 'playing' && plies < 400) {
    const isAi = state.turn === 'red';
    if (isAi) {
      const t0 = performance.now();
      const res = searchBestMove(state, topo, { maxDepth: MAX_DEPTH, timeMs: TIME_MS });
      const dt = performance.now() - t0;
      aiMoves++;
      aiMs += dt;
      maxAiMs = Math.max(maxAiMs, dt);
      if (!res.move) break;
      state = playMove(state, topo, res.move.from, res.move.to);
    } else {
      const res = randomMove(state, topo);
      if (!res.move) break;
      state = playMove(state, topo, res.move.from, res.move.to);
    }
    plies++;
  }
  if (state.winner === 'red') wins++;
  else if (state.winner === 'black') losses++;
  else draws++;
  process.stdout.write(
    `第 ${g} 局：${state.winner ?? '和棋'}（${state.endReason ?? '未终局'}），${plies} 手\n`,
  );
}

const rate = (wins / GAMES) * 100;
console.log('———— 汇总 ————');
console.log(`局数 ${GAMES}：胜 ${wins} / 负 ${losses} / 和 ${draws}，胜率 ${rate.toFixed(1)}%`);
console.log(
  `AI 单步平均 ${(aiMs / Math.max(1, aiMoves)).toFixed(0)} ms，最慢 ${maxAiMs.toFixed(0)} ms（上限 ${TIME_MS} ms / 深度 ${MAX_DEPTH}）`,
);
if (rate < 80) {
  console.error(`胜率 ${rate.toFixed(1)}% 低于 80% 的验收线`);
  process.exit(1);
}
