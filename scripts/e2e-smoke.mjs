/**
 * 端到端冒烟：用无头 Edge + CDP 真实点击棋盘，验证 M1 的选中/落子/悔棋。
 *
 * 前置：`pnpm build` 产出 dist/，并用静态服务器托管（默认 http://127.0.0.1:5188/）。
 * 运行：node scripts/e2e-smoke.mjs
 *
 * 环境变量：
 *   APP_URL    被测地址（默认 http://127.0.0.1:5188/）
 *   EDGE_PATH  浏览器可执行文件（默认 Edge 安装路径）
 *   CDP_PORT   调试端口（默认 9333）
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EDGE =
  process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5188/';
const PORT = Number(process.env.CDP_PORT ?? 9333);
const OUT_DIR = resolve(process.cwd(), 'debug');
mkdirSync(OUT_DIR, { recursive: true });

const layout = JSON.parse(readFileSync(resolve(OUT_DIR, 'classic.json'), 'utf8'));
const BOX_W = layout.box.w;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, { timeout = 15000, interval = 150, label = 'condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* 重试 */
    }
    if (Date.now() - t0 > timeout) throw new Error(`超时等待：${label}`);
    await sleep(interval);
  }
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else res(msg.result);
      } else if (msg.method) {
        const list = this.listeners.get(msg.method) ?? [];
        list.forEach((fn) => fn(msg.params));
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { resolve: res, reject: rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((res) => {
      const list = this.listeners.get(method) ?? [];
      const fn = (params) => {
        this.listeners.set(
          method,
          (this.listeners.get(method) ?? []).filter((f) => f !== fn),
        );
        res(params);
      };
      this.listeners.set(method, [...list, fn]);
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(`页面异常：${r.exceptionDetails.text}`);
    return r.result.value;
  }

  async screenshot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(OUT_DIR, file), Buffer.from(data, 'base64'));
    return file;
  }
}

function nodeById(id) {
  const n = layout.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`布局中找不到节点 ${id}`);
  return n;
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

let edge;
try {
  edge = spawn(
    EDGE,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--disable-extensions',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${resolve(OUT_DIR, 'edge-e2e')}`,
      '--window-size=1100,1000',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const targets = await waitFor(
    async () => {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      return page ? [page] : null;
    },
    { label: 'CDP 就绪' },
  );

  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('CDP WebSocket 连接失败')), { once: true });
  });
  const cdp = new Cdp(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // 1) 打开经典双人对局
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `${APP_URL}#/classic` });
  await loaded;
  await sleep(600);

  const rect = await cdp.eval(`(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`);
  check('对局页渲染出 canvas', !!rect, rect ? `${Math.round(rect.width)}×${Math.round(rect.height)}` : '缺失');
  if (!rect) throw new Error('canvas 未就绪');

  const scale = rect.width / BOX_W;
  const toClient = (x, y) => ({ x: rect.left + x * scale, y: rect.top + y * scale });

  const click = async (nodeId) => {
    const n = nodeById(nodeId);
    const p = toClient(n.x, n.y);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: p.x,
      y: p.y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: p.x,
      y: p.y,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await sleep(220);
  };

  const turnText = () => cdp.eval(`document.querySelector('[data-role="turn"]').textContent`);
  const plyText = () => cdp.eval(`document.querySelector('[data-role="ply"]').textContent`);

  check('开局轮到红方', (await turnText()).includes('红方'), await turnText());
  check('开局手数为 0', (await plyText()).trim() === '0', await plyText());
  const notice = await cdp.eval(`document.querySelector('[data-role="notice"]').textContent`);
  check('已启用走法校验', notice.includes('校验'), notice);

  // 2) 规则拒绝：红车(0,0) 被自家兵(0,3) 挡住，(0,5) 到不了
  const RED_CHARIOT = 0;
  const BLOCKED = 5 * 9 + 0;
  await click(RED_CHARIOT);
  await cdp.screenshot('e2e-selected.png');
  await click(BLOCKED);
  check('非法走法被拒绝（红车不能越过自家兵）', (await plyText()).trim() === '0', await plyText());

  // 3) 合法走法：红马(1,0) → (2,2) 走日字
  const RED_HORSE = 0 * 9 + 1;
  const HORSE_TARGET = 2 * 9 + 2;
  await click(RED_HORSE);
  await click(HORSE_TARGET);
  await cdp.screenshot('e2e-moved.png');
  check('合法走法成功（马走日）', (await plyText()).trim() === '1', await plyText());
  check('落子后轮到黑方', (await turnText()).includes('黑方'), await turnText());
  const moveLog = await cdp.eval(
    `document.querySelector('[data-role="moves"]').textContent`,
  );
  check('棋谱记录中文记法', moveLog.includes('马八进七'), moveLog.trim().slice(0, 40));

  // 4) 悔棋
  await cdp.eval(`document.querySelector('[data-act="undo"]').click()`);
  await sleep(220);
  check('悔棋后回到红方', (await turnText()).includes('红方'), await turnText());
  check('悔棋后手数归零', (await plyText()).trim() === '0', await plyText());

  // 5) 不能吃自己的子：点红车（0,0）→ 点自家红马（1,0）应无效
  await click(0);
  await click(1);
  const ply4 = await plyText();
  check('不能吃自己的子（手数不变）', ply4.trim() === '0', ply4);

  // 6) 认输 → 终局弹窗
  await cdp.eval(`document.querySelector('[data-act="resign"]').click()`);
  await sleep(260);
  const overlayHidden = await cdp.eval(
    `document.querySelector('[data-role="overlay"]').hasAttribute('hidden')`,
  );
  const resultTitle = await cdp.eval(
    `document.querySelector('[data-role="resultTitle"]').textContent`,
  );
  check('认输弹出终局遮罩', overlayHidden === false, `hidden=${overlayHidden}`);
  check('认输判对方胜', resultTitle.includes('黑方'), resultTitle);
  await cdp.screenshot('e2e-result.png');

  // 7) 人机对局：切到电脑·易，玩家走一步后电脑应招
  await cdp.eval(`(() => {
    const s = document.querySelector('[data-role="opponent"]');
    s.value = 'easy';
    s.dispatchEvent(new Event('change'));
  })()`);
  await sleep(300);
  await cdp.eval(`location.hash = '#/classic'`);
  await sleep(400);
  await cdp.eval(`(() => {
    const s = document.querySelector('[data-role="opponent"]');
    s.value = 'easy';
    s.dispatchEvent(new Event('change'));
  })()`);
  await sleep(300);

  const rectAi = await cdp.eval(`(() => {
    const c = document.querySelector('canvas');
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`);
  const scaleAi = rectAi.width / BOX_W;
  const clickAt = async (nodeId) => {
    const n = nodeById(nodeId);
    const x = rectAi.left + n.x * scaleAi;
    const y = rectAi.top + n.y * scaleAi;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(200);
  };
  await clickAt(3 * 9 + 4); // 红兵
  await clickAt(4 * 9 + 4); // 渡口
  const aiReplied = await waitFor(async () => (await plyText()).trim() === '2', {
    timeout: 12000,
    interval: 200,
    label: '电脑应招',
  });
  check('电脑自动应招（手数 2）', !!aiReplied, await plyText());
  const turnAfterAi = await turnText();
  check('电脑走完后轮到玩家', turnAfterAi.includes('红方'), turnAfterAi);
  await cdp.screenshot('e2e-ai.png');

  // 8) 三人逐鹿：真实点击走一步兵
  const threeLayout = JSON.parse(readFileSync(resolve(OUT_DIR, 'three.json'), 'utf8'));
  await cdp.eval(`location.hash = '#/three'`);
  await sleep(900);
  const rect3 = await cdp.eval(`(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  })()`);
  check('三人棋盘渲染出 canvas', !!rect3, rect3 ? `${Math.round(rect3.width)}×${Math.round(rect3.height)}` : '缺失');
  if (!rect3) throw new Error('三人棋盘 canvas 未就绪');

  const scale3 = rect3.width / threeLayout.box.w;
  const node3 = (w, f, r) => {
    const n = threeLayout.nodes.find((x) => x.wing === w && x.file === f && x.rank === r);
    if (!n) throw new Error(`三人布局找不到翼${w} (${f},${r})`);
    return n;
  };
  const click3 = async (n) => {
    const x = rect3.left + n.x * scale3;
    const y = rect3.top + n.y * scale3;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(220);
  };

  const teams = await cdp.eval(`document.querySelectorAll('.team').length`);
  check('三家状态条渲染', teams === 3, String(teams));

  await click3(node3(0, 4, 3)); // 红兵
  await cdp.screenshot('e2e-three-selected.png');
  await click3(node3(0, 4, 4)); // 渡口
  const ply3 = await cdp.eval(`document.querySelector('[data-role="ply"]').textContent`);
  const turn3 = await cdp.eval(`document.querySelector('[data-role="turn"]').textContent`);
  await cdp.screenshot('e2e-three-moved.png');
  check('三人局红兵过河一步', ply3.trim() === '1', ply3);
  check('三人局轮到黑方', turn3.includes('黑方'), turn3);

  // 8) 首页可达
  await cdp.eval(`location.hash = '#/home'`);
  await sleep(400);
  const cards = await cdp.eval(`document.querySelectorAll('.card').length`);
  check('首页两张模式卡', cards === 2, String(cards));
  await cdp.screenshot('e2e-home.png');

  ws.close();
} catch (err) {
  check('冒烟脚本执行', false, err.message);
} finally {
  edge?.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  console.error('失败项：', failed.map((f) => f.name).join('、'));
  process.exit(1);
}
