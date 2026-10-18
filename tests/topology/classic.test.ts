import { describe, expect, it } from 'vitest';
import { classicId, classicTopology } from '../../src/topology/classic';
import { CLASSIC_LAYOUT, classicX, classicY } from '../../src/topology/geometry';

const topo = classicTopology;
const GAP_X = CLASSIC_LAYOUT.gapX;
const GAP_Y = CLASSIC_LAYOUT.gapY;

describe('经典棋盘拓扑 · 节点（M1-01）', () => {
  it('共 90 个交点，id = rank*9 + file', () => {
    expect(topo.nodes).toHaveLength(90);
    expect(new Set(topo.nodes.map((n) => n.id)).size).toBe(90);
    for (const n of topo.nodes) {
      expect(n.id).toBe(classicId(n.file!, n.rank!));
    }
  });

  it('坐标严格落在标定网格上（无 0.01px 以上漂移）', () => {
    for (const n of topo.nodes) {
      expect(n.x).toBeCloseTo(classicX(n.file!), 6);
      expect(n.y).toBeCloseTo(classicY(n.rank!), 6);
    }
  });

  it('棋盘包围盒与底图一致，且所有点都在盒内', () => {
    expect(topo.boardBox).toEqual({ w: 454, h: 530 });
    for (const n of topo.nodes) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.y).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(topo.boardBox.w);
      expect(n.y).toBeLessThan(topo.boardBox.h);
    }
  });

  it('9 条竖线各含 10 点、10 条横线各含 9 点', () => {
    for (let file = 0; file < 9; file++) {
      const column = topo.nodes.filter((n) => n.file === file);
      expect(column).toHaveLength(10);
    }
    for (let rank = 0; rank < 10; rank++) {
      const row = topo.nodes.filter((n) => n.rank === rank);
      expect(row).toHaveLength(9);
    }
  });
});

describe('经典棋盘拓扑 · 走法射线', () => {
  it('每条射线上的点与起点共线且等距（竖线用 gapY，横线用 gapX）', () => {
    for (const n of topo.nodes) {
      const rays = topo.rays.get(n.id)!;
      expect(rays.length).toBeGreaterThan(0);
      for (const ray of rays) {
        const vertical = ray.dir === 2 || ray.dir === 3;
        const gap = vertical ? GAP_Y : GAP_X;
        expect(ray.nodes.length).toBeGreaterThan(0);
        ray.nodes.forEach((id, i) => {
          const m = topo.nodes[id]!;
          const dist = Math.hypot(m.x - n.x, m.y - n.y);
          expect(dist).toBeCloseTo(gap * (i + 1), 5);
          // 共线：叉积为 0
          const cross = (m.x - n.x) * (vertical ? 1 : 0) - (m.y - n.y) * (vertical ? 0 : 1);
          expect(Math.abs(cross)).toBeLessThan(1e-6);
        });
      }
    }
  });

  it('射线不因河界断开：rank 4 向上的射线一直通到 rank 9', () => {
    const ray = topo.rays
      .get(classicId(4, 4))!
      .find((r) => r.dir === 2)!;
    expect(ray.nodes).toEqual([5, 6, 7, 8, 9].map((rank) => classicId(4, rank)));
  });

  it('每条射线的长度 = 该方向剩余格数', () => {
    for (const n of topo.nodes) {
      for (const ray of topo.rays.get(n.id)!) {
        const expectLen =
          ray.dir === 0 ? 8 - n.file! : ray.dir === 1 ? n.file! : ray.dir === 2 ? 9 - n.rank! : n.rank!;
        expect(ray.nodes).toHaveLength(expectLen);
      }
    }
  });
});

describe('经典棋盘拓扑 · 跳跃（马 / 相象）', () => {
  it('中心点的马有 8 个落点，每个都带蹩腿点', () => {
    const jumps = topo.jumps.get(classicId(4, 4))!.filter((j) => j.kind === 'horse');
    expect(jumps).toHaveLength(8);
    for (const j of jumps) {
      expect(j.leg).toBeTypeOf('number');
      // 腿点与起点必须相邻（曼哈顿距离 1）
      const leg = topo.nodes[j.leg!]!;
      const from = topo.nodes[classicId(4, 4)]!;
      expect(Math.abs(leg.file! - from.file!) + Math.abs(leg.rank! - from.rank!)).toBe(1);
    }
  });

  it('角上的马只有 2 个落点，且不会生成盘外点', () => {
    const jumps = topo.jumps.get(classicId(0, 0))!.filter((j) => j.kind === 'horse');
    expect(jumps.map((j) => j.target).sort((a, b) => a - b)).toEqual(
      [classicId(1, 2), classicId(2, 1)].sort((a, b) => a - b),
    );
  });

  it('相/象每个点最多 4 个落点，且象眼 = 两点中点', () => {
    for (const n of topo.nodes) {
      const elephants = topo.jumps.get(n.id)!.filter((j) => j.kind === 'elephant');
      expect(elephants.length).toBeLessThanOrEqual(4);
      for (const j of elephants) {
        expect(j.eye).toBeTypeOf('number');
        const eye = topo.nodes[j.eye!]!;
        expect(eye.file).toBe((n.file! + topo.nodes[j.target]!.file!) / 2);
        expect(eye.rank).toBe((n.rank! + topo.nodes[j.target]!.rank!) / 2);
      }
    }
  });
});

describe('经典棋盘拓扑 · 九宫与渲染线段', () => {
  it('双方九宫各 9 个点', () => {
    const palace = topo.palaces.get('plane')!;
    expect(palace).toHaveLength(18);
    expect(palace.filter((id) => topo.nodes[id]!.rank! <= 2)).toHaveLength(9);
    expect(palace.filter((id) => topo.nodes[id]!.rank! >= 7)).toHaveLength(9);
  });

  it('渲染线段 154 段：横 80 + 竖 74（中路 7 条在河界断开）', () => {
    expect(topo.segments).toHaveLength(154);
    const horizontal = topo.segments.filter(([a, b]) => topo.nodes[a]!.rank === topo.nodes[b]!.rank);
    const vertical = topo.segments.filter(([a, b]) => topo.nodes[a]!.file === topo.nodes[b]!.file);
    expect(horizontal).toHaveLength(80);
    expect(vertical).toHaveLength(74);
    // 河界（rank4→rank5）只有最左、最右两条竖线连通
    const crossing = vertical.filter(
      ([a, b]) =>
        Math.abs(topo.nodes[a]!.rank! - topo.nodes[b]!.rank!) === 1 &&
        Math.min(topo.nodes[a]!.rank!, topo.nodes[b]!.rank!) === 4,
    );
    expect(crossing.map(([a]) => topo.nodes[a]!.file).sort((x, y) => x! - y!)).toEqual([0, 8]);
  });

  it('每条线段的两个端点相邻（横线差 gapX，竖线差 gapY）', () => {
    for (const [a, b] of topo.segments) {
      const na = topo.nodes[a]!;
      const nb = topo.nodes[b]!;
      const sameRank = na.rank === nb.rank;
      const sameFile = na.file === nb.file;
      expect(sameRank || sameFile).toBe(true);
      if (sameRank) {
        expect(Math.abs(na.x - nb.x)).toBeCloseTo(GAP_X, 5);
      } else {
        expect(Math.abs(na.y - nb.y)).toBeCloseTo(GAP_Y, 5);
      }
    }
  });
});

describe('经典棋盘拓扑 · 初始布局（M1-03）', () => {
  it('红黑各 16 子，共 32 子', () => {
    expect(topo.startLayout).toHaveLength(32);
    expect(topo.startLayout.filter((p) => p.piece.team === 'red')).toHaveLength(16);
    expect(topo.startLayout.filter((p) => p.piece.team === 'black')).toHaveLength(16);
  });

  it('底线布局：车马相仕帅仕相马车', () => {
    const order = ['chariot', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'chariot'];
    const redBack = Array.from({ length: 9 }, (_, f) =>
      topo.startLayout.find((p) => p.node === classicId(f, 0))?.piece.kind,
    );
    const blackBack = Array.from({ length: 9 }, (_, f) =>
      topo.startLayout.find((p) => p.node === classicId(f, 9))?.piece.kind,
    );
    expect(redBack).toEqual(order);
    expect(blackBack).toEqual(order);
    expect(topo.startLayout.find((p) => p.node === classicId(4, 0))!.piece.team).toBe('red');
    expect(topo.startLayout.find((p) => p.node === classicId(4, 9))!.piece.team).toBe('black');
  });

  it('炮与兵卒位置正确', () => {
    const at = (file: number, rank: number): string | undefined =>
      topo.startLayout.find((p) => p.node === classicId(file, rank))?.piece.kind;
    expect(at(1, 2)).toBe('cannon');
    expect(at(7, 2)).toBe('cannon');
    expect(at(1, 7)).toBe('cannon');
    expect(at(7, 7)).toBe('cannon');
    for (const f of [0, 2, 4, 6, 8]) {
      expect(at(f, 3)).toBe('pawn');
      expect(at(f, 6)).toBe('pawn');
    }
    // 兵卒行之外不应有兵
    expect(topo.startLayout.filter((p) => p.piece.kind === 'pawn')).toHaveLength(10);
  });

  it('开局时没有任何两个子重叠', () => {
    const nodes = topo.startLayout.map((p) => p.node);
    expect(new Set(nodes).size).toBe(nodes.length);
  });
});
