import 'server-only';
import { tradingStore } from '../tradara/store';
import { TradingError, type Row } from '../tradara/contracts';
// Missing checkout migrations are an activation problem, not a retryable network error.
export function commerceUnavailable(error: unknown) {
 const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
 return new TradingError(['PGRST202', 'PGRST205', '42P01', '42703', '42883'].includes(String(code)) ? 'commerce_not_ready' : 'commerce_unavailable', 503);
}
export class CommerceStore {
 readonly db=tradingStore().db;
 async rpc(name:string,args:Row={}):Promise<any>{const {data,error}=await this.db.rpc(`cm_${name}`,args);if(error){const code=['not_found','payment_pending','product_unavailable','processor_unavailable','quote_changed','provider_mismatch','reconciliation_required','routing_version_conflict','slots_full','kyc_required','invalid_affiliate','ticket_unavailable','ticket_reserved','reason_required','crypto_minimum','coupon_limit','coupon_unavailable','not_revealed','not_discount','already_used','ticket_held','discounts_do_not_stack','plan_unavailable'].find(code=>error.message.includes(code));throw code ? new TradingError(code,409) : commerceUnavailable(error);}return data;}
 async snapshot(id:string,user?:string){let query=this.db.from('cm_checkouts').select('*').eq('id',id);if(user)query=query.eq('user_id',user);const {data:checkout,error}=await query.maybeSingle();if(error)throw commerceUnavailable(error);if(!checkout)throw new TradingError('not_found',404);const [revision,attempts]=await Promise.all([this.db.from('cm_revisions').select('*').eq('id',checkout.current_revision).maybeSingle(),this.db.from('cm_attempts').select('*').eq('checkout_id',id).order('created_at',{ascending:false}).limit(20)]);if(revision.error||attempts.error)throw commerceUnavailable(revision.error??attempts.error);let issuance: {slot_id:string;account_id:string|null;state:string}[]=[];let requires_acceptance=false;
  if(checkout.state==='paid'&&checkout.slot_order){
   const result=await this.db.from('ct_entitlements').select('slot_id,issued_account_id,consumed_by,cancelled_at').eq('user_id',checkout.user_id).eq('origin','purchase').like('source',`order:${checkout.slot_order}:%`).order('created_at').order('id').limit(3);
   if(result.error)throw commerceUnavailable(result.error);
   const [allocation,membership]=await Promise.all([tradingStore().rpc('allocation_snapshot',{p_user:checkout.user_id}),this.db.from('ct_memberships').select('status').eq('user_id',checkout.user_id).maybeSingle()]);
   if(membership.error)throw commerceUnavailable(membership.error);
   requires_acceptance=['INVITED','PENDING_ACCEPTANCE'].includes(String(membership.data?.status??'').toUpperCase());
   const slots=Array.isArray(allocation?.slots)?allocation.slots:[];
   issuance=(result.data??[]).map(e=>({slot_id:e.slot_id,account_id:e.issued_account_id,state:e.issued_account_id?'ready':e.cancelled_at?'cancelled':slots.find((slot:Row)=>slot.id===e.slot_id)?.state??'queued'}));
  }
  return {checkout,revision:revision.data,attempts:attempts.data,issuance,requires_acceptance};}
 async result(id:string,result:import('./providers').Result){return this.rpc('result',{p_attempt:id,p_state:result.state,p_reference:result.reference,p_amount:result.amount,p_currency:result.currency,p_invoice:result.invoice,p_url:result.url??null});}
}
