import type { AppRoute } from './app';

export interface HomeHandlers {
  navigate: (route: AppRoute) => void;
}

function classicMini(): string {
  const xs = Array.from({ length: 9 }, (_, i) => 10 + i * 12.5);
  const ys = Array.from({ length: 10 }, (_, j) => 13 + j * 13);
  const v = xs.map((x) => `<line x1="${x}" y1="${ys[0]}" x2="${x}" y2="${ys[9] ?? 130}"/>`).join('');
  const h = ys.map((y) => `<line x1="10" y1="${y}" x2="110" y2="${y}"/>`).join('');
  // 九宫斜线
  const p1 = `<line x1="${xs[3]}" y1="${ys[0]}" x2="${xs[5]}" y2="${ys[2]}"/><line x1="${xs[5]}" y1="${ys[0]}" x2="${xs[3]}" y2="${ys[2]}"/>`;
  const p2 = `<line x1="${xs[3]}" y1="${ys[7]}" x2="${xs[5]}" y2="${ys[9]}"/><line x1="${xs[5]}" y1="${ys[7]}" x2="${xs[3]}" y2="${ys[9]}"/>`;
  return `<svg viewBox="0 0 120 143" class="mini" aria-hidden="true">
    <rect x="10" y="13" width="100" height="117" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".85"/>
    <g stroke="currentColor" fill="none" stroke-width=".9" opacity=".55">${h}${v}${p1}${p2}</g>
  </svg>`;
}

function threeMini(): string {
  // 三翼 + 中央逐鹿台的示意，只表意不表精确
  return `<svg viewBox="0 0 150 143" class="mini" aria-hidden="true">
    <g stroke="currentColor" fill="none" stroke-width=".9" opacity=".62">
      <path d="M75 10 L141 126 L9 126 Z"/>
      <path d="M75 10 L75 126" opacity=".4"/>
      <path d="M42 68 L108 68" opacity=".4"/>
      <path d="M9 126 L75 68 L141 126" opacity=".4"/>
      <path d="M60 126 L75 68 L90 126" opacity=".4"/>
    </g>
    <g fill="currentColor" opacity=".85">
      <circle cx="75" cy="22" r="4.5"/>
      <circle cx="130" cy="117" r="4.5"/>
      <circle cx="20" cy="117" r="4.5"/>
    </g>
  </svg>`;
}

export function renderHome(root: HTMLElement, handlers: HomeHandlers): void {
  root.innerHTML = `
  <section class="home">
    <header class="home__head">
      <p class="home__kick">中国象棋 · 双模式</p>
      <h1 class="home__title">逐鹿</h1>
      <p class="home__sub">经典双人，或三家逐鹿中原</p>
    </header>

    <div class="cards">
      <button class="card" data-route="classic" type="button">
        <span class="card__badge">已开放</span>
        <div class="card__art">${classicMini()}</div>
        <h2 class="card__name">经典双人</h2>
        <p class="card__desc">标准 9×10 棋盘，楚河汉界，红黑对垒</p>
        <span class="card__cta">开始对局 →</span>
      </button>

      <button class="card" data-route="three" type="button">
        <span class="card__badge">已开放</span>
        <div class="card__art">${threeMini()}</div>
        <h2 class="card__name">三人逐鹿</h2>
        <p class="card__desc">三翼棋盘 + 逐鹿台，杀将收编，最后存活者胜</p>
        <span class="card__cta">开始逐鹿 →</span>
      </button>
    </div>

    <footer class="home__foot">
      <span>双人含三档电脑对手 · 三人为同屏轮流</span>
    </footer>
  </section>`;

  root.querySelectorAll<HTMLElement>('[data-route]').forEach((el) => {
    el.addEventListener('click', () => {
      handlers.navigate(el.dataset.route === 'classic' ? 'classic' : 'three');
    });
  });
}
