import 'server-only';
import { authorized, cors, principal } from '../request';
import { TradingError, object, readBody, string, uuid } from '../tradara/contracts';
import { AUTOMATED_EMAILS } from './transactional-catalog';
import { EMAIL_PREVIEW_CONTEXT, emailDataSchema, emailDefinition, renderTransactionalEmail, validateCopy } from './editor';
import { checked, emailRpc, emailStore } from './store';
import { generateEmailCopy } from './ai';
export async function emailAdminResponse(request:Request,segments:string[]):Promise<Response> {
 let headers=new Headers({'Cache-Control':'private, no-store'});
 try{
  headers=cors(request);if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const who=await principal(request,true);authorized(who,'emails:read');
  const path=segments.join('/'),reply=(value:unknown,status=200)=>Response.json(value,{headers,status});
  const db=emailStore();
  if(request.method==='GET'){
   if(path==='templates'){
    const templates=await emailRpc(db,'catalog') as {id:string;revision:number;enabled:boolean;category:string;copy:unknown}[];
    return reply({items:AUTOMATED_EMAILS.map(def=>{const row=templates.find(item=>item.id===def.id);if(!row)throw new TradingError('email_migration_required',503);return {...def,...row,schema:emailDataSchema(def.id)};})});
   }
   if(segments[0]==='history'&&segments.length===2){emailDefinition(segments[1]);return reply({items:checked(await db.from('ce_revisions').select('revision,copy,created_at,created_by').eq('template_id',segments[1]).order('revision',{ascending:false}).limit(30))});}
   if(path==='deliveries')return reply({items:checked(await db.from('ce_outbox').select('id,event_id,template_id,template_revision,state,attempts,provider_id,last_error,created_at').order('created_at',{ascending:false}).limit(100))});
   throw new TradingError('not_found',404);
  }
  if(request.method!=='POST')throw new TradingError('method_not_allowed',405);
  const body=object(JSON.parse(new TextDecoder().decode(await readBody(request,50000))));
  const id=string(body.id,'template',100),definition=emailDefinition(id);
  if(path==='preview')return reply(renderTransactionalEmail(id,EMAIL_PREVIEW_CONTEXT,definition.sample,validateCopy(id,body.copy)));
  authorized(who,'emails:write');
  if(path==='save'||path==='reset'){
   if(!Number.isInteger(body.revision)||Number(body.revision)<1)throw new TradingError('invalid_revision');
   const copy=validateCopy(id,path==='reset'?definition.defaults:body.copy);
   return reply({revision:await emailRpc(db,'save',{p_id:id,p_revision:body.revision,p_copy:copy,p_actor:who.id}),copy});
  }
  if(path==='generate'){
   authorized(who,'emails:generate');
   const generationId=uuid(body.generationId),copy=validateCopy(id,body.copy),brief=string(body.brief,'brief',4000);
   if(!process.env.ANTHROPIC_API_KEY||!process.env.ANTHROPIC_NEWSLETTER_MODEL)throw new TradingError('anthropic_not_configured',503);
   const started=await emailRpc(db,'start_generation',{p_id:generationId,p_actor:who.id,p_template:id});
   if(!started){const existing=checked(await db.from('ce_generations').select('created_by,state,result').eq('id',generationId).single());if(existing.created_by!==who.id)throw new TradingError('permission_denied',403);if(existing.state!=='complete')throw new TradingError('generation_pending_or_unknown',409);return reply({copy:existing.result});}
   try{const result=await generateEmailCopy(id,copy,brief);checked(await db.from('ce_generations').update({state:'complete',result}).eq('id',generationId).select('id').single());return reply({copy:result});}
   catch(error){await db.from('ce_generations').update({state:error instanceof TradingError&&error.code==='generation_unknown'?'unknown':'failed',error:error instanceof TradingError?error.code:'generation_failed'}).eq('id',generationId);throw error;}
  }
  throw new TradingError('not_found',404);
 }catch(error){return Response.json({error:error instanceof TradingError?error.code:error instanceof SyntaxError?'invalid_json':'invalid_email_request'},{status:error instanceof TradingError?error.status:400,headers});}
}
