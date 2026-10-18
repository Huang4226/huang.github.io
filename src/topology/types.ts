import type { Piece, Team } from '../core/types';

/** 一架（一套方向体系）。双人局只有 'plane'；三人局为 s0/s1/s2 + center */
export type Frame = 'plane' | 's0' | 's1' | 's2' | 'center';

export interface BoardNode {
  id: number;
  /** 世界坐标（棋盘像素，y 向下） */
  x: number;
  y: number;
  /** 该点属于哪些架。渡口/三岔口会同时属于多个架 */
  frames: Frame[];
  /** 语义标签：palace:s0 / ferry / junction / centerInner ... */
  tags: string[];
  /** 方阵内坐标（经典棋盘全盘通用；三人局为该点所属方阵的局部坐标） */
  file?: number;
  rank?: number;
  /** 三人局：该点所属方阵的序号（0/1/2）；经典棋盘为 undefined */
  wing?: number;
}

/** 从某节点出发的一整条直线（走法用，河界不断开）；nodes 不含起点，按距离升序 */
export interface Ray {
  dir: number;
  nodes: number[];
}

/** 一次跳跃（马 / 相象） */
export interface JumpMove {
  kind: 'horse' | 'elephant';
  target: number;
  /** 蹩马腿的判定点 */
  leg?: number;
  /** 塞象眼的判定点 */
  eye?: number;
}

export interface PieceInit {
  node: number;
  piece: Piece;
}

export interface BoardBox {
  w: number;
  h: number;
}

export interface Topology {
  name: 'classic' | 'three';
  nodes: BoardNode[];
  /** 走法射线（河界不参与，整条直线） */
  rays: Map<number, Ray[]>;
  /** 跳跃表（含蹩腿/塞象眼判定点） */
  jumps: Map<number, JumpMove[]>;
  /** 九宫：架 → 9 个节点 */
  palaces: Map<Frame, number[]>;
  startLayout: PieceInit[];
  boardBox: BoardBox;
  /** 渲染线段（与走法射线不同：经典棋盘中路 7 条竖线在河界断开） */
  segments: Array<[number, number]>;
  /** 默认格距，用于棋子尺寸与吸附半径 */
  gap: number;

  // —— 区域规则（把"哪块地界"的判断留在拓扑层，rules 层只问不猜） ——
  /** 某方的九宫 9 个节点 */
  palace(team: Team): ReadonlySet<number>;
  /** 该点是否在 team 的本方半场（相/象不可过河的依据） */
  ownHalf(node: number, team: Team): boolean;
  /** 兵/卒向前一步的落点（经典 1 个；三人局站在渡口时有 2 个"过河"方向） */
  pawnForward(node: number, team: Team): number[];
  /** 兵/卒横向一步的两个落点（是否允许由调用方按"过河"判断） */
  pawnSide(node: number, team: Team): number[];
}

export function nodeAt(topo: Topology, id: number): BoardNode {
  const n = topo.nodes[id];
  if (!n) throw new Error(`节点 ${id} 不存在于拓扑 ${topo.name}`);
  return n;
}
