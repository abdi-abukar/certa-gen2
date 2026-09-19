import 'server-only';
import { authorized, cors, principal } from '../request';
import { TradingError, exact, object, readBody, string, uuid } from '../tradara/contracts';
import { claimCode, customerTicket, poolInput, prepareInventory } from './schema';
import { checked, ticketRpc, ticketStore } from './store';
export async function ticketsResponse(request:Request,segments:string[],staff=false):Promise<Response>{
 let headers=new Headers({'Cache-Control':'private, no-store'});
 try{
  headers=cors(request);if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const who=await principal(request,staff);if(staff)authorized(who,'tickets:read');
  const db=ticketStore(),path=segments.join('/'),url=new URL(request.url);
  const reply=(data:unknown,status=200)=>Response.json(data,{headers,status});
  const page=Number(url.searchParams.get('page')??0);if(!Number.isSafeInteger(page)||page<0||page>100000)throw new TradingError('invalid_page');
  if(request.method==='GET'){
   if(staff&&path==='pools')return reply({items:checked(await db.from('tk_pools').select('id,title,mode,per_user,quantity,state,created_at').order('created_at',{ascending:false}).range(page*50,page*50+49))});
   if(staff&&segments[0]==='pools'&&segments.length===2){
    const id=uuid(segments[1]);const item=checked(await db.from('tk_pools').select('*').eq('id',id).single());
    const codes=checked(await db.from('tk_codes').select('code,capacity,claimed').eq('pool_id',id).order('code').range(page*100,page*100+99));
    return reply({item,codes});
   }
   if(staff&&path==='manual')return reply({items:checked(await db.from('tk_tickets').select('id,pool_id,prize,user_id,manual_state,claimed_at').in('manual_state',['requested','completed']).order('claimed_at',{ascending:false}).range(page*50,page*50+49))});
   if(!staff&&path==='mine')return reply({items:checked(await db.from('tk_tickets').select('id,pool_id,title,prize,claimed_at,revealed_at,used_at,checkout_id,manual_state').eq('user_id',who.id).order('claimed_at',{ascending:false}).range(page*50,page*50+49)).map(customerTicket)});
   throw new TradingError('not_found',404);
  }
  if(request.method!=='POST')throw new TradingError('method_not_allowed',405);
  let body:Record<string,unknown>;try{body=object(JSON.parse(new TextDecoder().decode(await readBody(request,1500000))));}catch(e){if(e instanceof TradingError)throw e;throw new TradingError('invalid_json');}
  if(staff){
   authorized(who,'tickets:write');
   if(path==='pools'){
    const pool=poolInput(body),inventory=prepareInventory(pool);
    const id=uuid(request.headers.get('idempotency-key'));
    return reply(await ticketRpc('create',{p_actor:who.id,p_id:id,p_config:pool,p_prizes:inventory.prizes,p_codes:inventory.codes}),201);
   }
   if(segments[0]==='pools'&&segments.length===3&&segments[2]==='state'){
    exact(body,['state']);if(!['active','paused'].includes(String(body.state)))throw new TradingError('invalid_state');
    return reply(await ticketRpc('state',{p_actor:who.id,p_id:uuid(segments[1]),p_state:body.state}));
   }
   if(segments[0]==='manual'&&segments.length===2){exact(body,['reference']);return reply(await ticketRpc('manual',{p_user:null,p_actor:who.id,p_ticket:uuid(segments[1]),p_reference:string(body.reference,'reference',200)}));}
  }else{
   if(!who.emailVerified)throw new TradingError('verified_email_required',403);
   if(path==='claim'){exact(body,['code']);return reply(await ticketRpc('claim',{p_user:who.id,p_code:claimCode(body.code),p_key:uuid(request.headers.get('idempotency-key')),p_pool:null}).then(customerTicket));}
   if(segments.length===2&&segments[1]==='reveal'){exact(body,[]);return reply(customerTicket(await ticketRpc('reveal',{p_user:who.id,p_ticket:uuid(segments[0])})));}
   if(segments.length===2&&segments[1]==='request-prize'){exact(body,[]);return reply(await ticketRpc('manual',{p_user:who.id,p_actor:null,p_ticket:uuid(segments[0]),p_reference:null}));}
  }
  throw new TradingError('not_found',404);
 }catch(e){return Response.json({error:e instanceof TradingError?e.code:'tickets_unavailable'},{status:e instanceof TradingError?e.status:503,headers});}
}
