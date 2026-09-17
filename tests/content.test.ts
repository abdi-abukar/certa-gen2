import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { newsletter, newsletterFixture, puzzle, UNSUBSCRIBE_MARKER } from '../packages/server/src/content/schema';
import { answerHash } from '../packages/server/src/content/http';
import { generateDraft } from '../packages/server/src/content/anthropic';
import { normalizeImage } from '../packages/server/src/content/images';
import { verifyNewsletterWebhook } from '../packages/server/src/content/webhook';
import { ContentWorker } from '../packages/server/src/content/worker';
import { environmentFor } from '../scripts/environment.mjs';

test('newsletter rejects code, unsafe links, missing image descriptions and ticket fields',()=>{
 assert.deepEqual(newsletter(newsletterFixture),newsletterFixture);
 for(const value of [ {...newsletterFixture,ticket_id:'no'}, {...newsletterFixture,subject:'a\nb'}, {...newsletterFixture,title:UNSUBSCRIBE_MARKER}, {...newsletterFixture,sections:[{...newsletterFixture.sections[0],button_url:'javascript:alert(1)'}]}, {...newsletterFixture,sections:[{...newsletterFixture.sections[0],image_id:'aaaaaaaa-1234-4234-8234-111111111111'}]} ])assert.throws(()=>newsletter(value));
});
test('React preview escapes editorial text and emits HTML/text from the same template',()=>{
 // React email rendering uses the normal server renderer; worker tests use react-server for server-only guards.
 const code=`import {renderNewsletter} from './packages/server/src/content/render.tsx'; import {newsletterFixture} from './packages/server/src/content/schema.ts'; const content={...newsletterFixture,title:'<script>alert(1)</script>'}; console.log(JSON.stringify(renderNewsletter({content,images:{},unsubscribe:'https://example.com/unsubscribe?token=preview',postalAddress:'100 Example Street'})));`;
 const output=JSON.parse(execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{cwd:process.cwd(),env:{PATH:process.env.PATH,NODE_ENV:'test'}}).toString());
 assert.match(output.html,/&lt;script&gt;/);assert.doesNotMatch(output.html,/<script>/);assert.match(output.html,/100 Example Street/);assert.match(output.text,/Sunday puzzle/);assert.match(output.html,/role="presentation"/);
});
test('puzzle input preserves Sunday scheduling and links one opaque ticket ID',()=>{
 const input={prompt:'Clue',image_id:null,answer:'a b-c!',reward_ticket_id:'connect-later',reward_cap:100,live_on:'2026-11-01'};
 assert.equal(puzzle(input).answer,'ABC');assert.throws(()=>puzzle({...input,live_on:'2026-11-02'}));assert.throws(()=>puzzle({...input,live_on:'2026-02-30'}));
 assert.equal(answerHash('puzzle','a b-c!','a'.repeat(32)),answerHash('puzzle','ABC','a'.repeat(32)));
 assert.notEqual(answerHash('one','ABC','a'.repeat(32)),answerHash('two','ABC','a'.repeat(32)));
 assert.throws(()=>answerHash('one','ABC','short'));
});
test('image uploads reject SVG, fake MIME bytes and oversized input',async()=>{
 await assert.rejects(normalizeImage(Buffer.from('<svg onload="alert(1)"/>')));
 await assert.rejects(normalizeImage(Buffer.alloc(4194305)));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4ZsAAAAASUVORK5CYII=','base64');
 // Valid decode is tested using a tiny generated image without reading real assets.
 const sharp=createRequire(new URL('../packages/server/package.json',import.meta.url))('sharp');
 const valid=await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).png().toBuffer();
 const result=await normalizeImage(valid);assert.equal(result.mime,'image/webp');assert.ok(result.data.length>0);
 await assert.rejects(normalizeImage(png.subarray(0,10)));
});
test('Claude uses structured output, bounded tokens, fixed endpoint and no automatic retry',async()=>{
 let calls=0;
 const env={ANTHROPIC_API_KEY:'canary',ANTHROPIC_NEWSLETTER_MODEL:'configured-model'};
 const result=await generateDraft({template:'digest',brief:'Our Sunday puzzle',images:[]},env,async(url,init)=>{
  calls++;assert.equal(url,'https://api.anthropic.com/v1/messages');assert.equal(init?.redirect,'error');
  const body=JSON.parse(String(init?.body));assert.equal(body.max_tokens,4096);assert.equal(body.output_config.format.type,'json_schema');
  assert.ok(!JSON.stringify(body).includes('subscriber'));assert.equal(body.model,'configured-model');
  return Response.json({id:'msg_test',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(newsletterFixture)}],usage:{input_tokens:10,output_tokens:20}});
 });assert.equal(calls,1);assert.equal(result.usage.output_tokens,20);
 await assert.rejects(generateDraft({template:'digest',brief:'x',images:[]},env,async()=>{calls++;throw new Error('private provider failure');}),/generation_unknown/);assert.equal(calls,2);
 await assert.rejects(generateDraft({template:'digest',brief:'x',images:[]},env,async()=>Response.json({stop_reason:'max_tokens',content:[]})),/generation_incomplete/);
 await assert.rejects(generateDraft({template:'digest',brief:'x',images:[]},{},async()=>{throw new Error('must not call');}),/anthropic_not_configured/);
});
test('Resend callbacks authenticate exact bytes, reject replay windows and wrong signatures',()=>{
 const secret='whsec_'+Buffer.alloc(32,7).toString('base64'),raw=Buffer.from('{"type":"email.bounced"}'),now=1800000000000;
 const stamp=String(now/1000),id='msg_fixture';
 const signature=createHmac('sha256',Buffer.alloc(32,7)).update(`${id}.${stamp}.`).update(raw).digest('base64');
 const headers=new Headers({'svix-id':id,'svix-timestamp':stamp,'svix-signature':`v1,${signature}`});
 assert.equal(verifyNewsletterWebhook(raw,headers,secret,now),id);
 assert.throws(()=>verifyNewsletterWebhook(Buffer.from('{}'),headers,secret,now),/invalid_signature/);
 assert.throws(()=>verifyNewsletterWebhook(raw,headers,secret,now+301000),/invalid_signature/);
 assert.throws(()=>verifyNewsletterWebhook(raw,headers,undefined,now),/webhook_not_configured/);
});
test('newsletter retries reuse frozen body and key; persistence failure never reports send failure',async()=>{
 const calls:any[]=[];const writes:any[]=[];
 const job={delivery:{id:'delivery-1',lease_token:'lease-1',email:'reader@example.com',unsubscribe_token:'a'.repeat(64)},sender:'Certa <news@example.com>',reply_to:null,rendered:{subject:'Frozen',html:`<a href="https://example.com/unsub?token=${UNSUBSCRIBE_MARKER}">Unsubscribe</a>`,text:`Unsubscribe: https://example.com/unsub?token=${UNSUBSCRIBE_MARKER}`}};
 const db={rpc:async(name:string,args:any)=>{writes.push({name,args});if(name==='cn_claim_delivery')return{data:job,error:null};return{data:null,error:{message:'persist failed'}};}} as any;
 const worker=new ContentWorker({NEWSLETTER_DELIVERY_MODE:'live',RESEND_API_KEY:'re_fixture'},async(url,init)=>{calls.push(init);return Response.json({id:'provider-1'});},db);
 await assert.rejects(worker.tick());await assert.rejects(worker.tick());
 assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);assert.deepEqual(calls[0].headers,calls[1].headers);
 assert.equal(JSON.parse(calls[0].body).headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
 assert.equal(writes.filter(c=>c.name==='cn_finish_delivery').length,2);assert.ok(writes.filter(c=>c.name==='cn_finish_delivery').every(c=>c.args.p_provider==='provider-1'));
 const disabled=new ContentWorker({},async()=>{throw new Error('must not send');},{rpc:async()=>{throw new Error('must not claim');}} as any);await disabled.tick();
});
test('content credentials stay within their owning server processes',()=>{
 const settings={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_for_tests',WEB_ORIGIN:'https://web.example.com',ADMIN_ORIGIN:'https://admin.example.com',API_ORIGIN:'https://web.example.com',ANTHROPIC_API_KEY:'ai-canary',PUZZLE_ANSWER_KEY:'puzzle-canary',RESEND_API_KEY:'mail-canary',RESEND_NEWSLETTER_WEBHOOK_SECRET:'hook-canary'};
 for(const app of ['web','admin','mobile','content','tradara','contracts','discord']){
  const env=environmentFor(app,settings,{});
  assert.equal(env.ANTHROPIC_API_KEY,app==='admin'?'ai-canary':undefined);
  assert.equal(env.PUZZLE_ANSWER_KEY,['web','admin'].includes(app)?'puzzle-canary':undefined);
  assert.equal(env.RESEND_API_KEY,['web','content'].includes(app)?'mail-canary':undefined);
  assert.equal(env.RESEND_NEWSLETTER_WEBHOOK_SECRET,app==='web'?'hook-canary':undefined);
 }
});

test('ticket handoff reuses the source key after a grant succeeds but completion is lost',async()=>{
 const {dispatchPuzzleRewards}=await import('../packages/server/src/content/puzzle-rewards');
 const requests:any[]=[];const reward={id:'reward-1',user_id:'user-1',reward_ticket_id:'configured-ticket'};
 let saved=false;let fail=true;
 const query={select:()=>query,eq:()=>query,order:()=>query,limit:async()=>({data:saved?[]:[reward],error:null})};
 const db={from:()=>query,rpc:async(name:string,args:any)=>{assert.equal(name,'cn_complete_reward');assert.equal(args.p_grant_id,'real-grant');if(fail){fail=false;return {data:null,error:{message:'network'}};}saved=true;return {data:true,error:null};}} as any;
 const grant=async(input:any)=>{requests.push(input);return {grantId:'real-grant'};};
 await assert.rejects(dispatchPuzzleRewards(grant,db));assert.equal(await dispatchPuzzleRewards(grant,db),1);assert.equal(await dispatchPuzzleRewards(grant,db),0);
 assert.deepEqual(requests[0],requests[1]);assert.equal(requests[0].ticketId,'configured-ticket');assert.equal(requests[0].idempotencyKey,'puzzle-reward/reward-1');
});

test('GIF upload preserves animation as WebP and rejects excessive frames', async () => {
 const sharp=createRequire(new URL('../packages/server/package.json',import.meta.url))('sharp');
 const pixels=Buffer.from([255,0,0, 255,0,0, 255,0,0, 255,0,0, 0,0,255, 0,0,255, 0,0,255, 0,0,255]);
 const gif=await sharp(pixels,{raw:{width:2,height:4,channels:3,pageHeight:2}}).gif({delay:[120,240],loop:0}).toBuffer();
 const result=await normalizeImage(gif);
 const metadata=await sharp(result.data,{animated:true}).metadata();
 assert.equal(metadata.format,'webp');assert.equal(metadata.pages,2);assert.deepEqual(metadata.delay,[120,240]);
 const manyPixels=Buffer.alloc(2*2*3*101);for(let i=0;i<101;i++)manyPixels.fill(i%2 ? 255 : 0,i*12,(i+1)*12);
 const many=await sharp(manyPixels,{raw:{width:2,height:202,channels:3,pageHeight:2}}).gif({delay:100}).toBuffer();
 assert.equal((await sharp(many,{animated:true}).metadata()).pages,101);
 await assert.rejects(normalizeImage(many));
});
