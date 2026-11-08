/** 探针：直行 ≤60°、拐弯 66–132°、禁止连续两次过桥。 */
import { createThreeTopology, threeWingAt } from '../src/topology/three';

const topo = createThreeTopology().topology;
const P = (id: number) => ({ x: topo.nodes[id]!.x, y: topo.nodes[id]!.y });
const label = (id: number) => {
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
const bridge = (a: number, b: number) => topo.nodes[a]!.wing !== topo.nodes[b]!.wing;

const STRAIGHT = Number(process.env.ST ?? 60);
const TURN_LO = Number(process.env.TL ?? 66);
const TURN_HI = 132;

function routes(x: number) {
  const out = new Map<number, number[]>();
  const push = (b: number, path: number[]) => {
    if (b === x) return;
    if (!out.has(b)) out.set(b, path);
  };
  for (const a of NB.get(x) ?? []) {
    const br1 = bridge(x, a);
    for (const a2 of NB.get(a) ?? []) {
      if (a2 === x) continue;
      const br2 = bridge(a, a2);
      if (br1 && br2) continue; // 禁止连续两次过桥（倒三角上连跨两条边）
      const bend = ang(x, a, a2);
      for (const b of NB.get(a2) ?? []) {
        if (b === a || b === x) continue;
        if (br2 && bridge(a2, b)) continue;
        const t = ang(a, a2, b);
        if ((bend <= STRAIGHT && t >= TURN_LO && t <= TURN_HI) ||
            (bend >= TURN_LO && bend <= TURN_HI && t <= STRAIGHT)) {
          push(b, [a, a2, b]);
        }
      }
    }
  }
  return out;
}

for (const [title, x] of [
  ['渡口顶点', threeWingAt(0, 4, 4)],
  ['河沿 (3,4)', threeWingAt(0, 3, 4)],
  ['河沿 (5,4)', threeWingAt(0, 5, 4)],
  ['中路 (4,2)', threeWingAt(0, 4, 2)],
  ['底线 (1,0)', threeWingAt(0, 1, 0)],
] as const) {
  const r = routes(x);
  console.log(`\n${title} ${label(x)}: ${r.size} 个落点`);
  for (const [t, path] of [...r.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`   ${label(t)}   ${x}→${path.join('→')}`);
  }
}
