import { describe, expect, it } from 'vitest';
import { positionKey } from '../../src/core/hash';
import { settleThree, THREE_TURN_CAP } from '../../src/core/result';
import { createInitialState } from '../../src/core/state';
import type { GameState, Piece, PieceKind, Team } from '../../src/core/types';
import { allLegalMoves } from '../../src/rules/check';
import { eliminatePlayer, scoreOf } from '../../src/rules/convert';
import { resolveEliminations } from '../../src/rules/session';
import { threeTopology, threeWingAt } from '../../src/topology/three';

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

const count = (s: GameState, team: Team): number =>
  s.cells.filter((p) => p && p.team === team).length;

/** 黑方摆满各兵种：车马炮各 1、未过河卒 1、过河卒 1、士 2、相 2、将 1 */
function blackSample(turn: Team = 'black'): GameState {
  return makeBoard(
    [
      [threeWingAt(1, 4, 0), 'black', 'general'],
      [threeWingAt(1, 0, 0), 'black', 'chariot'],
      [threeWingAt(1, 1, 0), 'black', 'horse'],
      [threeWingAt(1, 1, 2), 'black', 'cannon'],
      [threeWingAt(1, 3, 0), 'black', 'advisor'],
      [threeWingAt(1, 5, 0), 'black', 'advisor'],
      [threeWingAt(1, 2, 0), 'black', 'elephant'],
      [threeWingAt(1, 6, 0), 'black', 'elephant'],
      [threeWingAt(1, 4, 3), 'black', 'pawn'], // 未过河
      [threeWingAt(2, 3, 2), 'black', 'pawn', true], // 已过河（在第三家境内）
      [threeWingAt(0, 4, 0), 'red', 'general'],
      [threeWingAt(2, 4, 0), 'white', 'general'],
    ],
    turn,
  );
}

describe('M5 收编 · 范围与去留（S-02 / S-03 / S-17 / S-18）', () => {
  it('杀将后：车马炮与未过河卒归降，士相与过河卒移出', () => {
    const before = blackSample();
    const after = eliminatePlayer(before, topo, 'black', 'red');

    const e = after.eliminations[0]!;
    expect(e.victim).toBe('black');
    expect(e.killer).toBe('red');
    expect(e.converted.map((p) => p.kind).sort()).toEqual(['cannon', 'chariot', 'horse', 'pawn']);
    expect(e.removed).toHaveLength(6);
    expect(e.removed.filter((p) => p.kind === 'general')).toHaveLength(1);
    expect(e.removed.filter((p) => p.kind === 'advisor')).toHaveLength(2);
    expect(e.removed.filter((p) => p.kind === 'elephant')).toHaveLength(2);
    expect(e.removed.filter((p) => p.kind === 'pawn')).toHaveLength(1);
  });

  it('S-03 棋盘总子数 = 原总数 −（将 + 士 + 相 + 过河兵）', () => {
    const before = blackSample();
    const totalBefore = before.cells.filter(Boolean).length;
    const after = eliminatePlayer(before, topo, 'black', 'red');
    const totalAfter = after.cells.filter(Boolean).length;
    expect(totalAfter).toBe(totalBefore - 6);
    expect(count(after, 'red')).toBe(count(before, 'red') + 4);
    expect(count(after, 'white')).toBe(count(before, 'white'));
    expect(count(after, 'black')).toBe(0);
  });

  it('S-17 河沿上的卒算未过河（可收编），进入别家境内的卒算已过河（移除）', () => {
    const ferry = threeWingAt(1, 4, 4);
    const foreign = threeWingAt(2, 4, 3);
    const before = makeBoard(
      [
        [threeWingAt(1, 4, 0), 'black', 'general'],
        [ferry, 'black', 'pawn'],
        [foreign, 'black', 'pawn'],
        [threeWingAt(0, 4, 0), 'red', 'general'],
      ],
      'black',
    );
    const after = eliminatePlayer(before, topo, 'black', 'red');
    expect(after.cells[ferry]).toMatchObject({ team: 'red', kind: 'pawn' });
    expect(after.cells[ferry]!.crossed).toBeFalsy();
    expect(after.cells[foreign]).toBeNull();
  });

  it('S-18 归降的兵保持未过河状态', () => {
    const ferry = threeWingAt(1, 4, 3);
    const before = makeBoard(
      [
        [threeWingAt(1, 4, 0), 'black', 'general'],
        [ferry, 'black', 'pawn'],
        [threeWingAt(0, 4, 0), 'red', 'general'],
      ],
      'black',
    );
    const after = eliminatePlayer(before, topo, 'black', 'red');
    const pawn = after.cells[ferry]!;
    expect(pawn.team).toBe('red');
    expect(pawn.crossed).toBeFalsy();
    expect(after.cells[threeWingAt(1, 4, 4)]).toBeNull();
  });

  it('S-19 eliminate 事件同时记录 converted 与 removed', () => {
    const before = blackSample();
    const after = eliminatePlayer(before, topo, 'black', 'red');
    const e = after.eliminations[0]!;
    expect(e.converted.length + e.removed.length).toBe(count(before, 'black'));
    expect(after.order).toEqual(['red', 'white']);
  });
});

describe('M5 淘汰 · 轮转与终局（S-01 / S-05 / S-06 / S-07）', () => {
  it('S-01 淘汰后轮到下家', () => {
    const before = blackSample('black');
    const after = eliminatePlayer(before, topo, 'black', 'red');
    expect(after.turn).toBe('white');
    expect(after.order).not.toContain('black');
  });

  it('S-06 被将死 = 出局，收编权归将军方', () => {
    // 黑将(4,0) 被红车(4,2) 将军，(3,0)/(5,0) 被另两车封住
    const state = makeBoard(
      [
        [threeWingAt(1, 4, 0), 'black', 'general'],
        [threeWingAt(1, 4, 2), 'red', 'chariot'],
        [threeWingAt(1, 3, 3), 'red', 'chariot'],
        [threeWingAt(1, 5, 3), 'red', 'chariot'],
        [threeWingAt(0, 4, 0), 'red', 'general'],
        [threeWingAt(2, 4, 0), 'white', 'general'],
      ],
      'black',
    );
    expect(allLegalMoves(state, topo, 'black')).toHaveLength(0);
    const after = resolveEliminations(state, topo);
    expect(after.order).toEqual(['red', 'white']);
    const e = after.eliminations[0]!;
    expect(e.victim).toBe('black');
    expect(e.killer).toBe('red');
    expect(e.removed.some((p) => p.kind === 'general')).toBe(true);
  });

  it('S-07 困毙 = 出局，残子原地清除、无人收编', () => {
    const state = makeBoard(
      [
        [threeWingAt(1, 4, 1), 'black', 'general'],
        [threeWingAt(1, 2, 1), 'red', 'horse'],
        [threeWingAt(1, 6, 1), 'red', 'horse'],
        [threeWingAt(1, 3, 2), 'red', 'chariot'],
        [threeWingAt(1, 5, 2), 'red', 'chariot'],
        [threeWingAt(0, 4, 0), 'red', 'general'],
        [threeWingAt(2, 4, 0), 'white', 'general'],
      ],
      'black',
    );
    expect(allLegalMoves(state, topo, 'black')).toHaveLength(0);
    const after = resolveEliminations(state, topo);
    const e = after.eliminations[0]!;
    expect(e.killer).toBeNull();
    expect(e.converted).toHaveLength(0);
    expect(count(after, 'black')).toBe(0);
    expect(after.order).toEqual(['red', 'white']);
  });

  it('S-07b 无人收编时，攻击子也一并清除', () => {
    const before = blackSample('black');
    const after = eliminatePlayer(before, topo, 'black', null);
    const e = after.eliminations[0]!;
    expect(e.killer).toBeNull();
    expect(e.converted).toHaveLength(0);
    expect(count(after, 'black')).toBe(0);
    expect(count(after, 'red')).toBe(count(before, 'red'));
  });

  it('S-05 只剩一家时终局', () => {
    const before = blackSample('black');
    const after = eliminatePlayer(before, topo, 'black', 'red');
    const done = eliminatePlayer(after, topo, 'white', 'red');
    const settled = settleThree(done);
    expect(settled.status).toBe('over');
    expect(settled.winner).toBe('red');
    expect(settled.endReason).toBe('eliminated');
  });

  it('S-09 回合上限按计分判定', () => {
    const state = makeBoard(
      [
        [threeWingAt(0, 4, 0), 'red', 'general'],
        [threeWingAt(0, 0, 0), 'red', 'chariot'],
        [threeWingAt(1, 4, 0), 'black', 'general'],
        [threeWingAt(2, 4, 0), 'white', 'general'],
        [threeWingAt(2, 0, 0), 'white', 'horse'],
      ],
      'red',
    );
    state.ply = THREE_TURN_CAP;
    const settled = settleThree(state);
    expect(settled.status).toBe('over');
    expect(settled.endReason).toBe('score');
    expect(settled.winner).toBe('red');
    expect(scoreOf(settled, 'red')).toBeGreaterThan(scoreOf(settled, 'white'));
  });
});
