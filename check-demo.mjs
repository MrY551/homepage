// 诊断演示站主界面：登录后看看表格有没有渲染、JS 有没有报错、接口返回什么
const PORT = process.env.CDP_PORT || '9343';
const BASE = 'http://8.138.227.156/demo/';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const logs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
  else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(m.params.type.toUpperCase() + ': ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
});
const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: mid, method, params })); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url: BASE + 'login.php' });
await sleep(2000);
const login = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `fetch('api/auth.php/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'demo',password:'demo1234'})}).then(r=>r.text())`,
});
console.log('login:', String(login.result.value).slice(0, 120));

await send('Page.navigate', { url: BASE + 'index.php' });
await sleep(4500);

const probe = await send('Runtime.evaluate', {
  awaitPromise: true, returnByValue: true,
  expression: `(async () => {
    const out = {};
    out.trs = document.querySelectorAll('tr').length;
    out.tables = document.querySelectorAll('table').length;
    out.text = document.body.innerText.replace(/\\s+/g,' ').slice(0, 500);
    try {
      const r = await fetch('api/files.php?page=1&limit=3', { headers: { 'X-CSRF-Token': (document.querySelector('meta[name=csrf-token]')||{}).content || '' } });
      out.apiStatus = r.status;
      out.apiBody = (await r.text()).slice(0, 220);
    } catch (e) { out.apiErr = String(e).slice(0, 200); }
    out.meta = !!document.querySelector('meta[name=csrf-token]');
    out.scripts = [...document.scripts].map(s => s.src || 'inline').slice(0, 6);
    return out;
  })()`,
});
console.log(JSON.stringify(probe.result.value, null, 2));
console.log('--- console/exceptions ---');
console.log(logs.slice(0, 12).join('\n') || '(无)');
ws.close(); process.exit(0);
