/** 检查马跳是否对称：B 在 A 的落点里 ⟺ A 在 B 的落点里。 */
import { createThreeTopology } from '../src/topology/three';

const topo = createThreeTopology().topology;
const set = (id: number) =>
  new Set((topo.jumps.get(id) ?? []).filter((j) => j.kind === 'horse').map((j) => j.target));
const name = (id: number) => {
  const n = topo.nodes[id]!;
  return `w${n.wing}(f${n.file},r${n.rank})`;
};

let bad = 0;
const examples: string[] = [];
for (let a = 0; a < topo.nodes.length; a++) {
  for (const b of set(a)) {
    if (!set(b).has(a)) {
      bad++;
      if (examples.length < 12) examples.push(`${name(a)} → ${name(b)} 但没有反跳`);
    }
  }
}
console.log('不对称条数:', bad);
for (const e of examples) console.log('  ', e);
console.log('落点总数:', [...Array(topo.nodes.length).keys()].reduce((s, i) => s + set(i).size, 0));
