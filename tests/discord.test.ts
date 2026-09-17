import { EventEmitter } from 'node:events';
import { DiscordGateway } from '../services/discord/src/gateway';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { DiscordClient, DiscordFailure, milestoneMessage, snowflake } from '../packages/server/src/discord/provider';
import { verifyInteraction } from '../packages/server/src/discord/interactions';
import { pnlRows, moneyUnits, moneyLabel } from '../packages/server/src/discord/stats';
import { DiscordWorker } from '../packages/server/src/discord/worker';
import { environmentFor } from '../scripts/environment.mjs';

test('Discord secrets are projected only to their server owners',()=>{
 const settings={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_for_tests',WEB_ORIGIN:'http://localhost:3200',ADMIN_ORIGIN:'http://localhost:3201',API_ORIGIN:'http://localhost:3200',DISCORD_BOT_TOKEN:'bot-secret',DISCORD_CLIENT_SECRET:'oauth-secret',DISCORD_PUBLIC_KEY:'verification-key'};
 for(const app of ['web','admin','mobile','tradara','contracts','discord']){
  const env=environmentFor(app,settings,{});assert.equal(env.DISCORD_BOT_TOKEN, ['web','discord'].includes(app)?'bot-secret':undefined);assert.equal(env.DISCORD_CLIENT_SECRET,app==='web'?'oauth-secret':undefined);assert.equal(env.DISCORD_PUBLIC_KEY,app==='web'?'verification-key':undefined);
 }
});
test('Discord IDs stay strings and reject paths, unsafe numbers and role mentions',()=>{
 assert.equal(snowflake('123456789012345678'),'123456789012345678');
 for(const value of [123456789012345678,'../users','<@123456789012345678>','abc',null])assert.throws(()=>snowflake(value));
});
test('anonymous milestone posts contain neither identity nor money; naming and amounts need consent',()=>{
 const payload={event:'payout_paid',amount_cents:'100000'};
 assert.ok(!JSON.stringify(milestoneMessage(payload,null)).includes('1000'));
 const link={state:'linked',milestones:true,discord_id:'123456789012345678',show_amount:false};
 const named=JSON.stringify(milestoneMessage(payload,link));assert.ok(named.includes(link.discord_id));assert.ok(!named.includes('1000.00'));
 assert.ok(JSON.stringify(milestoneMessage(payload,{...link,show_amount:true})).includes('1000.00'));
 assert.ok(!JSON.stringify(milestoneMessage(payload,{...link,state:'disconnecting'})).includes(link.discord_id));
});
test('message delivery uses a stable nonce, disables mentions and refuses redirects',async()=>{
 const sent:any[]=[];const client=new DiscordClient('fixture',async()=>{},async()=>{},async(url,init)=>{assert.equal(url,'https://discord.com/api/v10/channels/123456789012345678/messages');assert.equal(init?.redirect,'error');sent.push(JSON.parse(String(init?.body)));return Response.json({id:'234567890123456789'});});
 await client.message('123456789012345678','same-job',{content:'@everyone'});await client.message('123456789012345678','same-job',{content:'@everyone'});
 assert.equal(sent[0].nonce,sent[1].nonce);assert.equal(sent[0].enforce_nonce,true);assert.deepEqual(sent[0].allowed_mentions,{parse:[]});
});
test('Discord rate limits pause the shared budget without immediate retry',async()=>{
 let calls=0;let paused=0;const client=new DiscordClient('fixture',async()=>{},async(_r,s)=>{paused=s;},async()=>{calls++;return Response.json({retry_after:12.5},{status:429});});
 await assert.rejects(client.call('/users/@me'),e=>e instanceof DiscordFailure&&e.retryAfter===13);assert.equal(calls,1);assert.equal(paused,13);
});
test('only an unknown-member error confirms absence; network write failures are ambiguous',async()=>{
 for(const code of [10007,10004]){const client=new DiscordClient('fixture',async()=>{},async()=>{},async()=>Response.json({code},{status:404}));if(code===10007)assert.equal(await client.member('123456789012345678','234567890123456789'),null);else await assert.rejects(client.member('123456789012345678','234567890123456789'));}
 const client=new DiscordClient('fixture',async()=>{},async()=>{},async()=>{throw new Error('secret must not leak');});await assert.rejects(client.call('/channels/123456789012345678/messages','POST',{}),e=>e instanceof DiscordFailure&&e.ambiguous&&!e.message.includes('secret'));
});
test('Discord interaction signatures bind exact bytes and expire',()=>{
 const pair=generateKeyPairSync('ed25519');const key=pair.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');const now=Date.now(),ts=String(Math.floor(now/1000));const bytes=Buffer.from('{"type":1}');const signature=sign(null,Buffer.concat([Buffer.from(ts),bytes]),pair.privateKey).toString('hex');const headers=new Headers({'x-signature-ed25519':signature,'x-signature-timestamp':ts});
 verifyInteraction(bytes,headers,key,now);assert.throws(()=>verifyInteraction(Buffer.from('{"type":2}'),headers,key,now));assert.throws(()=>verifyInteraction(bytes,headers,key,now+301000));
});
test('conflicting daily PnL evidence cannot produce a verified card',()=>{
 assert.equal(pnlRows({items:[{session_date:'2026-09-14',net_pnl:'12.50'}]}).get('2026-09-14'),'12.50');
 assert.throws(()=>pnlRows({items:[{session_date:'2026-09-14',net_pnl:'12.50'},{session_date:'2026-09-14',net_pnl:'99.00'}]}));
});
test('role reconciliation changes only managed roles and cleanup persists until completion',async()=>{
 const changes:any[]=[];const finishes:any[]=[];
 const link={user_id:'user',generation:'generation',state:'linked',discord_id:'123456789012345678'};
 const worker=Object.create(DiscordWorker.prototype);
 worker.config={guild:'234567890123456789'};
 worker.store={one:async()=>link,rpc:async(name:string,args:any)=>{if(name==='roles_wanted')return ['345678901234567890'];finishes.push([name,args]);},db:{from:()=>({select:async()=>({data:[{role_id:'345678901234567890'},{role_id:'456789012345678901'}]}),update:()=>({eq:()=>({eq:async()=>({error:null})})})})}};
 worker.client={member:async()=>({roles:['456789012345678901','567890123456789012']}),call:async(path:string,method:string)=>{changes.push([path,method]);}};
 await worker.run({id:'job',user_id:'user',generation:'generation',kind:'roles',payload:{}});
 assert.equal(changes.length,2);assert.ok(changes.every(([path])=>!path.includes('567890123456789012')));assert.equal(finishes.at(-1)[1].p_state,'sent');
 changes.length=0;link.state='disconnecting';await worker.run({id:'cleanup',user_id:'user',generation:'generation',kind:'cleanup',payload:{discord_id:link.discord_id}});assert.equal(changes.length,1);assert.equal(changes[0][1],'DELETE');
});

test('Discord PnL formatting rounds decimal amounts without floating-point loss',()=>{assert.equal(moneyLabel(moneyUnits('123456789012.345')),'$123,456,789,012.35');assert.equal(moneyLabel(moneyUnits('-0.005')),'-$0.01');});

test('one Gateway projects configured founder presence, ignores others and resumes its sequence',async()=>{
 const prior=process.env.DISCORD_FOUNDER_IDS;const channel=process.env.DISCORD_VOICE_CHANNEL_ID;
 process.env.DISCORD_FOUNDER_IDS='123456789012345678';process.env.DISCORD_VOICE_CHANNEL_ID='345678901234567890';
 const updates:any[]=[];const sockets:any[]=[];
 class Socket extends EventEmitter {readyState=1;sent:any[]=[];send(value:string){this.sent.push(JSON.parse(value));}terminate(){this.readyState=3;}close(){this.emit('close',1000);}}
 const worker={owner:'owner',config:{token:'fixture',guild:'234567890123456789'},store:{rpc:async(_n:string,args:any)=>{updates.push(args.p_data);}}};
 const gateway=new DiscordGateway(worker as any,()=>{},()=>{const socket=new Socket();sockets.push(socket);return socket as any;});
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  gateway.start();gateway.start();assert.equal(sockets.length,1);const socket=sockets[0];
  const packet=(value:any)=>socket.emit('message',Buffer.from(JSON.stringify(value)));
  packet({op:10,d:{heartbeat_interval:60000}});await flush();assert.equal(socket.sent[0].op,2);
  packet({op:0,s:1,t:'READY',d:{session_id:'session',resume_gateway_url:'wss://gateway-us-east1-b.discord.gg'}});
  packet({op:0,s:2,t:'GUILD_CREATE',d:{id:worker.config.guild,voice_states:[{user_id:'123456789012345678',channel_id:'345678901234567890'},{user_id:'999999999999999999',channel_id:'345678901234567890'}]}});
  await flush();assert.deepEqual(updates.at(-1),{available:true,live:true});
  packet({op:0,s:3,t:'VOICE_STATE_UPDATE',d:{guild_id:worker.config.guild,user_id:'123456789012345678',channel_id:null}});await flush();assert.deepEqual(updates.at(-1),{available:true,live:false});
  gateway.stop();await flush();assert.equal(updates.at(-1).available,false);
  gateway.start();sockets[1].emit('message',Buffer.from(JSON.stringify({op:10,d:{heartbeat_interval:60000}})));await flush();assert.equal(sockets[1].sent[0].op,6);assert.equal(sockets[1].sent[0].d.seq,3);
 }finally{gateway.stop();if(prior===undefined)delete process.env.DISCORD_FOUNDER_IDS;else process.env.DISCORD_FOUNDER_IDS=prior;if(channel===undefined)delete process.env.DISCORD_VOICE_CHANNEL_ID;else process.env.DISCORD_VOICE_CHANNEL_ID=channel;}
});
test('ambiguous Discord messages stay unknown while repeatable roles can retry',async()=>{
 const before=process.env.DISCORD_DELIVERY_ENABLED;process.env.DISCORD_DELIVERY_ENABLED='true';
 try{for(const kind of ['milestone','roles']){
  const outcomes:any[]=[];const worker=Object.create(DiscordWorker.prototype);worker.nextSchedule=Infinity;worker.client={writeAccepted:false};worker.owner='fixture';
  worker.store={rpc:async(name:string,args:any)=>{if(name==='claim')return{id:'job',kind,attempts:1};if(name==='finish')outcomes.push(args);}};
  worker.run=async()=>{throw new DiscordFailure('discord_network',true);};
  await worker.tick();assert.equal(outcomes[0].p_state,kind==='milestone'?'unknown':'queued');
 }}finally{if(before===undefined)delete process.env.DISCORD_DELIVERY_ENABLED;else process.env.DISCORD_DELIVERY_ENABLED=before;}
});
