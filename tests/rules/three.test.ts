import { describe, expect, it } from 'vitest';
import { positionKey } from '../../src/core/hash';
import { createInitialState } from '../../src/core/state';
import type { GameState, Piece, PieceKind, Team } from '../../src/core/types';
import { legalMovesFrom } from '../../src/rules/check';
import { threeBridges, threeTopology, threeWingAt } from '../../src/topology/three';

const topo = threeTopology;

type Spec = [node: number, team: Team, kind: PieceKind, crossed?: boolean];

function makeBoard(specs: Spec[], turn: Team): GameState {
  const base = createInitialState('three', topo);
  const cells: (Piece | null)[] = base.cells.map(() => null);
  for (const [node, team, kind, crossed] of specs) {
    cells[node] = crossed === undefined ? { team, kind } : { team, kind, crossed };
  }
  return {
    ...base,
    cells,
    turn,
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

const targets = (specs: Spec[], turn: Team, from: number): number[] =>
  legalMovesFrom(makeBoard(specs, turn), topo, from).sort((a, b) => a - b);

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

  it('马可以过河（桥上没有蹩腿）', () => {
    const bank = threeWingAt(0, 2, 4);
    const moves = targets([[bank, 'red', 'horse']], 'red', bank);
    expect(moves.some((m) => wingOf(m) !== 0)).toBe(true);
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
