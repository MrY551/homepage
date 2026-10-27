import { writeFileSync } from 'node:fs';
const PORT = process.env.CDP_PORT || '9396';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id=0; const pending=new Map();
ws.addEventListener('message', ev=>{const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}});
const send=(method,params={})=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,{resolve:res,reject:rej});ws.send(JSON.stringify({id:mid,method,params}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await new Promise(r=>ws.addEventListener('open',r));
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:2,mobile:false});
await send('Page.navigate',{url:'http://8.138.227.156/'});
await sleep(2500);
await send('Runtime.evaluate',{expression:`document.getElementById('talkBtn').click()`});
await sleep(350);
const r = await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
  const menu=document.getElementById('talkMenu');
  return {
    items:[...menu.querySelectorAll('.talk-item')].map(a=>({
      tag:a.tagName.toLowerCase(),
      text:(a.textContent||'').replace(/\s+/g,' ').trim(),
      href:a.getAttribute('href'),
      copy:a.getAttribute('data-copy')
    })),
    contactCopy:[...document.querySelectorAll('.contact[data-copy]')].map(b=>b.getAttribute('data-copy'))
  };})()`});
console.log(JSON.stringify(r.result.value,null,2));
// 点“复制 QQ 号”
await send('Runtime.evaluate',{expression:`document.querySelector('.talk-menu [data-copy="1924053793"]').click()`});
await sleep(500);
const t1 = await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const t=document.querySelector('.talk-toast');return {text:t.textContent,show:t.getAttribute('data-show'),menuOpen:document.getElementById('talkMenu').getAttribute('data-open')};})()`});
console.log('复制 QQ 反馈:', JSON.stringify(t1.result.value));
// 点联系区的 QQ 卡
await send('Runtime.evaluate',{expression:`document.querySelector('.contact[data-copy="1924053793"]').click()`});
await sleep(500);
const t2 = await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const t=document.querySelector('.talk-toast');return {text:t.textContent,show:t.getAttribute('data-show')};})()`});
console.log('联系卡复制反馈:', JSON.stringify(t2.result.value));
const s = await send('Page.captureScreenshot',{format:'png'});
writeFileSync(process.env.OUT_DIR + '/shot-qq-1280.png', Buffer.from(s.data,'base64'));
console.log('saved shot-qq-1280.png');
ws.close(); process.exit(0);