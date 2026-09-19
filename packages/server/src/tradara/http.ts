import 'server-only';
import { allocationResponse } from './allocation-http';
import { accountActivity, dashboardSnapshot } from './dashboard';
import { createHash, randomBytes } from 'node:crypto';
import { principal, authorized, cors, type Principal } from '../request';
import { TradingStore, tradingStore } from './store';
import { exact, object, readBody, string, uuid, validateAction, permissions, TradingError, type Action, type Row } from './contracts';
import { parseEvent, project, verifyWebhook } from './events';
const accountActions: Record<string,Action> = {lock:'lock',unlock:'unlock','cancel-orders':'cancel-orders',flatten:'flatten','cash-adjustments':'cash-adjustment','max-loss-limit':'max-loss-limit',refresh:'refresh'};
const userActions: Record<string,Action> = {invitations:'invite',suspend:'suspend',restore:'restore','access/check':'access-check',refresh:'refresh'};
export async function tradingResponse(request: Request, segments: string[], staff = false): Promise<Response> {
  let headers=new Headers({'Cache-Control':'private, no-store'});
  try {
    headers=cors(request);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
    const who=await principal(request,staff);
    const store=tradingStore(); const path=segments.join('/'); const url=new URL(request.url);
    if(request.method==='GET'&&path==='launch'&&!staff) {
      const {data,error}=await store.db.from('ct_accounts').select('id').eq('user_id',who.id).eq('lifecycle','active').limit(1);
      if(error)throw new TradingError('trading_store_unavailable',503);
      return json({hasLiveAccount:Boolean(data?.length)},headers);
    }
    if(request.method==='GET'&&path==='dashboard') return json(await dashboardSnapshot(store,who.id,url.searchParams.get('cursor')??undefined),headers);
    if(request.method==='GET'&&segments[0]==='accounts'&&segments.length===3&&segments[2]==='activity') return json(await accountActivity(store,who.id,uuid(segments[1]),url),headers);
    const after=url.searchParams.get('cursor')??undefined; if(after) uuid(after);
    const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||50));
    const account=segments[0]==='accounts'&&segments[1]?await ownedAccount(store,uuid(segments[1]),who):null;
    let user=who.id;
    if(staff&&segments[0]==='users'&&segments[1]) user=uuid(segments[1]);
    if(account) user=String(account.user_id);
    const allocationContext={user,actor:who.id,staff,authorize:(permission:string)=>authorized(who,permission)};
    if(request.method==='GET') {
      const allocation=await allocationResponse(request,segments,store,allocationContext,headers);if(allocation)return allocation;
      if(path==='access'||staff&&segments[0]==='users'&&segments.slice(2).join('/')==='access') {
        const member=await store.one('memberships','user_id',user);
        const status=String(member?.status??'UNLINKED');
        return json({status,checked_at:member?.checked_at??null,requires_acceptance:['INVITED','PENDING_ACCEPTANCE'].includes(status),message:accessMessage(status),login_url:process.env.TRADARA_LOGIN_URL??null},headers);
      }
      if(path==='accounts') return json(await store.list('accounts',staff?{}:{user_id:user},after,limit),headers);
      if(path==='overview'&&staff) return json({runtime:await store.list('runtime'),pending:await store.list('operations',{state:'queued'},undefined,20)},headers);
      if(path==='provisioning'&&staff) return json(await store.list('operations',{action:'provision'},after,limit),headers);
      if(segments[0]==='operations'&&segments[1]&&segments.length===2) {
        const operation=await store.one('operations','id',uuid(segments[1]));
        if(!operation||!staff&&operation.user_id!==who.id) throw new TradingError('not_found',404);
        return json(operation,headers);
      }
      if(account&&segments.length<=3) {
        const resource=segments[2];
        if(!resource) return json(account,headers);
        if(resource==='summary') return json({account,records:(await Promise.all(['balances','stats'].map(kind=>store.list('records',{account_id:String(account.id),kind})))).flat()},headers);
        const kinds: Record<string,string>={trades:'trades','daily-stats':'daily-stats','cash-adjustments':'cash-adjustments',orders:'orders',positions:'positions',fills:'fills'};
        if(kinds[resource]) return json(await store.list('records',{account_id:String(account.id),kind:kinds[resource]},after,limit),headers);
        if(resource==='exposure'&&staff) return json({account,orders:await store.list('records',{account_id:String(account.id),kind:'orders'}),positions:await store.list('records',{account_id:String(account.id),kind:'positions'}),source:'snapshot',refresh_action:`/api/trading/accounts/${account.id}/refresh`},headers);
      }
      if(staff&&['catalog','market-data'].includes(path)) return json(await store.list('records',{kind:path==='catalog'?'catalog':'usage'},after,limit),headers);
      if(staff&&segments[0]==='users'&&segments[2]==='entitlements') return json(await store.list('records',{user_id:user,kind:'entitlements'},after,limit),headers);
      throw new TradingError('not_found',404);
    }
    if(request.method!=='POST') throw new TradingError('method_not_allowed',405);
    if(!request.headers.get('content-type')?.includes('application/json')) throw new TradingError('json_required',415);
    const bytes=await readBody(request); let body: Row;
    try {body=object(JSON.parse(Buffer.from(bytes).toString()));} catch {throw new TradingError('invalid_json');}
    const allocation=await allocationResponse(request,segments,store,allocationContext,headers,body);if(allocation)return allocation;
    if(path==='live-session') {
      exact(body,[]); const token=randomBytes(32).toString('base64url');
      const {error}=await store.db.from('ct_tickets').insert({id:createHash('sha256').update(token).digest('hex'),user_id:who.id,staff:who.staff,expires_at:new Date(Date.now()+30000).toISOString()});
      if(error) throw new TradingError('trading_store_unavailable',503);
      return json({ticket:token,url:process.env.TRADARA_LIVE_URL??null,expires_in:30},headers);
    }
    if(staff&&segments[0]==='users'&&segments[2]==='link') {
      authorized(who,'trading:provision'); exact(body,['vendor_user_id','reason']);
      const vendor=uuid(body.vendor_user_id); const reason=string(body.reason,'reason',500);
      const result=await store.rpc('admin_edit',{p_actor:who.id,p_user:user,p_action:'link',p_data:{vendor_user_id:vendor,firm_id:configuredFirm(),reason}});return json(result,headers,201);
    }
    if(staff&&segments[0]==='users'&&segments[2]==='adopt-account') {
      authorized(who,'trading:provision'); exact(body,['vendor_account_id','inventory_operation_id','kind','reason']);
      const inventory=await store.one('operations','id',uuid(body.inventory_operation_id));
      if(!inventory||inventory.user_id!==user||inventory.state!=='confirmed'||inventory.action!=='refresh'||object(inventory.payload).resource!=='accounts') throw new TradingError('verified_inventory_required',409);
      const rows=object(inventory.result).items;
      const row=Array.isArray(rows)?rows.find(row=>(row.id??row.account_id)===body.vendor_account_id):null;
      if(!row||!['evaluation','practice','funded'].includes(String(body.kind))) throw new TradingError('account_not_in_inventory',409);
      const result=await store.rpc('admin_edit',{p_actor:who.id,p_user:user,p_action:'adopt-account',p_data:{...body,firm_id:configuredFirm(),reason:string(body.reason,'reason',500)}});return json(result,headers,201);
    }
    if(staff&&segments[0]==='operations'&&segments.length===3&&segments[2]==='resolve') {
      authorized(who,'trading:recovery');exact(body,['resolution','evidence']);
      const result=await store.rpc('resolve',{p_id:uuid(segments[1]),p_actor:who.id,p_resolution:string(body.resolution,'resolution'),p_evidence:string(body.evidence,'evidence',1000)});
      return json(result,headers);
    }
    let action: Action|undefined;
    if(path==='access/check') action='access-check';
    if(path==='invitations/resend') action='invite';
    if(path==='practice') {
      exact(body,[]); const entitlements=await store.list('entitlements',{user_id:who.id,kind:'practice'});
      const eligible=entitlements.find(e=>!e.consumed_by&&(!e.expires_at||Date.parse(String(e.expires_at))>Date.now()));
      if(!eligible)throw new TradingError('not_entitled',409);action='provision';body={entitlement_id:eligible.id};
    }
    if(account&&staff&&segments.length===3) action=accountActions[segments[2]];
    if(staff&&segments[0]==='users') action=userActions[segments.slice(2).join('/')];
    if(staff&&path==='provision') {authorized(who,'trading:provision'); const entitlement=await store.one('entitlements','id',uuid(body.entitlement_id));if(!entitlement)throw new TradingError('not_found',404); user=String(entitlement.user_id);action='provision';}
    if(staff) {
      const global: Record<string,Action>={halt:'halt','halt/release':'halt-release','reconciliations/preview':'correction-preview',reconciliations:'correction','catalog/refresh':'catalog-refresh','market-data/refresh':'usage-refresh'};
      action=action??global[path];
    }
    if(!action)throw new TradingError('not_found',404);
    if(staff)authorized(who,permissions[action]);
    const payload=validateAction(action,body);
    const key=string(request.headers.get('idempotency-key'),'idempotency_key',100);
    if(!/^[A-Za-z0-9:_-]{8,100}$/.test(key))throw new TradingError('invalid_idempotency_key');
    const op=await store.rpc('enqueue',{p_actor:who.id,p_user:user,p_account:account?.id??null,p_action:action,p_key:key,p_payload:payload});
    return json({operation:op},headers,202);
  } catch(error) {
    return json({error:error instanceof TradingError?error.code:'trading_unavailable'},headers,error instanceof TradingError?error.status:503);
  }
}
const json=(value: unknown,headers: Headers,status=200)=>Response.json(value,{status,headers});
function configuredFirm(){if(!process.env.TRADARA_FIRM_ID)throw new TradingError('tradara_not_configured',503);return process.env.TRADARA_FIRM_ID;}
async function ownedAccount(store:TradingStore,id:string,who:Principal){const row=await store.one('accounts','id',id);if(!row||!who.staff&&row.user_id!==who.id)throw new TradingError('not_found',404);return row;}
function accessMessage(status:string){return ({INVITED:'Check your email and finish your Tradara invitation.',PENDING_ACCEPTANCE:'Sign in to Tradara and accept your Certa relationship.',ACTIVE:'Your Tradara relationship is active. Sign in with Tradara to continue.',SUSPENDED:'Your Tradara access is suspended. Contact support.',REVOKED:'Your Tradara access has been revoked. Contact support.'} as Record<string,string>)[status]??'Your latest Tradara access has not been verified.';}
export async function webhookResponse(request:Request):Promise<Response>{
 const headers={'Cache-Control':'no-store'};
 try {
  if(!process.env.TRADARA_WEBHOOK_SECRET||!process.env.TRADARA_FIRM_ID)throw new TradingError('webhook_not_configured',503);
  if(!request.headers.get('content-type')?.includes('application/json'))throw new TradingError('json_required',415);
  const bytes=await readBody(request,256*1024);verifyWebhook(bytes,request.headers.get('tradara-signature'),process.env.TRADARA_WEBHOOK_SECRET);
  let raw:Row;try{raw=object(JSON.parse(Buffer.from(bytes).toString()));}catch{throw new TradingError('invalid_json');}
  if(request.headers.get('tradara-event-id')!==raw.event_id)throw new TradingError('event_id_mismatch',400);
  const event=parseEvent(raw,'webhook',process.env.TRADARA_FIRM_ID);
  const result=await tradingStore(process.env,4000).rpc('ingest',{p_event:project(event)});
  return Response.json({received:true,result},{headers});
 }catch(error){return Response.json({error:error instanceof TradingError?error.code:'webhook_unavailable'},{status:error instanceof TradingError?error.status:503,headers});}
}
