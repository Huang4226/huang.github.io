/**
 * 点开某个交点并截图，用来看"这个子能走到哪儿"。
 *
 * 用法：node scripts/hl-shot.mjs <输出.png> <w,f,r> [<w,f,r> ...]
 *   w,f,r 是要依次点击的交点（翼,列,行）；先点棋子再点落点即为走一步。
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9377);
const URL = process.env.APP_URL ?? 'http://127.0.0.1:5188/#/three';

const out = process.argv[2] ?? 'debug/hl.png';
const picks = process.argv.slice(3).map((s) => s.split(',').map(Number));

const layout = JSON.parse(readFileSync('debug/three.json', 'utf8'));
const node = (w, f, r) => {
  const n = layout.nodes.find((x) => x.wing === w && x.file === f && x.rank === r);
  if (!n) throw new Error(`找不到交点 ${w}/${f}/${r}`);
  return n;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(
  EDGE,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${resolve('debug/edge-hl')}`,
    '--window-size=1100,1000',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let page = null;
for (let i = 0; i < 60 && !page; i++) {
  await sleep(250);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    page = list.find((t) => t.type === 'page');
  } catch {}
}
if (!page) throw new Error('CDP 未就绪');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    console.log('EXCEPTION:', m.params.exceptionDetails.text);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL });
await sleep(2000);

const rect = JSON.parse(
  (
    await send('Runtime.evaluate', {
      expression: 'JSON.stringify(document.querySelector("canvas").getBoundingClientRect())',
      returnByValue: true,
    })
  ).result.value,
);
const scale = Math.min(rect.width / layout.box.w, rect.height / layout.box.h);

for (const [w, f, r] of picks) {
  const n = node(w, f, r);
  const x = rect.left + n.x * scale;
  const y = rect.top + n.y * scale;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(360);
}

const info = await send('Runtime.evaluate', {
  expression: 'document.body.innerText.replace(/\\s+/g," ").slice(0,160)',
  returnByValue: true,
});
console.log('页面:', info.result.value);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);
edge.kill();
process.exit(0);
