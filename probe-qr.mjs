import { writeFileSync } from 'node:fs';
const PORT='9399';
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page=list.find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);
let id=0;const pending=new Map();
ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}});
const send=(method,params={})=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,{resolve:res,reject:rej});ws.send(JSON.stringify({id:mid,method,params}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await new Promise(r=>ws.addEventListener('open',r));
await send('Page.enable');await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1400,deviceScaleFactor:2,mobile:false});
await send('Page.navigate',{url:'http://8.138.227.156/'});
await sleep(3000);
await send('Runtime.evaluate',{expression:`document.getElementById('contact').scrollIntoView({block:'center'})`});
await sleep(800);
const info=await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
  const im=document.querySelector('.contact .qr');
  return {qrLoaded: im ? im.complete && im.naturalWidth>0 : false, w: im?im.naturalWidth:0, h: im?im.naturalHeight:0,
          contacts:[...document.querySelectorAll('.contacts .contact')].map(c=>(c.textContent||'').replace(/\s+/g,' ').trim())};})()`});
console.log(JSON.stringify(info.result.value,null,2));
const s=await send('Page.captureScreenshot',{format:'png'});
writeFileSync(process.env.OUT_DIR+'/shot-qr-1280.png',Buffer.from(s.data,'base64'));
console.log('saved shot-qr-1280.png');
ws.close();process.exit(0);