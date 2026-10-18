import { BOARD_CLASSIC_URL, BOARD_THREE_URL } from './assets';
import { mountGame, type ViewHandle } from './game';
import { renderHome } from './home';

export type AppRoute = 'home' | 'classic' | 'three';

let activeHandle: ViewHandle | null = null;
let token = 0;
let appRoot: HTMLElement | null = null;

export function navigateTo(route: AppRoute): void {
  const target = `#/${route}`;
  if (location.hash === target) {
    renderRoute(route);
    return;
  }
  location.hash = target;
}

function routeFromHash(): AppRoute {
  const raw = location.hash.replace(/^#\/?/, '');
  if (raw === 'classic' || raw === 'three') return raw;
  return 'home';
}

export function mountApp(root: HTMLElement): void {
  appRoot = root;
  window.addEventListener('hashchange', () => renderRoute(routeFromHash()));
  renderRoute(routeFromHash());
}

function renderRoute(route: AppRoute): void {
  const root = appRoot;
  if (!root) return;

  activeHandle?.destroy();
  activeHandle = null;
  const myToken = ++token;

  if (route === 'home') {
    renderHome(root, { navigate: navigateTo });
    document.title = '逐鹿 · 象棋';
    return;
  }

  const isThree = route === 'three';
  document.title = isThree ? '三人逐鹿 · 逐鹿' : '经典双人 · 逐鹿';

  void mountGame(root, navigateTo, {
    mode: isThree ? 'three' : 'classic',
    background: isThree ? BOARD_THREE_URL : BOARD_CLASSIC_URL,
    aiAvailable: !isThree,
  }).then((handle) => {
    if (myToken !== token) {
      handle.destroy();
      return;
    }
    activeHandle = handle;
  });
}
