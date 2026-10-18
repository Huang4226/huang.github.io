/**
 * 经典棋盘几何常量。
 *
 * 全部数值来自对 `picture/双人地图.png` 的实测标定（见设计文档 6 章）：
 *   竖线 x = 23 … 424.5（9 条），横线 y = 35.5 … 486.5（10 条）
 * 因此交点坐标必须由「测量值线性插值」得到，不能用手工凑的整数。
 */

export const CLASSIC_LAYOUT = {
  files: 9,
  ranks: 10,
  /** file 0 的 x（底线左边第一条竖线） */
  originX: 23,
  /** rank 0 的 y（红方底线，图像坐标系 y 向下，所以是最下面那条横线） */
  originY: 486.5,
  gapX: (424.5 - 23) / 8, // 50.1875
  gapY: (486.5 - 35.5) / 9, // 50.1111…
  box: { w: 454, h: 530 },
  /** 棋子贴图 46px / 格距 50.15 ≈ 0.92 */
  pieceScale: 0.92,
} as const;

export function classicX(file: number): number {
  return CLASSIC_LAYOUT.originX + file * CLASSIC_LAYOUT.gapX;
}

export function classicY(rank: number): number {
  return CLASSIC_LAYOUT.originY - rank * CLASSIC_LAYOUT.gapY;
}
