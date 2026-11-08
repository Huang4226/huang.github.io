/** 导出每个节点的马落点（给 Python 对截图用）。 */
import { writeFileSync } from 'node:fs';
import { threeTopology } from '../src/topology/three';

const topo = threeTopology;
const out: Record<number, number[]> = {};
for (let i = 0; i < topo.nodes.length; i++) {
  out[i] = [...new Set((topo.jumps.get(i) ?? []).filter((j) => j.kind === 'horse').map((j) => j.target))];
}
writeFileSync(
  'debug/horse-sets.json',
  JSON.stringify({
    nodes: topo.nodes.map((n) => [n.x, n.y]),
    sets: out,
  }),
);
console.log('nodes', topo.nodes.length);
