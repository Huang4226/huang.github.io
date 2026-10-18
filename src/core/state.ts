import { positionKey } from './hash';
import type { GameMode, GameState, Move, Piece, Team } from './types';
import type { Topology } from '../topology/types';

export function teamsForMode(mode: GameMode): Team[] {
  return mode === 'classic' ? ['red', 'black'] : ['red', 'black', 'white'];
}

export function createInitialState(mode: GameMode, topo: Topology): GameState {
  const cells: (Piece | null)[] = topo.nodes.map(() => null);
  for (const init of topo.startLayout) {
    cells[init.node] = { ...init.piece };
  }
  const order = teamsForMode(mode);
  const turn = order[0]!;
  const base: GameState = {
    mode,
    topology: topo.name,
    cells,
    turn,
    order,
    ply: 0,
    status: 'playing',
    winner: null,
    endReason: null,
    history: [],
    positions: [positionKey({ cells, turn })],
    quiet: 0,
    eliminations: [],
    captured: [],
  };
  return base;
}

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    cells: s.cells.slice(),
    order: s.order.slice(),
    history: s.history.slice(),
    positions: s.positions.slice(),
    eliminations: s.eliminations.slice(),
    captured: s.captured.slice(),
  };
}

export function nextTeam(s: GameState, current: Team): Team {
  const idx = s.order.indexOf(current);
  if (idx < 0) return s.order[0]!;
  return s.order[(idx + 1) % s.order.length]!;
}

export function canSelect(s: GameState, node: number): boolean {
  const p = s.cells[node];
  return !!p && p.team === s.turn && s.status === 'playing';
}

/** 结构层检查：目标格不是己方棋子（真正的合法性在 rules/check.ts） */
export function canPlace(s: GameState, node: number): boolean {
  if (s.status !== 'playing') return false;
  const p = s.cells[node];
  return !p || p.team !== s.turn;
}

/**
 * 落子（机械层）：只负责挪子/吃子/换手，**不做走法校验**。
 * 合法性由 rules/session.ts 的 playMove 负责。
 */
export function applyMove(s: GameState, from: number, to: number): GameState {
  if (from === to) return s;
  const piece = s.cells[from];
  if (!piece) throw new Error(`起点 ${from} 无棋子`);
  const target = s.cells[to];
  if (target && target.team === piece.team) throw new Error('不能吃自己的子');

  const next = cloneState(s);
  const move: Move = { from, to, piece, captured: target ?? null };
  next.cells[to] = piece;
  next.cells[from] = null;
  if (target) next.captured.push(target);
  next.history.push(move);
  next.ply += 1;
  next.quiet = target ? 0 : next.quiet + 1;
  next.turn = nextTeam(s, s.turn);
  next.positions.push(positionKey(next));
  return next;
}

/** 回退一手，并让 quiet 计数回到该手之前的状态 */
export function undoMove(s: GameState): GameState {
  const last = s.history[s.history.length - 1];
  if (!last) return s;
  const prev = cloneState(s);
  prev.cells[last.from] = last.piece;
  prev.cells[last.to] = last.captured ? last.captured : null;
  prev.history.pop();
  prev.positions.pop();
  if (last.captured) prev.captured.pop();
  prev.ply -= 1;
  prev.quiet = quietBefore(prev.history);
  prev.turn = last.piece.team;
  prev.status = 'playing';
  prev.winner = null;
  prev.endReason = null;
  return prev;
}

/** 从历史尾部往前数，到最近一次吃子为止的半回合数 */
export function quietBefore(history: Move[]): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.captured) break;
    n += 1;
  }
  return n;
}
