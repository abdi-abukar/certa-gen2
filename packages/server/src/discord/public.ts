import 'server-only';
import { object, TradingError } from '../tradara/contracts';
import { DiscordStore } from './store';
export async function publicCommunity(store=new DiscordStore()){
 const live=await store.one('runtime','id','live');
 const fresh=live&&Date.now()-Date.parse(String(live.updated_at))<90000;
 const {data,error}=await store.db.from('cd_jobs').select('id,payload,finished_at').eq('kind','milestone').eq('state','sent').order('finished_at',{ascending:false}).limit(20);
 if(error)throw new TradingError('discord_store_unavailable',503);
 return {live:!!(fresh&&object(live!.data).live),available:!!(fresh&&object(live!.data).available),invite_url:inviteUrl(),feed:(data??[]).map(r=>({id:r.id,event:r.payload.event,at:r.finished_at}))};
}
export function inviteUrl(){const value=process.env.DISCORD_INVITE_URL??'https://discord.gg/certa';const url=new URL(value);if(url.protocol!=='https:'||!['discord.gg','discord.com'].includes(url.hostname)||url.username||url.password)throw new TradingError('invalid_discord_invite',503);return url.href;}
