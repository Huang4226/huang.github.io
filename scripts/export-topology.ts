/**
 * 导出拓扑为 JSON，供离线绘图校验（debug/classic.json、debug/three.json）。
 * 用途：把交点圆点 / 线段叠加到底图上，人工核对标定与几何是否正确。
 *
 * 运行：pnpm export:topology
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classicTopology } from '../src/topology/classic';
import { threeTopology } from '../src/topology/three';
import type { Topology } from '../src/topology/types';

const outDir = resolve(process.cwd(), 'debug');
mkdirSync(outDir, { recursive: true });

function dump(topo: Topology) {
  return {
    name: topo.name,
    box: topo.boardBox,
    gap: topo.gap,
    nodes: topo.nodes.map((n) => ({
      id: n.id,
      x: n.x,
      y: n.y,
      file: n.file,
      rank: n.rank,
      wing: n.wing,
      frames: n.frames,
    })),
    segments: topo.segments,
    pieces: topo.startLayout.map((p) => ({ node: p.node, ...p.piece })),
    palaces: Object.fromEntries(topo.palaces),
  };
}

for (const topo of [classicTopology, threeTopology]) {
  const data = dump(topo);
  writeFileSync(resolve(outDir, `${topo.name}.json`), JSON.stringify(data, null, 1), 'utf8');
  console.log(
    `${topo.name}: ${data.nodes.length} 交点 / ${data.segments.length} 段线 / ${data.pieces.length} 枚棋子 → debug/${topo.name}.json`,
  );
}
