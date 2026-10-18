import { describe, expect, it } from 'vitest';
import { historyTexts, notateMove } from '../../src/core/notation';
import { positionKey } from '../../src/core/hash';
import { createInitialState } from '../../src/core/state';
import type { GameState, Piece, PieceKind, Team } from '../../src/core/types';
import { playMove } from '../../src/rules/session';
import { classicId, classicTopology } from '../../src/topology/classic';
import { threeTopology, threeWingAt } from '../../src/topology/three';

const topo = classicTopology;

type Spec = [file: number, rank: number, team: Team, kind: PieceKind];

function makeBoard(specs: Spec[], turn: Team): GameState {
  const base = createInitialState('classic', topo);
  const cells: (Piece | null)[] = base.cells.map(() => null);
  for (const [f, r, team, kind] of specs) cells[classicId(f, r)] = { team, kind };
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

describe('记谱 · 基本格式', () => {
  it('红方用中文数字，从自己右手边数：炮八平五', () => {
    const s = createInitialState('classic', topo);
    const next = playMove(s, topo, classicId(1, 2), classicId(4, 2));
    expect(next.history[0]!.text).toBe('炮八平五');
  });

  it('马走"日"用目标列号：马八进七', () => {
    const s = createInitialState('classic', topo);
    const next = playMove(s, topo, classicId(1, 0), classicId(2, 2));
    expect(next.history[0]!.text).toBe('马八进七');
  });

  it('黑方用阿拉伯数字，从自己右手边数：卒5进1', () => {
    const s = makeBoard(
      [
        [4, 6, 'black', 'pawn'],
        [4, 0, 'red', 'general'],
        [5, 9, 'black', 'general'],
      ],
      'black',
    );
    const next = playMove(s, topo, classicId(4, 6), classicId(4, 5));
    expect(next.history[0]!.text).toBe('卒5进1');
  });

  it('直线子进/退后跟步数：车九进一、帅五平六', () => {
    const chariot = makeBoard(
      [
        [0, 0, 'red', 'chariot'],
        [4, 0, 'red', 'general'],
        [5, 9, 'black', 'general'],
      ],
      'red',
    );
    expect(notateMove(chariot, topo, classicId(0, 0), classicId(0, 1))).toBe('车九进一');

    const general = makeBoard(
      [
        [4, 0, 'red', 'general'],
        [5, 9, 'black', 'general'],
      ],
      'red',
    );
    expect(notateMove(general, topo, classicId(4, 0), classicId(3, 0))).toBe('帅五平六');
  });

  it('黑车横走：车9平1', () => {
    const s = makeBoard(
      [
        [8, 9, 'black', 'chariot'],
        [3, 7, 'black', 'general'],
        [4, 0, 'red', 'general'],
      ],
      'black',
    );
    expect(notateMove(s, topo, classicId(8, 9), classicId(0, 9))).toBe('车9平1');
  });
});

describe('记谱 · 同列消歧（前/中/后）', () => {
  it('两炮同列：前炮进二', () => {
    const s = makeBoard(
      [
        [1, 2, 'red', 'cannon'],
        [1, 6, 'red', 'cannon'],
        [4, 0, 'red', 'general'],
        [3, 9, 'black', 'general'],
      ],
      'red',
    );
    expect(notateMove(s, topo, classicId(1, 6), classicId(1, 8))).toBe('前炮进二');
  });

  it('两炮同列：后炮退二', () => {
    const s = makeBoard(
      [
        [1, 2, 'red', 'cannon'],
        [1, 6, 'red', 'cannon'],
        [4, 0, 'red', 'general'],
        [3, 9, 'black', 'general'],
      ],
      'red',
    );
    expect(notateMove(s, topo, classicId(1, 2), classicId(1, 0))).toBe('后炮退二');
  });

  it('三卒同列：前/中/后卒', () => {
    const s = makeBoard(
      [
        [4, 3, 'red', 'pawn'],
        [4, 5, 'red', 'pawn'],
        [4, 7, 'red', 'pawn'],
        [4, 0, 'red', 'general'],
        [3, 9, 'black', 'general'],
      ],
      'red',
    );
    expect(notateMove(s, topo, classicId(4, 7), classicId(4, 8))).toBe('前兵进一');
    expect(notateMove(s, topo, classicId(4, 5), classicId(4, 6))).toBe('中兵进一');
    expect(notateMove(s, topo, classicId(4, 3), classicId(4, 4))).toBe('后兵进一');
  });

  it('不同列时仍用列号：车二进三', () => {
    const s = makeBoard(
      [
        [7, 0, 'red', 'chariot'],
        [0, 0, 'red', 'chariot'],
        [4, 0, 'red', 'general'],
        [5, 9, 'black', 'general'],
      ],
      'red',
    );
    expect(notateMove(s, topo, classicId(7, 0), classicId(7, 3))).toBe('车二进三');
  });
});

describe('记谱 · 三人局与历史', () => {
  it('三人局退回坐标记法', () => {
    const base = createInitialState('three', threeTopology);
    const from = threeWingAt(0, 4, 3);
    const to = threeWingAt(0, 4, 4);
    const text = notateMove(base, threeTopology, from, to);
    expect(text).toContain('红方兵');
    expect(text).toMatch(/5-4→5-5/);
  });

  it('历史列表能取到最近若干手的记谱', () => {
    let s = createInitialState('classic', topo);
    s = playMove(s, topo, classicId(1, 2), classicId(4, 2));
    s = playMove(s, topo, classicId(1, 7), classicId(4, 7));
    s = playMove(s, topo, classicId(1, 0), classicId(2, 2));
    // 黑方列号从黑方右手边数：viewer file 1 → 黑 2
    expect(historyTexts(s)).toEqual(['炮八平五', '炮2平5', '马八进七']);
  });
});
