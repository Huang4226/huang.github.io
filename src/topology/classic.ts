import type { Piece, PieceKind, Team } from '../core/types';
import { CLASSIC_LAYOUT, classicX, classicY } from './geometry';
import type { BoardNode, Frame, JumpMove, PieceInit, Ray, Topology } from './types';

const { files, ranks } = CLASSIC_LAYOUT;

/** 红方九宫 file 3–5 × rank 0–2；黑方 file 3–5 × rank 7–9 */
export const CLASSIC_PALACE_RED: ReadonlyArray<readonly [number, number]> = [
  [3, 0], [4, 0], [5, 0],
  [3, 1], [4, 1], [5, 1],
  [3, 2], [4, 2], [5, 2],
];

export const CLASSIC_PALACE_BLACK: ReadonlyArray<readonly [number, number]> = CLASSIC_PALACE_RED.map(
  ([f, r]) => [f, r + 7] as const,
);

export function classicId(file: number, rank: number): number {
  return rank * files + file;
}

export function classicFileRank(id: number): { file: number; rank: number } {
  return { file: id % files, rank: Math.floor(id / files) };
}

/** 河界：红方半场 rank 0–4，黑方半场 rank 5–9 */
export const CLASSIC_RIVER_BETWEEN = 4.5;

function isOnBoard(file: number, rank: number): boolean {
  return file >= 0 && file < files && rank >= 0 && rank < ranks;
}

const HORSE_STEPS: ReadonlyArray<readonly [number, number, number, number]> = [
  // [df, dr, legDf, legDr]
  [1, 2, 0, 1],
  [-1, 2, 0, 1],
  [1, -2, 0, -1],
  [-1, -2, 0, -1],
  [2, 1, 1, 0],
  [2, -1, 1, 0],
  [-2, 1, -1, 0],
  [-2, -1, -1, 0],
];

const ELEPHANT_STEPS: ReadonlyArray<readonly [number, number]> = [
  [2, 2], [2, -2], [-2, 2], [-2, -2],
];

function buildNodes(): BoardNode[] {
  const nodes: BoardNode[] = [];
  for (let rank = 0; rank < ranks; rank++) {
    for (let file = 0; file < files; file++) {
      const tags: string[] = [];
      if (file >= 3 && file <= 5 && rank <= 2) tags.push('palace:red');
      if (file >= 3 && file <= 5 && rank >= 7) tags.push('palace:black');
      if (rank === 4) tags.push('river:red');
      if (rank === 5) tags.push('river:black');
      nodes.push({
        id: classicId(file, rank),
        x: classicX(file),
        y: classicY(rank),
        frames: ['plane'],
        tags,
        file,
        rank,
      });
    }
  }
  return nodes;
}

/** 走法射线：整条直线，河界不断开（与渲染线段不同） */
function buildRays(): Map<number, Ray[]> {
  const rays = new Map<number, Ray[]>();
  for (let rank = 0; rank < ranks; rank++) {
    for (let file = 0; file < files; file++) {
      const list: Ray[] = [];
      // dir 0: 向 file+ 方向
      const right: number[] = [];
      for (let f = file + 1; f < files; f++) right.push(classicId(f, rank));
      if (right.length) list.push({ dir: 0, nodes: right });
      // dir 1: 向 file− 方向
      const left: number[] = [];
      for (let f = file - 1; f >= 0; f--) left.push(classicId(f, rank));
      if (left.length) list.push({ dir: 1, nodes: left });
      // dir 2: 向 rank+ 方向
      const up: number[] = [];
      for (let r = rank + 1; r < ranks; r++) up.push(classicId(file, r));
      if (up.length) list.push({ dir: 2, nodes: up });
      // dir 3: 向 rank− 方向
      const down: number[] = [];
      for (let r = rank - 1; r >= 0; r--) down.push(classicId(file, r));
      if (down.length) list.push({ dir: 3, nodes: down });
      rays.set(classicId(file, rank), list);
    }
  }
  return rays;
}

function buildJumps(): Map<number, JumpMove[]> {
  const jumps = new Map<number, JumpMove[]>();
  for (let rank = 0; rank < ranks; rank++) {
    for (let file = 0; file < files; file++) {
      const list: JumpMove[] = [];
      for (const [df, dr, legDf, legDr] of HORSE_STEPS) {
        const tf = file + df;
        const tr = rank + dr;
        if (!isOnBoard(tf, tr)) continue;
        list.push({
          kind: 'horse',
          target: classicId(tf, tr),
          leg: classicId(file + legDf, rank + legDr),
        });
      }
      for (const [df, dr] of ELEPHANT_STEPS) {
        const tf = file + df;
        const tr = rank + dr;
        if (!isOnBoard(tf, tr)) continue;
        list.push({
          kind: 'elephant',
          target: classicId(tf, tr),
          eye: classicId(file + df / 2, rank + dr / 2),
        });
      }
      jumps.set(classicId(file, rank), list);
    }
  }
  return jumps;
}

/** 渲染线段：横 80 段 + 竖 81 段，其中中路 7 条竖线在河界断开 → 154 段 */
function buildSegments(): Array<[number, number]> {
  const segs: Array<[number, number]> = [];
  for (let rank = 0; rank < ranks; rank++) {
    for (let file = 0; file < files - 1; file++) {
      segs.push([classicId(file, rank), classicId(file + 1, rank)]);
    }
  }
  for (let file = 0; file < files; file++) {
    for (let rank = 0; rank < ranks - 1; rank++) {
      // 河界处只有最左、最右两条竖线连通
      if (rank === 4 && file !== 0 && file !== files - 1) continue;
      segs.push([classicId(file, rank), classicId(file, rank + 1)]);
    }
  }
  return segs;
}

function backRank(team: Team, rank: number): PieceInit[] {
  const order: Array<[PieceKind, number]> = [
    ['chariot', 0],
    ['horse', 1],
    ['elephant', 2],
    ['advisor', 3],
    ['general', 4],
    ['advisor', 5],
    ['elephant', 6],
    ['horse', 7],
    ['chariot', 8],
  ];
  return order.map(([kind, file]) => ({
    node: classicId(file, rank),
    piece: { team, kind } satisfies Piece,
  }));
}

function buildStartLayout(): PieceInit[] {
  const layout: PieceInit[] = [];
  // 红方
  layout.push(...backRank('red', 0));
  layout.push({ node: classicId(1, 2), piece: { team: 'red', kind: 'cannon' } });
  layout.push({ node: classicId(7, 2), piece: { team: 'red', kind: 'cannon' } });
  for (const file of [0, 2, 4, 6, 8]) {
    layout.push({ node: classicId(file, 3), piece: { team: 'red', kind: 'pawn' } });
  }
  // 黑方
  layout.push(...backRank('black', 9));
  layout.push({ node: classicId(1, 7), piece: { team: 'black', kind: 'cannon' } });
  layout.push({ node: classicId(7, 7), piece: { team: 'black', kind: 'cannon' } });
  for (const file of [0, 2, 4, 6, 8]) {
    layout.push({ node: classicId(file, 6), piece: { team: 'black', kind: 'pawn' } });
  }
  return layout;
}

const PALACE_RED_SET: ReadonlySet<number> = new Set(
  CLASSIC_PALACE_RED.map(([f, r]) => classicId(f, r)),
);
const PALACE_BLACK_SET: ReadonlySet<number> = new Set(
  CLASSIC_PALACE_BLACK.map(([f, r]) => classicId(f, r)),
);

export function createClassicTopology(): Topology {
  const nodes = buildNodes();
  const rankOf = (node: number): number => nodes[node]!.rank!;
  const fileOf = (node: number): number => nodes[node]!.file!;

  return {
    name: 'classic',
    nodes,
    rays: buildRays(),
    jumps: buildJumps(),
    palaces: new Map<Frame, number[]>([
      ['plane', [...CLASSIC_PALACE_RED, ...CLASSIC_PALACE_BLACK].map(([f, r]) => classicId(f, r))],
    ]),
    startLayout: buildStartLayout(),
    boardBox: { ...CLASSIC_LAYOUT.box },
    segments: buildSegments(),
    gap: (CLASSIC_LAYOUT.gapX + CLASSIC_LAYOUT.gapY) / 2,

    palace(team) {
      return team === 'red' ? PALACE_RED_SET : PALACE_BLACK_SET;
    },
    // 河界在 rank 4 与 5 之间：红方半场 rank 0–4，黑方半场 rank 5–9
    ownHalf(node, team) {
      return team === 'red' ? rankOf(node) <= 4 : rankOf(node) >= 5;
    },
    pawnForward(node, team) {
      const file = fileOf(node);
      const rank = team === 'red' ? rankOf(node) + 1 : rankOf(node) - 1;
      return rank >= 0 && rank < ranks ? [classicId(file, rank)] : [];
    },
    pawnSide(node) {
      const file = fileOf(node);
      const rank = rankOf(node);
      const out: number[] = [];
      if (file > 0) out.push(classicId(file - 1, rank));
      if (file < files - 1) out.push(classicId(file + 1, rank));
      return out;
    },
  };
}

export const classicTopology: Topology = createClassicTopology();
