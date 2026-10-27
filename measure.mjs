// 用 CDP 真机视口验证移动端布局：设置 device metrics 后测量 scrollWidth/innerWidth 并截图
import { writeFileSync } from 'node:fs';

const PORT = process.env.CDP_PORT || '9333';
const URL_ = process.env.TARGET_URL || 'http://8.138.227.156/';
const OUT = process.env.OUT_PNG || 'shot-cdp-mobile.png';
const W = Number(process.env.VW || 390);
const H = Number(process.env.VH || 844);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
if (!page) { console.error('no page target'); process.exit(1); }
console.log('target:', page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = new Map();

ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  } else if (msg.method) {
    const arr = events.get(msg.method) || [];
    arr.push(msg.params);
    events.set(msg.method, arr);
  }
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 2, mobile: true,
  screenWidth: W, screenHeight: H,
});
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

// 可选：模拟深色模式（COLOR_SCHEME=dark）或浅色（light）
const scheme = process.env.COLOR_SCHEME;
if (scheme === 'dark' || scheme === 'light') {
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: scheme }],
  });
}

await send('Page.navigate', { url: URL_ });
await sleep(2500);

const measure = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const d = document.documentElement, b = document.body;
    const de = document.querySelectorAll('*');
    let widest = null, maxRight = 0;
    for (const el of de) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > maxRight) { maxRight = r.right; widest = el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''); }
    }
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: d.scrollWidth,
      bodyScrollWidth: b.scrollWidth,
      overflowX: d.scrollWidth > window.innerWidth,
      maxRight: Math.round(maxRight),
      widestEl: widest,
      navVisible: getComputedStyle(document.querySelector('nav ul')).display,
      gridCols: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns,
      title: document.title,
    };
  })()`,
});
console.log('metrics:', JSON.stringify(measure.result.value, null, 2));

// 整页截图
const layout = await send('Page.getLayoutMetrics');
const { width, height } = layout.cssContentSize;
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
  clip: { x: 0, y: 0, width, height, scale: 1 },
});
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log(`saved ${OUT} (${width}x${Math.round(height)})`);
ws.close();
process.exit(0);
