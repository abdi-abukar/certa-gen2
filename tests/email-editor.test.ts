import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTOMATED_EMAILS } from '../packages/server/src/email/transactional-catalog';
import { EMAIL_PREVIEW_CONTEXT, emailDefinition, renderTransactionalEmail, validateCopy, validateEmailData } from '../packages/server/src/email/editor';
import { generateEmailCopy } from '../packages/server/src/email/ai';
import { sendLoginChallenge } from '../packages/server/src/email/triggers';
import { TransactionalEmailWorker, enqueueTransactionalEmail } from '../packages/server/src/email/outbox';

test('all 25 original templates have independent fixtures, runtime contracts and escaped previews',()=>{
 assert.equal(AUTOMATED_EMAILS.length,25);
 for(const def of AUTOMATED_EMAILS){const rendered=renderTransactionalEmail(def.id,EMAIL_PREVIEW_CONTEXT,def.sample);assert.ok(rendered.subject);assert.ok(rendered.html.includes('<html'));assert.ok(rendered.text);assert.ok(!rendered.text.includes('{{'));}
 const def=emailDefinition('checkout_receipt');const output=renderTransactionalEmail(def.id,{...EMAIL_PREVIEW_CONTEXT,user:{...EMAIL_PREVIEW_CONTEXT.user,greeting:'<img src=x onerror=alert(1)>'}},{...def.sample,'receipt.lines':'<script>alert(1)</script>'});
 assert.ok(output.html.includes('&lt;script&gt;'));assert.ok(!output.html.includes('<script>'));assert.ok(!output.html.includes('<img src=x'));
});
test('editor rejects missing credentials, unknown variables, subject injection and dangerous URLs',()=>{
 const login=emailDefinition('login_pin');assert.throws(()=>validateCopy(login.id,{...login.defaults,body:'Hi'}));assert.throws(()=>validateCopy(login.id,{...login.defaults,subject:'Code {{pin}}'}));assert.throws(()=>validateCopy(login.id,{...login.defaults,title:'{{pin}}'}));
 const receipt=emailDefinition('checkout_receipt');assert.throws(()=>validateCopy(receipt.id,{...receipt.defaults,body:receipt.defaults.body+'{{user.access_token}}'}));assert.throws(()=>validateCopy(receipt.id,{...receipt.defaults,ctaUrl:'javascript:alert(1)'}));assert.throws(()=>validateEmailData(receipt.id,{...receipt.sample,access_token:'secret'}));assert.throws(()=>renderTransactionalEmail(receipt.id,EMAIL_PREVIEW_CONTEXT,{...receipt.sample,'receipt.total':'USD\r\nInjected'},{...receipt.defaults,subject:'{{receipt.total}}'}));
 const message=renderTransactionalEmail('login_pin',EMAIL_PREVIEW_CONTEXT,{pin:'829101',expiresInMinutes:'5'});assert.ok(message.text.includes('5 minutes'));assert.ok(!message.subject.includes('829101'));
});
test('AI returns validated copy, preserves links and never performs automatic retries',async()=>{
 const def=emailDefinition('checkout_receipt');let calls=0;const env={ANTHROPIC_API_KEY:'fixture',ANTHROPIC_NEWSLETTER_MODEL:'fixture'};
 const result=await generateEmailCopy(def.id,def.defaults,'Shorter copy',env,async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.ok(body.output_config.format.schema);assert.ok(!JSON.stringify(body).includes('alex@example.test'));return Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({...def.defaults,title:'Purchase confirmed'})}]});});assert.equal(result.title,'Purchase confirmed');assert.equal(calls,1);
 await assert.rejects(generateEmailCopy(def.id,def.defaults,'Edit',env,async()=>{calls++;throw new Error('secret transport detail');}),/generation_unknown/);assert.equal(calls,2);
 await assert.rejects(generateEmailCopy(def.id,def.defaults,'Edit',env,async()=>Response.json({stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({...def.defaults,ctaUrl:'https://attacker.example'})}]})),/generation_invalid/);
});
test('disabled auth and worker paths cannot send and sensitive events cannot enter durable outbox',async()=>{
 const previous=process.env.EMAIL_DELIVERY_MODE;process.env.EMAIL_DELIVERY_MODE='disabled';
 try{await assert.rejects(sendLoginChallenge({id:'fixture',user:{id:'fixture',email:'alex@example.test',user_metadata:{}},data:{code:'123456',expiresInMinutes:10}}),/disabled/);}finally{if(previous===undefined)delete process.env.EMAIL_DELIVERY_MODE;else process.env.EMAIL_DELIVERY_MODE=previous;}
 let touched=false;const db={rpc:async()=>{touched=true;throw new Error('Unexpected storage call');}} as any;
 await new TransactionalEmailWorker({EMAIL_DELIVERY_MODE:'disabled'},async()=>{throw new Error('Unexpected send');},db).tick();assert.equal(touched,false);
 await assert.rejects(enqueueTransactionalEmail(db,{eventId:'fixture',templateId:'login_pin',userId:'fixture',data:{pin:'123456',expiresInMinutes:'10'}}),/dedicated/);assert.equal(touched,false);
});
test('transactional retries preserve frozen payload and idempotency key, including suppression before retry',async()=>{
 const calls:{name:string;args:any}[]=[];const job={id:'job-1',user_id:'user',template_id:'checkout_receipt',lease_token:'lease',recipient:'alex@example.test',rendered:{subject:'Frozen',html:'Frozen HTML',text:'Frozen text'},sender:'Certa <support@example.test>',reply_to:'reply@example.test'};
 const db={rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:name==='ce_claim'?job:name==='ce_prepare'?true:null,error:null};}} as any;
 let sends=0;await new TransactionalEmailWorker({EMAIL_DELIVERY_MODE:'live',RESEND_API_KEY:'re_fixture',EMAIL_FROM:'changed@example.test'},async(_url,init)=>{sends++;const body=JSON.parse(String(init?.body));assert.equal(body.subject,'Frozen');assert.equal(body.from,job.sender);assert.equal(new Headers(init?.headers).get('Idempotency-Key'),'transactional/job-1');return Response.json({id:'provider-1'});},db).tick();assert.equal(sends,1);assert.equal(calls.at(-1)?.args.p_provider,'provider-1');
 db.rpc=async(name:string)=>({data:name==='ce_claim'?job:false,error:null});await new TransactionalEmailWorker({EMAIL_DELIVERY_MODE:'live'},async()=>{throw new Error('Suppressed recipient must not send');},db).tick();
});
