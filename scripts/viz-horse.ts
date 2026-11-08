/**
 * 把"马能跳到哪儿"导成 JSON，交给 scripts/viz-three.py 画图核对（落点带编号）。
 * 用法：pnpm exec vite-node scripts/viz-horse.ts
 */
import { writeFileSync } from 'node:fs';
import { threeTopology, threeWingAt } from '../src/topology/three';

const topo = threeTopology;
const horseJumps = (id: number) => (topo.jumps.get(id) ?? []).filter((j) => j.kind === 'horse');

const cases: Array<[string, string, [number, number, number]]> = [
  ['apex', '渡口顶点 (4,4)', [0, 4, 4]],
  ['bank3', '河沿 (3,4)', [0, 3, 4]],
  ['bank5', '河沿 (5,4)', [0, 5, 4]],
  ['inner', '中路旁 (4,3)', [0, 4, 3]],
  ['center', '中路 (4,2)', [0, 4, 2]],
];

const scenarios = cases.map(([id, title, [w, f, r]]) => {
  const from = threeWingAt(w, f, r);
  const jumps = horseJumps(from);
  const targets = [...new Set(jumps.map((j) => j.target))];
  const legs = new Set(jumps.map((j) => j.leg));
  const cross = targets.filter((t) => topo.nodes[t]!.wing !== w).length;
  console.log(`${title}: ${targets.length} 落点 / ${jumps.length} 路线 / ${legs.size} 条腿 / 跨翼 ${cross}`);
  return {
    id,
    title: `${title} → ${targets.length} 落点`,
    from,
    pieces: [{ node: from, kind: 'horse', team: 'red' }],
    targets,
  };
});

// 全盘统计
const all = [];
for (let i = 0; i < topo.nodes.length; i++) all.push(new Set(horseJumps(i).map((j) => j.target)).size);
all.sort((a, b) => a - b);
console.log('落点数 min/中位/max:', all[0], all[Math.floor(all.length / 2)], all[all.length - 1]);
console.log('自环:', [...Array(topo.nodes.length).keys()].some((i) => horseJumps(i).some((j) => j.target === i)));

writeFileSync('debug/viz.json', JSON.stringify({ box: topo.boardBox, scenarios }, null, 1));
