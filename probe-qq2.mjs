import { writeFileSync } from 'node:fs';
const PORT='9397';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t=>t.type==='page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id=0; const pending=new Map();
ws.addEventListener('message', ev=>{const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}});
const send=(method,params={})=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,{resolve:res,reject:rej});ws.send(JSON.stringify({id:mid,method,params}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await new Promise(r=>ws.addEventListener('open',r));
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:2,mobile:false});
await send('Page.navigate',{url:'http://8.138.227.156/'});
await sleep(2600);
await send('Runtime.evaluate',{expression:`document.getElementById('talkBtn').click()`});
await sleep(400);
const r = await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
  const menu=document.getElementById('talkMenu');
  return [...menu.querySelectorAll('.talk-item')].map(a=>({
    text:(a.textContent||'').replace(/\s+/g,' ').trim(),
    href:a.getAttribute('href'), target:a.getAttribute('target'),
    copy:a.getAttribute('data-copy')
  }));})()`});
console.log(JSON.stringify(r.result.value,null,2));
const c = await send('Runtime.evaluate',{returnByValue:true,expression:`[...document.querySelectorAll('.contacts .contact')].map(a=>({t:(a.textContent||'').replace(/\s+/g,' ').trim(),href:a.getAttribute('href')}))`});
console.log('联系区:', JSON.stringify(c.result.value));
const s = await send('Page.captureScreenshot',{format:'png'});
writeFileSync(process.env.OUT_DIR + '/shot-qqpage-1280.png', Buffer.from(s.data,'base64'));
console.log('saved shot-qqpage-1280.png');
ws.close(); process.exit(0);