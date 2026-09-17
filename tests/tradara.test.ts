import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { lifecycle, parseEvent, project, verifyWebhook } from '../packages/server/src/tradara/events';
import { validateAction, vendorCashAmount, readBody, TradingError } from '../packages/server/src/tradara/contracts';
import { TradaraClient, VendorFailure, vendorConfig } from '../packages/server/src/tradara/client';
import { environmentFor } from '../scripts/environment.mjs';
const base={event_id:'evt_123',type:'accounts.passed',firm_id:'firm',account_id:'account',user_id:'user',created_at:Date.now(),data:{status:'PASSED'}};
test('vendor passes, breach reasons and lineage drive the single event projection',()=>{
 assert.equal(lifecycle(parseEvent(base,'webhook','firm')),'passed');
 assert.equal(lifecycle(parseEvent({...base,type:'risk.breach',data:{hard_breach:true}},'webhook','firm')),'failed');
 assert.equal(lifecycle(parseEvent({...base,type:'risk.breach',data:{hard_breach:false}},'webhook','firm')),null);
 assert.equal(lifecycle(parseEvent({...base,type:'accounts.phase_advanced',data:{successor_account_id:'next'}},'webhook','firm')),'upgraded');
 assert.equal(project(parseEvent({...base,type:'new.event'},'webhook','firm')).ignored,true);
 assert.equal(project(parseEvent({...base,type:'devices.flagged'},'webhook','firm')).ignored,true);
});
test('event parser rejects wrong firm and unsafe replay cursors and removes secret fields',()=>{
 assert.throws(()=>parseEvent(base,'webhook','other'));
 assert.throws(()=>parseEvent({...base,seq:Number.MAX_SAFE_INTEGER+1},'ws:balances','firm'));
 assert.throws(()=>parseEvent(base,'ws:balances','firm'));
 const event=parseEvent({...base,type:'account.updated',data:{account:{id:'account',max_drawdown_limit:'0'},invitation_token_hash:'SECRET'}},'webhook','firm');
 assert.equal(event.type,'accounts.updated');assert.equal(event.data.max_drawdown_limit,'0');assert.ok(!JSON.stringify(event).includes('SECRET'));
});
test('webhook verification uses exact raw bytes, rejects expired and forged signatures',()=>{
 const body=Buffer.from(JSON.stringify(base));const now=Date.now();const t=Math.floor(now/1000);
 const sign=(bytes:Uint8Array)=>`t=${t},v1=${createHmac('sha256','secret').update(`${t}.`).update(bytes).digest('hex')}`;
 verifyWebhook(body,sign(body),'secret',now);
 assert.throws(()=>verifyWebhook(Buffer.concat([body,Buffer.from('\n')]),sign(body),'secret',now));
 assert.throws(()=>verifyWebhook(body,sign(body),'secret',now+301000));
 assert.throws(()=>verifyWebhook(body,`t=${t},v1=bad`,'secret',now));
});
test('actions validate money, reject injected fields and never expose local pass operations',()=>{
 assert.throws(()=>validateAction('cash-adjustment',{reason:'test',direction:'deposit',amount:100}));
 assert.throws(()=>validateAction('cash-adjustment',{reason:'test',direction:'deposit',amount:'-1'}));
 assert.throws(()=>validateAction('lock',{reason:'test',expires_at:'2000-01-01'}));
 assert.throws(()=>validateAction('invite',{user_id:'victim'}));
 assert.deepEqual(validateAction('max-loss-limit',{reason:'payout cap',max_drawdown_limit:'0'}),{reason:'payout cap',max_drawdown_limit:'0'});
});
test('vendor adapter performs one write attempt and treats ambiguous failures honestly',async()=>{
 let calls=0;
 const client=new TradaraClient({origin:'https://api.sandbox.tradara.com',key:'secret',firmId:'firm'},async()=>{},async(_url,init)=>{
  calls++;assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');throw new Error('private token response');
 });
 await assert.rejects(client.request('POST','/v1/firm-control/accounts',{}),(error:unknown)=>error instanceof VendorFailure&&error.ambiguous&&!error.message.includes('private'));
 assert.equal(calls,1);
 await assert.rejects(client.request('GET','https://attacker.example'));
});
test('vendor list cannot turn a malformed response into an empty account book',async()=>{
 const client=new TradaraClient({origin:'https://api.tradara.com',key:'secret',firmId:'firm'},async()=>{},async()=>Response.json({wrong:[]}));
 await assert.rejects(client.page('/v1/orders'));
 assert.throws(()=>vendorConfig({TRADARA_API_BASE_URL:'https://attacker.example',TRADARA_FIRM_API_KEY:'secret',TRADARA_FIRM_ID:'firm'}));
});
test('body readers stop oversized streamed requests even without Content-Length',async()=>{
 const request=new Request('https://example.test',{method:'POST',body:'0123456789'});
 await assert.rejects(readBody(request,5),(error:unknown)=>error instanceof TradingError&&error.status===413);
});
test('only the worker receives firm write credentials; clients receive no backend secrets',()=>{
 const settings={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_for_tests',WEB_ORIGIN:'http://localhost:3200',ADMIN_ORIGIN:'http://localhost:3201',API_ORIGIN:'http://localhost:3200',TRADARA_FIRM_API_KEY:'firm-canary',SUPABASE_SECRET_KEY:'db-canary',TRADARA_WEBHOOK_SECRET:'hook-canary'};
 for(const app of ['web','admin','mobile','tradara']){
  const env=environmentFor(app,settings,{});
  assert.equal(JSON.stringify(env).includes('firm-canary'),app==='tradara');
  assert.equal(JSON.stringify(env).includes('hook-canary'),app==='web');
  assert.equal(JSON.stringify(env).includes('db-canary'),['web','admin','tradara'].includes(app));
 }
});

test('cash serialization rejects precision loss instead of silently changing money',()=>{
 assert.equal(vendorCashAmount('125.50'),125.5);
 assert.throws(()=>vendorCashAmount('999999999999999.99'));
});
