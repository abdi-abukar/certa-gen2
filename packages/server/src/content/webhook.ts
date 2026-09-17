import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readBody, TradingError, object, string } from '../tradara/contracts';
import { contentStore, rpc } from './store';
/** Resend/Svix v1: authenticate the exact bytes, message ID and timestamp before parsing. */
export function verifyNewsletterWebhook(raw:Uint8Array,headers:Headers,secret:string|undefined,now=Date.now()) {
 if(!secret?.startsWith('whsec_'))throw new TradingError('webhook_not_configured',503);
 const key=Buffer.from(secret.slice(6),'base64');if(key.length<16)throw new TradingError('webhook_not_configured',503);
 const id=headers.get('svix-id')??'',stamp=headers.get('svix-timestamp')??'',signature=headers.get('svix-signature')??'';
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||!/^\d{10}$/.test(stamp)||Math.abs(now/1000-Number(stamp))>300||signature.length>2048)throw new TradingError('invalid_signature',401);
 const expected=createHmac('sha256',key).update(`${id}.${stamp}.`).update(raw).digest();
 const valid=signature.split(' ').some(part=>{
  const [version,value]=part.split(',');if(version!=='v1'||!value)return false;
  const actual=Buffer.from(value,'base64');return actual.length===expected.length&&timingSafeEqual(expected,actual);
 });
 if(!valid)throw new TradingError('invalid_signature',401);
 return id;
}
export async function newsletterWebhookResponse(request:Request) {
 const headers={'Cache-Control':'no-store'};
 try {
  const raw=await readBody(request,65536);
  const id=verifyNewsletterWebhook(raw,request.headers,process.env.RESEND_NEWSLETTER_WEBHOOK_SECRET);
  let event:Record<string,unknown>;try{event=object(JSON.parse(new TextDecoder().decode(raw)));}catch{throw new TradingError('invalid_event');}
  if(!['email.delivered','email.bounced','email.complained'].includes(String(event.type)))return Response.json({received:true},{headers});
  const data=object(event.data);const provider=string(data.email_id,'email_id',128);
  await rpc(contentStore(),'email_event',{p_id:id,p_provider:provider,p_kind:event.type});
  return Response.json({received:true},{headers});
 }catch(e){const error=e instanceof TradingError?e:new TradingError('webhook_unavailable',503);return Response.json({error:error.code},{status:error.status,headers});}
}
