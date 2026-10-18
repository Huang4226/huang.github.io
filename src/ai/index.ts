import { searchBestMove, type SearchResult } from './search';
import { legalMovesFrom } from '../rules/check';
import type { GameState } from '../core/types';
import type { Topology } from '../topology/types';

export type AiLevel = 'easy' | 'normal' | 'hard';

export interface LevelConfig {
  label: string;
  maxDepth: number;
  timeMs: number;
}

/**
 * 三档难度。深度不大，但靠 MVV-LVA + 迭代加深能在 1.5s 内下出"不送子、会吃白子"的棋。
 * 时间是硬上限：超时回落到上一轮完整搜索结果，绝不会卡死 UI。
 */
export const AI_LEVELS: Record<AiLevel, LevelConfig> = {
  easy: { label: '电脑 · 易', maxDepth: 2, timeMs: 500 },
  normal: { label: '电脑 · 中', maxDepth: 3, timeMs: 1500 },
  hard: { label: '电脑 · 难', maxDepth: 4, timeMs: 3500 },
};

/** 随机走一步合法棋（测试基线 / 三人局临时兜底） */
export function randomMove(state: GameState, topo: Topology): SearchResult {
  const moves: Array<{ from: number; to: number }> = [];
  for (let from = 0; from < state.cells.length; from++) {
    const p = state.cells[from];
    if (!p || p.team !== state.turn) continue;
    for (const to of legalMovesFrom(state, topo, from)) moves.push({ from, to });
  }
  if (!moves.length) return { move: null, score: 0, depth: 0, nodes: 0, elapsedMs: 0 };
  const pick = moves[Math.floor(Math.random() * moves.length)]!;
  return { move: pick, score: 0, depth: 0, nodes: 0, elapsedMs: 0 };
}

export function chooseMove(state: GameState, topo: Topology, level: AiLevel): SearchResult {
  // negamax 是两人零和的；三人局（order.length === 3）暂不启用搜索，先随机兜底
  if (state.order.length !== 2) return randomMove(state, topo);
  return searchBestMove(state, topo, AI_LEVELS[level]);
}

export { searchBestMove };
export type { SearchResult };
