/**
 * 探针：马的路线 = "直行 2 格 → 拐弯 → 1 格"（以及镜像的 "拐 1 格 → 直行 2 格"），
 * 按图上真实几何算，看看渡口顶点会给出几个落点、有没有绕回原地。
 */
import { createThreeTopology, threeWingAt } from '../src/topology/three';

const topo = createThreeTopology().topology;
const P = (id: number) => ({ x: topo.nodes[id]!.x, y: topo.nodes[id]!.y });

const adj = new Map<number, number[]>();
const add = (a: number, b: number) => {
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  if (!adj.get(a)!.includes(b)) adj.get(a)!.push(b);
  if (!adj.get(b)!.includes(a)) adj.get(b)!.push(a);
};
for (const [from, list] of topo.rays) {
  for (const ray of list) if (ray.nodes[0] !== undefined) add(from, ray.nodes[0]);
}

/** 在 b 处量 a→b 与 b→c 的夹角：0°=继续直行，90°=拐弯，180°=掉头 */
const ang = (a: number, b: number, c: number) => {
  const p = P(a);
  const q = P(b);
  const r = P(c);
  const v1 = { x: q.x - p.x, y: q.y - p.y };
  const v2 = { x: r.x - q.x, y: r.y - q.y };
  const d = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y));
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI;
};

const STRAIGHT = 35;
const TURN_LO = 45;
const TURN_HI = 135;

function routes(x: number) {
  const out = new Map<number, number[]>();
  const push = (t: number, path: number[]) => {
    if (t === x) return; // 转一圈回到原地 → 删掉
    if (!out.has(t)) out.set(t, path);
  };
  // 形 A：直行 2 格后拐 1 格
  for (const a of adj.get(x) ?? []) {
    for (const a2 of adj.get(a) ?? []) {
      if (a2 === x) continue;
      if (ang(x, a, a2) > STRAIGHT) continue;
      for (const b of adj.get(a2) ?? []) {
        if (b === a) continue;
        const turn = ang(a, a2, b);
        if (turn < TURN_LO || turn > TURN_HI) continue;
        push(b, [a, a2, b]);
      }
    }
  }
  // 形 B：先拐 1 格再直行 2 格
  for (const a of adj.get(x) ?? []) {
    for (const a2 of adj.get(a) ?? []) {
      if (a2 === x) continue;
      const turn = ang(x, a, a2);
      if (turn < TURN_LO || turn > TURN_HI) continue;
      for (const b of adj.get(a2) ?? []) {
        if (b === a) continue;
        if (ang(a, a2, b) > STRAIGHT) continue;
        push(b, [a, a2, b]);
      }
    }
  }
  return out;
}

for (const [label, x] of [
  ['渡口顶点 (4,4)', threeWingAt(0, 4, 4)],
  ['河沿 (3,4)', threeWingAt(0, 3, 4)],
  ['中路 (4,2)', threeWingAt(0, 4, 2)],
  ['底线 (1,0)', threeWingAt(0, 1, 0)],
] as const) {
  const r = routes(x);
  console.log(`${label}: ${r.size} 个落点`);
  for (const [t, path] of r) {
    const n = topo.nodes[t]!;
    console.log(`   wing${n.wing} (f${n.file},r${n.rank})   ${x}→${path.join('→')}`);
  }
}
