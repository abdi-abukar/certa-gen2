import WebSocket from 'ws';
import { type DiscordWorker } from '@certa/server/discord-worker';
// One leased Gateway owner, narrow intents, no message content collection.
export class DiscordGateway {
 private socket:WebSocket|null=null;private heartbeat:ReturnType<typeof setInterval>|null=null;
 private ack=true;private seq:number|null=null;private session:string|null=null;
 private resumeUrl='wss://gateway.discord.gg/';private stopped=true;private available=false;private voices=new Map<string,string>();private next=0;private failures=0;
 private founders=new Set((process.env.DISCORD_FOUNDER_IDS??'').split(',').filter(v=>/^\d{17,20}$/.test(v)));
 constructor(private worker:DiscordWorker,private changed:()=>void,private connectSocket:(url:string)=>WebSocket=url=>new WebSocket(url,{maxPayload:4*1024*1024,handshakeTimeout:10000})){}
 async status(){
  await this.worker.store.rpc('live',{p_owner:this.worker.owner,p_data:{available:this.available,live:this.available&&[...this.voices.values()].includes(process.env.DISCORD_VOICE_CHANNEL_ID??'')}});this.changed();
 }
 start(){this.stopped=false;if(this.socket||Date.now()<this.next)return;this.connect();}
 stop(){this.stopped=true;this.socket?.terminate();this.socket=null;if(this.heartbeat)clearInterval(this.heartbeat);this.heartbeat=null;this.available=false;void this.status().catch(()=>{});}
 private connect(){
  const ws=this.connectSocket(`${this.resumeUrl}?v=10&encoding=json`);this.socket=ws;
  const send=(op:number,d:unknown)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({op,d}));};
  let pending=Promise.resolve();let queued=0;
  ws.on('message',raw=>{
   if(++queued>500){ws.terminate();return;}
   pending=pending.then(async()=>{
    if(this.socket!==ws||this.stopped)return;
    const packet=JSON.parse(raw.toString());
    if(packet.op===10){
     const interval=Number(packet.d?.heartbeat_interval);if(!Number.isFinite(interval)||interval<1000||interval>120000)throw new Error('invalid_heartbeat');
     this.ack=true;this.heartbeat=setInterval(()=>{if(!this.ack){ws.terminate();return;}this.ack=false;send(1,this.seq);},interval);
     if(this.session&&this.seq!==null)send(6,{token:this.worker.config.token,session_id:this.session,seq:this.seq});
     else send(2,{token:this.worker.config.token,intents:129+(process.env.DISCORD_MEMBER_EVENTS==='true'?2:0),properties:{os:process.platform,browser:'certa',device:'certa'}});
    }else if(packet.op===11)this.ack=true;
    else if(packet.op===1)send(1,this.seq);
    else if(packet.op===7)ws.close();
    else if(packet.op===9){if(!packet.d){this.session=null;this.seq=null;this.voices.clear();}ws.close();}
    else if(packet.op===0){
     const d=packet.d;const type=packet.t;
     if(type==='READY'){const resume=new URL(d.resume_gateway_url);if(resume.protocol!=='wss:'||!resume.hostname.endsWith('.discord.gg')||resume.username||resume.password)throw new Error('invalid_resume_url');this.resumeUrl=`${resume.origin}/`;this.session=d.session_id;this.voices.clear();this.failures=0;}
     if(type==='RESUMED'){this.available=true;this.failures=0;await this.status();}
     if(type==='GUILD_CREATE'&&d.id===this.worker.config.guild){this.voices.clear();for(const v of d.voice_states??[])if(this.founders.has(v.user_id)&&v.channel_id)this.voices.set(v.user_id,v.channel_id);this.available=true;await this.status();}
     if(type==='GUILD_DELETE'&&d.id===this.worker.config.guild){this.available=false;this.voices.clear();await this.status();}
     if(type==='VOICE_STATE_UPDATE'&&d.guild_id===this.worker.config.guild&&this.founders.has(d.user_id)){
      if(d.channel_id)this.voices.set(d.user_id,d.channel_id);else this.voices.delete(d.user_id);await this.status();
     }
     if(['GUILD_MEMBER_ADD','GUILD_MEMBER_UPDATE','GUILD_MEMBER_REMOVE'].includes(type)&&d.guild_id===this.worker.config.guild){
      const link=await this.worker.store.one('links','discord_id',String(d.user.id));if(link?.state==='linked')await this.worker.store.rpc('queue_roles',{p_user:link.user_id});
     }
     if(Number.isSafeInteger(packet.s))this.seq=packet.s;
    }
   }).catch(()=>{this.session=null;this.seq=null;ws.terminate();}).finally(()=>{queued--;});
  });
  ws.on('error',()=>{});
  ws.on('close',code=>{
   if(this.socket&&this.socket!==ws)return;
   if(this.heartbeat)clearInterval(this.heartbeat);this.heartbeat=null;this.socket=null;this.available=false;
   if([4004,4013,4014].includes(code)){this.next=Infinity;console.error('discord_gateway_configuration_rejected');}
   else {this.next=Date.now()+Math.min(60000,5000*2**Math.min(this.failures++,4))+Math.random()*1000;if([4007,4009].includes(code)){this.session=null;this.seq=null;}}
   void this.status().catch(()=>{});
  });
 }
}
