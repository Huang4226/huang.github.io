/** 探针：列出从 (3,4) 出发每条路线的两个折角，挑"最像日字"的那条当唯一路线。 */
import { createThreeTopology, threeWingAt } from '../src/topology/three';

const topo = createThreeTopology().topology;
const P = (id: number) => ({ x: topo.nodes[id]!.x, y: topo.nodes[id]!.y });
const name = (id: number) => {
  const n = topo.nodes[id]!;
  return `w${n.wing}(f${n.file},r${n.rank})`;
};
const ang = (a: number, b: number, c: number) => {
  const p = P(a);
  const q = P(b);
  const r = P(c);
  const v1 = { x: q.x - p.x, y: q.y - p.y };
  const v2 = { x: r.x - q.x, y: r.y - q.y };
  const d = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
};

const NB = new Map<number, number[]>();
for (const [from, list] of topo.rays) {
  for (const ray of list) {
    const first = ray.nodes[0];
    if (first === undefined) continue;
    const l = NB.get(from) ?? [];
    if (!l.includes(first)) l.push(first);
    NB.set(from, l);
  }
}
const isBridge = (a: number, b: number) => topo.nodes[a]!.wing !== topo.nodes[b]!.wing;

const x = threeWingAt(0, 3, 4);
const routes: Array<{ target: number; a: number; a2: number; b: number; bend: number; turn: number; br: number }> = [];
for (const a of NB.get(x) ?? []) {
  for (const a2 of NB.get(a) ?? []) {
    if (a2 === x) continue;
    for (const b of NB.get(a2) ?? []) {
      if (b === a || b === x) continue;
      const bend = ang(x, a, a2);
      const turn = ang(a, a2, b);
      if (bend <= 35 || turn <= 35 || bend >= 145 || turn >= 145) continue;
      const br = [isBridge(x, a), isBridge(a, a2), isBridge(a2, b)].filter(Boolean).length;
      routes.push({ target: b, a, a2, b, bend, turn, br });
    }
  }
}
console.log('候选路线', routes.length);
for (const r of routes) {
  console.log(
    `${name(r.target).padEnd(12)} ${name(r.a)}→${name(r.a2)}  bend=${r.bend.toFixed(0)} turn=${r.turn.toFixed(0)} 桥${r.br}`,
  );
}
