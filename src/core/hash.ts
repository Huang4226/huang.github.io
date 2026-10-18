import type { GameState, Piece } from './types';

const KIND_CODE: Record<Piece['kind'], string> = {
  general: 'g',
  advisor: 'a',
  elephant: 'e',
  horse: 'h',
  chariot: 'c',
  cannon: 'n',
  pawn: 'p',
};

const TEAM_CODE: Record<Piece['team'], string> = {
  red: 'r',
  black: 'b',
  white: 'w',
};

/**
 * 局面键：棋盘占位 + 行动方。
 * 90 交点 → 90 字符，长度固定，用于重复局面（三次重复 / 长将）判定。
 */
export function positionKey(state: Pick<GameState, 'cells' | 'turn'>): string {
  const board = new Array<string>(state.cells.length);
  for (let i = 0; i < state.cells.length; i++) {
    const p = state.cells[i];
    board[i] = p ? TEAM_CODE[p.team] + KIND_CODE[p.kind] : '.';
  }
  return `${board.join('')}|${state.turn}`;
}
