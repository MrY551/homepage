// 验证「聊聊」下拉：展开状态、菜单项、QQ 链接、复制按钮、截图
import { writeFileSync } from 'node:fs';
const PORT = process.env.CDP_PORT || '9395';
const URL_ = process.env.TARGET_URL || 'http://8.138.227.156/';
const OUT = process.env.OUT_DIR || '.';
const W = Number(process.env.VW || 1280), H = Number(process.env.VH || 900);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
});
const send = (m, p = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: mid, method: m, params: p })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}`, Buffer.from(s.data, 'base64'));
  console.log('saved', name);
};

await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: W < 600, screenWidth: W, screenHeight: H });
await send('Page.navigate', { url: URL_ });
await sleep(2600);

// 1) 菜单默认收起
const before = await send('Runtime.evaluate', { returnByValue: true, expression: `({open: document.getElementById('talkMenu').getAttribute('data-open'), exp: document.getElementById('talkBtn').getAttribute('aria-expanded')})` });
console.log('初始状态:', JSON.stringify(before.result.value));

// 2) 点开
await send('Runtime.evaluate', { expression: `document.getElementById('talkBtn').click()` });
await sleep(400);
const after = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
  const menu = document.getElementById('talkMenu');
  const items = [...menu.querySelectorAll('.talk-item')].map(a => (a.textContent || '').replace(/\\s+/g, ' ').trim());
  const qq = menu.querySelector('a[href*="wpa.qq.com"]');
  const cs = getComputedStyle(menu);
  return {
    open: menu.getAttribute('data-open'),
    expanded: document.getElementById('talkBtn').getAttribute('aria-expanded'),
    opacity: cs.opacity,
    itemCount: items.length,
    items: items,
    qqHref: qq ? qq.getAttribute('href') : null,
    qqTarget: qq ? qq.getAttribute('target') : null,
    copyData: (document.getElementById('copyWechat') || {}).dataset ? document.getElementById('copyWechat').dataset.copy : null
  };
})()` });
console.log('展开状态:', JSON.stringify(after.result.value, null, 2));
await shot(`shot-talk-${W}.png`);

// 3) Esc 关闭
await send('Runtime.evaluate', { expression: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))` });
await sleep(300);
const esc = await send('Runtime.evaluate', { returnByValue: true, expression: `document.getElementById('talkMenu').getAttribute('data-open')` });
console.log('Esc 后 data-open:', esc.result.value);

// 4) 复制按钮（headless 里 clipboard 可能被拒，看兜底是否给出反馈）
await send('Runtime.evaluate', { expression: `document.getElementById('talkBtn').click()` });
await sleep(200);
await send('Runtime.evaluate', { expression: `document.getElementById('copyWechat').click()` });
await sleep(600);
const toast = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => { const t = document.querySelector('.talk-toast'); return t ? {text: t.textContent, show: t.getAttribute('data-show')} : null; })()` });
console.log('复制反馈:', JSON.stringify(toast.result.value));

ws.close(); process.exit(0);
