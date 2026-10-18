/**
 * 单文件构建：把 dist/ 的 JS、CSS、图片全部内联进一个 index.html。
 * 产物双击即可玩（file:// 下不再有 module/CORS 问题）。
 *
 * 用法：pnpm build && node scripts/build-single.mjs
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(process.cwd(), 'dist');
const outDir = resolve(process.cwd(), 'dist-single');

const MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

const assetsDir = join(dist, 'assets');
const files = new Map();
for (const name of readdirSync(assetsDir)) {
  const p = join(assetsDir, name);
  if (statSync(p).isFile()) files.set(name, p);
}

const assetPath = (url) => {
  const clean = url.replace(/^\.?\//, '').replace(/^assets\//, '');
  const decoded = decodeURIComponent(clean);
  const hit = files.get(clean) ?? files.get(decoded);
  if (!hit) throw new Error(`找不到资源：${url}`);
  return hit;
};

let html = readFileSync(join(dist, 'index.html'), 'utf8');

// 1) 内联样式表
html = html.replace(/<link\b[^>]*>/g, (tag) => {
  if (!/\brel="stylesheet"/.test(tag)) return tag;
  const m = tag.match(/href="([^"]+)"/);
  if (!m) return tag;
  const css = readFileSync(assetPath(m[1]), 'utf8');
  return `<style>\n${css}\n</style>`;
});

// 2) 内联脚本
html = html.replace(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/script>/g, (_tag, _pre, src) => {
  const js = readFileSync(assetPath(src), 'utf8');
  return `<script type="module">\n${js}\n</script>`;
});

// 3) 图片转 data URI
//    Vite 在 base='./' 下会把资源编译成 new URL(`xxx.png`, import.meta.url).href
//    内联后 import.meta.url 指向 index.html，必须整体替换掉。
let inlined = 0;
const toDataUri = (url) => {
  const path = assetPath(url);
  const ext = path.split('.').pop().toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';
  const b64 = readFileSync(path).toString('base64');
  inlined += 1;
  return `data:${mime};base64,${b64}`;
};

html = html.replace(
  /new URL\(\s*([`"'])([^`"']+\.(?:png|jpe?g|webp|gif|svg))\1\s*,\s*import\.meta\.url\s*\)\s*\.href/g,
  (_m, _q, url) => JSON.stringify(toDataUri(url)),
);

// 兼容直接以字符串形式出现的资源引用
html = html.replace(/(["'`])(\.\/assets\/[^"'`]+)\1/g, (_m, quote, url) => {
  return `${quote}${toDataUri(url)}${quote}`;
});

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'index.html');
writeFileSync(outFile, html, 'utf8');

const kb = (statSync(outFile).size / 1024).toFixed(0);
console.log(`单文件构建完成：${outFile}`);
console.log(`内联图片 ${inlined} 张，产物 ${kb} KB`);
if (inlined < 21) {
  console.error('警告：内联图片少于 21 张，可能有资源没被打包进去');
  process.exit(1);
}
