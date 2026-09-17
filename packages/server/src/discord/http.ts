import 'server-only';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { authorized, cors, principal } from '../request';
import { exact, object, readBody, string, uuid, TradingError, type Row } from '../tradara/contracts';
import { DiscordStore } from './store';
import { authorizeUrl, appOrigin, DiscordClient, discordConfig, hash, snowflake } from './provider';
import { verifiedPnl } from './stats';
const roleKinds=['connected','evaluation','funded','summit','bronze','crown','founding'];
const cookieName='certa-discord-state';
function cookie(value:string,seconds:number){return `${cookieName}=${value}; Path=/api/community; HttpOnly; SameSite=Lax; Max-Age=${seconds}${appOrigin().startsWith('https:')?'; Secure':''}`;}
const linkFields='user_id,discord_id,username,state,daily_pnl,weekly_pnl,milestones,show_amount,nickname,member,connected_at,synced_at,error_code';
export { publicCommunity } from './public';
import { publicCommunity, inviteUrl } from './public';
export async function communityResponse(request:Request,segments:string[],staff=false):Promise<Response>{
 let headers=new Headers({'Cache-Control':'private, no-store'});
 try{
  headers=cors(request);const path=segments.join('/');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
  if(!staff&&path==='live'&&request.method==='GET')return reply(await publicCommunity());
  const who=await principal(request,staff);const store=new DiscordStore();
  if(staff)authorized(who,request.method==='GET'?'discord:read':path.startsWith('roles/')||path==='founding'||path==='commands/register'?'discord:config':'discord:manage');
  const user=staff&&segments[0]==='users'?uuid(segments[1]):who.id;
  if(!staff&&path==='callback'&&request.method==='GET'){
   headers.set('Set-Cookie',cookie('',0));headers.set('Referrer-Policy','no-referrer');
   const url=new URL(request.url);const state=url.searchParams.get('state')??'';
   const stored=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${cookieName}=`))?.slice(cookieName.length+1)??'';
   if(!/^[A-Za-z0-9_-]{43}$/.test(state)||state.length!==stored.length||!timingSafeEqual(Buffer.from(state),Buffer.from(stored)))throw new TradingError('oauth_state_mismatch',403);
   const epoch=await store.rpc('oauth_consume',{p_user:who.id,p_hash:hash(state)});
   if(url.searchParams.has('error'))throw new TradingError('oauth_denied',400);
   const config=discordConfig();const client=new DiscordClient(config.token,r=>store.budget(r),async(r,s)=>{await store.rpc('pause',{p_id:r,p_seconds:s});});
   const code=string(url.searchParams.get('code'),'code',2048);
   const tokens=object(await client.call('/oauth2/token','POST',new URLSearchParams({client_id:config.client,client_secret:process.env.DISCORD_CLIENT_SECRET??'',grant_type:'authorization_code',code,redirect_uri:`${appOrigin()}/api/community/callback`}),''));
   const token=string(tokens.access_token,'token',4096);
   try{
    const profile=object(await client.call('/users/@me','GET',undefined,`Bearer ${token}`));
    await store.rpc('link',{p_user:who.id,p_epoch:epoch,p_discord:snowflake(profile.id),p_username:string(profile.username,'username',100)});
    // Identity linking succeeds independently of guild invitation acceptance. No tokens stored.
    try{await client.call(`/guilds/${config.guild}/members/${snowflake(profile.id)}`,'PUT',{access_token:token});}catch{/* Dashboard exposes membership via role sync and the invite link. */}
    await store.rpc('queue_roles',{p_user:who.id});
   }finally{
    try{await client.call('/oauth2/token/revoke','POST',new URLSearchParams({client_id:config.client,client_secret:process.env.DISCORD_CLIENT_SECRET??'',token}), '');}catch{/* Short-lived token is discarded, never persisted. */}
   }
   headers.set('Location',`${appOrigin()}/community?connected=1`);return new Response(null,{status:303,headers});
  }
  if(request.method==='GET'){
   if(path==='status'||staff&&/^users\/[^/]+\/status$/.test(path)){
    const {data:link,error}=await store.db.from('cd_links').select(linkFields).eq('user_id',user).maybeSingle();if(error)throw new TradingError('discord_store_unavailable',503);
    return reply({link,invite_url:inviteUrl(),configured:!!process.env.DISCORD_CLIENT_ID,delivery_enabled:process.env.DISCORD_DELIVERY_ENABLED==='true'});
   }
   if(staff&&path==='links'){
    const query=new URL(request.url).searchParams;let q=store.db.from('cd_links').select(linkFields).order('user_id').limit(50);
    if(query.get('user'))q=q.eq('user_id',uuid(query.get('user')));if(query.get('discord'))q=q.eq('discord_id',snowflake(query.get('discord')));if(query.get('cursor'))q=q.gt('user_id',uuid(query.get('cursor')));
    const {data,error}=await q;if(error)throw new TradingError('discord_store_unavailable',503);return reply(data);
   }
   if(staff&&['jobs','audit','roles','runtime'].includes(path)){
    let q=store.db.from(`cd_${path}`).select(path==='jobs'?'id,user_id,kind,state,attempts,error_code,message_id,channel_id,created_at':'*').limit(50);
    const query=new URL(request.url).searchParams;
    if(path==='jobs'){q=q.order('id');const state=query.get('state');if(state){if(!['failed','unknown','queued','sent','running','cancelled'].includes(state))throw new TradingError('invalid_state');q=q.eq('state',state);}if(query.get('cursor'))q=q.gt('id',uuid(query.get('cursor')));}
    if(path==='roles')q=q.order('active',{ascending:false});
    if(path==='audit')q=q.order('created_at',{ascending:false});
    const {data,error}=await q;if(error)throw new TradingError('discord_store_unavailable',503);return reply(data);
   }
   if(!staff&&path==='accounts'){
    const {data,error}=await store.db.from('ct_accounts').select('id,kind,lifecycle').eq('user_id',who.id).order('id').limit(50);if(error)throw new TradingError('discord_store_unavailable',503);return reply(data);
   }
   throw new TradingError('not_found',404);
  }
  if(request.method!=='POST')throw new TradingError('method_not_allowed',405);
  if(!request.headers.get('content-type')?.includes('application/json'))throw new TradingError('json_required',415);
  let body:Row;try{body=object(JSON.parse(Buffer.from(await readBody(request,16384)).toString()));}catch{throw new TradingError('invalid_json');}
  if(!await store.rpc('limit',{p_id:`actions:${who.id}`,p_max:20,p_seconds:60}))throw new TradingError('cooldown',429);
  if(!staff&&path==='connect'){
   exact(body,[]);if(!who.emailVerified)throw new TradingError('verified_email_required',409);
   const state=randomBytes(32).toString('base64url');const url=authorizeUrl(state);
   await store.rpc('oauth_begin',{p_user:who.id,p_hash:hash(state)});headers.set('Set-Cookie',cookie(state,600));return reply({url});
  }
  if(path==='disconnect'&&!staff||staff&&/^users\/[^/]+\/disconnect$/.test(path)){
   exact(body,staff?['reason']:[]);await store.rpc('disconnect',{p_actor:who.id,p_user:user,p_reason:staff?string(body.reason,'reason',500):'User disconnected'});return reply({cleanup_pending:true},202);
  }
  if(path==='sync'&&!staff||staff&&/^users\/[^/]+\/sync$/.test(path)){
   exact(body,[]);await store.rpc('queue_roles',{p_user:user});return reply({queued:true},202);
  }
  if(!staff&&path==='preferences'){
   exact(body,['daily_pnl','weekly_pnl','milestones','show_amount']);if(body.weekly_pnl!==undefined&&typeof body.weekly_pnl!=='boolean')throw new TradingError('invalid_preferences');if(['daily_pnl','milestones','show_amount'].some(k=>typeof body[k]!=='boolean'))throw new TradingError('invalid_preferences');
   await store.rpc('preferences',{p_user:who.id,p_daily:body.daily_pnl,p_weekly:body.weekly_pnl??null,p_milestones:body.milestones,p_amount:body.show_amount});return reply({saved:true});
  }
  if(!staff&&path==='nickname'){
   exact(body,['nickname']);const nick=body.nickname===null?null:string(body.nickname,'nickname',32);if(nick&&/[\n\r@<>]/.test(nick))throw new TradingError('invalid_nickname');await store.rpc('nickname',{p_user:who.id,p_nickname:nick});return reply({queued:true},202);
  }
  if(!staff&&['share','preview'].includes(path)){
   exact(body,['account_id','period']);const account=uuid(body.account_id),period=string(body.period,'period',106);const card=await verifiedPnl(store,who.id,account,period);
   if(path==='preview')return reply(card);
   const link=await store.one('links','user_id',who.id);if(link?.state!=='linked')throw new TradingError('not_linked',409);
   await store.enqueue(`share:${link.generation}:${account}:${period}`,who.id,'share',{account_id:account,period},String(link.generation));return reply({queued:true},202);
  }
  if(staff&&segments[0]==='roles'&&segments.length===2){
   exact(body,['role_id','reason']);if(!roleKinds.includes(segments[1]!))throw new TradingError('invalid_role');
   const role=body.role_id===null?null:snowflake(body.role_id);if(role===process.env.DISCORD_GUILD_ID)throw new TradingError('invalid_role');
   await store.rpc('config_role',{p_actor:who.id,p_kind:segments[1],p_role:role,p_reason:string(body.reason,'reason',500)});return reply({saved:true});
  }
  if(staff&&path==='commands/register'){
   exact(body,['reason']);const reason=string(body.reason,'reason',500);
   await store.rpc('register_commands',{p_actor:who.id,p_reason:reason});return reply({queued:true},202);
  }
  if(staff&&path==='founding'){
   exact(body,['user_id','reason']);const target=uuid(body.user_id),reason=string(body.reason,'reason',500);
   await store.rpc('founding',{p_actor:who.id,p_user:target,p_reason:reason});return reply({saved:true});
  }
  if(staff&&segments[0]==='jobs'&&segments.length===3&&['retry','cancel'].includes(segments[2]!)){
   exact(body,['reason']);await store.rpc('recover',{p_actor:who.id,p_job:uuid(segments[1]),p_action:segments[2],p_reason:string(body.reason,'reason',500)});return reply({saved:true});
  }
  throw new TradingError('not_found',404);
 }catch(error){return Response.json({error:error instanceof TradingError?error.code:'discord_unavailable'},{status:error instanceof TradingError?error.status:503,headers});}
}
export async function communityStream(request:Request){
 try{
  const configured=process.env.DISCORD_STREAM_ORIGIN;if(!configured)throw new Error();const url=new URL(configured);
  if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new Error();
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
  let upstream:Response;try{upstream=await fetch(`${url.origin}/events`,{cache:'no-store',signal:AbortSignal.any([request.signal,controller.signal]),redirect:'error'});}finally{clearTimeout(timeout);}
  if(!upstream.ok||!upstream.headers.get('content-type')?.includes('text/event-stream')){await upstream.body?.cancel();throw new Error();}
  return new Response(upstream.body,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
 }catch{return Response.json({error:'community_stream_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
