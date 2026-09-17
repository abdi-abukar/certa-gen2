import { createServer, type ServerResponse } from 'node:http';
import { DiscordWorker, publicCommunity } from '@certa/server/discord-worker';
import { DiscordGateway } from './gateway';
const worker=new DiscordWorker();let changed=true;let stopped=false;let leased=false;let snapshot='';
const listeners=new Set<ServerResponse>();
const gateway=new DiscordGateway(worker,()=>{changed=true;});
const server=createServer((request,response)=>{
 if(request.url==='/health'){response.writeHead(leased?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({service:'discord',lease:leased,delivery_enabled:process.env.DISCORD_DELIVERY_ENABLED==='true'}));return;}
 if(request.url!=='/events'||request.method!=='GET'){response.writeHead(404);response.end();return;}
 if(listeners.size>=2000){response.writeHead(503);response.end();return;}
 response.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});
 response.write(`retry: 15000\n\n${snapshot}`);listeners.add(response);request.on('close',()=>listeners.delete(response));
});
server.listen(Number(process.env.DISCORD_SERVICE_PORT??3211),'127.0.0.1');
let renewing=false;
const leaseTimer=setInterval(()=>{if(renewing||!leased)return;renewing=true;void worker.lease().then(ok=>{if(!ok){leased=false;gateway.stop();for(const client of listeners)client.end();listeners.clear();snapshot='';}}).catch(()=>{leased=false;gateway.stop();for(const client of listeners)client.end();listeners.clear();snapshot='';}).finally(()=>{renewing=false;});},10000);
const heartbeat=setInterval(()=>{for(const client of listeners)if(!client.write(': heartbeat\n\n')){client.destroy();listeners.delete(client);}},20000);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;});
let refresh=0;let idleMs=1000;
while(!stopped){
 try{
  if(!leased)leased=await worker.lease();
  if(leased){gateway.start();const worked=await worker.tick();idleMs=worked?250:Math.min(10000,idleMs*2);if(worker.published){changed=true;worker.published=false;}
   if(changed||Date.now()>refresh){await gateway.status();const state=await publicCommunity(worker.store);snapshot=`data: ${JSON.stringify(state)}\n\n`;for(const client of listeners)if(!client.write(snapshot)){client.destroy();listeners.delete(client);}changed=false;refresh=Date.now()+30000;}
  }else {gateway.stop();for(const client of listeners)client.end();listeners.clear();snapshot='';}
 }catch{console.error('discord_worker_tick_failed');gateway.stop();leased=false;for(const client of listeners)client.end();listeners.clear();snapshot='';}
 await new Promise(resolve=>setTimeout(resolve,changed?1000:idleMs));
}
gateway.stop();clearInterval(leaseTimer);clearInterval(heartbeat);for(const client of listeners)client.end();server.close();
