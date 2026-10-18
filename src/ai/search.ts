import type { GameState, MoveRef, Piece, Team } from '../core/types';
import type { Topology } from '../topology/types';
import { generalNode, isAttacked } from '../rules/check';
import { pseudoMovesFrom } from '../rules/moves';
import { PIECE_VALUE, evaluate } from './evaluate';

/** 将死的分值基数：比任何子力差都大，且离根越近分越高（更快的杀更优） */
export const MATE = 90000;

export interface SearchLimits {
  maxDepth: number;
  timeMs: number;
}

export interface SearchResult {
  move: MoveRef | null;
  score: number;
  depth: number;
  nodes: number;
  elapsedMs: number;
}

interface Ctx {
  topo: Topology;
  order: Team[];
  enemyCache: Map<Team, Team[]>;
  nodes: number;
  deadline: number;
  timeout: boolean;
}

function enemiesOf(ctx: Ctx, team: Team): Team[] {
  let cached = ctx.enemyCache.get(team);
  if (!cached) {
    cached = ctx.order.filter((t) => t !== team);
    ctx.enemyCache.set(team, cached);
  }
  return cached;
}

function nextOf(ctx: Ctx, team: Team): Team {
  const idx = ctx.order.indexOf(team);
  return ctx.order[(idx + 1) % ctx.order.length]!;
}

/**
 * 生成 legal moves：伪合法走法 + "走完自己老将不能被攻击"。
 * 直接在手头的数组上 make/unmake，避免每个节点克隆棋盘。
 */
function legalMoves(cells: (Piece | null)[], ctx: Ctx, turn: Team): MoveRef[] {
  const enemies = enemiesOf(ctx, turn);
  const king = generalNode(cells, turn);
  const out: MoveRef[] = [];
  for (let from = 0; from < cells.length; from++) {
    const piece = cells[from];
    if (!piece || piece.team !== turn) continue;
    for (const to of pseudoMovesFrom(cells, ctx.topo, from)) {
      const captured = cells[to] ?? null;
      cells[to] = piece;
      cells[from] = null;
      const kingAfter = from === king ? to : king;
      const safe = kingAfter === null || !isAttacked(cells, ctx.topo, kingAfter, enemies);
      cells[to] = captured;
      cells[from] = piece;
      if (safe) out.push({ from, to });
    }
  }
  return out;
}

/** MVV-LVA：先试吃大子、再用小子吃 */
function orderMoves(moves: MoveRef[], cells: ReadonlyArray<Piece | null>): void {
  moves.sort((a, b) => scoreMove(b, cells) - scoreMove(a, cells));
}

function scoreMove(move: MoveRef, cells: ReadonlyArray<Piece | null>): number {
  const victim = cells[move.to];
  if (!victim) return 0;
  const attacker = cells[move.from]!;
  return PIECE_VALUE[victim.kind] * 10 - PIECE_VALUE[attacker.kind];
}

function timeUp(ctx: Ctx): boolean {
  if (ctx.timeout) return true;
  if ((ctx.nodes & 1023) !== 0) return false;
  if (performance.now() > ctx.deadline) {
    ctx.timeout = true;
    return true;
  }
  return false;
}

function negamax(
  cells: (Piece | null)[],
  ctx: Ctx,
  turn: Team,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
): number {
  ctx.nodes++;
  if (depth <= 0) return evaluate(cells, ctx.topo, turn);

  const moves = legalMoves(cells, ctx, turn);
  if (moves.length === 0) return -(MATE - ply); // 将死与困毙在象棋里都判负

  orderMoves(moves, cells);
  let best = -Infinity;
  for (const move of moves) {
    if (timeUp(ctx)) return alpha;
    const piece = cells[move.from]!;
    const captured = cells[move.to] ?? null;
    cells[move.to] = piece;
    cells[move.from] = null;

    const score = -negamax(cells, ctx, nextOf(ctx, turn), depth - 1, -beta, -alpha, ply + 1);

    cells[move.to] = captured;
    cells[move.from] = piece;

    if (ctx.timeout) return alpha;
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * 迭代加深的根搜索。超时则丢弃这一轮的部分结果，返回上一轮的完整结果。
 */
export function searchBestMove(
  state: GameState,
  topo: Topology,
  limits: SearchLimits,
): SearchResult {
  const started = performance.now();
  const ctx: Ctx = {
    topo,
    order: state.order,
    enemyCache: new Map(),
    nodes: 0,
    deadline: started + limits.timeMs,
    timeout: false,
  };

  const cells: (Piece | null)[] = state.cells.slice();
  const rootMoves = legalMoves(cells, ctx, state.turn);
  if (rootMoves.length === 0) {
    return { move: null, score: 0, depth: 0, nodes: ctx.nodes, elapsedMs: performance.now() - started };
  }

  let bestMove: MoveRef = rootMoves[0]!;
  let bestScore = -Infinity;
  let reachedDepth = 0;

  for (let depth = 1; depth <= limits.maxDepth; depth++) {
    let alpha = -Infinity;
    let localBest: MoveRef | null = null;
    let localScore = -Infinity;

    // 上一轮的最佳招排到最前，剪枝效率提升明显
    orderMoves(rootMoves, cells);
    const ordered = [bestMove, ...rootMoves.filter((m) => m !== bestMove)];

    for (const move of ordered) {
      const piece = cells[move.from]!;
      const captured = cells[move.to] ?? null;
      cells[move.to] = piece;
      cells[move.from] = null;

      const score = -negamax(cells, ctx, nextOf(ctx, state.turn), depth - 1, -Infinity, -alpha, 1);

      cells[move.to] = captured;
      cells[move.from] = piece;

      if (ctx.timeout) break;
      if (score > localScore) {
        localScore = score;
        localBest = move;
      }
      if (score > alpha) alpha = score;
    }

    if (ctx.timeout) break;
    if (localBest) {
      bestMove = localBest;
      bestScore = localScore;
      reachedDepth = depth;
    }
    if (bestScore >= MATE - 100) break; // 已经找到杀棋
  }

  return {
    move: bestMove,
    score: bestScore,
    depth: reachedDepth,
    nodes: ctx.nodes,
    elapsedMs: performance.now() - started,
  };
}
