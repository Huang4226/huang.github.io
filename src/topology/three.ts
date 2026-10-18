import type { Piece, PieceKind, Team } from '../core/types';
import type { BoardNode, Frame, JumpMove, PieceInit, Ray, Topology } from './types';

const FILES = 9;
const RANKS = 5;

/**
 * 每翼的仿射矩阵（最小二乘拟合自图上 96 个格子中心，见 scripts/fit-three.py）：
 *   x = a1*f + a2*r + c1
 *   y = b1*f + b2*r + c2
 */
const AFFINE: ReadonlyArray<{ a1: number; a2: number; c1: number; b1: number; b2: number; c2: number }> = [
  { a1: 72.8617, a2: 0.0197, c1: 255.89, b1: -0.0038, b2: -66.5486, c2: 874.54 },
  { a1: 36.4436, a2: -53.8537, c1: 706.11, b1: 63.1179, b2: 31.0042, c2: 103.99 },
  { a1: -37.2442, a2: 53.6639, c1: 317.37, b1: 62.6546, b2: 30.6386, c2: 105.26 },
];
const TEAM_WING: Record<Team, number> = { red: 0, black: 1, white: 2 };
const WING_TEAM: Team[] = ['red', 'black', 'white'];
const FRAME_OF_WING: Frame[] = ['s0', 's1', 's2'];


export interface BuiltThree {
  topology: Topology;
  wingAtId: (s: number, f: number, r: number) => number;
  bridges: Map<number, number[]>;
}

export function createThreeTopology(): BuiltThree {
  const nodes: BoardNode[] = [];
  const ids: number[][] = [];

  for (let s = 0; s < 3; s++) {
    const row: number[] = [];
    for (let r = 0; r < RANKS; r++) {
      for (let f = 0; f < FILES; f++) {
        const m = AFFINE[s]!;
        const x = m.a1 * f + m.a2 * r + m.c1;
        const y = m.b1 * f + m.b2 * r + m.c2;

        const id = nodes.length;
        row.push(id);
        nodes.push({
          id,
          x,
          y,
          frames: [FRAME_OF_WING[s]!],
          tags: r === RANKS - 1 ? ['ferry'] : [],
          file: f,
          rank: r,
          wing: s,
        });
      }
    }
    ids.push(row);
  }

  const wingAt = (s: number, f: number, r: number): number => ids[s]![r * FILES + f]!;
  const inside = (f: number, r: number): boolean => f >= 0 && f < FILES && r >= 0 && r < RANKS;

  // —— 过河桥 ——
  const bridges = new Map<number, number[]>();
  const link = (a: number, b: number): void => {
    const la = bridges.get(a) ?? [];
    if (!la.includes(b)) la.push(b);
    bridges.set(a, la);
    const lb = bridges.get(b) ?? [];
    if (!lb.includes(a)) lb.push(a);
    bridges.set(b, lb);
  };

  // 三个河沿顶点两两相连
  const apexes = [wingAt(0, 4, 4), wingAt(1, 4, 4), wingAt(2, 4, 4)];
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) link(apexes[i]!, apexes[j]!);
  }

  // 其余河沿点：连到最近的对岸河沿点
  for (let s = 0; s < 3; s++) {
    for (let f = 0; f < FILES; f++) {
      if (f === 4) continue;
      const from = wingAt(s, f, 4);
      if (bridges.has(from)) continue;
      const a = nodes[from]!;
      let best = -1;
      let bestD = Infinity;
      for (let os = 0; os < 3; os++) {
        if (os === s) continue;
        for (let of = 0; of < FILES; of++) {
          const to = wingAt(os, of, 4);
          const b = nodes[to]!;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < bestD) {
            bestD = d;
            best = to;
          }
        }
      }
      if (best >= 0 && bestD < 260) link(from, best);
    }
  }

  // —— 射线：翼内 4 向 + 过河 ——
  const rays = new Map<number, Ray[]>();
  const pushRay = (from: number, dir: number, targets: number[]): void => {
    if (!targets.length) return;
    const list = rays.get(from) ?? [];
    list.push({ dir, nodes: targets });
    rays.set(from, list);
  };

  for (let s = 0; s < 3; s++) {
    for (let r = 0; r < RANKS; r++) {
      for (let f = 0; f < FILES; f++) {
        const from = wingAt(s, f, r);
        const dirs: Array<[number, number, number]> = [
          [1, 0, 1],
          [-1, 0, 2],
          [0, 1, 3],
          [0, -1, 4],
        ];
        for (const [df, dr, dir] of dirs) {
          const targets: number[] = [];
          for (let k = 1; ; k++) {
            const nf = f + df * k;
            const nr = r + dr * k;
            if (!inside(nf, nr)) break;
            targets.push(wingAt(s, nf, nr));
          }
          pushRay(from, dir, targets);
        }
      }
    }
  }

  // 过河射线：跨到对岸后沿对岸的"向底线"方向继续
  for (const [from, tos] of bridges) {
    for (const to of tos) {
      const b = nodes[to]!;
      const line: number[] = [to];
      for (let r = (b.rank ?? 0) - 1; r >= 0; r--) line.push(wingAt(b.wing!, b.file!, r));
      pushRay(from, 10, line);
    }
  }

  // —— 跳跃：马 / 相（相不过河）——
  const jumps = new Map<number, JumpMove[]>();
  const pushJump = (from: number, jump: JumpMove): void => {
    const list = jumps.get(from) ?? [];
    if (list.some((j) => j.target === jump.target)) return;
    list.push(jump);
    jumps.set(from, list);
  };
  const HORSE: Array<[number, number, number, number]> = [
    [1, 2, 0, 1],
    [-1, 2, 0, 1],
    [1, -2, 0, -1],
    [-1, -2, 0, -1],
    [2, 1, 1, 0],
    [2, -1, 1, 0],
    [-2, 1, -1, 0],
    [-2, -1, -1, 0],
  ];
  for (let s = 0; s < 3; s++) {
    for (let r = 0; r < RANKS; r++) {
      for (let f = 0; f < FILES; f++) {
        const from = wingAt(s, f, r);
        for (const [df, dr, lf, lr] of HORSE) {
          if (!inside(f + df, r + dr) || !inside(f + lf, r + lr)) continue;
          pushJump(from, {
            kind: 'horse',
            target: wingAt(s, f + df, r + dr),
            leg: wingAt(s, f + lf, r + lr),
          });
        }
        for (const [df, dr] of [[2, 2], [2, -2], [-2, 2], [-2, -2]] as const) {
          if (!inside(f + df, r + dr) || !inside(f + df / 2, r + dr / 2)) continue;
          pushJump(from, {
            kind: 'elephant',
            target: wingAt(s, f + df, r + dr),
            eye: wingAt(s, f + df / 2, r + dr / 2),
          });
        }
      }
    }
  }
  // 马也能过河（桥上没有蹩腿）
  for (const [from, tos] of bridges) {
    for (const to of tos) pushJump(from, { kind: 'horse', target: to });
  }

  // —— 九宫 ——
  const palaces = new Map<Frame, number[]>();
  for (let s = 0; s < 3; s++) {
    const list: number[] = [];
    for (let r = 0; r <= 2; r++) for (let f = 3; f <= 5; f++) list.push(wingAt(s, f, r));
    palaces.set(FRAME_OF_WING[s]!, list);
  }

  // —— 开局：与双人完全一致 ——
  const backRank: Array<[PieceKind, number]> = [
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
  const startLayout: PieceInit[] = [];
  for (let s = 0; s < 3; s++) {
    const team = WING_TEAM[s]!;
    for (const [kind, f] of backRank) {
      startLayout.push({ node: wingAt(s, f, 0), piece: { team, kind } satisfies Piece });
    }
    startLayout.push({ node: wingAt(s, 1, 2), piece: { team, kind: 'cannon' } });
    startLayout.push({ node: wingAt(s, 7, 2), piece: { team, kind: 'cannon' } });
    for (const f of [0, 2, 4, 6, 8]) {
      startLayout.push({ node: wingAt(s, f, 3), piece: { team, kind: 'pawn' } });
    }
  }

  const topology: Topology = {
    name: 'three',
    nodes,
    rays,
    jumps,
    palaces,
    startLayout,
    boardBox: { w: 1023, h: 980 },
    segments: [],
    gap: 57,

    palace(team) {
      return new Set(palaces.get(FRAME_OF_WING[TEAM_WING[team]]!) ?? []);
    },

    ownHalf(node, team) {
      return nodes[node]!.wing === TEAM_WING[team];
    },

    /** 兵向前：翼内 rank+1；站在河沿则过河（顶点处左右皆可） */
    pawnForward(node, team) {
      const n = nodes[node]!;
      if (n.wing !== TEAM_WING[team]) return [];
      if ((n.rank ?? 0) < RANKS - 1) return [wingAt(n.wing!, n.file!, (n.rank ?? 0) + 1)];
      return bridges.get(node) ?? [];
    },

    pawnSide(node) {
      const n = nodes[node]!;
      const out: number[] = [];
      if (n.file! > 0) out.push(wingAt(n.wing!, n.file! - 1, n.rank!));
      if (n.file! < FILES - 1) out.push(wingAt(n.wing!, n.file! + 1, n.rank!));
      return out;
    },
  };

  return { topology, wingAtId: wingAt, bridges };
}

const built = createThreeTopology();

export const threeTopology: Topology = built.topology;
export const threeWingAt = built.wingAtId;
export const threeBridges = built.bridges;
