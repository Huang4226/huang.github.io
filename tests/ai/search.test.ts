import { describe, expect, it } from 'vitest';
import { chooseMove, randomMove, AI_LEVELS } from '../../src/ai';
import { searchBestMove } from '../../src/ai/search';
import { positionKey } from '../../src/core/hash';
import { createInitialState } from '../../src/core/state';
import type { GameState, Piece, PieceKind, Team } from '../../src/core/types';
import { legalMovesFrom } from '../../src/rules/check';
import { playMove } from '../../src/rules/session';
import { classicId, classicTopology } from '../../src/topology/classic';

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
    status: 'playing',
    winner: null,
    endReason: null,
  };
}

function legalSet(state: GameState): Set<string> {
  const set = new Set<string>();
  for (let from = 0; from < state.cells.length; from++) {
    const p = state.cells[from];
    if (!p || p.team !== state.turn) continue;
    for (const to of legalMovesFrom(state, topo, from)) set.add(`${from}:${to}`);
  }
  return set;
}

describe('AI · 战术正确性', () => {
  it('AI-02 白吃一车必吃', () => {
    const state = makeBoard(
      [
        [0, 0, 'red', 'chariot'],
        [0, 5, 'black', 'chariot'],
        [3, 0, 'red', 'general'],
        [4, 9, 'black', 'general'],
      ],
      'red',
    );
    const res = chooseMove(state, topo, 'normal');
    expect(res.move).toEqual({ from: classicId(0, 0), to: classicId(0, 5) });
  });

  it('AI 能找到一步杀（双车错）', () => {
    // 红车(0,0)→(0,7) 横向将军：将(4,7) 的 (3,7)(5,7) 同线被封、 (4,8) 被车(8,8) 封、 (4,6) 被自家卒占住
    const state = makeBoard(
      [
        [4, 7, 'black', 'general'],
        [4, 6, 'black', 'pawn'],
        [0, 0, 'red', 'chariot'],
        [8, 8, 'red', 'chariot'],
        [5, 0, 'red', 'general'],
      ],
      'red',
    );
    const res = chooseMove(state, topo, 'easy');
    expect(res.move).toEqual({ from: classicId(0, 0), to: classicId(0, 7) });
    expect(res.score).toBeGreaterThan(80000); // 杀棋分
  });
});

describe('AI · 合法性与时间', () => {
  it('AI-05 随机对局中每一步都返回合法招', () => {
    let state = createInitialState('classic', topo);
    for (let i = 0; i < 30 && state.status === 'playing'; i++) {
      const legal = legalSet(state);
      const res = chooseMove(state, topo, 'easy');
      expect(res.move).not.toBeNull();
      expect(legal.has(`${res.move!.from}:${res.move!.to}`)).toBe(true);
      state = playMove(state, topo, res.move!.from, res.move!.to);
      if (state.status === 'over') break;
      const reply = randomMove(state, topo);
      if (!reply.move) break;
      state = playMove(state, topo, reply.move.from, reply.move.to);
    }
    expect(state.ply).toBeGreaterThan(4);
  });

  it('AI-03 难度=难 单步不超过时间上限（含超时降级）', () => {
    const state = createInitialState('classic', topo);
    const started = Date.now();
    const res = searchBestMove(state, topo, AI_LEVELS.hard);
    const elapsed = Date.now() - started;
    expect(res.move).not.toBeNull();
    expect(res.depth).toBeGreaterThanOrEqual(1);
    expect(elapsed).toBeLessThan(AI_LEVELS.hard.timeMs + 1500);
  });

  it('开局搜索的节点数非零且能找到深度 2 以上的结果', () => {
    const state = createInitialState('classic', topo);
    const res = searchBestMove(state, topo, { maxDepth: 2, timeMs: 3000 });
    expect(res.nodes).toBeGreaterThan(100);
    expect(res.depth).toBeGreaterThanOrEqual(2);
  });
});
