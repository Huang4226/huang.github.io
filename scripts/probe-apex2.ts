/** 探针：红帅前方有子挡住时，顶点马的合法走法。 */
import type { Piece } from '../src/core/types';
import { inCheck, legalTargets } from '../src/rules/check';
import { createThreeTopology, threeWingAt } from '../src/topology/three';

const topo = createThreeTopology().topology;
const apex = threeWingAt(0, 4, 4);
const g0 = threeWingAt(0, 4, 0);
const g1 = threeWingAt(1, 4, 0);

function run(label: string, blockers: Array<[number, Piece]>) {
  const cells: Array<Piece | null> = new Array(topo.nodes.length).fill(null);
  cells[apex] = { team: 'red', kind: 'horse' };
  cells[g0] = { team: 'red', kind: 'general' };
  cells[g1] = { team: 'black', kind: 'general' };
  for (const [n, p] of blockers) cells[n] = p;
  console.log(
    `${label}: 红帅被将军=${inCheck(cells, topo, 'red', ['black', 'white'])}  顶点马合法=${legalTargets(cells, topo, apex, ['black', 'white']).length}`,
  );
}

run('无遮挡（马挡着黑将的视线）', []);
run('相在 (4,2)', [[threeWingAt(0, 4, 2), { team: 'red', kind: 'elephant' }]]);
run('相在 (4,2)+兵在 (4,3)', [
  [threeWingAt(0, 4, 2), { team: 'red', kind: 'elephant' }],
  [threeWingAt(0, 4, 3), { team: 'red', kind: 'pawn' }],
]);
