/**
 * 截图 / 查错小工具。
 * 用法：node scripts/shot.mjs <url> <out.png> [waitMs] [clicks]
 *   clicks: "x,y;x,y" 依次点击（CSS 像素，相对视口）
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9355);
const url = process.argv[2] ?? 'http://127.0.0.1:5188/';
const out = process.argv[3] ?? 'debug/shot.png';
const wait = Number(process.argv[4] ?? 1500);
const clicks = (process.argv[5] ?? '')
  .split(';')
  .filter(Boolean)
  .map((s) => s.split(',').map(Number));

mkdirSync('debug', { recursive: true });
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
    `--user-data-dir=${resolve('debug/edge-shot')}`,
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
if (!page) {
  console.error('CDP 未就绪');
  process.exit(1);
}

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
  if (m.method === 'Runtime.consoleAPICalled') {
    console.log('console:', m.params.type, m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console.log('EXCEPTION:', d.text, d.exception?.description ?? '');
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
await send('Page.navigate', { url });
await sleep(wait);

for (const [x, y] of clicks) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(400);
}

const info = await send('Runtime.evaluate', {
  expression: 'document.querySelectorAll("canvas").length + " canvas / " + document.body.innerText.slice(0,80)',
  returnByValue: true,
});
console.log('page:', info.result?.value);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);

edge.kill();
process.exit(0);
