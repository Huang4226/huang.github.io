import { describe, expect, it } from 'vitest';
import { threeBridges, threeTopology, threeWingAt } from '../../src/topology/three';

const topo = threeTopology;

describe('三人拓扑（三人地图）', () => {
  it('135 个交点：三翼各 45（9 列 × 5 行）', () => {
    expect(topo.nodes).toHaveLength(135);
    for (let s = 0; s < 3; s++) {
      expect(topo.nodes.filter((n) => n.wing === s)).toHaveLength(45);
    }
    for (let s = 0; s < 3; s++) {
      for (let r = 0; r < 5; r++) {
        for (let f = 0; f < 9; f++) {
          expect(threeWingAt(s, f, r)).toBeTypeOf('number');
        }
      }
    }
  });

  it('三个河道顶点两两相连（倒三角）', () => {
    const apexes = [0, 1, 2].map((s) => threeWingAt(s, 4, 4));
    for (const apex of apexes) {
      const partners = threeBridges.get(apex) ?? [];
      const others = partners.filter((p) => !apexes.includes(p));
      expect(others).toHaveLength(0);
      // 每个顶点至少连到另外两个顶点中的两个方向
      expect(partners.length).toBeGreaterThanOrEqual(2);
    }
    expect(new Set(apexes).size).toBe(3);
  });

  it('每条河沿点都至少有一条过河桥', () => {
    for (let s = 0; s < 3; s++) {
      for (let f = 0; f < 9; f++) {
        const id = threeWingAt(s, f, 4);
        expect(threeBridges.get(id)?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('九宫各 9 点，位于翼内 file 3–5 × rank 0–2', () => {
    for (const team of ['red', 'black', 'white'] as const) {
      const palace = topo.palace(team);
      expect(palace.size).toBe(9);
      for (const id of palace) {
        const n = topo.nodes[id]!;
        expect(n.rank).toBeLessThanOrEqual(2);
        expect(n.file).toBeGreaterThanOrEqual(3);
        expect(n.file).toBeLessThanOrEqual(5);
      }
    }
  });

  it('开局 48 子，每翼 16 子，摆法与双人一致', () => {
    expect(topo.startLayout).toHaveLength(48);
    for (const team of ['red', 'black', 'white'] as const) {
      const own = topo.startLayout.filter((p) => p.piece.team === team);
      expect(own).toHaveLength(16);
      const wing = team === 'red' ? 0 : team === 'black' ? 1 : 2;
      const at = (f: number, r: number): string | undefined =>
        own.find((p) => p.node === threeWingAt(wing, f, r))?.piece.kind;
      expect(at(4, 0)).toBe('general');
      expect(at(0, 0)).toBe('chariot');
      expect(at(1, 2)).toBe('cannon');
      expect(at(4, 3)).toBe('pawn');
      expect(own.filter((p) => p.piece.kind === 'pawn')).toHaveLength(5);
    }
  });

  it('所有交点落在底图范围内，且互不重合', () => {
    for (const n of topo.nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.y).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(topo.boardBox.w);
      expect(n.y).toBeLessThan(topo.boardBox.h);
    }
    let min = Infinity;
    for (let i = 0; i < topo.nodes.length; i++) {
      for (let j = i + 1; j < topo.nodes.length; j++) {
        const a = topo.nodes[i]!;
        const b = topo.nodes[j]!;
        min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    expect(min).toBeGreaterThan(12);
  });
});
