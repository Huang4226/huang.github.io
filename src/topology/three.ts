import type { Piece, PieceKind, Team } from '../core/types';
import { THREE_NODES } from './three-coords';
import type { BoardNode, Frame, JumpMove, PieceInit, Ray, Topology } from './types';

/**
 * 三人局拓扑：三翼各 9×5 = 45 个交点，共 135 个，渡口（rank 4）点对点相连。
 *
 * 交点的像素坐标不是公式算出来的，而是从 `picture/三人地图.png` 的墨线里逐点标定的
 * （见 three-coords.ts 与 docs/设计文档.md 7.2.1）。这里只用坐标画图和判命中；
 * 走法、将军、飞将、吃子全部只看本文件建立的 rays / jumps / bridges。
 */
const FILES = 9;
const RANKS = 5;

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
        const id = nodes.length;
        const [x, y] = THREE_NODES[id]!;
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

  // —— 射线：河道不切断线，列线走到渡口就顺着桥接上对岸那条列线 ——
  const rays = new Map<number, Ray[]>();
  const pushRay = (from: number, dir: number, targets: number[]): void => {
    if (!targets.length) return;
    const list = rays.get(from) ?? [];
    list.push({ dir, nodes: targets });
    rays.set(from, list);
  };

  /** 对岸那条列线：从对岸渡口点往下走到本方底线 */
  const bankLine = (partner: number): number[] => {
    const b = nodes[partner]!;
    const line: number[] = [partner];
    for (let rr = (b.rank ?? 0) - 1; rr >= 0; rr--) line.push(wingAt(b.wing!, b.file!, rr));
    return line;
  };

  for (let s = 0; s < 3; s++) {
    for (let r = 0; r < RANKS; r++) {
      for (let f = 0; f < FILES; f++) {
        const from = wingAt(s, f, r);
        for (const [df, dr, dir] of [[1, 0, 1], [-1, 0, 2], [0, -1, 4]] as const) {
          const targets: number[] = [];
          for (let k = 1; ; k++) {
            const nf = f + df * k;
            const nr = r + dr * k;
            if (!inside(nf, nr)) break;
            targets.push(wingAt(s, nf, nr));
          }
          pushRay(from, dir, targets);
        }

        // 向渡口（rank+）：本列剩余的点 + 过桥后的对岸列线。
        // 渡口顶点连着两条桥，所以从顶点出发会分叉成两条射线（车/炮各走一条）。
        const up: number[] = [];
        for (let k = r + 1; k < RANKS; k++) up.push(wingAt(s, f, k));
        const bank = wingAt(s, f, RANKS - 1);
        const partners = bridges.get(bank) ?? [];
        if (!partners.length) {
          pushRay(from, 3, up);
          continue;
        }
        for (const partner of partners) {
          pushRay(from, 3, [...up, ...bankLine(partner)]);
        }
      }
    }
  }

  // —— 跳跃：马 / 相（相不过河）——
  const jumps = new Map<number, JumpMove[]>();
  const pushJump = (from: number, jump: JumpMove): void => {
    const list = jumps.get(from) ?? [];
    // 同一落点可能有多条路线（蹩腿点不同），要全部留下
    if (list.some((j) => j.target === jump.target && j.leg === jump.leg)) return;
    list.push(jump);
    jumps.set(from, list);
  };

  // 相：翼内 2×2，塞象眼，不过河
  for (let s = 0; s < 3; s++) {
    for (let r = 0; r < RANKS; r++) {
      for (let f = 0; f < FILES; f++) {
        const from = wingAt(s, f, r);
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

  // —— 马：按"直行两格 + 拐弯一格"在图上走，不套理想方格 ——
  // 这样地形拉伸、渡口倒三角都自然成立：路线永远是"两段直行 + 一段拐弯"，
  // 第一格的落点就是蹩马腿的位置；绕回出发点（倒三角转一圈）的路线直接丢弃。
  const NB = new Map<number, number[]>();
  for (const [from, list] of rays) {
    for (const ray of list) {
      const first = ray.nodes[0];
      if (first === undefined) continue;
      const l = NB.get(from) ?? [];
      if (!l.includes(first)) l.push(first);
      NB.set(from, l);
    }
  }
  /** 在 b 处量 a→b 与 b→c 的夹角：0°=继续直行，90°=拐弯，180°=掉头 */
  const angleAt = (a: number, b: number, c: number): number => {
    const p = nodes[a]!;
    const q = nodes[b]!;
    const r = nodes[c]!;
    const v1x = q.x - p.x;
    const v1y = q.y - p.y;
    const v2x = r.x - q.x;
    const v2y = r.y - q.y;
    const d = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
    return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
  };
  const STRAIGHT = 60; // 行/列线在盘心折了约 50–57°，所以"直行"要放宽到 60°
  const TURN_LO = 66;
  const TURN_HI = 132;
  const isBridge = (a: number, b: number): boolean => nodes[a]!.wing !== nodes[b]!.wing;
  const cmpScore = (u: number[], v: number[]): number => {
    for (let i = 0; i < u.length; i++) {
      if (u[i]! !== v[i]!) return u[i]! - v[i]!;
    }
    return 0;
  };
  for (let x = 0; x < nodes.length; x++) {
    // 一个落点只留一条路线：先看少过河，再看拐角是否最像 90°，最后看总弯度
    const best = new Map<number, { leg: number; score: number[] }>();
    for (const a of NB.get(x) ?? []) {
      const br1 = isBridge(x, a) ? 1 : 0;
      for (const a2 of NB.get(a) ?? []) {
        if (a2 === x) continue; // 掉头回去，不算
        const br2 = isBridge(a, a2) ? 1 : 0;
        // 倒三角正好三条边：连跨两条桥就是"绕着三角转一圈"，直接不算
        if (br1 && br2) continue;
        const bend = angleAt(x, a, a2);
        for (const b of NB.get(a2) ?? []) {
          if (b === a) continue;
          if (b === x) continue; // 转一圈回到原地 → 删掉
          const br3 = isBridge(a2, b) ? 1 : 0;
          if (br2 && br3) continue;
          const t = angleAt(a, a2, b);
          // 形 A：先直行两格，再拐一格；形 B：先拐一格，再直行两格
          const straightThenTurn = bend <= STRAIGHT && t >= TURN_LO && t <= TURN_HI;
          const turnThenStraight = bend >= TURN_LO && bend <= TURN_HI && t <= STRAIGHT;
          // 形 C：两翼错开的地方两条线都只折了 30° 左右，视觉上仍是"拐了一下"
          const doubleBend = bend >= 25 && bend <= 62 && t >= 25 && t <= 62;
          if (!straightThenTurn && !turnThenStraight && !doubleBend) continue;
          const score = [br1 + br2 + br3, Math.round(Math.abs(t - 90)), Math.round(bend)];
          const prev = best.get(b);
          if (!prev || cmpScore(score, prev.score) < 0) best.set(b, { leg: a, score });
        }
      }
    }
    for (const [target, { leg }] of best) pushJump(x, { kind: 'horse', target, leg });
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

    /**
     * 兵前进：
     * - 未过河（含被收编的兵）：朝本翼渡口 rank+1；
     * - 已过河：深入所在翼 rank−1，到底线后无路可进；
     * - 渡口（rank 4）不算"前进"，续过河走 pawnCross，掉头走 pawnRetreat。
     */
    pawnForward(node, _team, crossed) {
      const n = nodes[node]!;
      const rank = n.rank ?? 0;
      if (crossed) return rank > 0 ? [wingAt(n.wing!, n.file!, rank - 1)] : [];
      return rank < RANKS - 1 ? [wingAt(n.wing!, n.file!, rank + 1)] : [];
    },

    /** 渡口过桥：每个河沿点都有桥，顶点处连两座 */
    pawnCross(node) {
      return bridges.get(node) ?? [];
    },

    /** 掉头：沿该翼向渡口退一步（仅在"地主已灭"时才允许调用） */
    pawnRetreat(node) {
      const n = nodes[node]!;
      const rank = n.rank ?? 0;
      return rank < RANKS - 1 ? [wingAt(n.wing!, n.file!, rank + 1)] : [];
    },

    /** 该翼的"地主"队伍：红 0 / 黑 1 / 白 2 */
    hostTeam(node) {
      const wing = nodes[node]!.wing;
      return wing === undefined ? null : (WING_TEAM[wing] ?? null);
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
