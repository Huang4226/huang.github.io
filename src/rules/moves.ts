import type { Piece } from '../core/types';
import type { Topology } from '../topology/types';

/**
 * 伪合法走法：只按兵种几何 + 区域限制生成，不考虑"走了之后自己是否被将军"。
 * 合法性过滤在 rules/check.ts。三人局的跨区规则由拓扑的 rays/jumps 决定，这里不特判。
 */
export function pseudoMovesFrom(
  cells: ReadonlyArray<Piece | null>,
  topo: Topology,
  from: number,
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
      for (const jump of topo.jumps.get(from) ?? []) {
        if (jump.kind !== 'horse') continue;
        // 过河桥上的"跳"没有蹩腿点
        if (jump.leg !== undefined && cells[jump.leg]) continue;
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
        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        // 九宫内斜走一格：两个方向各一格（不依赖固定格距，兼容三人局的翼）
        if (Math.abs(dx - topo.gap) <= topo.gap * 0.2 && Math.abs(dy - topo.gap) <= topo.gap * 0.2) {
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
      for (const id of topo.pawnForward(from, piece.team)) push(id);
      const crossed = piece.crossed ?? !topo.ownHalf(from, piece.team);
      if (crossed) {
        for (const id of topo.pawnSide(from, piece.team)) {
          // 过河兵不能退回本方半场（三人局逐鹿台里可能相邻到自家渡口）
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
