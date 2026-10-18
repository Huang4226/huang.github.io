import { positionKey } from '../core/hash';
import type { GameState, Piece, Team } from '../core/types';
import type { Topology } from '../topology/types';
import { PIECE_VALUE } from '../ai/evaluate';
import { isAttacked } from './check';

/**
 * 淘汰一家（设计文档 8.5 的时序）：
 *   1. 帅/将（若还在盘上）与防御子、已过河兵 移出棋盘
 *   2. 车/马/炮 → 归收编者
 *   3. 未过河的兵/卒 → 归收编者
 *   4. 无人收编（困毙）时，攻击子也一并清除
 *   5. 从轮转序列中移除，轮到它的下家
 *
 * 关键：先按**收编前**的 crossed 状态把兵分桶，再执行变更，
 * 否则"刚归降的兵"会被后一步判成已过河。
 */
export function eliminatePlayer(
  state: GameState,
  topo: Topology,
  victim: Team,
  killer: Team | null,
): GameState {
  const cells = state.cells.slice();
  const converted: Piece[] = [];
  const removed: Piece[] = [];

  // 第一遍：只分桶，不改状态
  const takeover: number[] = [];
  const wipe: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const p = cells[i];
    if (!p || p.team !== victim) continue;
    if (p.kind === 'chariot' || p.kind === 'horse' || p.kind === 'cannon') {
      takeover.push(i);
    } else if (p.kind === 'pawn') {
      const crossed = p.crossed ?? !topo.ownHalf(i, victim);
      if (crossed) wipe.push(i);
      else takeover.push(i);
    } else {
      wipe.push(i);
    }
  }

  // 第二遍：执行
  for (const i of takeover) {
    const p = cells[i]!;
    if (killer) {
      cells[i] = { ...p, team: killer };
      converted.push(p);
    } else {
      cells[i] = null;
      removed.push(p);
    }
  }
  for (const i of wipe) {
    removed.push(cells[i]!);
    cells[i] = null;
  }

  // 轮转：摘掉 victim，轮到它的下家
  const oldOrder = state.order;
  const victimAt = oldOrder.indexOf(victim);
  const order = oldOrder.filter((t) => t !== victim);
  let turn = order[0] ?? victim;
  for (let k = 1; k <= oldOrder.length; k++) {
    const cand = oldOrder[(victimAt + k) % oldOrder.length]!;
    if (cand !== victim) {
      turn = cand;
      break;
    }
  }

  const next: GameState = {
    ...state,
    cells,
    order,
    turn,
    eliminations: [...state.eliminations, { victim, killer, converted, removed }],
  };
  // 局面变了：重算当前局面键（悔棋与重复判定都依赖它）
  next.positions = [...state.positions.slice(0, -1), positionKey(next)];
  return next;
}

/** 8.6 计分：子力分 + 杀王数 × 300 */
export function scoreOf(state: Pick<GameState, 'cells' | 'eliminations'>, team: Team): number {
  let score = 0;
  for (const p of state.cells) {
    if (!p || p.team !== team) continue;
    score += PIECE_VALUE[p.kind] ?? 0;
  }
  const kills = state.eliminations.filter((e) => e.killer === team).length;
  return score + kills * 300;
}

/** 找出正在将军 team 的一方（多方同时将军时取轮转顺序里的第一个） */
export function findChecker(
  state: GameState,
  topo: Topology,
  team: Team,
  generalNode: number,
): Team | null {
  for (const t of state.order) {
    if (t === team) continue;
    if (isAttacked(state.cells, topo, generalNode, [t])) return t;
  }
  return null;
}
