import { TEAM_LABEL, type GameState, type PieceKind, type Team } from './types';
import type { Topology } from '../topology/types';

const CN_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

export const PIECE_NAME: Record<Team, Record<PieceKind, string>> = {
  red: { general: '帅', advisor: '仕', elephant: '相', horse: '马', chariot: '车', cannon: '炮', pawn: '兵' },
  black: { general: '将', advisor: '士', elephant: '象', horse: '马', chariot: '车', cannon: '炮', pawn: '卒' },
  white: { general: '帅', advisor: '士', elephant: '相', horse: '马', chariot: '车', cannon: '炮', pawn: '卒' },
};

const STRAIGHT: ReadonlySet<PieceKind> = new Set<PieceKind>([
  'chariot',
  'cannon',
  'pawn',
  'general',
]);

/**
 * 中文记谱（经典棋盘）：
 *   炮八平五 / 马八进七 / 卒5进1 / 前炮进二
 *
 * 规则要点：
 * - 红方从自己的右手边数，用中文数字（file 8 → 一，file 0 → 九）
 * - 黑方从自己的右手边数，用阿拉伯数字（file 0 → 1，file 8 → 9）
 * - 车/炮/兵/帅：进/退后跟**步数**；马/相/仕：进/退后跟**目标列号**
 * - 同一列上有两个及以上同种棋子时，用 前/中/后 代替起始列号
 *
 * 三人局没有通用记谱，退回「队伍 + 兵种 + 坐标」的可读形式。
 */
export function notateMove(
  state: GameState,
  topo: Topology,
  from: number,
  to: number,
): string {
  const piece = state.cells[from];
  const a = topo.nodes[from];
  const b = topo.nodes[to];
  if (!piece || !a || !b) return '';

  if (topo.name !== 'classic' || piece.team === 'white') {
    const tag = `${TEAM_LABEL[piece.team]}${PIECE_NAME[piece.team][piece.kind]}`;
    const at = (n: { file?: number; rank?: number }): string =>
      `${(n.file ?? 0) + 1}-${(n.rank ?? 0) + 1}`;
    return `${tag}${at(a)}→${at(b)}`;
  }

  const num = (n: number): string =>
    piece.team === 'red' ? (CN_DIGITS[n - 1] ?? String(n)) : String(n);
  const fileNo = (file: number): string => num(piece.team === 'red' ? 9 - file : file + 1);

  // 同列同兵种 → 前/中/后
  const column = state.cells
    .map((p, i) => ({ p, i }))
    .filter((e) => e.p && e.p.team === piece.team && e.p.kind === piece.kind)
    .filter((e) => topo.nodes[e.i]!.file === a.file && topo.nodes[e.i]!.wing === a.wing)
    .sort((x, y) => {
      const rx = topo.nodes[x.i]!.rank ?? 0;
      const ry = topo.nodes[y.i]!.rank ?? 0;
      // "前" = 更靠近对方底线
      return piece.team === 'red' ? ry - rx : rx - ry;
    });

  let prefix = '';
  let origin = fileNo(a.file ?? 0);
  if (column.length >= 2) {
    const idx = column.findIndex((e) => e.i === from);
    if (idx >= 0) {
      if (column.length === 2) prefix = idx === 0 ? '前' : '后';
      else if (column.length === 3) prefix = ['前', '中', '后'][idx] ?? '中';
      else prefix = idx === 0 ? '前' : idx === column.length - 1 ? '后' : '中';
      origin = '';
    }
  }

  const name = PIECE_NAME[piece.team][piece.kind];
  const fromRank = a.rank ?? 0;
  const toRank = b.rank ?? 0;
  const toFile = b.file ?? 0;

  if (fromRank === toRank) {
    return `${prefix}${name}${origin}平${fileNo(toFile)}`;
  }

  const forward = piece.team === 'red' ? toRank > fromRank : toRank < fromRank;
  const action = forward ? '进' : '退';
  const value = STRAIGHT.has(piece.kind)
    ? num(Math.abs(toRank - fromRank))
    : fileNo(toFile);

  return `${prefix}${name}${origin}${action}${value}`;
}

/** 最近若干手的记谱（落子时已算好，存在 Move.text 里） */
export function historyTexts(state: GameState, limit = 8): string[] {
  return state.history.slice(-limit).map((m) => m.text ?? '');
}
