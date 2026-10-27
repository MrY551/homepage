const list = await (await fetch('http://127.0.0.1:9390/json/list')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id=0; const pending=new Map(); const net=[];
ws.addEventListener('message', ev=>{ const m=JSON.parse(ev.data);
  if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}
  else if(m.method==='Network.responseReceived'){const r=m.params.response;net.push(r.status+' '+r.url);}
});
const send=(method,params={})=>new Promise((res,rej)=>{const mid=++id;pending.set(mid,{resolve:res,reject:rej});ws.send(JSON.stringify({id:mid,method,params}));});
await new Promise(r=>ws.addEventListener('open',r));
await send('Page.enable'); await send('Network.enable');
await send('Page.navigate',{url:'http://8.138.227.156/demo/login.php?cachebust='+Date.now()});
await new Promise(r=>setTimeout(r,3500));
console.log(net.filter(x=>/\.(css|js)/.test(x)).join('\n'));
const st = await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const c=document.querySelector('.login-container,main,.login,.wrap')||document.body;const s=getComputedStyle(c);return {bg:s.backgroundColor,font:getComputedStyle(document.body).fontFamily.slice(0,40),h:document.body.scrollHeight,w:document.documentElement.scrollWidth}})()`});
console.log(JSON.stringify(st.result.value));
ws.close(); process.exit(0);