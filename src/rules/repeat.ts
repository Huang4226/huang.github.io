import type { GameState, Team } from '../core/types';

export interface RepetitionResult {
  winner: Team | null;
  reason: 'perpetual-check' | 'draw-repetition';
}

/**
 * 三次重复局面判定。
 *
 * 简化规则（设计文档 8.2）：
 * - 若一个完整重复周期内，某一方的**每一手都是将军** → 该方判负（长将）
 * - 否则 → 和棋
 *
 * 只看最近两个周期（3 次同局面），避免把很久以前的和棋素材算进来。
 */
export function repetitionResult(state: GameState): RepetitionResult | null {
  const keys = state.positions;
  const key = keys[keys.length - 1];
  if (key === undefined) return null;

  const hits: number[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === key) hits.push(i);
  }
  if (hits.length < 3) return null;

  const start = hits[hits.length - 3]!;
  const cycle = state.history.slice(start);

  const stats = new Map<Team, { total: number; checks: number }>();
  for (const move of cycle) {
    const rec = stats.get(move.piece.team) ?? { total: 0, checks: 0 };
    rec.total += 1;
    if (move.gaveCheck) rec.checks += 1;
    stats.set(move.piece.team, rec);
  }

  const perpetual = [...stats.entries()].filter(([, s]) => s.total > 0 && s.checks === s.total);
  if (perpetual.length === 1) {
    const loser = perpetual[0]![0];
    return {
      winner: state.order.find((t) => t !== loser) ?? null,
      reason: 'perpetual-check',
    };
  }
  return { winner: null, reason: 'draw-repetition' };
}
