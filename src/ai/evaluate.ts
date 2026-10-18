import type { Piece, PieceKind, Team } from '../core/types';
import type { Topology } from '../topology/types';

/** 子力价值（与设计文档 8.6 的计分口径一致） */
export const PIECE_VALUE: Record<PieceKind, number> = {
  general: 100000,
  chariot: 900,
  cannon: 450,
  horse: 400,
  advisor: 200,
  elephant: 200,
  pawn: 100,
};

function centerBonus(file: number): number {
  return 4 - Math.abs(file - 4);
}

/**
 * 位置分：rank 先换算成"朝自己推进方向"的坐标，红黑共用一个函数。
 * 只做粗粒度的形状分（兵过河、马炮中路），不追求棋力，追求"不送子、会吃白子"。
 */
export function positionalScore(piece: Piece, file: number, rank: number): number {
  const r = piece.team === 'red' ? rank : 9 - rank;
  switch (piece.kind) {
    case 'pawn':
      return (r >= 5 ? (r - 4) * 16 : 0) + (Math.abs(file - 4) <= 1 ? 8 : 0);
    case 'horse':
      return centerBonus(file) * 3 + (r >= 4 ? 6 : 0);
    case 'cannon':
      return centerBonus(file) * 2 + (Math.abs(file - 4) <= 1 ? 6 : 0);
    case 'chariot':
      return centerBonus(file);
    default:
      return 0;
  }
}

/** 以 turn 为视角的静态评估（正数表示 turn 占优） */
export function evaluate(
  cells: ReadonlyArray<Piece | null>,
  topo: Topology,
  turn: Team,
): number {
  let score = 0;
  for (let i = 0; i < cells.length; i++) {
    const p = cells[i];
    if (!p) continue;
    const node = topo.nodes[i]!;
    const file = node.file ?? 4;
    const rank = node.rank ?? 0;
    const v = PIECE_VALUE[p.kind] + positionalScore(p, file, rank);
    score += p.team === turn ? v : -v;
  }
  return score;
}
