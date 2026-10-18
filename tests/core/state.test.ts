import { describe, expect, it } from 'vitest';
import {
  applyMove,
  canPlace,
  canSelect,
  createInitialState,
  nextTeam,
  undoMove,
} from '../../src/core/state';
import { classicId, classicTopology } from '../../src/topology/classic';
import type { GameState } from '../../src/core/types';

const topo = classicTopology;
const fresh = () => createInitialState('classic', topo);
const threePlayer = (): GameState => ({ ...fresh(), mode: 'three', order: ['red', 'black', 'white'] });

describe('对局状态 · 开局', () => {
  it('开局 32 子、红先行、回合序为 红→黑', () => {
    const s = fresh();
    expect(s.cells.filter(Boolean)).toHaveLength(32);
    expect(s.turn).toBe('red');
    expect(s.order).toEqual(['red', 'black']);
    expect(s.ply).toBe(0);
    expect(s.status).toBe('playing');
    expect(s.history).toHaveLength(0);
    expect(s.captured).toHaveLength(0);
  });

  it('棋盘数组长度 = 拓扑节点数，未被占用的格子为 null', () => {
    const s = fresh();
    expect(s.cells).toHaveLength(topo.nodes.length);
    expect(s.cells.filter((c) => c === null)).toHaveLength(90 - 32);
  });
});

describe('对局状态 · 选择与落点', () => {
  it('只能选中当前行动方的棋子（M1-05）', () => {
    const s = fresh();
    const redPawn = classicId(4, 3);
    const blackPawn = classicId(4, 6);
    expect(canSelect(s, redPawn)).toBe(true);
    expect(canSelect(s, blackPawn)).toBe(false);
    expect(canSelect(s, classicId(4, 4))).toBe(false); // 空点
  });

  it('可以落在空点或敌子上，不能落在己方子上', () => {
    const s = fresh();
    expect(canPlace(s, classicId(4, 4))).toBe(true); // 空
    expect(canPlace(s, classicId(4, 6))).toBe(true); // 黑子
    expect(canPlace(s, classicId(4, 3))).toBe(false); // 红兵自己
  });
});

describe('对局状态 · 落子 / 吃子 / 悔棋', () => {
  it('落子后棋子移动、轮次交替、ply+1', () => {
    const s0 = fresh();
    const from = classicId(4, 3);
    const to = classicId(4, 4);
    const s1 = applyMove(s0, from, to);
    expect(s1.cells[from]).toBeNull();
    expect(s1.cells[to]?.kind).toBe('pawn');
    expect(s1.turn).toBe('black');
    expect(s1.ply).toBe(1);
    expect(s1.history).toHaveLength(1);
    expect(s0.cells[from]?.kind).toBe('pawn'); // 不可变：原状态未被修改
  });

  it('吃子会记录到 captured，且被吃子从棋盘消失', () => {
    const s0 = fresh();
    s0.cells[classicId(0, 3)] = { team: 'black', kind: 'pawn' }; // 制造一个可吃的敌子
    const s1 = applyMove(s0, classicId(0, 0), classicId(0, 3));
    expect(s1.cells[classicId(0, 3)]).toMatchObject({ team: 'red', kind: 'chariot' });
    expect(s1.cells[classicId(0, 0)]).toBeNull();
    expect(s1.captured).toHaveLength(1);
    expect(s1.captured[0]).toMatchObject({ team: 'black', kind: 'pawn' });
    expect(s1.history[0]!.captured).toMatchObject({ team: 'black', kind: 'pawn' });
  });

  it('不能吃自己的子（抛错）', () => {
    const s = fresh();
    expect(() => applyMove(s, classicId(0, 0), classicId(0, 3))).toThrow(/不能吃自己的子/);
  });

  it('悔棋可完整还原到落子前（M2-02）', () => {
    const s0 = fresh();
    const s1 = applyMove(s0, classicId(4, 3), classicId(4, 4));
    const s2 = undoMove(s1);
    expect(s2.cells).toEqual(s0.cells);
    expect(s2.turn).toBe(s0.turn);
    expect(s2.ply).toBe(0);
    expect(s2.history).toHaveLength(0);
  });

  it('多次落子后连续悔棋可逐步回退', () => {
    let s = fresh();
    const snaps = [s];
    const seq: Array<[number, number]> = [
      [classicId(4, 3), classicId(4, 4)],
      [classicId(4, 6), classicId(4, 5)],
      [classicId(4, 4), classicId(4, 5)],
    ];
    for (const [from, to] of seq) {
      s = applyMove(s, from, to);
      snaps.push(s);
    }
    for (let i = snaps.length - 2; i >= 0; i--) {
      s = undoMove(s);
      expect(s.cells).toEqual(snaps[i]!.cells);
      expect(s.turn).toBe(snaps[i]!.turn);
    }
  });

  it('无历史时悔棋返回原状态', () => {
    const s0 = fresh();
    expect(undoMove(s0)).toBe(s0);
  });
});

describe('对局状态 · 回合轮转', () => {
  it('双人局按 红→黑→红 循环', () => {
    const s = fresh();
    expect(nextTeam(s, 'red')).toBe('black');
    expect(nextTeam(s, 'black')).toBe('red');
  });

  it('三人局按 红→黑→白→红 循环', () => {
    const s = threePlayer();
    expect(nextTeam(s, 'red')).toBe('black');
    expect(nextTeam(s, 'black')).toBe('white');
    expect(nextTeam(s, 'white')).toBe('red');
  });

  it('淘汰一家后顺序跳过该家', () => {
    const s = threePlayer();
    s.order = ['red', 'white'];
    expect(nextTeam(s, 'white')).toBe('red');
  });
});
