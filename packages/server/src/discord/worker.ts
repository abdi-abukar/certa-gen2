import 'server-only';
import { randomUUID } from 'node:crypto';
import { DiscordStore, DiscordBudget } from './store';
import { DiscordClient, DiscordFailure, discordConfig, milestoneMessage, snowflake } from './provider';
import { verifiedPnl } from './stats';
import { object, TradingError, type Row } from '../tradara/contracts';
export { publicCommunity } from './public';
export class DiscordWorker {
 published=false;
 readonly owner=randomUUID();readonly store=new DiscordStore();readonly config=discordConfig();
 readonly client=new DiscordClient(this.config.token,async route=>{if(!await this.lease())throw new TradingError('lease_lost',503);await this.store.budget(route);},async(route,seconds)=>{await this.store.rpc('pause',{p_id:route,p_seconds:seconds});});
 nextSchedule=0;
 async lease(){const {data,error}=await this.store.db.rpc('ct_lease',{p_id:'discord-worker',p_owner:this.owner});if(error)throw new TradingError('lease_failed',503);return data===true;}
 async tick(){
  if(process.env.DISCORD_DELIVERY_ENABLED!=='true')return false;
  if(Date.now()>=this.nextSchedule){await this.store.rpc('schedule',{p_owner:this.owner});this.nextSchedule=Date.now()+60000;}
  const job=await this.store.rpc('claim',{p_owner:this.owner});if(!job)return false;
  this.client.writeAccepted=false;
  try{await this.run(job);}
  catch(error){
   const idempotent=['roles','cleanup','nickname'].includes(job.kind);
   const unknown=!idempotent&&(this.client.writeAccepted||error instanceof DiscordFailure&&error.ambiguous);
   const retry=error instanceof TradingError&&['lease_lost','lease_failed','discord_store_unavailable','trading_store_unavailable'].includes(error.code)||error instanceof DiscordBudget||error instanceof DiscordFailure&&(error.retryAfter>0||idempotent&&(error.statusCode>=500||error.ambiguous));
   if(job.kind==='roles'&&!retry){await this.store.db.from('cd_links').update({synced_at:new Date().toISOString(),error_code:error instanceof TradingError?error.code:'role_sync_failed'}).eq('user_id',job.user_id).eq('generation',job.generation);}
   await this.store.rpc('finish',{p_id:job.id,p_state:unknown?'unknown':retry?'queued':'failed',p_error:error instanceof TradingError?error.code:'discord_job_failed',p_delay:Math.max(error instanceof DiscordFailure?error.retryAfter:0,Math.min(3600,2**job.attempts*10))});
  }
  return true;
 }
 async run(job:Row){
  const input=object(job.payload);
  const link=job.user_id?await this.store.one('links','user_id',String(job.user_id)):null;
  const same=link&&link.generation===job.generation&&link.state==='linked';
  const done=(state='sent',channel?:string,message?:string)=>this.store.rpc('finish',{p_id:job.id,p_state:state,p_channel:channel??null,p_message:message??null});
  if(['roles','nickname','share','daily','weekly'].includes(String(job.kind))&&!same){await done('cancelled');return;}
  if(job.kind==='commands'){
   for(const name of ['certa','next']) await this.client.call(`/applications/${this.config.client}/guilds/${this.config.guild}/commands`,'POST',{name,description:'Show your Certa next steps privately',type:1});
   await done();return;
  }
  if(job.kind==='roles'||job.kind==='cleanup'){
   const target=job.kind==='cleanup'?input.discord_id:link!.discord_id;
   const member=await this.client.member(this.config.guild,String(target));
   if(member){
    const {data:managed,error}=await this.store.db.from('cd_roles').select('role_id');if(error)throw new TradingError('discord_store_unavailable',503);
    const wanted:string[]=job.kind==='cleanup'?[]:await this.store.rpc('roles_wanted',{p_user:job.user_id});
    const current=new Set(Array.isArray(member.roles)?member.roles:[]);
    for(const row of managed??[]){const role=snowflake(row.role_id);if(wanted.includes(role)!==current.has(role))await this.client.call(`/guilds/${this.config.guild}/members/${target}/roles/${role}`,wanted.includes(role)?'PUT':'DELETE');}
   }
   if(job.kind==='roles'){
    const {error}=await this.store.db.from('cd_links').update({member:!!member,synced_at:new Date().toISOString(),error_code:member?null:'not_in_guild'}).eq('user_id',job.user_id).eq('generation',job.generation);if(error)throw new TradingError('discord_store_unavailable',503);
   }
   await done();return;
  }
  if(job.kind==='nickname'){
   await this.client.call(`/guilds/${this.config.guild}/members/${link!.discord_id}`,'PATCH',{nick:link!.nickname});await done();return;
  }
  let channel:string|undefined,payload:Row;
  if(job.kind==='milestone'){
   channel=process.env.DISCORD_MILESTONES_CHANNEL_ID;
   payload=milestoneMessage(input,link);
  }else if(job.kind==='alert'){
   channel=process.env.DISCORD_STAFF_CHANNEL_ID;
   payload={embeds:[{title:'Account operation needs review',description:`Operation ${input.operation_id}: ${input.state}. Review in Certa admin.`,color:0xed4245}]};
  }else{
   if(job.kind==='weekly'&&!link!.weekly_pnl){await done('cancelled');return;}
   if(job.kind==='daily'&&!link!.daily_pnl){await done('cancelled');return;}
   channel=process.env.DISCORD_PNL_CHANNEL_ID;
   payload=await verifiedPnl(this.store,String(job.user_id),String(input.account_id),String(input.period));
   payload.content=`<@${link!.discord_id}> shared an account result.`;
  }
  if(!channel)throw new TradingError('channel_not_configured',503);
  const message=await this.client.message(channel,String(job.id),payload);await done('sent',channel,message);this.published=true;
 }
}
