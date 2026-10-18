import type { GameState, MoveRef, Piece, Team } from '../core/types';
import type { Topology } from '../topology/types';
import { attackTargets, pseudoMovesFrom } from './moves';

/** 该方老将所在节点；已被吃掉（三人局出局）返回 null */
export function generalNode(
  cells: ReadonlyArray<Piece | null>,
  team: Team,
): number | null {
  for (let i = 0; i < cells.length; i++) {
    const p = cells[i];
    if (p && p.team === team && p.kind === 'general') return i;
  }
  return null;
}

/** node 是否被 enemies 中的任一方攻击 */
export function isAttacked(
  cells: ReadonlyArray<Piece | null>,
  topo: Topology,
  node: number,
  enemies: readonly Team[],
): boolean {
  for (let i = 0; i < cells.length; i++) {
    const p = cells[i];
    if (!p || !enemies.includes(p.team)) continue;
    if (attackTargets(cells, topo, i).includes(node)) return true;
  }
  return false;
}

/** team 是否被将军（含将帅照面：飞将按"老将攻击老将"处理） */
export function inCheck(
  cells: ReadonlyArray<Piece | null>,
  topo: Topology,
  team: Team,
  enemies: readonly Team[],
): boolean {
  const general = generalNode(cells, team);
  if (general === null) return false;
  return isAttacked(cells, topo, general, enemies);
}

export function isInCheck(state: GameState, topo: Topology, team: Team = state.turn): boolean {
  return inCheck(state.cells, topo, team, state.order.filter((t) => t !== team));
}

/**
 * 合法走法：伪合法走法里，剔除"走完之后自己被将军"的招。
 * 被将军时天然只剩应将的招，不需要额外分支。
 */
export function legalMovesFrom(state: GameState, topo: Topology, from: number): number[] {
  const piece = state.cells[from];
  if (!piece || piece.team !== state.turn || state.status !== 'playing') return [];
  return legalTargets(state.cells, topo, from, state.order.filter((t) => t !== piece.team));
}

/** 不看轮次，只算某子上所有合法落点（AI / 复盘用） */
export function legalTargets(
  cells: ReadonlyArray<Piece | null>,
  topo: Topology,
  from: number,
  enemies: readonly Team[],
): number[] {
  const piece = cells[from];
  if (!piece) return [];
  const board = cells.slice() as (Piece | null)[];
  const legal: number[] = [];
  for (const to of pseudoMovesFrom(board, topo, from)) {
    const captured = board[to] ?? null;
    board[to] = piece;
    board[from] = null;
    const bad = inCheck(board, topo, piece.team, enemies);
    board[to] = captured;
    board[from] = piece;
    if (!bad) legal.push(to);
  }
  return legal;
}

export function allLegalMoves(state: GameState, topo: Topology, team: Team): MoveRef[] {
  const enemies = state.order.filter((t) => t !== team);
  const out: MoveRef[] = [];
  for (let from = 0; from < state.cells.length; from++) {
    const p = state.cells[from];
    if (!p || p.team !== team) continue;
    for (const to of legalTargets(state.cells, topo, from, enemies)) out.push({ from, to });
  }
  return out;
}
