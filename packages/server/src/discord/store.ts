import 'server-only';
import { tradingStore } from '../tradara/store';
import { TradingError, type Row } from '../tradara/contracts';
export class DiscordStore {
 readonly db;
 constructor(timeout=10000) { this.db=tradingStore(process.env,timeout).db; }
 async rpc(name:string,args:Row={}):Promise<any> {
  const {data,error}=await this.db.rpc(`cd_${name}`,args);
  if(error) {const code=error.code==='23505'?'conflict':['cooldown','already_linked','oauth_expired','not_linked','not_recoverable','evidence_required','cleanup_required','conflict'].find(c=>error.message.includes(c));throw new TradingError(code??'discord_store_unavailable',code?409:503);}return data;
 }
 async one(table:string,field:string,value:string):Promise<Row|null>{const {data,error}=await this.db.from(`cd_${table}`).select('*').eq(field,value).maybeSingle();if(error)throw new TradingError('discord_store_unavailable',503);return data;}
 async save(table:string,row:Row){const {error}=await this.db.from(`cd_${table}`).upsert(row);if(error)throw new TradingError('discord_store_unavailable',503);}
 async enqueue(dedupe:string,user:string|null,kind:string,payload:Row={},generation?:string){
  const {error}=await this.db.from('cd_jobs').upsert({dedupe,user_id:user,kind,payload,...(generation?{generation}:{})},{onConflict:'dedupe',ignoreDuplicates:true});
  if(error)throw new TradingError('discord_store_unavailable',503);
 }
 async budget(route:string){
  if(!await this.rpc('limit',{p_id:'rest',p_max:4,p_seconds:1})||!await this.rpc('limit',{p_id:route,p_max:2,p_seconds:1}))throw new DiscordBudget();
 }
}
export class DiscordBudget extends TradingError {constructor(){super('discord_budget',429);}}
