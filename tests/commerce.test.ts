import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHmac} from 'node:crypto';
import {charge,cryptoResult,nmiResult,verifyCallback,findReference} from '../packages/server/src/commerce/providers';
import {assertPurchaseEmail,purchaseEvidence} from '../packages/server/src/commerce/policy';
const payment={processor:'nmi' as const,amount:15000,currency:'USD',invoice:'fixture-invoice'};
test('NMI payment states distinguish settled, held, declined and ambiguous',()=>{
 assert.equal(nmiResult({id:'1',response:'1',status:'pending'},payment).state,'unknown');
 assert.equal(nmiResult({id:'1',response:'1',status:'pendingsettlement'},payment).state,'paid');
 assert.equal(nmiResult({id:'1',response:'2'},payment).state,'declined');
 assert.equal(nmiResult({response:'3'},payment).state,'unknown');
});
test('crypto partial/confirming cannot fulfill and verified amounts stay authoritative',()=>{
 for(const state of ['partially_paid','confirming','confirmed','sending','waiting'])assert.equal(cryptoResult({payment_status:state,price_amount:150,price_currency:'usd',order_id:payment.invoice,payment_id:123},payment).state,'unknown');
 const result=cryptoResult({payment_status:'finished',price_amount:42,price_currency:'eur',order_id:'other',payment_id:123},payment);
 assert.equal(result.state,'paid');assert.equal(result.amount,4200);assert.equal(result.currency,'EUR');assert.equal(result.invoice,'other');
});
test('free purchase cannot contact any payment provider',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('unexpected provider call');};
 try{for(const processor of ['authnet','nmi','crypto'] as const){const result=await charge({...payment,processor,amount:0},{},'fixture@example.test');assert.equal(result.state,'paid');assert.equal(result.reference,'free:fixture-invoice');}}finally{globalThis.fetch=old;}
});
test('NMI adapter preserves v5 amount type, order ID and does not vault or replay tokens',async()=>{
 const old=globalThis.fetch;const key=process.env.NMI_SECURITY_KEY;process.env.NMI_SECURITY_KEY='synthetic-key';let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;assert.match(String(input),/\/api\/v5\/payments\/sale$/);const body=JSON.parse(String(init?.body));assert.equal(body.amount,150);assert.equal(body.order_details.id,payment.invoice);assert.deepEqual(body.payment_details,{payment_token:'synthetic-token'});assert.equal(body.customer_vault,undefined);assert.deepEqual(body.billing_address,{email:'fixture@example.test',first_name:'Fixture',last_name:'Buyer',address1:'100 Fixture St',city:'Toronto',state:'ON',zip:'M5V1A1',country:'CA'});return Response.json({id:'fixture-payment',response:'1',status:'pendingsettlement'});};
 try{assert.equal((await charge({...payment,billing:{name:'Fixture Buyer',address:'100 Fixture St',city:'Toronto',state:'ON',postal_code:'M5V 1A1',country:'CA'}},{paymentToken:'synthetic-token'},'fixture@example.test')).state,'paid');assert.equal(calls,1);}finally{globalThis.fetch=old;if(key===undefined)delete process.env.NMI_SECURITY_KEY;else process.env.NMI_SECURITY_KEY=key;}
});
test('webhook signatures fail closed, reject tampering, and enforce NMI timestamp',()=>{
 const old=process.env.NMI_WEBHOOK_SIGNING_KEY;process.env.NMI_WEBHOOK_SIGNING_KEY='synthetic-secret';const raw='{"event_id":"fixture"}';const signature=createHmac('sha256','synthetic-secret').update(raw).digest('hex');
 try{assert.equal(verifyCallback('nmi',raw,new Headers({Signature:signature})),true);assert.equal(verifyCallback('nmi',raw+' ',new Headers({Signature:signature})),false);const timestamp='1';const sig=createHmac('sha256','synthetic-secret').update(`${timestamp}.${raw}`).digest('hex');assert.equal(verifyCallback('nmi',raw,new Headers({'Webhook-Signature':`t=${timestamp},s=${sig}`})),false);assert.equal(verifyCallback('nmi',raw,new Headers()),false);}finally{if(old===undefined)delete process.env.NMI_WEBHOOK_SIGNING_KEY;else process.env.NMI_WEBHOOK_SIGNING_KEY=old;}
});
test('original purchase restrictions cannot be bypassed through plus tags and Gmail aliases',()=>{
 assert.throws(()=>assertPurchaseEmail('khaza.yma588+test@googlemail.com'),/purchase_declined/);assert.throws(()=>assertPurchaseEmail('info+test@certafutures.com'),/purchase_declined/);assert.doesNotThrow(()=>assertPurchaseEmail('fixture@example.test'));
});
test('purchase evidence requires current explicit consent and preserves safe immutable facts',()=>{
 const version=process.env.CERTA_CHECKOUT_TERMS_VERSION,url=process.env.CERTA_CHECKOUT_TERMS_URL;process.env.CERTA_CHECKOUT_TERMS_VERSION='fixture-v1';process.env.CERTA_CHECKOUT_TERMS_URL='https://example.test/agreement';
 try{const input={accepted:true,terms_version:'fixture-v1',name:'Fixture Buyer',country:'CA'};assert.throws(()=>purchaseEvidence({...input,accepted:false},'fixture@example.test'),/accept_current_terms/);assert.throws(()=>purchaseEvidence({...input,country:'KP'},'fixture@example.test'),/billing_region_unavailable/);assert.match(purchaseEvidence(input,'Fixture+1@example.test').sha256,/^[a-f0-9]{64}$/);}finally{if(version===undefined)delete process.env.CERTA_CHECKOUT_TERMS_VERSION;else process.env.CERTA_CHECKOUT_TERMS_VERSION=version;if(url===undefined)delete process.env.CERTA_CHECKOUT_TERMS_URL;else process.env.CERTA_CHECKOUT_TERMS_URL=url;}
});
test('missing invoice search results cannot be interpreted as a decline',async()=>{
 const old=globalThis.fetch,key=process.env.NMI_SECURITY_KEY;process.env.NMI_SECURITY_KEY='synthetic';globalThis.fetch=async()=>new Response('<nm_response/>');try{assert.equal(await findReference(payment),null);}finally{globalThis.fetch=old;if(key===undefined)delete process.env.NMI_SECURITY_KEY;else process.env.NMI_SECURITY_KEY=key;}
});
test('crypto return URLs resume the exact checkout and invoice creation never reports paid',async()=>{
 const saved={...process.env},old=globalThis.fetch;Object.assign(process.env,{CERTA_APP_ORIGIN:'https://web.example.test',NOWPAYMENTS_API_KEY:'synthetic'});let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;assert.equal(String(input),'https://api.nowpayments.io/v1/invoice');const body=JSON.parse(String(init?.body));assert.equal(body.success_url,'https://web.example.test/checkout?checkout=10000000-0000-4000-8000-000000000001');assert.equal(body.cancel_url,body.success_url);assert.equal(body.order_id,payment.invoice);assert.equal(body.price_amount,150);return Response.json({id:123,invoice_url:'https://nowpayments.io/payment/?iid=123'});};
 try{const result=await charge({...payment,processor:'crypto',checkoutId:'10000000-0000-4000-8000-000000000001'},{},'fixture@example.test');assert.equal(result.state,'unknown');assert.equal(result.reference,null);assert.equal(calls,1);}finally{globalThis.fetch=old;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
test('Authorize.net only captures a browser token and preserves the invoice',async()=>{
 const saved={...process.env},old=globalThis.fetch;Object.assign(process.env,{AUTHORIZE_NET_API_LOGIN_ID:'synthetic',AUTHORIZE_NET_TRANSACTION_KEY:'synthetic'});let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;assert.match(String(input),/^https:\/\/(api|apitest)\.authorize\.net\//);const request=JSON.parse(String(init?.body)).createTransactionRequest;assert.equal(request.transactionRequest.order.invoiceNumber,payment.invoice);assert.deepEqual(request.transactionRequest.payment,{opaqueData:{dataDescriptor:'COMMON.ACCEPT.INAPP.PAYMENT',dataValue:'synthetic-token'}});return Response.json({transactionResponse:{responseCode:'1',transId:'12345'}});};
 try{const result=await charge({...payment,processor:'authnet'},{dataDescriptor:'COMMON.ACCEPT.INAPP.PAYMENT',dataValue:'synthetic-token'},'fixture@example.test');assert.equal(result.state,'paid');assert.equal(calls,1);}finally{globalThis.fetch=old;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
