// 访客侧性能与布局验证：帧率（应≈30fps）、布局溢出、关键元素、截图
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || '9370';
const URL_ = process.env.TARGET_URL || 'http://8.138.227.156/';
const W = Number(process.env.VW || 1280);
const H = Number(process.env.VH || 900);
const OUT = process.env.OUT_PNG || 'shot.png';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const logs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 160));
});
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
await send('Page.enable'); await send('Runtime.enable'); await send('Performance.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: W < 600, screenWidth: W, screenHeight: H });
await send('Page.navigate', { url: URL_ });
await sleep(2500);

// 主线程占用：3 秒内 TaskDuration 增量 / 3
const m0 = await send('Performance.getMetrics');
await sleep(3000);
const m1 = await send('Performance.getMetrics');
const pick = (m, k) => (m.metrics.find(x => x.name === k) || { value: 0 }).value;
const busy = pick(m1, 'TaskDuration') - pick(m0, 'TaskDuration');
console.log('main-thread busy over 3s: ' + (busy / 3 * 100).toFixed(1) + '%');

const probe = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    // 量 2 秒内 rAF 触发次数（页面内部已做 30fps 节流，绘制帧应≈60 的一半）
    const t0 = performance.now();
    let frames = 0;
    await new Promise(res => {
      function tick() { frames++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(); }
      requestAnimationFrame(tick);
    });
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    let painted = 0, total = 0;
    const img = ctx.getImageData(0, 0, Math.min(300, canvas.width), Math.min(300, canvas.height)).data;
    for (let i = 3; i < img.length; i += 4) { total++; if (img[i] > 0) painted++; }

    const hero = document.querySelector('.hero');
    const cs = getComputedStyle(hero);
    return {
      fps: +(frames / 2).toFixed(1),
      innerWidth: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      canvasPaintedRatio: (painted / total * 100).toFixed(2) + '%',
      heroBackdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      worksCount: document.querySelectorAll('.work').length,
      counter: document.getElementById('count').textContent,
      htmlBytes: document.documentElement.outerHTML.length,
      noiseLayer: getComputedStyle(document.body, '::after').display,
      contentVis: getComputedStyle(document.querySelector('.sec')).contentVisibility
    };
  })()`,
});
console.log(JSON.stringify(probe.result.value, null, 2));
console.log('errors:', logs.length ? logs.join(' | ') : '(none)');

const layout = await send('Page.getLayoutMetrics');
const { width, height } = layout.cssContentSize;
const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
writeFileSync(OUT, Buffer.from(s.data, 'base64'));
console.log(`saved ${OUT} (${Math.round(width)}x${Math.round(height)})`);
ws.close(); process.exit(0);
