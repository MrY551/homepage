// 只拍视口（不拼长图）：首屏 + 滚动到 1200px 处，验证真实使用时背景无接缝
import { writeFileSync } from 'node:fs';
const PORT = process.env.CDP_PORT || '9374';
const URL_ = process.env.TARGET_URL || 'http://8.138.227.156/';
const W = Number(process.env.VW || 1280), H = Number(process.env.VH || 900);
const OUT = process.env.OUT_DIR || '.';
const TAG = process.env.TAG || 'd';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
});
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });   // 视口大小，不 beyond
  writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, 'base64'));
  console.log('saved', name);
};

await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: W < 600, screenWidth: W, screenHeight: H });
await send('Page.navigate', { url: URL_ });
await sleep(2600);
await shot(`shot-view-${TAG}-top.png`);

await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 1200)' });
await sleep(900);
await shot(`shot-view-${TAG}-scrolled.png`);

const info = await send('Runtime.evaluate', { returnByValue: true, expression: '({ y: scrollY, sw: document.documentElement.scrollWidth, iw: innerWidth })' });
console.log(JSON.stringify(info.result.value));
ws.close(); process.exit(0);
