/**
 * 把几个"能走到哪儿"的场景导成 JSON，交给 scripts/viz-three.py 画成对照图。
 * 用法：pnpm exec vite-node scripts/viz-moves.ts
 */
import { writeFileSync } from 'node:fs';
import type { Piece, PieceKind, Team } from '../src/core/types';
import { attackTargets } from '../src/rules/moves';
import { createThreeTopology, threeWingAt } from '../src/topology/three';

const topo = createThreeTopology().topology;
const N = topo.nodes.length;

interface Spec {
  id: string;
  title: string;
  /** 棋盘上的子：翼,列,行,兵种,阵营 */
  pieces: Array<[number, number, number, PieceKind, Team]>;
  from: [number, number, number];
}

const SPECS: Spec[] = [
  {
    id: 'cannon',
    title: '红中炮：红兵当炮架，两边中兵一起打',
    pieces: [
      [0, 4, 2, 'cannon', 'red'],
      [0, 4, 3, 'pawn', 'red'],
      [1, 4, 3, 'pawn', 'black'],
      [2, 4, 3, 'pawn', 'white'],
    ],
    from: [0, 4, 2],
  },
  {
    id: 'horse',
    title: '渡口红马：日字斜着跨河',
    pieces: [[0, 5, 4, 'horse', 'red']],
    from: [0, 5, 4],
  },
  {
    id: 'chariot',
    title: '中线红车：一着到底，两翼通吃',
    pieces: [[0, 4, 1, 'chariot', 'red']],
    from: [0, 4, 1],
  },
];

const out = SPECS.map((spec) => {
  const cells: Array<Piece | null> = new Array(N).fill(null);
  for (const [w, f, r, kind, team] of spec.pieces) cells[threeWingAt(w, f, r)] = { kind, team };
  const from = threeWingAt(...spec.from);
  return {
    id: spec.id,
    title: spec.title,
    from,
    pieces: spec.pieces.map(([w, f, r, kind, team]) => ({
      node: threeWingAt(w, f, r),
      kind,
      team,
    })),
    targets: attackTargets(cells, topo, from),
  };
});

writeFileSync('debug/viz.json', JSON.stringify({ box: topo.boardBox, scenarios: out }, null, 1));
for (const s of out) console.log(`${s.id}: ${s.targets.length} 个落点`);
