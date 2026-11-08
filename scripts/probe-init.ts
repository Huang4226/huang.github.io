/** 在三人局初始局面上把红马挪到顶点，看合法落点是多少。 */
import { createInitialState } from '../src/core/state';
import type { Piece } from '../src/core/types';
import { legalMovesFrom } from '../src/rules/check';
import { threeTopology, threeWingAt } from '../src/topology/three';

const topo = threeTopology;
const apex = threeWingAt(0, 4, 4);
const name = (id: number) => {
  const n = topo.nodes[id]!;
  return `w${n.wing}(f${n.file},r${n.rank})`;
};

const base = createInitialState('three', topo);
const cells = base.cells.slice() as Array<Piece | null>;
// 把红方中兵拿掉，红马放到顶点
cells[threeWingAt(0, 4, 3)] = null;
cells[apex] = { team: 'red', kind: 'horse' };
// 再在 (4,2) 放一个红相（模拟用户局面）
cells[threeWingAt(0, 4, 2)] = { team: 'red', kind: 'elephant' };
const state = { ...base, cells };
console.log('轮到:', state.turn);
console.log('顶点马合法落点:', legalMovesFrom(state, topo, apex).length);
console.log('顶点马合法落点列表:', legalMovesFrom(state, topo, apex).map(name).join(' '));

// 去掉 (4,2) 的相，看是否变成"被牵制"
const c2 = cells.slice() as Array<Piece | null>;
c2[threeWingAt(0, 4, 2)] = null;
const s2 = { ...base, cells: c2 };
console.log('无相时合法落点:', legalMovesFrom(s2, topo, apex).length);
