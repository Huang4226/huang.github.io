import type { GameState, Team } from './types';
import type { Topology } from '../topology/types';
import { allLegalMoves, isInCheck } from '../rules/check';
import { repetitionResult } from '../rules/repeat';
import { scoreOf } from '../rules/convert';

export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'perpetual-check'
  | 'draw-repetition'
  | 'draw-60'
  | 'resign'
  | 'eliminated'
  | 'score';

export interface Outcome {
  winner: Team | null;
  reason: EndReason;
}

export const REASON_LABEL: Record<EndReason, string> = {
  checkmate: '将死',
  stalemate: '困毙',
  'perpetual-check': '长将判负',
  'draw-repetition': '三次重复局面，和棋',
  'draw-60': '60 回合无吃子，和棋',
  resign: '认输',
  eliminated: '灭国 · 最后存活',
  score: '回合上限 · 按计分判定',
};

/** 每 120 个半回合（60 回合）无吃子判和（双人局） */
export const QUIET_LIMIT = 120;

/** 三人局回合上限：200 整轮 × 3 家 */
export const THREE_TURN_CAP = 600;

/**
 * 双人局结算：
 * - 无合法招且被将军 = 将死判负；无合法招但未被将军 = 困毙判负
 * - 三次重复（长将判负 / 和棋）、60 回合无吃子判和
 */
export function evaluateOutcome(state: GameState, topo: Topology): Outcome | null {
  if (state.status === 'over') return null;
  if (state.order.length > 2) return null; // 三人局走 settleThree

  const legal = allLegalMoves(state, topo, state.turn);
  if (legal.length === 0) {
    const opponent = state.order.find((t) => t !== state.turn) ?? null;
    return {
      winner: opponent,
      reason: isInCheck(state, topo, state.turn) ? 'checkmate' : 'stalemate',
    };
  }

  const repeated = repetitionResult(state);
  if (repeated) return repeated;

  if (state.quiet >= QUIET_LIMIT) return { winner: null, reason: 'draw-60' };
  return null;
}

/** 三人局收尾：只剩一家 / 回合上限 */
export function settleThree(state: GameState): GameState {
  if (state.status === 'over') return state;
  if (state.order.length === 1) {
    return { ...state, status: 'over', winner: state.order[0]!, endReason: 'eliminated' };
  }
  if (state.ply >= THREE_TURN_CAP) {
    const ranked = [...state.order].sort((a, b) => scoreOf(state, b) - scoreOf(state, a));
    const best = ranked[0]!;
    const runnerUp = ranked[1];
    const tie = runnerUp !== undefined && scoreOf(state, best) === scoreOf(state, runnerUp);
    return {
      ...state,
      status: 'over',
      winner: tie ? null : best,
      endReason: 'score',
    };
  }
  return state;
}

/** 统一入口：按模式收尾 */
export function settle(state: GameState, topo: Topology): GameState {
  if (state.status === 'over') return state;
  if (state.mode === 'three') {
    const afterEliminate = settleThree(state);
    if (afterEliminate.status === 'over') return afterEliminate;
    return afterEliminate;
  }
  const outcome = evaluateOutcome(state, topo);
  return outcome
    ? { ...state, status: 'over', winner: outcome.winner, endReason: outcome.reason }
    : state;
}
