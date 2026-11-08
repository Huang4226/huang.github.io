import type { Piece, Team } from '../core/types';
import type { Topology } from '../topology/types';

/**
 * 伪合法走法：只按兵种几何 + 区域限制生成，不考虑"走了之后自己是否被将军"。
 * 合法性过滤在 rules/check.ts。三人局的跨区规则由拓扑的 rays/jumps 决定，这里不特判。
 */
export function pseudoMovesFrom(
  cells: ReadonlyArray<Piece | null>,
  topo: Topology,
  from: number,
  alive?: readonly Team[],
): number[] {
  const piece = cells[from];
  if (!piece) return [];

  const out: number[] = [];
  const push = (id: number): void => {
    const p = cells[id];
    if (!p || p.team !== piece.team) out.push(id);
  };

  switch (piece.kind) {
    case 'chariot': {
      for (const ray of topo.rays.get(from) ?? []) {
        for (const id of ray.nodes) {
          const p = cells[id];
          if (!p) {
            out.push(id);
            continue;
          }
          if (p.team !== piece.team) out.push(id);
          break;
        }
      }
      break;
    }
    case 'cannon': {
      for (const ray of topo.rays.get(from) ?? []) {
        let hasScreen = false;
        for (const id of ray.nodes) {
          const p = cells[id];
          if (!hasScreen) {
            if (!p) {
              out.push(id);
              continue;
            }
            hasScreen = true;
            continue;
          }
          if (p) {
            if (p.team !== piece.team) out.push(id);
            break;
          }
        }
      }
      break;
    }
    case 'horse': {
      // 同一落点可能有多条路线（蹩腿点不同）：只要有一条腿没被堵就能走
      const seen = new Set<number>();
      for (const jump of topo.jumps.get(from) ?? []) {
        if (jump.kind !== 'horse') continue;
        if (seen.has(jump.target)) continue;
        if (jump.leg !== undefined && cells[jump.leg]) continue;
        seen.add(jump.target);
        push(jump.target);
      }
      break;
    }
    case 'elephant': {
      for (const jump of topo.jumps.get(from) ?? []) {
        if (jump.kind !== 'elephant' || jump.eye === undefined) continue;
        if (cells[jump.eye]) continue; // 塞象眼
        if (!topo.ownHalf(jump.target, piece.team)) continue; // 不过河
        push(jump.target);
      }
      break;
    }
    case 'advisor': {
      const a = topo.nodes[from]!;
      for (const target of topo.palace(piece.team)) {
        if (target === from) continue;
        const b = topo.nodes[target]!;
        // 九宫内斜走一格：按方阵坐标判 (±1, ±1)，与图上的实际格距无关
        if (a.file === undefined || a.rank === undefined) continue;
        if (b.file === undefined || b.rank === undefined) continue;
        if (Math.abs(b.file - a.file) === 1 && Math.abs(b.rank - a.rank) === 1) {
          push(target);
        }
      }
      break;
    }
    case 'general': {
      const palace = topo.palace(piece.team);
      for (const ray of topo.rays.get(from) ?? []) {
        const id = ray.nodes[0];
        if (id === undefined) continue;
        if (!palace.has(id)) continue; // 不出九宫
        push(id);
      }
      break;
    }
    case 'pawn': {
      const crossed = piece.crossed ?? !topo.ownHalf(from, piece.team);
      // 未过河朝渡口、已过河深入所在翼（rank−1），到底线后无路
      for (const id of topo.pawnForward(from, piece.team, crossed)) push(id);
      // 河道边（渡口）：可继续过桥去第三翼；不回本方翼
      for (const id of topo.pawnCross(from)) {
        if (!topo.ownHalf(id, piece.team)) push(id);
      }
      // 掉头：仅"已过河 + 所在翼的将已死"时开放，向渡口退一步
      if (crossed && alive) {
        const host = topo.hostTeam(from);
        if (host !== null && !alive.includes(host)) {
          for (const id of topo.pawnRetreat(from)) push(id);
        }
      }
      if (crossed) {
        for (const id of topo.pawnSide(from, piece.team)) {
          // 过河兵不能退回本方半场
          if (!topo.ownHalf(id, piece.team)) push(id);
        }
      }
      break;
    }
    default:
      break;
  }

  return out;
}

/**
 * 攻击格：伪合法走法 + 将帅照面（飞将）。
 * 飞将不是"可以走的招"，而是"这一列上对方老将正对着我"的攻击判定。
 * 三人局的列线在渡口处接上对岸那条线（见 topology/three.ts 的射线构造），
 * 所以这里的照面判定对"隔河对脸"天然成立，不需要额外分支。
 */
export function attackTargets(
  cells: ReadonlyArray<Piece | null>,
  topo: Topology,
  from: number,
): number[] {
  const piece = cells[from];
  if (!piece) return [];
  const out = pseudoMovesFrom(cells, topo, from);
  if (piece.kind !== 'general') return out;

  for (const ray of topo.rays.get(from) ?? []) {
    for (const id of ray.nodes) {
      const p = cells[id];
      if (!p) continue;
      if (p.kind === 'general' && p.team !== piece.team) out.push(id);
      break; // 只看第一条被挡的线
    }
  }
  return out;
}
