import { AI_LEVELS, chooseMove, type AiLevel } from '../ai';
import type { AppRoute } from './app';
import { BoardView } from './board';
import { Toast } from './toast';
import { Sound } from './sound';
import { historyTexts } from '../core/notation';
import { REASON_LABEL, type EndReason } from '../core/result';
import { canSelect, createInitialState, undoMove } from '../core/state';
import {
  KIND_LABEL_BY_TEAM,
  TEAM_LABEL,
  type GameMode,
  type GameState,
  type Piece,
  type Team,
} from '../core/types';
import { generalNode, isInCheck } from '../rules/check';
import { hintsFor, playMove, resign } from '../rules/session';
import { classicTopology } from '../topology/classic';
import { threeTopology } from '../topology/three';
import type { Topology } from '../topology/types';

export interface ViewHandle {
  destroy: () => void;
}

export interface GameConfig {
  mode: GameMode;
  /** 底图；null 表示矢量自绘（三人棋盘） */
  background: string | null;
  aiAvailable: boolean;
}

const TOPOLOGY: Record<GameMode, Topology> = {
  classic: classicTopology,
  three: threeTopology,
};

function capturedChips(captured: Piece[]): string {
  if (!captured.length) return '<span class="muted">暂无</span>';
  return captured
    .map((p) => `<span class="chip chip--${p.team}">${KIND_LABEL_BY_TEAM[p.team][p.kind]}</span>`)
    .join('');
}

function countPieces(state: GameState, team: Team): number {
  return state.cells.filter((p) => p && p.team === team).length;
}

export async function mountGame(
  root: HTMLElement,
  navigate: (r: AppRoute) => void,
  cfg: GameConfig,
): Promise<ViewHandle> {
  const topo = TOPOLOGY[cfg.mode];
  const isThree = cfg.mode === 'three';
  let state: GameState = createInitialState(cfg.mode, topo);
  let selected: number | null = null;
  let hints: number[] = [];
  let aiLevel: AiLevel | null = null;
  const aiTeam: Team = 'black'; // 人机对局时玩家执红
  let busy = false;
  let disposed = false;
  let shownEliminations = 0;

  const opponentControl = cfg.aiAvailable
    ? `<label class="select">
         <span>对手</span>
         <select data-role="opponent">
           <option value="human">双人同屏</option>
           <option value="easy">${AI_LEVELS.easy.label}</option>
           <option value="normal">${AI_LEVELS.normal.label}</option>
           <option value="hard">${AI_LEVELS.hard.label}</option>
         </select>
       </label>`
    : '';

  root.innerHTML = `
  <section class="game ${isThree ? 'game--three' : ''}">
    <div class="game__bar">
      <button class="btn btn--ghost" data-act="back" type="button">← 返回</button>
      <div class="turn" data-role="turn"></div>
      ${opponentControl}
      <div class="game__acts">
        <button class="btn btn--icon" data-act="sound" data-role="sound" type="button" title="音效开关">🔊</button>
        <button class="btn" data-act="undo" type="button">悔棋</button>
        <button class="btn" data-act="resign" type="button">认输</button>
        <button class="btn" data-act="reset" type="button">重开</button>
      </div>
    </div>

    <div class="game__stage" data-role="stage">
      <canvas data-role="canvas"></canvas>
      <div class="overlay" data-role="overlay" hidden>
        <div class="overlay__card">
          <p class="overlay__kick" data-role="resultKick">对局结束</p>
          <h2 class="overlay__title" data-role="resultTitle"></h2>
          <p class="overlay__desc" data-role="resultDesc"></p>
          <div class="overlay__acts">
            <button class="btn btn--primary" data-act="again" type="button">再来一局</button>
            <button class="btn btn--ghost" data-act="home" type="button">返回首页</button>
          </div>
        </div>
      </div>
    </div>

    <div class="game__side">
      <div class="panel">
        <div class="panel__row"><span class="panel__label">手数</span><span data-role="ply">0</span></div>
        <div class="panel__row"><span class="panel__label">被吃</span><span class="chips" data-role="captured"></span></div>
        <div class="panel__row panel__row--moves"><span class="panel__label">棋谱</span><span class="moves" data-role="moves"></span></div>
        ${isThree ? '<div class="panel__row"><span class="panel__label">三家</span><span class="teams" data-role="teams"></span></div>' : ''}
        <div class="panel__row panel__row--warn" data-role="notice"></div>
      </div>
    </div>
  </section>`;

  const canvas = root.querySelector<HTMLCanvasElement>('[data-role="canvas"]')!;
  const stage = root.querySelector<HTMLElement>('[data-role="stage"]')!;
  const turnEl = root.querySelector<HTMLElement>('[data-role="turn"]')!;
  const plyEl = root.querySelector<HTMLElement>('[data-role="ply"]')!;
  const capturedEl = root.querySelector<HTMLElement>('[data-role="captured"]')!;
  const teamsEl = root.querySelector<HTMLElement>('[data-role="teams"]');
  const movesEl = root.querySelector<HTMLElement>('[data-role="moves"]')!;
  const soundBtn = root.querySelector<HTMLButtonElement>('[data-role="sound"]')!;
  const noticeEl = root.querySelector<HTMLElement>('[data-role="notice"]')!;
  const overlay = root.querySelector<HTMLElement>('[data-role="overlay"]')!;
  const resultKick = root.querySelector<HTMLElement>('[data-role="resultKick"]')!;
  const resultTitle = root.querySelector<HTMLElement>('[data-role="resultTitle"]')!;
  const resultDesc = root.querySelector<HTMLElement>('[data-role="resultDesc"]')!;
  const opponentEl = root.querySelector<HTMLSelectElement>('[data-role="opponent"]');

  const toast = new Toast(stage);
  const sound = new Sound();
  soundBtn.textContent = sound.enabled ? '🔊' : '🔇';
  soundBtn.classList.toggle('btn--off', !sound.enabled);
  const board = new BoardView(canvas, topo, cfg.background);
  await board.init();
  if (disposed) {
    toast.destroy();
    return { destroy: () => undefined };
  }

  const fit = (): void => board.fit(stage.clientWidth - 8);

  const refresh = (): void => {
    const checkNode = isInCheck(state, topo) ? generalNode(state.cells, state.turn) : null;

    board.state = state;
    board.selected = selected;
    board.hints = hints;
    board.checkNode = checkNode;
    const last = state.history[state.history.length - 1];
    board.lastMove = last ? { from: last.from, to: last.to } : null;
    board.draw();

    if (state.status === 'over') turnEl.textContent = '对局结束';
    else if (busy) turnEl.textContent = '电脑思考中…';
    else turnEl.textContent = `${TEAM_LABEL[state.turn]}行棋`;
    turnEl.dataset.team = state.turn;

    plyEl.textContent = String(state.ply);
    capturedEl.innerHTML = capturedChips(state.captured);

    const texts = historyTexts(state, 8);
    const startNo = state.history.length - texts.length;
    movesEl.innerHTML = texts.length
      ? texts.map((t, i) => `<span class="mv"><i>${startNo + i + 1}</i>${t}</span>`).join('')
      : '<span class="muted">—</span>';

    if (teamsEl) {
      teamsEl.innerHTML = ['red', 'black', 'white']
        .map((t) => {
          const team = t as Team;
          const out = !state.order.includes(team);
          return `<span class="team ${out ? 'team--out' : ''} ${state.turn === team && state.status === 'playing' ? 'team--active' : ''}" data-team="${team}">
            <i></i>${TEAM_LABEL[team]}<b>${out ? '出局' : countPieces(state, team)}</b>
          </span>`;
        })
        .join('');
    }

    if (state.status === 'over') {
      noticeEl.textContent = '';
    } else if (checkNode !== null) {
      noticeEl.textContent = `将军！${TEAM_LABEL[state.turn]}必须应将`;
    } else if (aiLevel) {
      noticeEl.textContent = `你执红，对手：${AI_LEVELS[aiLevel].label}`;
    } else if (isThree) {
      noticeEl.textContent = '三家轮流 · 灭国者收编其车马炮与未过河兵卒';
    } else {
      noticeEl.textContent = '走法已校验 · 点击棋子查看合法落点';
    }

    if (state.status === 'over') {
      const winner = state.winner;
      const reason = (state.endReason ?? 'resign') as EndReason;
      resultKick.textContent =
        reason === 'resign' ? '对局结束' : `对局结束 · ${REASON_LABEL[reason] ?? ''}`;
      resultTitle.textContent = winner ? `${TEAM_LABEL[winner]}胜` : '和棋';
      resultTitle.dataset.team = winner ?? 'none';
      resultDesc.textContent = winner
        ? (REASON_LABEL[reason] ?? '')
        : `${REASON_LABEL[reason] ?? ''}（双方均无法取胜）`;
      overlay.hidden = false;
    } else {
      overlay.hidden = true;
    }
  };

  const clearSelection = (): void => {
    selected = null;
    hints = [];
  };

  const announce = (): void => {
    if (state.eliminations.length > shownEliminations) {
      const e = state.eliminations[state.eliminations.length - 1]!;
      const detail = e.killer
        ? `收编 ${e.converted.length} 子、移除 ${e.removed.length} 子`
        : `残子清除 ${e.removed.length} 枚`;
      toast.show(`${TEAM_LABEL[e.victim]}出局 · ${detail}`);
      shownEliminations = state.eliminations.length;
      return;
    }
    if (state.status === 'playing' && isInCheck(state, topo)) toast.show('将军！');
  };

  const playMoveSound = (): void => {
    const last = state.history[state.history.length - 1];
    if (state.status === 'over') sound.play('win');
    else if (last?.gaveCheck) sound.play('check');
    else if (last?.captured) sound.play('capture');
    else sound.play('move');
  };

  const maybeAi = async (): Promise<void> => {
    if (disposed || busy) return;
    if (!aiLevel || state.status !== 'playing' || state.turn !== aiTeam) return;
    busy = true;
    refresh();
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (disposed) {
      busy = false;
      return;
    }
    const result = chooseMove(state, topo, aiLevel);
    if (result.move) {
      const from = result.move.from;
      const to = result.move.to;
      state = playMove(state, topo, from, to);
      board.pendingMove = { from, to };
      playMoveSound();
    }
    busy = false;
    refresh();
    announce();
  };

  const onClick = (ev: MouseEvent): void => {
    sound.unlock();
    if (state.status === 'over' || busy) return;
    const hit = board.hitTest(ev.clientX, ev.clientY);
    if (!hit) {
      clearSelection();
      refresh();
      return;
    }
    const id = hit.node.id;

    if (selected !== null && hints.includes(id)) {
      const from = selected;
      state = playMove(state, topo, from, id);
      clearSelection();
      board.pendingMove = { from, to: id };
      playMoveSound();
      refresh();
      announce();
      void maybeAi();
      return;
    }
    if (canSelect(state, id)) {
      selected = selected === id ? null : id;
      hints = selected === null ? [] : hintsFor(state, topo, selected);
      refresh();
      return;
    }
    if (selected !== null) toast.show('不能这样走');
    clearSelection();
    refresh();
  };

  const resetGame = (): void => {
    state = createInitialState(cfg.mode, topo);
    shownEliminations = 0;
    clearSelection();
    refresh();
    void maybeAi();
  };

  const onResize = (): void => fit();
  canvas.addEventListener('click', onClick);
  const ro = new ResizeObserver(() => fit());
  ro.observe(stage);
  window.addEventListener('resize', onResize);

  opponentEl?.addEventListener('change', () => {
    const value = opponentEl.value;
    aiLevel = value === 'human' ? null : (value as AiLevel);
    resetGame();
  });

  const actions: Record<string, () => void> = {
    back: () => navigate('home'),
    home: () => navigate('home'),
    sound: () => {
      const on = sound.toggle();
      soundBtn.textContent = on ? '🔊' : '🔇';
      soundBtn.classList.toggle('btn--off', !on);
      if (on) sound.play('move');
    },
    undo: () => {
      if (busy) return;
      state = undoMove(state);
      if (aiLevel && state.history.length > 0 && state.turn === aiTeam) state = undoMove(state);
      shownEliminations = state.eliminations.length;
      clearSelection();
      refresh();
    },
    reset: () => resetGame(),
    again: () => resetGame(),
    resign: () => {
      if (state.status === 'over') return;
      state = resign(state, state.turn);
      clearSelection();
      refresh();
    },
  };

  root.querySelectorAll<HTMLElement>('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fn = actions[btn.dataset.act ?? ''];
      if (fn) fn();
    });
  });

  refresh();
  fit();

  return {
    destroy: () => {
      disposed = true;
      toast.destroy();
      board.dispose();
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
    },
  };
}
