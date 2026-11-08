import { describe, expect, it } from 'vitest';
import { positionKey } from '../../src/core/hash';
import { createInitialState } from '../../src/core/state';
import type { GameState, Piece, PieceKind, Team } from '../../src/core/types';
import { inCheck, legalMovesFrom } from '../../src/rules/check';
import { attackTargets } from '../../src/rules/moves';
import { threeBridges, threeTopology, threeWingAt } from '../../src/topology/three';

const topo = threeTopology;

type Spec = [node: number, team: Team, kind: PieceKind, crossed?: boolean];

function makeBoard(specs: Spec[], turn: Team, order?: Team[]): GameState {
  const base = createInitialState('three', topo);
  const cells: (Piece | null)[] = base.cells.map(() => null);
  for (const [node, team, kind, crossed] of specs) {
    cells[node] = crossed === undefined ? { team, kind } : { team, kind, crossed };
  }
  return {
    ...base,
    cells,
    turn,
    order: order ?? base.order,
    history: [],
    captured: [],
    ply: 0,
    quiet: 0,
    positions: [positionKey({ cells, turn })],
    eliminations: [],
    status: 'playing',
    winner: null,
    endReason: null,
  };
}

const targets = (specs: Spec[], turn: Team, from: number, order?: Team[]): number[] =>
  legalMovesFrom(makeBoard(specs, turn, order), topo, from).sort((a, b) => a - b);

const wingOf = (id: number): number | undefined => topo.nodes[id]!.wing;

describe('三人规则 · 过河（新地图）', () => {
  it('河沿上的车可以过河，并沿对岸向底线继续滑行', () => {
    const from = threeWingAt(0, 4, 4);
    const moves = targets([[from, 'red', 'chariot']], 'red', from);
    const partners = threeBridges.get(from)!;
    expect(partners.length).toBeGreaterThanOrEqual(2);
    for (const p of partners) expect(moves).toContain(p);
    // 过河后能继续走到对岸的底线
    const partner = partners[0]!;
    expect(moves).toContain(threeWingAt(wingOf(partner)!, topo.nodes[partner]!.file!, 0));
  });

  it('顶点上的兵可以选择左右过河（两个方向）', () => {
    const apex = threeWingAt(0, 4, 4);
    const moves = targets([[apex, 'red', 'pawn']], 'red', apex);
    expect(moves).toHaveLength(2);
    for (const m of moves) expect(wingOf(m)).not.toBe(0);
  });

  it('非顶点的河沿兵只能过河，不能横走', () => {
    const bank = threeWingAt(0, 0, 4);
    const moves = targets([[bank, 'red', 'pawn']], 'red', bank);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) {
      expect(wingOf(m)).not.toBe(0);
    }
  });

  it('兵过河后可以横走，且不能再退回本方半场', () => {
    const enemyBank = threeWingAt(1, 4, 3);
    const moves = targets([[enemyBank, 'red', 'pawn', true]], 'red', enemyBank);
    expect(moves).toContain(threeWingAt(1, 3, 3));
    expect(moves).toContain(threeWingAt(1, 5, 3));
    for (const m of moves) expect(topo.ownHalf(m, 'red')).toBe(false);
  });

  it('过河兵在他翼可以继续前进，一路推进到底线', () => {
    for (let rank = 4; rank > 0; rank--) {
      const from = threeWingAt(1, 4, rank);
      const moves = targets([[from, 'red', 'pawn', true]], 'red', from);
      expect(moves).toContain(threeWingAt(1, 4, rank - 1));
    }
  });

  it('过河兵推进到他翼底线后不能再前进，只能横走', () => {
    const bottom = threeWingAt(1, 4, 0);
    const moves = targets([[bottom, 'red', 'pawn', true]], 'red', bottom);
    expect(moves).toHaveLength(2);
    for (const m of moves) {
      expect(wingOf(m)).toBe(1);
      expect(topo.nodes[m]!.rank).toBe(0);
    }
  });

  it('过河兵在河道边不会退回本方翼，但可续过河去第三翼', () => {
    const from = threeWingAt(1, 4, 4);
    const moves = targets([[from, 'red', 'pawn', true]], 'red', from);
    expect(moves).toContain(threeWingAt(1, 4, 3)); // 深入黑翼
    expect(moves).toContain(threeWingAt(2, 4, 4)); // 续过河去白翼
    expect(moves).not.toContain(threeWingAt(0, 4, 4)); // 不回红翼（本方）
  });

  it('归降兵仍是未过河状态：朝所在翼渡口前进，不横走', () => {
    const from = threeWingAt(1, 4, 3);
    const moves = targets([[from, 'red', 'pawn', false]], 'red', from);
    expect(moves).toEqual([threeWingAt(1, 4, 4)]);
  });

  it('兵深入他翼后不能退回河道边', () => {
    for (const rank of [3, 2, 1]) {
      const from = threeWingAt(2, 4, rank);
      const moves = targets([[from, 'red', 'pawn', true]], 'red', from);
      expect(moves).not.toContain(threeWingAt(2, 4, rank + 1));
      expect(moves).toContain(threeWingAt(2, 4, rank - 1));
    }
  });

  it('所在翼的将死后，已过河的兵才可掉头退回河道', () => {
    const deep = threeWingAt(2, 4, 2);
    const alive = targets([[deep, 'red', 'pawn', true]], 'red', deep);
    const dead = targets([[deep, 'red', 'pawn', true]], 'red', deep, ['red', 'black']);
    expect(alive).not.toContain(threeWingAt(2, 4, 3));
    expect(dead).toContain(threeWingAt(2, 4, 3));
    expect(dead).toContain(threeWingAt(2, 4, 1)); // 掉头后仍可选择继续深入
  });

  it('掉头回到河道边后，可续过河去第三翼', () => {
    const wharf = threeWingAt(2, 4, 4);
    const moves = targets([[wharf, 'red', 'pawn', true]], 'red', wharf, ['red', 'black']);
    expect(moves).toContain(threeWingAt(1, 4, 4)); // 白翼渡口 → 黑翼
    expect(moves).not.toContain(threeWingAt(0, 4, 4)); // 不回红翼
  });

  it('黑兵过河到白翼河道边，仍可续过河进攻红翼', () => {
    const wharf = threeWingAt(2, 4, 4);
    const moves = targets([[wharf, 'black', 'pawn', true]], 'black', wharf);
    expect(moves).toContain(threeWingAt(0, 4, 4)); // 转战红翼
    expect(moves).not.toContain(threeWingAt(1, 4, 4)); // 不回黑翼
  });

  it('白兵在黑翼河道边：可深入黑翼，也可沿河沿到顶点转战红翼', () => {
    const point = threeWingAt(1, 3, 4);
    const moves = targets([[point, 'white', 'pawn', true]], 'white', point);
    expect(moves).toContain(threeWingAt(1, 3, 3)); // 深入黑翼
    expect(moves).toContain(threeWingAt(1, 4, 4)); // 沿河沿到顶点

    const apex = threeWingAt(1, 4, 4);
    const fromApex = targets([[apex, 'white', 'pawn', true]], 'white', apex);
    expect(fromApex).toContain(threeWingAt(0, 4, 4)); // 转战红翼
    expect(fromApex).not.toContain(threeWingAt(2, 4, 4)); // 不回白翼
  });

  it('马可以过河（桥上没有蹩腿）', () => {
    const bank = threeWingAt(0, 2, 4);
    const moves = targets([[bank, 'red', 'horse']], 'red', bank);
    expect(moves.some((m) => wingOf(m) !== 0)).toBe(true);
  });
});

describe('三人规则 · 隔河照面（方案 B：只改攻击判定，不改走法）', () => {
  const g0 = threeWingAt(0, 4, 0);
  const g1 = threeWingAt(1, 4, 0);
  const g2 = threeWingAt(2, 4, 0);

  it('B-01 中线清空时，将帅隔着渡口照面 = 将军', () => {
    const state = makeBoard([[g0, 'red', 'general'], [g1, 'black', 'general']], 'black');
    expect(attackTargets(state.cells, topo, g0)).toContain(g1);
    expect(inCheck(state.cells, topo, 'black', ['red', 'white'])).toBe(true);
  });

  it('B-02 中线被任何一子挡住就不算照面', () => {
    const state = makeBoard(
      [
        [g0, 'red', 'general'],
        [g1, 'black', 'general'],
        [threeWingAt(0, 4, 2), 'red', 'pawn'],
      ],
      'black',
    );
    expect(attackTargets(state.cells, topo, g0)).not.toContain(g1);
    expect(inCheck(state.cells, topo, 'black', ['red', 'white'])).toBe(false);
  });

  it('B-03 照面不产生走法：帅仍然走不出九宫，也不能隔河吃将', () => {
    const state = makeBoard([[g0, 'red', 'general'], [g1, 'black', 'general']], 'red');
    const moves = legalMovesFrom(state, topo, g0);
    expect(moves).not.toContain(g1);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) expect(topo.palace('red').has(m)).toBe(true);
  });

  it('B-04 三家中线彼此照面：红帅同时看到黑将与白将', () => {
    const state = makeBoard(
      [[g0, 'red', 'general'], [g1, 'black', 'general'], [g2, 'white', 'general']],
      'red',
    );
    const seen = attackTargets(state.cells, topo, g0);
    expect(seen).toContain(g1);
    expect(seen).toContain(g2);
  });

  it('B-05 开局三家老将都在中线上，但被本翼中兵挡住，开局不算照面', () => {
    const state = createInitialState('three', topo);
    for (const team of ['red', 'black', 'white'] as const) {
      const enemies = (['red', 'black', 'white'] as const).filter((t) => t !== team);
      expect(inCheck(state.cells, topo, team, enemies)).toBe(false);
    }
  });
});

describe('三人规则 · 河道不断线（车/炮/马直接跨河）', () => {
  it('X-09 中炮以本翼中兵为架，可打对岸两家的中兵', () => {
    const cannon = threeWingAt(0, 4, 2);
    const state = makeBoard(
      [
        [cannon, 'red', 'cannon'],
        [threeWingAt(0, 4, 3), 'red', 'pawn'],
        [threeWingAt(1, 4, 3), 'black', 'pawn'],
        [threeWingAt(2, 4, 3), 'white', 'pawn'],
      ],
      'red',
    );
    const seen = attackTargets(state.cells, topo, cannon);
    expect(seen).toContain(threeWingAt(1, 4, 3));
    expect(seen).toContain(threeWingAt(2, 4, 3));
  });

  it('X-10 车沿中线一着过河，直达对岸底线', () => {
    const from = threeWingAt(0, 4, 1);
    const moves = targets([[from, 'red', 'chariot']], 'red', from);
    expect(moves).toContain(threeWingAt(1, 4, 0));
    expect(moves).toContain(threeWingAt(2, 4, 0));
  });

  it('X-11 渡口红马"斜着走日"跨河', () => {
    const from = threeWingAt(0, 5, 4);
    const moves = targets([[from, 'red', 'horse']], 'red', from);
    const cross = moves.filter((m) => wingOf(m) !== 0);
    expect(cross.length).toBeGreaterThanOrEqual(4);
    for (const m of cross) expect(topo.nodes[m]!.rank).toBeGreaterThanOrEqual(2);
  });

  it('X-12 线上有子就过不去（车不能越子）', () => {
    const from = threeWingAt(0, 4, 1);
    const moves = targets(
      [
        [from, 'red', 'chariot'],
        [threeWingAt(0, 4, 3), 'red', 'pawn'],
      ],
      'red',
      from,
    );
    expect(moves).toContain(threeWingAt(0, 4, 2));
    expect(moves).not.toContain(threeWingAt(0, 4, 4));
    expect(moves).not.toContain(threeWingAt(1, 4, 0));
  });

  it('X-13 一个落点只有一条腿：腿被堵就跳不过去', () => {
    const from = threeWingAt(0, 4, 2);
    const target = threeWingAt(0, 3, 4);
    const legs = (topo.jumps.get(from) ?? [])
      .filter((j) => j.kind === 'horse' && j.target === target)
      .map((j) => j.leg!)
      .filter((x): x is number => x !== undefined);
    // 每个落点只保留一条路线，腿唯一
    expect(legs).toHaveLength(1);
    expect(targets([[from, 'red', 'horse']], 'red', from)).toContain(target);
    expect(targets([[from, 'red', 'horse'], [legs[0]!, 'red', 'pawn']], 'red', from)).not.toContain(target);
  });

  it('X-14 马不会"转一圈回到原地"', () => {
    for (let id = 0; id < topo.nodes.length; id++) {
      for (const jump of topo.jumps.get(id) ?? []) {
        if (jump.kind !== 'horse') continue;
        expect(jump.target).not.toBe(id);
        expect(jump.leg).not.toBe(id);
      }
    }
  });

  it('X-15 渡口顶点有 5 条出边，落点覆盖三个翼', () => {
    const apex = threeWingAt(0, 4, 4);
    const jumps = (topo.jumps.get(apex) ?? []).filter((j) => j.kind === 'horse');
    const legs = new Set(jumps.map((j) => j.leg));
    expect(legs.size).toBe(5);
    const wings = new Set([...new Set(jumps.map((j) => j.target))].map((t) => topo.nodes[t]!.wing));
    expect(wings.size).toBe(3);
  });
});

describe('三人规则 · 防御子不过河', () => {
  it('相只能在本翼活动', () => {
    const from = threeWingAt(0, 2, 0);
    const moves = targets([[from, 'red', 'elephant']], 'red', from);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) expect(wingOf(m)).toBe(0);
  });

  it('仕只在九宫内活动', () => {
    const palace = topo.palace('red');
    for (const from of palace) {
      const moves = targets([[from, 'red', 'advisor']], 'red', from);
      for (const m of moves) expect(palace.has(m)).toBe(true);
    }
  });

  it('帅不出九宫', () => {
    const palace = topo.palace('red');
    for (const from of palace) {
      const moves = targets([[from, 'red', 'general']], 'red', from);
      for (const m of moves) expect(palace.has(m)).toBe(true);
    }
  });
});
