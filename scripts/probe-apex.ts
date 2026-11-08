/** 探针：马站在渡口顶点时，为什么合法落点是 0。 */
import type { Piece } from '../src/core/types';
import { inCheck, legalTargets } from '../src/rules/check';
import { attackTargets, pseudoMovesFrom } from '../src/rules/moves';
import { createThreeTopology, threeWingAt } from '../src/topology/three';

const topo = createThreeTopology().topology;
const name = (id: number) => {
  const n = topo.nodes[id]!;
  return `w${n.wing}(f${n.file},r${n.rank})`;
};
const apex = threeWingAt(0, 4, 4);
const g0 = threeWingAt(0, 4, 0);
const g1 = threeWingAt(1, 4, 0);

const cells: Array<Piece | null> = new Array(topo.nodes.length).fill(null);
cells[apex] = { team: 'red', kind: 'horse' };
cells[g0] = { team: 'red', kind: 'general' };
cells[g1] = { team: 'black', kind: 'general' };

console.log('红帅开局是否被将军:', inCheck(cells, topo, 'red', ['black', 'white']));
const t = pseudoMovesFrom(cells, topo, apex)[0]!;
const b = cells.slice() as Array<Piece | null>;
b[t] = b[apex]!;
b[apex] = null;
console.log(`马走到 ${name(t)} 之后，红帅是否被将军:`, inCheck(b, topo, 'red', ['black', 'white']));
console.log('黑将攻击格是否含红帅:', attackTargets(cells, topo, g1).includes(g0));
console.log('合法落点数:', legalTargets(cells, topo, apex, ['black', 'white']).length);

// 对比：把红帅挪开（不放帅）看是否正常
const c2 = cells.slice() as Array<Piece | null>;
c2[g0] = null;
console.log('无红帅时合法落点数:', legalTargets(c2, topo, apex, ['black', 'white']).length);
