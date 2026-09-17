import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { TradingWorker } from '@certa/server/tradara-worker';
const worker=new TradingWorker();
const sockets=new Map<string,WebSocket>();
const clients=new Map<WebSocket,{user:string;staff:boolean;expires:number}>();
let stopping=false;let active=false;let cursor='0';let operating=false;let pumping=false;let leaseBusy=false;let repairing=false;let nextRepair=0;
const reconnects=new Map<string,ReturnType<typeof setTimeout>>();
const connecting=new Set<string>();
const blocked=new Set<string>();
const retry=new Map<string,number>();
const http=createServer((req,res)=>{
 if(req.url!=='/health'){res.writeHead(404);res.end();return;}
 res.writeHead(active?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify({active,streams:sockets.size}));
});
const wss=new WebSocketServer({noServer:true,maxPayload:16384});
http.on('upgrade',(req,socket,head)=>{
 const origin=req.headers.origin;
 if(req.url!=='/v1/live'||(origin&&!(process.env.CERTA_ALLOWED_ORIGINS??'').split(',').includes(origin))||!active){socket.destroy();return;}
 wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',ws=>{
 let authenticating=false;
 const timer=setTimeout(()=>{if(!clients.has(ws))ws.close(4401,'Authenticate first');},5000);
 ws.on('message',async bytes=>{
  if(clients.has(ws)||authenticating){ws.close(4400,'Unexpected message');return;}
  authenticating=true;
  try{
   const message=JSON.parse(bytes.toString());if(message.type!=='authenticate')throw new Error();
   const ticket=await worker.ticket(message.ticket);if(!ticket)throw new Error();
   if(clients.size===0)cursor=await worker.changeCursor();
   clients.set(ws,{user:ticket.user_id,staff:ticket.staff,expires:Date.now()+5*60000});
   clearTimeout(timer);ws.send(JSON.stringify({type:'ready',expires_in:300}));
  }catch{ws.close(4401,'Invalid ticket');}
 });
 ws.on('close',()=>{clearTimeout(timer);clients.delete(ws);});
 ws.on('error',()=>ws.terminate());
});
function schedule(channel:string){
 if(stopping||!active||reconnects.has(channel))return;
 const attempt=Math.min(6,(retry.get(channel)??0)+1);retry.set(channel,attempt);
 const timer=setTimeout(()=>{reconnects.delete(channel);void connect(channel);},Math.min(30000,1000*2**attempt)+Math.random()*2000);
 reconnects.set(channel,timer);
}
async function connect(channel:string){
 if(stopping||!active||sockets.has(channel)||connecting.has(channel)||blocked.has(channel))return;
 connecting.add(channel);
 try{
  await worker.store.budget('connect');const saved=await worker.cursor(channel);
  // Old cursors are not claimed fresh: mark hydration needed and let explicit repair operate.
  const expired=!saved||Date.now()-Date.parse(String(saved.updated_at))>23*3600000;
  const url=new URL('/v1/firm-ws',worker.config.origin.replace('https:','wss:'));
  if(saved?.cursor&&!expired)url.searchParams.set('last_seq',String(saved.cursor));
  await worker.status(channel,{status:expired?'repair_required':'connecting'});
  const socket=new WebSocket(url,{headers:{'X-Tradara-Api-Key':worker.config.key},maxPayload:256*1024,handshakeTimeout:8000});
  sockets.set(channel,socket);
  let poisoned=false;let confirmed=false;let lastPong=Date.now();let pendingBytes=0;let flushing=false;
  const pending: {raw:unknown;bytes:number}[]=[];
  const fail=()=>{poisoned=true;socket.terminate();void worker.status(channel,{status:'repair_required'}).catch(()=>{});};
  const flush=async()=>{
   if(flushing||poisoned||!active||pending.length===0)return;
   flushing=true;const batch=pending.splice(0,250);
   try{await worker.ingestBatch(batch.map(value=>value.raw),channel);pendingBytes-=batch.reduce((sum,value)=>sum+value.bytes,0);}
   catch{fail();}finally{flushing=false;}
  };
  const batchTimer=setInterval(()=>{void flush();},250);
  const heartbeat=setInterval(()=>{if(Date.now()-lastPong>70000)socket.terminate();else if(socket.readyState===WebSocket.OPEN)socket.ping();},30000);
  socket.on('pong',()=>{lastPong=Date.now();});
  socket.on('message',bytes=>{
   if(poisoned||!active)return;
   try{
    const text=bytes.toString();const raw=JSON.parse(text);
    if(raw.type==='connected'){
     if(raw.firm_id!==worker.config.firmId)throw new Error('wrong firm');
     socket.send(JSON.stringify({type:'scope.set',scope:'firm',entity:channel}));return;
    }
    if(raw.type==='scope.confirmed'){
     if(raw.scope!=='firm'||raw.entity!==channel)throw new Error('wrong scope');
     confirmed=true;retry.set(channel,0);void worker.status(channel,{status:expired?'repair_required':'connected'}).catch(()=>{});return;
    }
    if(raw.type==='pong')return;
    if(!confirmed||raw.schema!=='ws.firm.v1'||typeof raw.type!=='string'||!raw.type.startsWith(`${channel}.`))throw new Error('invalid event');
    pendingBytes+=Buffer.byteLength(text);
    if(pending.length>=1000||pendingBytes>8*1024*1024)throw new Error('local backlog');
    pending.push({raw,bytes:Buffer.byteLength(text)});if(pending.length>=250)void flush();
   }catch{fail();}
  });
  socket.on('close',code=>{
   clearInterval(heartbeat);clearInterval(batchTimer);sockets.delete(channel);
   if(code===4001){blocked.add(channel);void worker.status(channel,{status:'credentials_rejected'}).catch(()=>{});return;}
   schedule(channel);
  });
  socket.on('error',()=>socket.terminate());
 }catch{schedule(channel);}finally{connecting.delete(channel);}
}
const timers=[
 setInterval(()=>{if(leaseBusy)return;leaseBusy=true;void worker.lease().then(owned=>{
  active=!!owned;if(!active){for(const socket of sockets.values())socket.terminate();for(const client of clients.keys())client.close(1012,'Service unavailable');}
  else for(const channel of ['balances','stats','trades'])if(!sockets.has(channel)&&!reconnects.has(channel))void connect(channel);
 }).catch(()=>{active=false;for(const socket of sockets.values())socket.terminate();}).finally(()=>{leaseBusy=false;});},5000),
 setInterval(()=>{if(!active||operating)return;operating=true;void worker.tick().catch(()=>console.error('Tradara operation processing unavailable')).finally(()=>{operating=false;});},1000),
 setInterval(()=>{if(!active||pumping||clients.size===0)return;pumping=true;void worker.changes(cursor).then(changes=>{
  const combined=new Map<string,typeof changes[number]>();
  for(const change of changes){cursor=String(change.id);const key=`${change.user_id}:${change.account_id}:${change.kind}`;const previous=combined.get(key);combined.set(key,{...change,data:{...previous?.data,...change.data,patch:{...previous?.data?.patch,...change.data?.patch}}});}
  for(const change of combined.values()){for(const [socket,client]of clients){
   if(client.expires<Date.now()){socket.close(4401,'Renew authorization');continue;}
   if(client.staff||client.user===change.user_id){
    if(socket.bufferedAmount>128*1024){socket.close(4002,'Resync required');continue;}
    socket.send(JSON.stringify({type:'patch',account_id:change.account_id,kind:change.kind,version:String(change.id),data:change.data}));
    if(client.user===change.user_id&&change.kind==='access'&&['SUSPENDED','REVOKED'].includes(change.data?.status))socket.close(4403,'Access changed');
   }
  }}
 }).catch(()=>{}).finally(()=>{pumping=false;});},1000),
 setInterval(()=>{if(active)void worker.probe().catch(()=>{});},5*60000),
 setInterval(()=>{if(active)void worker.replayUnmapped().catch(()=>{});},60000),
 setInterval(()=>{if(!active||repairing||Date.now()<nextRepair)return;repairing=true;void worker.repair().then(pending=>{nextRepair=Date.now()+(pending?10000:600000);}).catch(()=>{nextRepair=Date.now()+60000;}).finally(()=>{repairing=false;});},10000),
 setInterval(()=>{if(active)void worker.cleanup().catch(()=>{});},3600000),
 setInterval(()=>{for(const [socket,client]of clients)if(client.expires<Date.now())socket.close(4401,'Renew authorization');},15000),
];
function shutdown(){stopping=true;active=false;for(const timer of timers)clearInterval(timer);for(const timer of reconnects.values())clearTimeout(timer);for(const socket of sockets.values())socket.terminate();for(const socket of clients.keys())socket.terminate();wss.close();http.close();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
http.listen(Number(process.env.TRADARA_SERVICE_PORT??3210),'127.0.0.1',()=>console.log('Certa Tradara worker listening'));
