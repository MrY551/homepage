// 用 CDP 打开参考页，把结果区的 DOM 结构与关键样式抽出来（不截图，只要数据）
const PORT = process.env.CDP_PORT || '9350';
const REF = process.env.REF_URL || 'https://www.aigei.com/s?type=webpage&q=%E8%BD%AF%E4%BB%B6';

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
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: REF });
await sleep(7000);

const probe = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(() => {
    const box = document.querySelector('#resContainer') || document.body;
    const out = { url: location.href, title: document.title };
    // 结果区里出现次数最多的类名 = 卡片候选
    const cnt = {};
    box.querySelectorAll('*').forEach(el => {
      const c = el.getAttribute('class');
      if (c) c.split(/\\s+/).forEach(x => { if (x) cnt[x] = (cnt[x] || 0) + 1; });
    });
    out.topClasses = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 28);
    // 找重复出现的“卡片”元素（同类名 >= 4 次且有文字）
    let cardSel = null, best = 0;
    Object.entries(cnt).forEach(([k, v]) => {
      if (v >= 4 && v > best) {
        const el = box.querySelector('.' + CSS.escape(k));
        if (el && el.innerText && el.innerText.trim().length > 8) { best = v; cardSel = k; }
      }
    });
    out.cardClass = cardSel;
    if (cardSel) {
      const el = box.querySelector('.' + CSS.escape(cardSel));
      out.cardHTML = el.outerHTML.replace(/\\s+/g, ' ').slice(0, 900);
      const cs = getComputedStyle(el);
      out.cardStyle = { display: cs.display, width: cs.width, height: cs.height, radius: cs.borderRadius, bg: cs.backgroundColor, border: cs.border, padding: cs.padding };
      const wrap = el.parentElement;
      const ws2 = getComputedStyle(wrap);
      out.wrapStyle = { display: ws2.display, cols: ws2.gridTemplateColumns, gap: ws2.gap, width: ws2.width };
      out.cardCount = box.querySelectorAll('.' + CSS.escape(cardSel)).length;
      // 缩略图比例
      const img = el.querySelector('img');
      if (img) { const r = img.getBoundingClientRect(); out.imgRatio = (r.width / r.height).toFixed(2) + ' (' + Math.round(r.width) + 'x' + Math.round(r.height) + ')'; }
    }
    // 顶部筛选条
    const bar = document.querySelector('.resc-nav, .tab-mount-nav-container, .filter');
    if (bar) {
      const bs = getComputedStyle(bar);
      out.filterBar = { text: bar.innerText.replace(/\\s+/g, ' ').slice(0, 220), bg: bs.backgroundColor, border: bs.borderBottom, height: bar.getBoundingClientRect().height };
    }
    out.bodyBg = getComputedStyle(document.body).backgroundColor;
    return out;
  })()`,
});
console.log(JSON.stringify(probe.result.value, null, 2));
ws.close(); process.exit(0);
