import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailDefinition, MARKETING_EMAILS, SENSITIVE_EMAILS, renderTransactionalEmail, validateEmailData, type TransactionalEmailId } from './editor';
import { emailRpc, emailStore } from './store';
import { contextFromUser } from './schema';
import { createResendDelivery, EmailDeliveryError } from './resend';
export type TransactionalEmailEvent={eventId:string;templateId:TransactionalEmailId;userId:string;data:Record<string,string>};
/** For SQL-owned mutations call ce_enqueue inside the SAME transaction. This helper is for durable event consumers. */
export async function enqueueTransactionalEmail(db:SupabaseClient,event:TransactionalEmailEvent) {
 const definition=emailDefinition(event.templateId);
 if(SENSITIVE_EMAILS.has(event.templateId)||MARKETING_EMAILS.has(event.templateId)||definition.audience==='internal')throw new Error('This event requires its dedicated recipient/delivery owner.');
 return emailRpc(db,'enqueue',{p_event_id:event.eventId,p_template_id:event.templateId,p_user_id:event.userId,p_data:validateEmailData(event.templateId,event.data)});
}
/** One bounded attempt per invocation; replicas coordinate through database leases. */
export class TransactionalEmailWorker {
 constructor(private readonly env=process.env,private readonly request:typeof fetch=fetch,private readonly db:SupabaseClient=emailStore()){}
 async tick(){
  if(this.env.EMAIL_DELIVERY_MODE!=='live')return;
  const job=await emailRpc(this.db,'claim');if(!job)return;
  let message=job.rendered,to=job.recipient;
  try {
   if(!message){
    const {data,error}=await this.db.auth.admin.getUserById(job.user_id);
    if(error||!data.user?.email_confirmed_at)throw new Error('recipient_unavailable');
    const context=contextFromUser(data.user);to=context.user.email;
    message=renderTransactionalEmail(job.template_id,context,job.data,job.copy);
    const ready=await emailRpc(this.db,'prepare',{p_id:job.id,p_lease:job.lease_token,p_recipient:to,p_rendered:message,p_sender:this.env.EMAIL_FROM??null,p_reply_to:this.env.EMAIL_REPLY_TO??null});
    if(!ready)return;
   }else{
    // Suppression is checked again for every retry, including already-rendered jobs.
    const ready=await emailRpc(this.db,'prepare',{p_id:job.id,p_lease:job.lease_token,p_recipient:to,p_rendered:message,p_sender:job.sender,p_reply_to:job.reply_to});if(!ready)return;
   }
  } catch {await emailRpc(this.db,'finish',{p_id:job.id,p_lease:job.lease_token,p_provider:null,p_error:'invalid_event',p_retry:false,p_delay:0});return;}
  let provider:string;
  try {
   const send=createResendDelivery({mode:'live',apiKey:this.env.RESEND_API_KEY,from:job.sender??this.env.EMAIL_FROM,replyTo:job.reply_to??this.env.EMAIL_REPLY_TO},this.request);
   provider=(await send({to,message,idempotencyKey:`transactional/${job.id}`})).providerId;
  }catch(error){await emailRpc(this.db,'finish',{p_id:job.id,p_lease:job.lease_token,p_provider:null,p_error:error instanceof EmailDeliveryError?error.code:'unknown',p_retry:error instanceof EmailDeliveryError&&error.retryable,p_delay:error instanceof EmailDeliveryError?error.retryAfterSeconds??0:0});return;}
  await emailRpc(this.db,'finish',{p_id:job.id,p_lease:job.lease_token,p_provider:provider,p_error:null,p_retry:false,p_delay:0});
 }
}
