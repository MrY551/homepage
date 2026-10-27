// 抓演示站截图：登录页 + 登录后切到「查询文件」标签（CDP 真视口 + 真登录）
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || '9344';
const BASE = process.env.DEMO_BASE || 'http://8.138.227.156/demo/';
const USER = process.env.DEMO_USER || 'demo';
const PASS = process.env.DEMO_PASS || 'demo1234';
const W = Number(process.env.VW || 1280);
const H = Number(process.env.VH || 900);
const OUT_DIR = process.env.OUT_DIR || '.';

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
const shot = async (file) => {
  const layout = await send('Page.getLayoutMetrics');
  const { width, height } = layout.cssContentSize;
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
  writeFileSync(`${OUT_DIR}/${file}`, Buffer.from(s.data, 'base64'));
  console.log(`saved ${file} (${width}x${Math.round(height)})`);
};

await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: W < 600, screenWidth: W, screenHeight: H });

// 1) 登录页
await send('Page.navigate', { url: `${BASE}login.php` });
await sleep(2500);
await shot(`shot-demo-login-${W}.png`);

// 2) 页面内登录
const login = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `fetch('api/auth.php/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(USER)},password:${JSON.stringify(PASS)}})}).then(r=>r.text())`,
});
console.log('login:', String(login.result.value).slice(0, 120));

// 3) 主界面 → 切到查询标签
await send('Page.navigate', { url: `${BASE}index.php` });
await sleep(3500);
const click = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const btn = document.querySelector('[data-tab="search"]');
    if (!btn) return 'no search tab';
    btn.click();
    await new Promise(r => setTimeout(r, 2500));
    return 'rows=' + document.querySelectorAll('tbody tr').length + ' tables=' + document.querySelectorAll('table').length;
  })()`,
});
console.log('search tab:', click.result.value);
await shot(`shot-demo-app-${W}.png`);

const state = await send('Runtime.evaluate', { returnByValue: true, expression: `({w: innerWidth, s: document.documentElement.scrollWidth, title: document.title})` });
console.log('state:', JSON.stringify(state.result.value));
ws.close(); process.exit(0);
