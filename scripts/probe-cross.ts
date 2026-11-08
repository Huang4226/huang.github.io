/** 临时探针：验证"河道不断线"的四个诉求。 */
import { createThreeTopology, threeWingAt } from '../src/topology/three';
import { attackTargets } from '../src/rules/moves';
import type { Piece, PieceKind, Team } from '../src/core/types';

const topo = createThreeTopology().topology;
const blank = () => new Array<Piece | null>(topo.nodes.length).fill(null);
const put = (cells: Array<Piece | null>, s: number, f: number, r: number, kind: PieceKind, team: Team) => {
  cells[threeWingAt(s, f, r)] = { kind, team };
};

// ① 红中炮 + 红中兵当炮架 → 能不能炸到白中兵 / 黑中兵
{
  const c = blank();
  put(c, 0, 4, 2, 'cannon', 'red');
  put(c, 0, 4, 3, 'pawn', 'red');
  put(c, 1, 4, 3, 'pawn', 'black');
  put(c, 2, 4, 3, 'pawn', 'white');
  const t = attackTargets(c, topo, threeWingAt(0, 4, 2));
  console.log('① 红中炮攻击格数:', t.length);
  console.log('   打到黑中兵:', t.includes(threeWingAt(1, 4, 3)));
  console.log('   打到白中兵:', t.includes(threeWingAt(2, 4, 3)));
}

// ② 红车在红中线上，能不能一口气过河
{
  const c = blank();
  put(c, 0, 4, 1, 'chariot', 'red');
  const t = attackTargets(c, topo, threeWingAt(0, 4, 1));
  console.log('② 红车可达格数:', t.length);
  console.log('   能到黑方底线:', t.includes(threeWingAt(1, 4, 0)));
  console.log('   能到白方底线:', t.includes(threeWingAt(2, 4, 0)));
}

// ③ 渡口上的红马能踩到哪儿（列出跨翼落点）
{
  const c = blank();
  const from = threeWingAt(0, 4, 4);
  put(c, 0, 4, 4, 'horse', 'red');
  const t = attackTargets(c, topo, from);
  const cross = t.filter((id) => topo.nodes[id]!.wing !== 0);
  console.log('③ 红马在渡口顶点，跨翼落点', cross.length, '个:');
  for (const id of cross) {
    const n = topo.nodes[id]!;
    console.log(`   → wing${n.wing} (f${n.file},r${n.rank})`);
  }
}

// ④ 黑炮用自家兵当架子打对岸白兵
{
  const c = blank();
  put(c, 1, 7, 2, 'cannon', 'black');
  put(c, 1, 7, 3, 'pawn', 'black');
  put(c, 0, 1, 3, 'pawn', 'red');
  put(c, 2, 1, 3, 'pawn', 'white');
  const t = attackTargets(c, topo, threeWingAt(1, 7, 2));
  console.log('④ 黑炮能否吃红兵/白兵:', t.includes(threeWingAt(0, 1, 3)), t.includes(threeWingAt(2, 1, 3)));
}
