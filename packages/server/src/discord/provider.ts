import 'server-only';
import { createHash } from 'node:crypto';
import { TradingError, object, readBody, type Row } from '../tradara/contracts';
export function snowflake(value:unknown):string {if(typeof value!=='string'||!/^\d{17,20}$/.test(value))throw new TradingError('invalid_discord_id');return value;}
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function discordConfig(env=process.env){
 const guild=snowflake(env.DISCORD_GUILD_ID),client=snowflake(env.DISCORD_CLIENT_ID);
 if(!env.DISCORD_BOT_TOKEN)throw new TradingError('discord_not_configured',503);
 return {guild,client,token:env.DISCORD_BOT_TOKEN};
}
export function appOrigin(env=process.env){const url=new URL(env.CERTA_WEB_ORIGIN??env.CERTA_APP_ORIGIN??'');if(url.username||url.password||url.pathname!=='/'||!['https:','http:'].includes(url.protocol))throw new TradingError('invalid_app_origin',503);return url.origin;}
export class DiscordFailure extends TradingError {
 constructor(code:string,readonly ambiguous=false,readonly retryAfter=0,readonly statusCode=503,readonly apiCode:number|null=null){super(code,statusCode);}
}
async function responseJson(response:Response){return JSON.parse(Buffer.from(await readBody(new Request('https://local.invalid',{method:'POST',body:response.body,duplex:'half'} as RequestInit),2*1024*1024)).toString());}
export class DiscordClient {
 writeAccepted=false;
 constructor(readonly token:string,readonly budget:(route:string)=>Promise<void>,readonly pause:(route:string,seconds:number)=>Promise<void>,readonly fetcher:typeof fetch=fetch){}
 async call(path:string,method='GET',body?:Row|URLSearchParams,authorization=`Bot ${this.token}`):Promise<any>{
  if(!/^\/(?:guilds|channels|users|oauth2|applications|gateway)(?:\/|$)/.test(path)||path.includes('..')||path.includes('?')||path.includes('#'))throw new TradingError('invalid_discord_path');
  const bucket=path.replace(/\/members\/\d+/,'/members/:id').replace(/\/roles\/\d+/,'/roles/:id');
  await this.budget(bucket);
  let response:Response;
  try{response=await this.fetcher(`https://discord.com/api/v10${path}`,{method,headers:{Authorization:authorization,...(body?{'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json'}:{})},body:body?body instanceof URLSearchParams?body.toString():JSON.stringify(body):undefined,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)});}
  catch{throw new DiscordFailure('discord_network',method!=='GET');}
  if(response.status===429){let retry=60;let global=false;try{const data=await responseJson(response);global=data.global===true;retry=Math.min(86400,Math.max(1,Math.ceil(Number(data.retry_after)||60)));}catch{} await this.pause(global?'rest':bucket,retry);throw new DiscordFailure('discord_rate_limited',false,retry,429);}
  if(response.ok&&method!=='GET')this.writeAccepted=true;
  const reset=Number(response.headers.get('x-ratelimit-reset-after'));
  if(response.headers.get('x-ratelimit-remaining')==='0'&&Number.isFinite(reset))await this.pause(bucket,Math.ceil(reset));
  if(!response.ok){let code:number|null=null;try{const body=await responseJson(response);if(Number.isSafeInteger(body.code))code=body.code;}catch{}throw new DiscordFailure(`discord_http_${response.status}`,method!=='GET'&&response.status>=500,0,response.status,code);}
  if(method!=='GET')this.writeAccepted=true;
  if(response.status===204)return null;
  try{return await responseJson(response);}
  catch{throw new DiscordFailure('discord_invalid_response',method!=='GET');}
 }
 async member(guild:string,user:string){try{return object(await this.call(`/guilds/${snowflake(guild)}/members/${snowflake(user)}`));}catch(e){if(e instanceof DiscordFailure&&e.statusCode===404&&e.apiCode===10007)return null;throw e;}}
 async message(channel:string,job:string,payload:Row){const result=object(await this.call(`/channels/${snowflake(channel)}/messages`,'POST',{...payload,nonce:hash(job).slice(0,24),enforce_nonce:true,allowed_mentions:{parse:[]}}));return snowflake(result.id);}
}
export function authorizeUrl(state:string,env=process.env){
 if(!env.DISCORD_CLIENT_SECRET)throw new TradingError('discord_not_configured',503);
 const query=new URLSearchParams({client_id:snowflake(env.DISCORD_CLIENT_ID),redirect_uri:`${appOrigin(env)}/api/community/callback`,response_type:'code',scope:'identify guilds.join',state,prompt:'consent'});
 return `https://discord.com/oauth2/authorize?${query}`;
}
export function milestoneMessage(payload:Row,link:Row|null){
 const paid=payload.event==='payout_paid';const named=link?.state==='linked'&&link.milestones===true;
 const amount=paid&&named&&link.show_amount===true?` · $${(Number(payload.amount_cents)/100).toFixed(2)}`:'';
 return {embeds:[{title:paid?'Payout completed':'Evaluation passed',description:`${named?`<@${snowflake(link!.discord_id)}>`:'A Certa trader'} ${paid?'received a payout':'passed an evaluation'}${amount}.`,color:paid?0x3ba55d:0x5865f2,footer:{text:'Certa Futures · confirmed account event'}}]};
}
