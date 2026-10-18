import { applyMove } from '../core/state';
import { notateMove } from '../core/notation';
import { settle } from '../core/result';
import type { GameState, MoveRef, Team } from '../core/types';
import type { Topology } from '../topology/types';
import { allLegalMoves, generalNode, isInCheck, legalMovesFrom } from './check';
import { eliminatePlayer, findChecker } from './convert';

/** 某子当前所有合法落点（供 UI 高亮） */
export function hintsFor(state: GameState, topo: Topology, from: number): number[] {
  return legalMovesFrom(state, topo, from);
}

/**
 * 兵/卒一旦离开本方半场就永久标记"已过河"（三人局的收编判定依赖它）。
 * 经典棋盘用 `crossed ?? !ownHalf` 也能推出来，这里显式落盘更稳。
 */
function markCrossed(state: GameState, to: number, topo: Topology): void {
  const p = state.cells[to];
  if (!p || p.kind !== 'pawn' || p.crossed) return;
  if (!topo.ownHalf(to, p.team)) {
    state.cells[to] = { ...p, crossed: true };
  }
}

/**
 * 三人局：把"当前方无子可动"的玩家逐个淘汰出去。
 * 被将军 = 将死（收编权归将军方）；未被将军 = 困毙（残子原地清除）。
 */
export function resolveEliminations(state: GameState, topo: Topology): GameState {
  if (state.mode !== 'three') return state;
  let cur = state;
  for (let guard = 0; guard < 4; guard++) {
    if (cur.status !== 'playing' || cur.order.length <= 1) break;
    const team = cur.turn;
    if (allLegalMoves(cur, topo, team).length > 0) break;
    const general = generalNode(cur.cells, team);
    const inChk = general !== null && isInCheck(cur, topo, team);
    const killer = inChk && general !== null ? findChecker(cur, topo, team, general) : null;
    cur = eliminatePlayer(cur, topo, team, killer);
  }
  return cur;
}

/**
 * 走一手棋：校验合法性 → 执行 → 标记过河与将军 → 三人局淘汰处理 → 终局结算。
 * 所有对局变更都必须走这里，别绕过它直接调 applyMove。
 */
export function playMove(state: GameState, topo: Topology, from: number, to: number): GameState {
  if (state.status === 'over') throw new Error('对局已结束');
  const piece = state.cells[from];
  if (!piece) throw new Error(`起点 ${from} 无棋子`);
  if (piece.team !== state.turn) throw new Error('不是该方的回合');

  const legal = legalMovesFrom(state, topo, from);
  if (!legal.includes(to)) throw new Error(`非法走法：${from} → ${to}`);

  let next = applyMove(state, from, to);
  markCrossed(next, to, topo);

  const last = next.history[next.history.length - 1]!;
  last.gaveCheck = isInCheck(next, topo, next.turn);
  // 记谱要用"落子前"的局面判断同列棋子，所以在 applyMove 之前算好
  last.text = notateMove(state, topo, from, to);

  next = resolveEliminations(next, topo);
  return settle(next, topo);
}

export function resign(state: GameState, team: Team): GameState {
  const winner = state.order.find((t) => t !== team) ?? null;
  return { ...state, status: 'over', winner, endReason: 'resign' };
}

export type { MoveRef };
