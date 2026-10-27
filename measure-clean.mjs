// 干净的负载测量：新浏览器实例、等动画稳定 4s、再测 3s 主线程占用
const PORT = process.env.CDP_PORT || '9380';
const URL_ = process.env.TARGET_URL || 'http://8.138.227.156/';
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

await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
await send('Page.enable'); await send('Runtime.enable'); await send('Performance.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: Number(process.env.DPR || 1), mobile: W < 600, screenWidth: W, screenHeight: H });
await send('Page.navigate', { url: URL_ });
await sleep(4000);                                  // 让首屏渲染、粒子启动彻底稳定

const pick = (m, k) => (m.metrics.find(x => x.name === k) || { value: 0 }).value;
const a = await send('Performance.getMetrics');
await sleep(3000);
const b = await send('Performance.getMetrics');
const busy = pick(b, 'TaskDuration') - pick(a, 'TaskDuration');
const script = pick(b, 'ScriptDuration') - pick(a, 'ScriptDuration');
const layout = pick(b, 'LayoutDuration') - pick(a, 'LayoutDuration');

const info = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `({
     particlesHint: (document.getElementById('particles').width / (window.devicePixelRatio||1)).toFixed(0) + 'x' + (document.getElementById('particles').height / (window.devicePixelRatio||1)).toFixed(0),
     canvasCss: (() => { const c = document.getElementById('particles'); const s = getComputedStyle(c); return s.width + ' / DPR ' + window.devicePixelRatio; })(),
     heroBlur: (getComputedStyle(document.querySelector('.hero')).backdropFilter || 'none'),
     navbarBlur: (getComputedStyle(document.querySelector('.navbar')).backdropFilter || 'none'),
     overflowX: document.documentElement.scrollWidth > innerWidth,
     works: document.querySelectorAll('.work').length
  })`
});

console.log('viewport      :', W + 'x' + H);
console.log('main-thread   :', (busy / 3 * 100).toFixed(1) + '%  (script ' + (script / 3 * 100).toFixed(1) + '% / layout ' + (layout / 3 * 100).toFixed(1) + '%)');
console.log('detail        :', JSON.stringify(info.result.value));
ws.close(); process.exit(0);
