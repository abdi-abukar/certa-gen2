import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { TradingError, type Row as GenericRow } from '../tradara/contracts';
type Row = Record<string, any>;
export type Processor = 'authnet' | 'nmi' | 'crypto';
type Billing = { name: string; country: string; state?: string; address?: string; city?: string; postal_code?: string };
export type Payment = { processor: Processor; invoice: string; amount: number; currency: string; reference?: string | null; checkoutId?: string; billing?: Billing };
export type Result = { state: 'paid' | 'declined' | 'unknown'; reference: string | null; amount: number; currency: string; invoice: string; url?: string };
const required = (name: string) => { const value = process.env[name]?.trim(); if (!value) throw new TradingError('processor_unavailable',503); return value; };
const live = (name: string) => ['production','live'].includes(process.env[name] ?? 'sandbox');
const nmiBase = () => live('NMI_ENV') ? 'https://secure.nmi.com' : 'https://sandbox.nmi.com';
const authnetUrl = () => live('AUTHORIZE_NET_ENV') ? 'https://api.authorize.net/xml/v1/request.api' : 'https://apitest.authorize.net/xml/v1/request.api';
const auth = () => ({ name: required('AUTHORIZE_NET_API_LOGIN_ID'), transactionKey: required('AUTHORIZE_NET_TRANSACTION_KEY') });
export function routingVersion() { const value = Number(required('CERTA_PAYMENT_ROUTING_VERSION')); if (!Number.isSafeInteger(value) || value < 1) throw new TradingError('processor_unavailable',503); return value; }
export function publicProcessor(id: Processor) {
  if(id==='authnet') return { id, configured: !!(process.env.AUTHORIZE_NET_API_LOGIN_ID&&process.env.AUTHORIZE_NET_TRANSACTION_KEY&&process.env.AUTHORIZE_NET_PUBLIC_CLIENT_KEY), apiLoginId:process.env.AUTHORIZE_NET_API_LOGIN_ID??'', clientKey:process.env.AUTHORIZE_NET_PUBLIC_CLIENT_KEY??'', scriptUrl:live('AUTHORIZE_NET_ENV')?'https://js.authorize.net/v1/Accept.js':'https://jstest.authorize.net/v1/Accept.js' };
  if(id==='nmi') return {id,configured:!!(process.env.NMI_SECURITY_KEY&&process.env.NMI_TOKENIZATION_KEY),tokenizationKey:process.env.NMI_TOKENIZATION_KEY??'',scriptUrl:`${nmiBase()}/token/Collect.js`};
  return {id,configured:!!(process.env.NOWPAYMENTS_API_KEY&&process.env.NOWPAYMENTS_IPN_SECRET)};
}
async function json(url: string, init: RequestInit): Promise<Row> {
  const response=await fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(15000)});
  const text=await response.text(); if(text.length>500000) throw new TradingError('provider_unavailable',503);
  const body=JSON.parse(text.replace(/^\uFEFF/,'')); if(!response.ok) throw new TradingError('provider_unavailable',503);
  return body;
}
const post=(url:string,body:Row,headers:Record<string,string>={})=>json(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
export function nmiResult(body:Row,payment:Payment): Result {
  const status=String(body.status??'').toLowerCase();
  return {state:['pendingsettlement','complete','settled'].includes(status)?'paid':['declined','failed','voided','cancelled','canceled'].includes(status)?'declined':String(body.response)==='1'&&!['pending','in_progress','unknown'].includes(status)?'paid':String(body.response)==='2'?'declined':'unknown',reference:body.id?String(body.id):null,amount:body.amount!==undefined?Math.round(Number(body.amount)*100):payment.amount,currency:String(body.currency??payment.currency).toUpperCase(),invoice:String(body.order_details?.order_id??body.order_details?.id??payment.invoice)};
}
export function cryptoResult(body:Row,payment:Payment):Result {
  return {state:body.payment_status==='finished'?'paid':['failed','expired','refunded'].includes(String(body.payment_status))?'declined':'unknown',reference:body.payment_id?String(body.payment_id):null,amount:Math.round(Number(body.price_amount)*100),currency:String(body.price_currency??'').toUpperCase(),invoice:String(body.order_id??'')};
}
export async function charge(payment:Payment,token:Row,email:string):Promise<Result> {
  if(payment.amount===0) return {state:'paid',reference:`free:${payment.invoice}`,amount:0,currency:payment.currency,invoice:payment.invoice};
  const parts=payment.billing?.name.trim().split(/\s+/)??[];
  const bill=payment.billing;
  const firstName=parts[0]?.slice(0,50),lastName=parts.slice(1).join(' ').slice(0,50)||firstName;
  if(payment.processor==='authnet') {
    const body=await post(authnetUrl(),{createTransactionRequest:{merchantAuthentication:auth(),refId:payment.invoice,transactionRequest:{transactionType:'authCaptureTransaction',amount:(payment.amount/100).toFixed(2),payment:{opaqueData:{dataDescriptor:token.dataDescriptor,dataValue:token.dataValue}},order:{invoiceNumber:payment.invoice,description:'Certa evaluation'},customer:{email},...(bill?{billTo:{firstName,lastName,address:bill.address,city:bill.city,state:bill.state,zip:bill.postal_code,country:bill.country}}:{}),transactionSettings:{setting:[{settingName:'duplicateWindow',settingValue:'120'}]}}}});
    const txn=body.transactionResponse??{};
    return {state:String(txn.responseCode)==='1'?'paid':String(txn.responseCode)==='2'?'declined':'unknown',reference:txn.transId&&String(txn.transId)!=='0'?String(txn.transId):null,amount:payment.amount,currency:'USD',invoice:payment.invoice};
  }
  if(payment.processor==='nmi') return nmiResult(await post(`${nmiBase()}/api/v5/payments/sale`,{amount:Number((payment.amount/100).toFixed(2)),currency:'USD',payment_details:{payment_token:token.paymentToken},billing_address:{email,...(bill?{first_name:firstName,last_name:lastName,address1:bill.address,city:bill.city,state:bill.state,zip:bill.postal_code?.replace(/\s+/g,''),country:bill.country}:{})},order_details:{id:payment.invoice,order_description:'Certa evaluation'}},{Authorization:required('NMI_SECURITY_KEY')}),payment);
  const origin=new URL(required('CERTA_APP_ORIGIN')); if(origin.protocol!=='https:') throw new TradingError('processor_unavailable',503);
  const body=await post('https://api.nowpayments.io/v1/invoice',{price_amount:Number((payment.amount/100).toFixed(2)),price_currency:'usd',order_id:payment.invoice,order_description:'Certa evaluation',ipn_callback_url:`${origin.origin}/api/webhooks/commerce/crypto`,success_url:`${origin.origin}/checkout${payment.checkoutId?`?checkout=${encodeURIComponent(payment.checkoutId)}`:""}`,cancel_url:`${origin.origin}/checkout${payment.checkoutId?`?checkout=${encodeURIComponent(payment.checkoutId)}`:""}`,is_fixed_rate:false,is_fee_paid_by_user:false},{'x-api-key':required('NOWPAYMENTS_API_KEY')});
  const url=new URL(String(body.invoice_url)); if(url.protocol!=='https:'||url.hostname!=='nowpayments.io') throw new TradingError('provider_unavailable',503);
  // An invoice ID is not a payment ID; store invoice URL and let verified payment callbacks bind payment ID.
  return {state:'unknown',reference:null,amount:payment.amount,currency:'USD',invoice:payment.invoice,url:url.href};
}
export async function reconcile(payment:Payment,reference:string):Promise<Result> {
  if(payment.processor==='authnet') {
    const body=await post(authnetUrl(),{getTransactionDetailsRequest:{merchantAuthentication:auth(),transId:reference}}); const txn=body.transaction??{};
    return {state:['capturedPendingSettlement','settledSuccessfully'].includes(txn.transactionStatus)?'paid':['declined','voided','expired','failedReview','FDSRejected'].includes(txn.transactionStatus)?'declined':'unknown',reference:txn.transId?String(txn.transId):null,amount:Math.round(Number(txn.settleAmount??txn.authAmount)*100),currency:'USD',invoice:String(txn.order?.invoiceNumber??'')};
  }
  if(payment.processor==='nmi') return nmiResult(await json(`${nmiBase()}/api/v5/payments/${encodeURIComponent(reference)}`,{headers:{Authorization:required('NMI_SECURITY_KEY')}}),{...payment,invoice:''});
  return cryptoResult(await json(`https://api.nowpayments.io/v1/payment/${encodeURIComponent(reference)}`,{headers:{'x-api-key':required('NOWPAYMENTS_API_KEY')}}),payment);
}
function equal(given:string,expected:string) { if(!/^[a-f0-9]+$/i.test(given)||given.length!==expected.length) return false; return timingSafeEqual(Buffer.from(given.toLowerCase()),Buffer.from(expected)); }
const sorted=(value:any):any=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export function verifyCallback(processor:Processor,raw:string,headers:Headers):boolean {
  try {
    if(processor==='authnet') return equal((headers.get('x-anet-signature')??'').replace(/^sha512=/i,''),createHmac('sha512',Buffer.from(required('AUTHORIZE_NET_SIGNATURE_KEY'),'hex')).update(raw).digest('hex'));
    if(processor==='crypto') return equal(headers.get('x-nowpayments-sig')??'',createHmac('sha512',required('NOWPAYMENTS_IPN_SECRET')).update(JSON.stringify(sorted(JSON.parse(raw)))).digest('hex'));
    const key=required('NMI_WEBHOOK_SIGNING_KEY');
    if(equal(headers.get('signature')??'',createHmac('sha256',key).update(raw).digest('hex'))) return true;
    const parts=Object.fromEntries((headers.get('webhook-signature')??'').split(',').map(value=>value.trim().split('=')));
    return /^\d+$/.test(parts.t??'')&&Math.abs(Date.now()/1000-Number(parts.t))<300&&equal(parts.s??'',createHmac('sha256',key).update(`${parts.t}.${raw}`).digest('hex'));
  } catch{return false;}
}
export function callbackIdentity(processor:Processor,body:Row) {
  if(processor==='authnet') return {event:String(body.notificationId??''),reference:String(body.payload?.id??''),invoice:null};
  if(processor==='crypto') return {event:`${body.payment_id}:${body.payment_status}`,reference:String(body.payment_id??''),invoice:String(body.order_id??'')};
  return {event:String(body.event_id??body.id??''),reference:String(body.event_body?.transaction_id??body.event_body?.id??body.transaction_id??body.data?.id??''),invoice:null};
}
/** Read-only invoice lookup. Absence is never evidence of a decline or permission to charge again. */
export async function findReference(payment:Payment,paymentUrl?:string|null):Promise<string|null>{
 if(payment.processor==='crypto'){
  const invoiceId=paymentUrl?new URL(paymentUrl).searchParams.get('iid'):null;if(!invoiceId)return null;
  const body=await json(`https://api.nowpayments.io/v1/invoice/${encodeURIComponent(invoiceId)}`,{headers:{'x-api-key':required('NOWPAYMENTS_API_KEY')}});
  return body.payment_id?String(body.payment_id):null;
 }
 if(payment.processor==='authnet'){
  const body=await post(authnetUrl(),{getUnsettledTransactionListRequest:{merchantAuthentication:auth(),sorting:{orderBy:'submitTimeUTC',orderDescending:true},paging:{limit:100,offset:1}}});
  const value=body.transactions?.transaction??body.transactions;const rows=Array.isArray(value)?value:value?[value]:[];
  const matches=rows.filter((row:Row)=>String(row.invoiceNumber??row.order?.invoiceNumber??'')===payment.invoice);
  if(matches.length!==1)return null;return matches[0].transId?String(matches[0].transId):null;
 }
 const query=new URLSearchParams({security_key:required('NMI_SECURITY_KEY'),order_id:payment.invoice});
 const response=await fetch(`${nmiBase()}/api/query.php?${query}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
 const xml=await response.text();if(!response.ok||xml.length>500000||/<(?:!DOCTYPE|!ENTITY|error_response)/i.test(xml))throw new TradingError('provider_unavailable',503);
 // Only extract numeric IDs from bounded vendor XML; never expand entities or execute a parser DTD.
 const matches=[...xml.matchAll(/<transaction_id>\s*(\d+)\s*<\/transaction_id>/g)].map(match=>match[1]);
 return new Set(matches).size===1?matches[0]:null;
}
