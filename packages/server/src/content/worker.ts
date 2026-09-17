import 'server-only';
import { createResendDelivery, EmailDeliveryError } from '../email/resend';
import { contentStore, rpc } from './store';
import { UNSUBSCRIBE_MARKER } from './schema';
/** All replicas use SKIP LOCKED leases. Sends are sequential and bounded to one per tick. */
export class ContentWorker {
 constructor(private readonly env=process.env,private readonly request:typeof fetch=fetch,private readonly db=contentStore()){}
 async tick() {
  if(this.env.NEWSLETTER_DELIVERY_MODE!=='live')return;
  if(!this.env.RESEND_API_KEY)throw new Error('newsletter_sender_not_configured');
  const job=await rpc(this.db,'claim_delivery');if(!job)return;
  const d=job.delivery;
  const replace=(value:string)=>value.replaceAll(UNSUBSCRIBE_MARKER,d.unsubscribe_token);
  const message={subject:job.rendered.subject,html:replace(job.rendered.html),text:replace(job.rendered.text)};
  const unsubscribe=message.text.match(/Unsubscribe: (https?:\/\/\S+)$/)?.[1];
  if(!unsubscribe)throw new Error('newsletter_unsubscribe_missing');
  let provider:string;
  try {
   const send=createResendDelivery({mode:'live',apiKey:this.env.RESEND_API_KEY,from:job.sender,replyTo:job.reply_to??undefined},this.request);
   provider=(await send({to:d.email,message,idempotencyKey:`newsletter/${d.id}`,unsubscribeUrl:unsubscribe})).providerId;
  }catch(e){
   const retry=e instanceof EmailDeliveryError?e.retryable:true;
   await rpc(this.db,'finish_delivery',{p_id:d.id,p_lease:d.lease_token,p_provider:null,p_error:e instanceof EmailDeliveryError?e.code:'send_unknown',p_retry:retry,p_retry_after:e instanceof EmailDeliveryError?(e.retryAfterSeconds??0):0});return;
  }
  // Keep this outside the send catch: failed persistence must not turn accepted mail into failed mail.
  await rpc(this.db,'finish_delivery',{p_id:d.id,p_lease:d.lease_token,p_provider:provider,p_error:null,p_retry:false});
 }
}
