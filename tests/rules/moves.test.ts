import { describe, expect, it } from 'vitest';
import { positionKey } from '../../src/core/hash';
import { createInitialState, undoMove } from '../../src/core/state';
import type { GameState, Piece, PieceKind, Team } from '../../src/core/types';
import { allLegalMoves, isInCheck, legalMovesFrom } from '../../src/rules/check';
import { playMove } from '../../src/rules/session';
import { evaluateOutcome } from '../../src/core/result';
import { classicId, classicTopology } from '../../src/topology/classic';

const topo = classicTopology;

type Spec = [file: number, rank: number, team: Team, kind: PieceKind];

function makeBoard(specs: Spec[], turn: Team): GameState {
  const base = createInitialState('classic', topo);
  const cells: (Piece | null)[] = base.cells.map(() => null);
  for (const [f, r, team, kind] of specs) {
    cells[classicId(f, r)] = { team, kind };
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
    status: 'playing',
    winner: null,
    endReason: null,
  };
}

const ids = (list: Array<[number, number]>): number[] =>
  list.map(([f, r]) => classicId(f, r)).sort((a, b) => a - b);

function targets(specs: Spec[], turn: Team, from: [number, number]): number[] {
  return legalMovesFrom(makeBoard(specs, turn), topo, classicId(from[0], from[1])).sort(
    (a, b) => a - b,
  );
}

// ————————————————————————— 3.1 兵种走法（22 条） —————————————————————————

describe('3.1 兵种走法 · 车', () => {
  it('R-JV-01 车(0,0) 遇己方兵(0,2)：吃到 (0,1) 为止', () => {
    const moves = targets([[0, 0, 'red', 'chariot'], [0, 2, 'red', 'pawn']], 'red', [0, 0]);
    expect(moves).toContain(classicId(0, 1));
    expect(moves).not.toContain(classicId(0, 2));
    expect(moves).not.toContain(classicId(0, 3));
  });

  it('R-JV-02 车(0,0) 遇黑卒(0,3)：可吃，且不能越过', () => {
    const moves = targets([[0, 0, 'red', 'chariot'], [0, 3, 'black', 'pawn']], 'red', [0, 0]);
    expect(moves).toEqual(expect.arrayContaining(ids([[0, 1], [0, 2], [0, 3]])));
    expect(moves).not.toContain(classicId(0, 4));
  });
});

describe('3.1 兵种走法 · 马', () => {
  it('R-MA-01 空盘中心马有 8 个落点', () => {
    expect(targets([[4, 4, 'red', 'horse']], 'red', [4, 4])).toHaveLength(8);
  });

  it('R-MA-02 (4,5) 有子：蹩掉向上两个落点', () => {
    const moves = targets(
      [[4, 4, 'red', 'horse'], [4, 5, 'red', 'pawn']],
      'red',
      [4, 4],
    );
    expect(moves).toHaveLength(6);
    expect(moves).not.toContain(classicId(3, 6));
    expect(moves).not.toContain(classicId(5, 6));
  });

  it('R-MA-03 角上的马只有 2 个落点', () => {
    expect(targets([[0, 0, 'red', 'horse']], 'red', [0, 0])).toEqual(
      ids([[1, 2], [2, 1]]),
    );
  });
});

describe('3.1 兵种走法 · 相/象', () => {
  it('R-XI-01 相(2,0) 可走田字到 (4,2)', () => {
    expect(targets([[2, 0, 'red', 'elephant']], 'red', [2, 0])).toEqual(
      ids([[0, 2], [4, 2]]),
    );
  });

  it('R-XI-02 象眼(3,1) 有子：塞住 (4,2)', () => {
    const moves = targets(
      [[2, 0, 'red', 'elephant'], [3, 1, 'red', 'pawn']],
      'red',
      [2, 0],
    );
    expect(moves).not.toContain(classicId(4, 2));
    expect(moves).toContain(classicId(0, 2));
  });

  it('R-XI-03 相不能过河：落点全部在本方半场（rank ≤ 4）', () => {
    const moves = targets([[4, 2, 'red', 'elephant']], 'red', [4, 2]);
    expect(moves.length).toBeGreaterThan(0);
    for (const id of moves) {
      expect(topo.nodes[id]!.rank!).toBeLessThanOrEqual(4);
    }
  });
});

describe('3.1 兵种走法 · 仕/士', () => {
  it('R-SH-01 仕(3,0) 只有 (4,1)', () => {
    expect(targets([[3, 0, 'red', 'advisor']], 'red', [3, 0])).toEqual(ids([[4, 1]]));
  });

  it('R-SH-02 仕(4,1) 走满四个对角', () => {
    expect(targets([[4, 1, 'red', 'advisor']], 'red', [4, 1])).toEqual(
      ids([[3, 0], [5, 0], [3, 2], [5, 2]]),
    );
  });

  it('R-SH-03 仕不能直走一格', () => {
    const moves = targets([[4, 0, 'red', 'advisor']], 'red', [4, 0]);
    expect(moves).not.toContain(classicId(4, 1));
    expect(moves).toEqual(ids([[3, 1], [5, 1]]));
  });
});

describe('3.1 兵种走法 · 帅/将', () => {
  it('R-SH-04 帅(4,0) 可走 (3,0)(5,0)(4,1)', () => {
    expect(targets([[4, 0, 'red', 'general']], 'red', [4, 0])).toEqual(
      ids([[3, 0], [5, 0], [4, 1]]),
    );
  });

  it('R-SH-05 帅(4,2) 不能出九宫到 (4,3)', () => {
    const moves = targets([[4, 2, 'red', 'general']], 'red', [4, 2]);
    expect(moves).not.toContain(classicId(4, 3));
    expect(moves).toEqual(ids([[3, 2], [5, 2], [4, 1]]));
  });
});

describe('3.1 兵种走法 · 炮', () => {
  it('R-PA-01 隔一子可吃：(2,3) 为炮架，(2,4) 有黑卒', () => {
    const moves = targets(
      [[2, 2, 'red', 'cannon'], [2, 3, 'red', 'pawn'], [2, 4, 'black', 'pawn']],
      'red',
      [2, 2],
    );
    expect(moves).toContain(classicId(2, 4));
    expect(moves).not.toContain(classicId(2, 3));
  });

  it('R-PA-02 隔两子不能吃', () => {
    const moves = targets(
      [
        [2, 2, 'red', 'cannon'],
        [2, 3, 'red', 'pawn'],
        [2, 4, 'red', 'pawn'],
        [2, 5, 'black', 'pawn'],
      ],
      'red',
      [2, 2],
    );
    expect(moves).not.toContain(classicId(2, 5));
    expect(moves).not.toContain(classicId(2, 4));
  });

  it('R-PA-03 隔 0 子不能吃，但可以走到 (2,3)', () => {
    const moves = targets(
      [[2, 2, 'red', 'cannon'], [2, 4, 'black', 'pawn']],
      'red',
      [2, 2],
    );
    expect(moves).not.toContain(classicId(2, 4));
    expect(moves).toContain(classicId(2, 3));
  });
});

describe('3.1 兵种走法 · 兵/卒', () => {
  it('R-BI-01 未过河的红兵只能前进一格', () => {
    expect(targets([[4, 3, 'red', 'pawn']], 'red', [4, 3])).toEqual(ids([[4, 4]]));
  });

  it('R-BI-02 已过河的红兵可前进与横走，不能后退', () => {
    expect(targets([[4, 5, 'red', 'pawn']], 'red', [4, 5])).toEqual(
      ids([[4, 6], [3, 5], [5, 5]]),
    );
  });

  it('R-BI-03 未过河的黑卒向下走一格', () => {
    expect(targets([[4, 6, 'black', 'pawn']], 'black', [4, 6])).toEqual(ids([[4, 5]]));
  });
});

describe('3.1 兵种走法 · 照面与通用', () => {
  it('R-ZM-01 两帅照面：帅不能走到 (4,1)', () => {
    const moves = targets(
      [[4, 0, 'red', 'general'], [4, 9, 'black', 'general']],
      'red',
      [4, 0],
    );
    expect(moves).not.toContain(classicId(4, 1));
    expect(moves).toContain(classicId(3, 0));
  });

  it('R-ZM-02 中间有子隔开则 (4,1) 合法', () => {
    const moves = targets(
      [[4, 0, 'red', 'general'], [4, 9, 'black', 'general'], [4, 5, 'red', 'pawn']],
      'red',
      [4, 0],
    );
    expect(moves).toContain(classicId(4, 1));
  });

  it('R-GN-01 任何棋子都不能落在己方子上', () => {
    const moves = targets(
      [[4, 4, 'red', 'horse'], [5, 6, 'red', 'pawn'], [3, 2, 'red', 'chariot']],
      'red',
      [4, 4],
    );
    expect(moves).not.toContain(classicId(5, 6));
    expect(moves).not.toContain(classicId(3, 2));
  });
});

// ————————————————————————— 3.2 将军与终局 —————————————————————————

describe('3.2 将军判定', () => {
  it('R-CK-01 车正对老将一线 → 被将军', () => {
    const s = makeBoard(
      [[4, 0, 'red', 'chariot'], [4, 9, 'black', 'general']],
      'black',
    );
    expect(isInCheck(s, topo, 'black')).toBe(true);
  });

  it('R-CK-02 被将军时只剩解除将军的招（移将离开火力线）', () => {
    const s = makeBoard(
      [[4, 0, 'red', 'chariot'], [4, 9, 'black', 'general']],
      'black',
    );
    const moves = legalMovesFrom(s, topo, classicId(4, 9)).sort((a, b) => a - b);
    expect(moves).toEqual(ids([[3, 9], [5, 9]]));
  });

  it('被牵制的子不能离开牵制线', () => {
    // 红车(4,2) 挡在 帅(4,0) 与 黑车(4,9) 之间
    const s = makeBoard(
      [
        [4, 0, 'red', 'general'],
        [4, 2, 'red', 'chariot'],
        [4, 9, 'black', 'chariot'],
        [3, 9, 'black', 'general'],
      ],
      'red',
    );
    const moves = legalMovesFrom(s, topo, classicId(4, 2));
    expect(moves.length).toBeGreaterThan(0);
    for (const id of moves) expect(topo.nodes[id]!.file).toBe(4);
  });
});

describe('3.2 终局判定', () => {
  it('R-CK-03 将死：黑将无路可走且被将军', () => {
    const s = makeBoard(
      [
        [4, 9, 'black', 'general'],
        [0, 9, 'red', 'chariot'],
        [4, 8, 'red', 'chariot'],
        [4, 7, 'red', 'pawn'],
        [4, 0, 'red', 'general'],
      ],
      'black',
    );
    const outcome = evaluateOutcome(s, topo);
    expect(outcome).toEqual({ winner: 'red', reason: 'checkmate' });
  });

  it('R-CK-04 困毙：黑将未被将军但无合法招', () => {
    const s = makeBoard(
      [
        [4, 9, 'black', 'general'],
        [3, 8, 'red', 'pawn'],
        [4, 7, 'red', 'pawn'],
        [5, 8, 'red', 'pawn'],
        [4, 0, 'red', 'general'],
      ],
      'black',
    );
    expect(isInCheck(s, topo, 'black')).toBe(false);
    expect(allLegalMoves(s, topo, 'black')).toHaveLength(0);
    expect(evaluateOutcome(s, topo)).toEqual({ winner: 'red', reason: 'stalemate' });
  });

  it('R-RP-03 60 回合无吃子判和', () => {
    const s = makeBoard(
      [[4, 0, 'red', 'general'], [4, 9, 'black', 'general'], [0, 1, 'red', 'chariot']],
      'red',
    );
    s.quiet = 120;
    expect(evaluateOutcome(s, topo)).toEqual({ winner: null, reason: 'draw-60' });
  });
});

describe('3.2 重复局面', () => {
  it('R-RP-01 长将判负：红车来回将军', () => {
    let s = makeBoard(
      [
        [5, 0, 'red', 'general'],
        [4, 5, 'red', 'chariot'],
        [4, 9, 'black', 'general'],
      ],
      'black',
    );
    const script: Array<[[number, number], [number, number]]> = [
      [[4, 9], [3, 9]],
      [[4, 5], [3, 5]],
      [[3, 9], [4, 9]],
      [[3, 5], [4, 5]],
      [[4, 9], [3, 9]],
      [[4, 5], [3, 5]],
      [[3, 9], [4, 9]],
      [[3, 5], [4, 5]],
    ];
    for (const [from, to] of script) {
      s = playMove(s, topo, classicId(from[0], from[1]), classicId(to[0], to[1]));
    }
    expect(s.status).toBe('over');
    expect(s.winner).toBe('black');
    expect(s.endReason).toBe('perpetual-check');
  });

  it('R-RP-02 三次重复但互不将军 → 和棋', () => {
    let s = makeBoard(
      [
        [3, 0, 'red', 'general'],
        [5, 9, 'black', 'general'],
        [0, 0, 'red', 'chariot'],
        [8, 9, 'black', 'chariot'],
      ],
      'red',
    );
    const script: Array<[[number, number], [number, number]]> = [
      [[0, 0], [0, 1]],
      [[8, 9], [8, 8]],
      [[0, 1], [0, 0]],
      [[8, 8], [8, 9]],
      [[0, 0], [0, 1]],
      [[8, 9], [8, 8]],
      [[0, 1], [0, 0]],
      [[8, 8], [8, 9]],
    ];
    for (const [from, to] of script) {
      s = playMove(s, topo, classicId(from[0], from[1]), classicId(to[0], to[1]));
    }
    expect(s.status).toBe('over');
    expect(s.winner).toBeNull();
    expect(s.endReason).toBe('draw-repetition');
  });
});

// ————————————————————————— 会话层 —————————————————————————

describe('session · playMove / 悔棋', () => {
  it('开局走 兵(4,3)→(4,4) 合法，之后轮换到黑方', () => {
    const s0 = createInitialState('classic', topo);
    const s1 = playMove(s0, topo, classicId(4, 3), classicId(4, 4));
    expect(s1.turn).toBe('black');
    expect(s1.ply).toBe(1);
    expect(s1.history[0]!.gaveCheck).toBe(false);
  });

  it('非法走法抛错：车(0,0)→(0,5) 有障碍/越界', () => {
    const s0 = createInitialState('classic', topo);
    expect(() => playMove(s0, topo, classicId(0, 0), classicId(0, 5))).toThrow(/非法走法/);
  });

  it('非本方回合不能走', () => {
    const s0 = createInitialState('classic', topo);
    expect(() => playMove(s0, topo, classicId(4, 6), classicId(4, 5))).toThrow(/不是该方的回合/);
  });

  it('悔棋后局面、手数、quiet 全部还原', () => {
    const s0 = createInitialState('classic', topo);
    const s1 = playMove(s0, topo, classicId(4, 3), classicId(4, 4));
    const s2 = undoMove(s1);
    expect(s2.cells).toEqual(s0.cells);
    expect(s2.turn).toBe('red');
    expect(s2.positions).toEqual(s0.positions);
    expect(s2.quiet).toBe(0);
  });

  it('吃子后 quiet 归零', () => {
    let s = createInitialState('classic', topo);
    s = playMove(s, topo, classicId(4, 3), classicId(4, 4)); // 红
    s = playMove(s, topo, classicId(4, 6), classicId(4, 5)); // 黑
    s = playMove(s, topo, classicId(4, 4), classicId(4, 5)); // 红吃黑卒
    expect(s.quiet).toBe(0);
    expect(s.captured).toHaveLength(1);
  });
});
