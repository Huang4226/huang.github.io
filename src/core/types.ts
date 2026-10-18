/**
 * 全局领域类型。规则引擎与渲染层共用，不允许依赖 DOM。
 */

export type Team = 'red' | 'black' | 'white';

export type PieceKind =
  | 'general' // 帅 / 将
  | 'advisor' // 仕 / 士
  | 'elephant' // 相 / 象
  | 'horse' // 马
  | 'chariot' // 车
  | 'cannon' // 炮
  | 'pawn'; // 兵 / 卒

export interface Piece {
  team: Team;
  kind: PieceKind;
  /** 仅兵/卒使用：是否已过河。一经置位不可撤销（设计文档 T-8 / T-2a） */
  crossed?: boolean;
}

/** 一手棋：从节点 from 走到节点 to */
export interface Move {
  from: number;
  to: number;
  piece: Piece;
  captured: Piece | null;
  /** 这一手是否形成将军（用于长将/重复局面判定） */
  gaveCheck?: boolean;
  /** 中文记谱（落子时按落子前局面计算，含 前/中/后 消歧） */
  text?: string;
}

export type GameMode = 'classic' | 'three';
export type GameStatus = 'playing' | 'over';

/** 走法引用（不含棋子信息），用于生成与统计 */
export interface MoveRef {
  from: number;
  to: number;
}

/** 三人局：一次"灭国"事件的明细（复盘、气泡提示、计分都用它） */
export interface EliminationDetail {
  victim: Team;
  /** 收编者；无人收编（困毙）时为 null */
  killer: Team | null;
  converted: Piece[];
  removed: Piece[];
}

export interface GameState {
  mode: GameMode;
  /** 拓扑名，用于选择棋盘数据 */
  topology: string;
  /** 长度 = 拓扑节点数，按 NodeId 索引 */
  cells: (Piece | null)[];
  turn: Team;
  /** 剩余玩家顺序（淘汰即移除），三人局长度会减少 */
  order: Team[];
  /** 半回合数 */
  ply: number;
  status: GameStatus;
  winner: Team | null;
  /** 终局原因：checkmate / stalemate / perpetual-check / draw-repetition / draw-60 */
  endReason: string | null;
  history: Move[];
  /** 每次落子后的局面键，长度 = history.length + 1（含开局） */
  positions: string[];
  /** 三人局的灭国事件流水 */
  eliminations: EliminationDetail[];
  /** 距上一手吃子的半回合数（60 回合无吃子判和） */
  quiet: number;
  captured: Piece[];
}

export const TEAM_LABEL: Record<Team, string> = {
  red: '红方',
  black: '黑方',
  white: '白方',
};

export const KIND_LABEL: Record<PieceKind, string> = {
  general: '帅',
  advisor: '仕',
  elephant: '相',
  horse: '马',
  chariot: '车',
  cannon: '炮',
  pawn: '兵',
};

/** 黑/白方的称呼与红方不同（将/士/象/卒） */
export const KIND_LABEL_BY_TEAM: Record<Team, Record<PieceKind, string>> = {
  red: { general: '帅', advisor: '仕', elephant: '相', horse: '马', chariot: '车', cannon: '炮', pawn: '兵' },
  black: { general: '将', advisor: '士', elephant: '象', horse: '马', chariot: '车', cannon: '炮', pawn: '卒' },
  white: { general: '帅', advisor: '士', elephant: '相', horse: '马', chariot: '车', cannon: '炮', pawn: '卒' },
};
