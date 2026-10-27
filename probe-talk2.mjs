import { writeFileSync } from 'node:fs';
const PORT = process.env.CDP_PORT;
const W = Number(process.env.VW), H = Number(process.env.VH);
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t=>t.type==='page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id=0; const pending=new Map();
ws.addEventListener('message', ev=>{const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}});
const send=(method,params={})=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,{resolve:res,reject:rej});ws.send(JSON.stringify({id:mid,method,params}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await new Promise(r=>ws.addEventListener('open',r));
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:2,mobile:W<600,screenWidth:W,screenHeight:H});
await send('Page.navigate',{url:'http://8.138.227.156/'});
await sleep(2600);
await send('Runtime.evaluate',{expression:`document.getElementById('talkBtn').click()`});
await sleep(400);
const r = await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
  const m=document.getElementById('talkMenu');
  const visible=[...m.querySelectorAll('.talk-item')].filter(el=>getComputedStyle(el).display!=='none');
  return {
    viewport: innerWidth,
    total: m.querySelectorAll('.talk-item').length,
    visible: visible.map(el=>({text:(el.textContent||'').replace(/\s+/g,' ').trim(),copy:el.getAttribute('data-copy')})),
    sepVisible: [...m.querySelectorAll('.talk-sep')].some(el=>getComputedStyle(el).display!=='none'),
    qrCard: !!document.querySelector('.qr-card'),
    contacts: [...document.querySelectorAll('.contacts .contact')].map(c=>(c.textContent||'').replace(/\s+/g,' ').trim())
  };})()`});
console.log(JSON.stringify(r.result.value,null,2));
const s = await send('Page.captureScreenshot',{format:'png'});
writeFileSync(process.env.OUT_DIR + `/shot-talk-${W}-final.png`, Buffer.from(s.data,'base64'));
ws.close(); process.exit(0);