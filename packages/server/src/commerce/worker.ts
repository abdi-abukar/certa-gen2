import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { CommerceStore } from './store';
import { reconcile, findReference, type Processor } from './providers';
import { TradingError } from '../tradara/contracts';
export async function reconcileAttempt(store:CommerceStore,id:string,providerReference?:string){
 const {data:attempt,error}=await store.db.from('cm_attempts').select('*').eq('id',id).maybeSingle();if(error||!attempt)throw new TradingError('not_found',404);
 if(!['submitted','unknown'].includes(attempt.state))return;
 const {data:revision,error:revisionError}=await store.db.from('cm_revisions').select('*').eq('id',attempt.revision_id).single();if(revisionError)throw new TradingError('commerce_unavailable',503);
 const payment={processor:attempt.processor as Processor,invoice:attempt.invoice,amount:revision.total_cents,currency:revision.currency};
 const reference=providerReference??attempt.provider_reference??await findReference(payment,attempt.payment_url);
 if(!reference)throw new TradingError('provider_reference_required',409);
 const result=await reconcile({processor:attempt.processor as Processor,invoice:attempt.invoice,amount:revision.total_cents,currency:revision.currency},reference);
 await store.result(id,result);
}
/** Bounded read-only reconciliation; writes to payment processors are never replayed. */
export async function runCommerceWorker(){
 const store=new CommerceStore();let processed=0;
 const {data:callbacks,error}=await store.db.from('cm_callbacks').select('*').eq('state','pending').lte('next_check_at',new Date().toISOString()).order('created_at').limit(5);if(error)throw new TradingError('commerce_unavailable',503);
 for(const callback of callbacks??[]){
  try{
   let query=store.db.from('cm_attempts').select('id').eq('processor',callback.processor);
   let invoice=callback.invoice;
   if(!invoice){const evidence=await reconcile({processor:callback.processor,invoice:'',amount:0,currency:'USD'},callback.provider_reference);invoice=evidence.invoice;}
   query=invoice?query.eq('invoice',invoice):query.eq('provider_reference',callback.provider_reference);
   const {data:attempt}=await query.maybeSingle();
   if(!attempt){await store.db.from('cm_callbacks').update({checks:callback.checks+1,next_check_at:new Date(Date.now()+300000).toISOString(),state:callback.checks>=20?'review':'pending'}).eq('id',callback.id);continue;}
   await reconcileAttempt(store,attempt.id,callback.provider_reference);
   const {error:doneError}=await store.db.from('cm_callbacks').update({state:'done'}).eq('id',callback.id);if(doneError)throw doneError;processed++;
  }catch{await store.db.from('cm_callbacks').update({checks:callback.checks+1,next_check_at:new Date(Date.now()+300000).toISOString(),state:callback.checks>=20?'review':'pending'}).eq('id',callback.id);}
 }
 const {data:attempts,error:queueError}=await store.db.from('cm_attempts').select('id,checks').in('state',['submitted','unknown']).lte('next_check_at',new Date().toISOString()).order('next_check_at').limit(5);if(queueError)throw new TradingError('commerce_unavailable',503);
 for(const attempt of attempts??[]){
  // Claim a cooldown with compare-and-set so concurrent runners do not poll the same operation.
  const {data:claimed}=await store.db.from('cm_attempts').update({checks:attempt.checks+1,next_check_at:new Date(Date.now()+Math.min(3600000,300000*(attempt.checks+1))).toISOString()}).eq('id',attempt.id).eq('checks',attempt.checks).select('id');
  if(!claimed?.length)continue;try{await reconcileAttempt(store,attempt.id);processed++;}catch{/* remains durable for the next bounded read */}
 }
 return {processed};
}
export async function commerceWorkerResponse(request:Request){
 const expected=process.env.CERTA_PAYMENT_WORKER_SECRET??'';const supplied=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
 const expectedBytes=Buffer.from(expected),suppliedBytes=Buffer.from(supplied);
 if(!expected||suppliedBytes.length!==expectedBytes.length||!timingSafeEqual(suppliedBytes,expectedBytes))return Response.json({error:'unauthorized'},{status:401});
 try{return Response.json(await runCommerceWorker(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'commerce_unavailable'},{status:503});}
}
