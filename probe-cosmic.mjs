// 校验星系版首页：布局是否溢出、canvas 是否在画、滤镜与元素是否到位
const PORT = process.env.CDP_PORT || '9360';
const URL_ = process.env.TARGET_URL || 'http://8.138.227.156/';
const W = Number(process.env.VW || 1280);
const H = Number(process.env.VH || 900);
const OUT = process.env.OUT_PNG || 'shot.png';

import { writeFileSync } from 'node:fs';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 200));
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('ERR ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200));
});
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: W < 600, screenWidth: W, screenHeight: H });
await send('Page.navigate', { url: URL_ });
await sleep(3200);

const probe = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const c = document.getElementById('particles');
    const ctx = c.getContext('2d');
    // 取一小块像素，确认画布上真有内容（不是空白）
    let painted = 0, total = 0;
    const box = ctx.getImageData(0, 0, Math.min(400, c.width), Math.min(400, c.height)).data;
    for (let i = 3; i < box.length; i += 4) { total++; if (box[i] > 0) painted++; }
    const card = document.querySelector('.hero');
    const cs = getComputedStyle(card);
    return {
      title: document.title,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      canvas: !!c, canvasW: c.width, canvasH: c.height,
      paintedAlphaPx: painted + '/' + total,
      heroBlur: cs.backdropFilter || cs.webkitBackdropFilter,
      heroRadius: cs.borderRadius,
      heroBg: cs.backgroundImage.slice(0, 60),
      actions: document.querySelectorAll('.actions a').length,
      works: document.querySelectorAll('.work').length,
      countText: (document.getElementById('count') || {}).textContent,
      avatarVisible: !!document.querySelector('.avatar'),
    };
  })()`,
});
console.log(JSON.stringify(probe.result.value, null, 2));
console.log('console errors:', logs.length ? logs.join('\n') : '(none)');

const layout = await send('Page.getLayoutMetrics');
const { width, height } = layout.cssContentSize;
const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
writeFileSync(OUT, Buffer.from(s.data, 'base64'));
console.log(`saved ${OUT} (${Math.round(width)}x${Math.round(height)})`);
ws.close(); process.exit(0);
