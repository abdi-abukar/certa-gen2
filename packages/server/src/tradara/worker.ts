import 'server-only';
import { PayoutStore } from '../payouts/store';
import { randomUUID, createHash } from 'node:crypto';
import { tradingStore } from './store';
import { TradaraClient, VendorFailure, vendorConfig } from './client';
import { TradingOperations } from './operations';
import { parseEvent, project } from './events';
import { object, TradingError, type Row } from './contracts';
export { vendorConfig } from './client';
export type { Row } from './contracts';
export class TradingWorker {
 readonly owner=randomUUID(); readonly store=tradingStore(); readonly config=vendorConfig();
 readonly client=new TradaraClient(this.config,kind=>this.store.budget(kind),fetch,async(kind,seconds)=>{await this.store.rpc('backoff',{p_kind:kind,p_seconds:seconds});});
 readonly operations=new TradingOperations(this.store,this.client,this.config.firmId);
 async lease(){return this.store.rpc('lease',{p_id:'worker',p_owner:this.owner});}
 private nextPayoutSessionCheck = 0;
 async tick(){
  if (Date.now() >= this.nextPayoutSessionCheck) {
   this.nextPayoutSessionCheck = Date.now() + 60000;
   try { await new PayoutStore(this.store).rpc('schedule', {p_owner:this.owner}); }
   catch { console.error('Affiliate session scheduling unavailable'); }
  }
  await this.store.rpc('schedule_allocations',{p_owner:this.owner});
  const op=await this.store.rpc('claim',{p_owner:this.owner});if(!op)return;
  this.client.writeAccepted=false;
  try{
   const result=await this.operations.run(op);
   await this.store.rpc('finish',{p_id:op.id,p_state:'confirmed',p_result:result});
  }catch(error){
   // Never replay an ambiguous external write. A restart leaves it unresolved too.
   const code=error instanceof TradingError?error.code:'operation_failed';
   const ambiguous=this.client.writeAccepted||error instanceof VendorFailure&&error.ambiguous;
   await this.store.rpc('finish',{p_id:op.id,p_state:ambiguous?'unknown':'failed',p_result:{},p_error:code});
  }
 }
 async cursor(channel:string){return this.store.one('runtime','id',`ws:${channel}`);}
 async ingestBatch(raw:unknown[],channel:string){
  const events=raw.map(value=>project(parseEvent(object(value),`ws:${channel}`,this.config.firmId)));
  return this.store.rpc('ingest_batch',{p_events:events,p_owner:this.owner});
 }
 async ticket(value:string){
  if(!/^[A-Za-z0-9_-]{43}$/.test(value))return null;
  return this.store.rpc('ticket',{p_hash:createHash('sha256').update(value).digest('hex')});
 }
 async changeCursor(){
  const {data,error}=await this.store.db.from('ct_changes').select('id').order('id',{ascending:false}).limit(1);
  if(error)throw new TradingError('changes_unavailable',503);return String(data?.[0]?.id??'0');
 }
 async changes(after:string){
  const {data,error}=await this.store.db.from('ct_changes').select('id,user_id,account_id,kind,data').gt('id',after).order('id').limit(500);
  if(error)throw new TradingError('changes_unavailable',503);return data??[];
 }
 async status(channel:string,data:Row){const {error}=await this.store.db.from('ct_runtime').upsert({id:`health:${channel}`,data,updated_at:new Date().toISOString()});if(error)throw new TradingError('health_persistence_failed',503);}
 async probe(){try{await this.client.request('GET','/v1/firm-control/firm');await this.status('rest',{status:'healthy'});}catch{await this.status('rest',{status:'unavailable'});}}
 async replayUnmapped(){
  // Bounded repair of already-received events after explicit account/user linking.
  const {data,error}=await this.store.db.from('ct_events').select('id,payload').eq('state','unmapped').order('received_at').limit(100);
  if(error)throw new TradingError('events_unavailable',503);
  if(data?.length)await this.store.rpc('reprocess_batch',{p_ids:data.map(row=>row.id),p_owner:this.owner});
 }
 async repair(){
  // One shared, resumable bulk pass. No per-customer polling or concurrent sweeps.
  const saved=await this.store.one('runtime','id','repair');
  const now=Date.now();const stale=!saved||now-Date.parse(String(saved.updated_at))>86400000;
  const health=await this.store.list('runtime');
  const required=health.some(row=>String(row.id).startsWith('health:')&&row.data&&object(row.data).status==='repair_required');
  if(!stale&&!required&&!(saved?.data&&object(saved.data).pending))return false;
  const state=saved?.data?object(saved.data):{};
  const phase=String(state.phase??'accounts');
  const after=state.pending&&saved&&now-Date.parse(String(saved.updated_at))<600000?String(state.cursor??''):'';
  const query=new URLSearchParams({limit:phase==='accounts'?'100':'50'});if(after)query.set('cursor',after);
  const page=await this.client.page(phase==='accounts'?`/v1/firm-control/accounts?${query}`:`/v1/admin/query/balances?${query}`);
  for(const row of page.items){
   if(row.is_shadow===true)continue;
   const account=String(row.account_id??row.id??'');if(!account)continue;
   const when=row.updated_at??row.as_of??row.created_at;
   const at=typeof when==='number'?new Date(when).toISOString():when?String(when):new Date().toISOString();
   await this.operations.apply(phase==='accounts'?'accounts.updated':'balances.updated',row,account,String(row.user_id??row.owner_id??''),at,`repair:${phase}:${account}:${at}`);
  }
  const nextPhase=page.next?phase:phase==='accounts'?'balances':'accounts';
  const pending=!!page.next||phase==='accounts';
  const {error}=await this.store.db.from('ct_runtime').upsert({id:'repair',data:{phase:nextPhase,cursor:page.next,pending},updated_at:new Date().toISOString()});
  if(error)throw new TradingError('repair_checkpoint_failed',503);
  if(!pending){
   // Bulk balances/accounts alone cannot certify missing historical trades/stats.
   await this.status('repair',{status:'bulk_completed',history_repair:'on_demand'});
   for(const channel of ['balances','stats','trades']) {
    const current=await this.store.one('runtime','id',`health:${channel}`);
    if(current?.data&&object(current.data).status==='repair_required')await this.status(channel,{status:'connected_history_gap',history_repair:'on_demand'});
   }
  }
  return pending;
 }
 async cleanup(){
  const days=(count:number)=>new Date(Date.now()-count*86400000).toISOString();
  await this.store.db.from('ct_changes').delete().lt('created_at',new Date(Date.now()-3600000).toISOString());
  await this.store.db.from('ct_tickets').delete().lt('expires_at',days(1));
  await this.store.db.from('ct_events').delete().eq('state','applied').like('id','ws:%').lt('received_at',days(2));
  await this.store.db.from('ct_events').delete().in('state',['applied','ignored']).not('id','like','ws:%').lt('received_at',days(30));
 }

}
