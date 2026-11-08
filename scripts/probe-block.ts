/** 验证：把红兵放在 (2,4) 后，(1,3) 与 (2,7,4) 这两个落点是否被蹩掉。 */
import type { Piece } from '../src/core/types';
import { attackTargets } from '../src/rules/moves';
import { createThreeTopology, threeWingAt } from '../src/topology/three';

const topo = createThreeTopology().topology;
const from = threeWingAt(0, 3, 4);
const name = (id: number) => {
  const n = topo.nodes[id]!;
  return `w${n.wing}(f${n.file},r${n.rank})`;
};
for (const j of topo.jumps.get(from) ?? []) {
  if (j.kind === 'horse') console.log(`${name(j.target)}  腿 ${j.leg === undefined ? '-' : name(j.leg)}`);
}

const cells: Array<Piece | null> = new Array(topo.nodes.length).fill(null);
cells[from] = { team: 'red', kind: 'horse' };
cells[threeWingAt(0, 2, 4)] = { team: 'red', kind: 'pawn' };
const moves = attackTargets(cells, topo, from);
console.log('红兵堵在 (2,4) 之后，马能走:', moves.map(name).join(' '));
