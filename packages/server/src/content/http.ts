import 'server-only';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { authorized, cors, principal } from '../request';
import { TradingError, exact, object, readBody, string, uuid } from '../tradara/contracts';
import { emailAddress, type RenderedEmail } from '../email/schema';
import { answer, newsletter, newsletterFixture, newsletterSchema, page, puzzle, templates, text, UNSUBSCRIBE_MARKER, type Newsletter } from './schema';
import { checked, contentStore, rpc } from './store';
import { normalizeImage } from './images';
import { generateDraft } from './anthropic';
import type { NewsletterProps } from '../email/templates/newsletter';
export type Renderer = (props:NewsletterProps)=>RenderedEmail;
const puzzleColumns='id,revision,prompt,image_id,answer_mask,reward_ticket_id,reward_cap,claimed,live_on,starts_at,ends_at,state,created_at';
const issueColumns='id,revision,content,template_version,state,published_at,created_at,updated_at';
const deliveryColumns='id,issue_id,subscriber_id,state,attempts,provider_id,last_error,updated_at';
function revision(value:unknown) { if(!Number.isInteger(value)||Number(value)<0)throw new TradingError('invalid_revision');return Number(value); }
export function answerHash(id:string,value:string,secret=process.env.PUZZLE_ANSWER_KEY) {
  if(!secret || secret.length<32)throw new TradingError('puzzle_not_configured',503);
  return createHmac('sha256',secret).update(`${id}:${answer(value)}`).digest('hex');
}
export async function contentResponse(request:Request,segments:string[],staff=false,render?:Renderer):Promise<Response> {
 let headers=new Headers({'Cache-Control':'private, no-store'});
 try {
  const path=segments.join('/');const url=new URL(request.url);
  const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
  // Possession of a random 256-bit unsubscribe token is sufficient. Never apply on GET (mail scanners).
  if(!staff && path==='newsletter/unsubscribe') {
   headers.set('Referrer-Policy','no-referrer');
   const token=url.searchParams.get('token')??'';
   if(!/^[a-f0-9]{64}$/.test(token))throw new TradingError('invalid_token');
   if(request.method==='GET')return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Unsubscribe</title><body><h1>Unsubscribe from Certa newsletters</h1><form method="post"><button type="submit">Confirm unsubscribe</button></form></body></html>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'"}});
   if(request.method==='POST'){await readBody(request,1024);await rpc(contentStore(),'unsubscribe',{p_token:token});return reply({unsubscribed:true});}
   throw new TradingError('method_not_allowed',405);
  }
  headers=cors(request);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const publicRead=!staff&&request.method==='GET'&&(path==='puzzles/current'||path==='newsletter/issues'||segments[0]==='newsletter'&&segments[1]==='issues'&&segments.length===4&&segments[3]==='render');
  const who=publicRead?null:await principal(request,staff);
  if(staff&&who)authorized(who,'content:read');
  const db=contentStore();const paging=page(url);
  const assetUrls=async(ids:string[])=>{
   if(!ids.length)return {};
   const rows=checked(await db.from('cn_assets').select('id,path').in('id',[...new Set(ids)]));
   if(rows.length!==new Set(ids).size)throw new TradingError('image_not_found',404);
   return Object.fromEntries(rows.map(a=>[a.id,db.storage.from('certa-content').getPublicUrl(a.path).data.publicUrl]));
  };
  const getIssue=async(id:string)=>checked(await db.from('cn_issues').select('*').eq('id',uuid(id)).maybeSingle());
  const renderIssue=async(content:unknown)=>{
   if(!render)throw new TradingError('renderer_unavailable',503);
   const c=newsletter(content);
   const postal=text(process.env.NEWSLETTER_POSTAL_ADDRESS,'postal_address',500);
   const origin=process.env.CERTA_WEB_ORIGIN;
   if(!origin)throw new TradingError('newsletter_not_configured',503);
   return render({content:c,images:await assetUrls(c.sections.flatMap(s=>s.image_id?[s.image_id]:[])),unsubscribe:`${new URL('/api/content/newsletter/unsubscribe',origin).href}?token=${UNSUBSCRIBE_MARKER}`,postalAddress:postal});
  };
  if(!staff && request.method==='GET') {
   if(path==='puzzles/current') {
    const now=new Date().toISOString();
    const items=checked(await db.from('cn_puzzles').select(puzzleColumns).eq('state','scheduled').lte('starts_at',now).gt('ends_at',now).limit(1));
    const item=items[0];return reply({item:item?{...item,images:await assetUrls(item.image_id?[item.image_id]:[])}:null});
   }
   if(path==='newsletter/issues')return reply({items:checked(await db.from('cn_issues').select('id,content,published_at,template_version').not('published_at','is',null).neq('state','cancelled').order('published_at',{ascending:false}).range(paging.from,paging.to))});
   if(segments[0]==='newsletter' && segments[1]==='issues' && segments.length===4 && segments[3]==='render'){
    const issue=await getIssue(segments[2]);
    if(!issue.published_at || issue.state==='cancelled')throw new TradingError('not_found',404);
    return reply({id:issue.id,template_version:issue.template_version,...issue.rendered});
   }
  }
  if(!who)throw new TradingError('not_found',404);
  if(request.method==='GET') {
   if(!staff && path==='puzzles/rewards') {
    let query=db.from('cn_puzzle_rewards').select('id,puzzle_id,reward_ticket_id,state,ticket_grant_id,created_at,completed_at').eq('user_id',who.id);
    const puzzleId=url.searchParams.get('puzzle_id');
    if(puzzleId!==null)query=query.eq('puzzle_id',uuid(puzzleId));
    return reply({items:checked(await query.order('created_at',{ascending:false}).range(paging.from,paging.to))});
   }
   if(staff) {
    if(path==='newsletter/templates')return reply({items:templates,schema:newsletterSchema,fixture:newsletterFixture});
    if(path==='newsletter/issues')return reply({items:checked(await db.from('cn_issues').select(issueColumns).order('created_at',{ascending:false}).range(paging.from,paging.to))});
    if(path==='newsletter/subscribers')return reply({items:checked(await db.from('newsletter_subscribers').select('id,email,status,source,consented_at,created_at').order('created_at',{ascending:false}).range(paging.from,paging.to))});
    if(path==='assets')return reply({items:checked(await db.from('cn_assets').select('id,path,mime,bytes,created_at').order('created_at',{ascending:false}).range(paging.from,paging.to)).map(a=>({...a,url:db.storage.from('certa-content').getPublicUrl(a.path).data.publicUrl}))});
    if(path==='puzzles')return reply({items:checked(await db.from('cn_puzzles').select(puzzleColumns).order('live_on',{ascending:false}).range(paging.from,paging.to))});
    if(path==='puzzles/rewards')return reply({items:checked(await db.from('cn_puzzle_rewards').select('*').order('created_at',{ascending:false}).range(paging.from,paging.to))});
    if(segments[0]==='puzzles'&&segments.length===2){const item=checked(await db.from('cn_puzzles').select(puzzleColumns).eq('id',uuid(segments[1])).maybeSingle());return reply({item:{...item,images:await assetUrls(item.image_id?[item.image_id]:[])}});}
    if(segments[0]==='newsletter'&&segments[1]==='generations'&&segments.length===3){
      const item=checked(await db.from('cn_generations').select('id,created_by,state,result,error,created_at').eq('id',uuid(segments[2])).maybeSingle());
      if(item.state==='running'&&Date.parse(item.created_at)<Date.now()-120000){item.state='unknown';item.error='generation_interrupted';}
      return reply({item});
    }
    if(segments[0]==='newsletter'&&segments[1]==='issues'&&segments.length>=3){
     const issue=await getIssue(segments[2]);
     if(segments.length===3){const {rendered,sender,reply_to,...item}=issue;return reply({item});}
     if(segments.length===4&&segments[3]==='render')return reply({id:issue.id,revision:issue.revision,template_version:issue.template_version,...(issue.rendered??await renderIssue(issue.content))});
     if(segments.length===4&&segments[3]==='deliveries')return reply({items:checked(await db.from('cn_deliveries').select(deliveryColumns).eq('issue_id',issue.id).order('id').range(paging.from,paging.to))});
    }
   }
   throw new TradingError('not_found',404);
  }
  if(request.method!=='POST')throw new TradingError('method_not_allowed',405);
  if(staff&&path==='assets') {
   authorized(who,'content:write');
   const image=await normalizeImage(await readBody(request,4194304));
   const id=randomUUID(), assetPath=`${id}.webp`;
   checked(await db.storage.from('certa-content').upload(assetPath,image.data,{contentType:image.mime,cacheControl:'31536000',upsert:false}));
   // A crash here can leave an unreferenced object, never a reused/overwritten URL.
   checked(await db.from('cn_assets').insert({id,path:assetPath,mime:image.mime,bytes:image.data.length,created_by:who.id}).select('id,path,mime,bytes').single());
   return reply({id,url:db.storage.from('certa-content').getPublicUrl(assetPath).data.publicUrl,mime:image.mime},201);
  }
  let body:Record<string,unknown>;
  try{body=object(JSON.parse(new TextDecoder().decode(await readBody(request,80000))));}catch(e){if(e instanceof TradingError)throw e;throw new TradingError('invalid_json');}
  if(!staff){
   if(path==='newsletter/subscribe'){
    exact(body,['consent','email']);if(body.consent!==true)throw new TradingError('consent_required');
    if(!who.emailVerified||!who.email)throw new TradingError('verified_email_required',403);
    if(body.email!==undefined && (typeof body.email!=='string' || body.email.trim().toLowerCase()!==who.email.toLowerCase()))throw new TradingError('email_mismatch');
    await rpc(db,'subscribe',{p_email:emailAddress(who.email).toLowerCase()});return reply({subscribed:true});
   }
   if(segments[0]==='puzzles'&&segments.length===3&&segments[2]==='guess'){
    exact(body,['guess']);if(!who.emailVerified)throw new TradingError('verified_email_required',403);
    const id=uuid(segments[1]);
    const result=await rpc(db,'guess',{p_user:who.id,p_id:id,p_hash:answerHash(id,string(body.guess,'guess',64))});
    // The ticket trigger completes a newly inserted reward in the same transaction.
    if(result.correct===true)result.reward=checked(await db.from('cn_puzzle_rewards').select('id,puzzle_id,reward_ticket_id,state,ticket_grant_id,created_at,completed_at').eq('user_id',who.id).eq('puzzle_id',id).single());
    return reply(result,result.error==='rate_limited'?429:result.error?409:200);
   }
   throw new TradingError('not_found',404);
  }
  if(path==='newsletter/render') {authorized(who,'content:write');return reply(await renderIssue(body));}
  if(path==='newsletter/generate') {
   authorized(who,'content:generate');exact(body,['template','brief','image_ids']);
   if(!templates.some(t=>t.id===body.template)||!Array.isArray(body.image_ids)||body.image_ids.length>4)throw new TradingError('invalid_generation');
   if(!process.env.ANTHROPIC_API_KEY||!process.env.ANTHROPIC_NEWSLETTER_MODEL)throw new TradingError('anthropic_not_configured',503);
   const input={template:body.template as Newsletter['template'],brief:text(body.brief,'brief',12000),image_ids:body.image_ids.map(uuid)};
   const key=string(request.headers.get('idempotency-key'),'idempotency_key',100);
   if(!/^[A-Za-z0-9_-]{8,100}$/.test(key))throw new TradingError('invalid_idempotency_key');
   const start=await rpc(db,'generation_begin',{p_actor:who.id,p_key:key,p_hash:createHash('sha256').update(JSON.stringify(input)).digest('hex')});
   if(!start.run)return reply({item:start.item},start.item.state==='completed'?200:202);
   try {
    const images=[];
    for(const id of input.image_ids){
     const row=checked(await db.from('cn_assets').select('path,mime').eq('id',id).single());
     const blob=checked(await db.storage.from('certa-content').download(row.path));
     images.push({id,mime:row.mime,base64:Buffer.from(await blob.arrayBuffer()).toString('base64')});
    }
    const result=await generateDraft({template:input.template,brief:input.brief,images});
    checked(await db.from('cn_generations').update({state:'completed',result}).eq('id',start.item.id).select('id').single());
    return reply({id:start.item.id,...result});
   }catch(e){
    const code=e instanceof TradingError&&e.code!=='content_store_unavailable'?e.code:'generation_unknown';
    await db.from('cn_generations').update({state:code==='generation_unknown'?'unknown':'failed',error:code}).eq('id',start.item.id);
    return reply({id:start.item.id,error:code},502);
   }
  }
  if(path==='newsletter/issues') {
   authorized(who,'content:write');exact(body,['id','revision','content']);
   const content=newsletter(body.content);await assetUrls(content.sections.flatMap(s=>s.image_id?[s.image_id]:[]));
   return reply({item:await rpc(db,'save_issue',{p_actor:who.id,p_id:uuid(body.id),p_revision:revision(body.revision),p_content:content})});
  }
  if(segments[0]==='newsletter'&&segments[1]==='issues'&&segments.length===4){
   const id=uuid(segments[2]);
   if(segments[3]==='live'){
    authorized(who,'content:publish');exact(body,['revision']);const rev=revision(body.revision);const issue=await getIssue(id);
    if(issue.published_at)return reply({item:{id:issue.id,state:issue.state,published_at:issue.published_at}});
    if(issue.revision!==rev)throw new TradingError('conflict',409);
    const sender=string(process.env.EMAIL_FROM,'sender',320); emailAddress(sender.match(/<([^<>]+)>$/)?.[1]??sender);
    if(/[\r\n]/.test(sender))throw new TradingError('invalid_sender');
    const replyTo=process.env.EMAIL_REPLY_TO?emailAddress(process.env.EMAIL_REPLY_TO):null;
    return reply({item:await rpc(db,'publish_issue',{p_actor:who.id,p_id:id,p_revision:rev,p_rendered:await renderIssue(issue.content),p_sender:sender,p_reply_to:replyTo})});
   }
   if(segments[3]==='cancel'){authorized(who,'content:publish');exact(body,[]);await rpc(db,'cancel_issue',{p_actor:who.id,p_id:id});return reply({cancelled:true});}
  }
  if(path==='puzzles'){
   authorized(who,'content:write');exact(body,['id','revision','puzzle']);const id=uuid(body.id),data=puzzle(body.puzzle);
   if(data.image_id)await assetUrls([data.image_id]);
   const {answer:solution,...safe}=data;
   return reply({item:await rpc(db,'save_puzzle',{p_actor:who.id,p_id:id,p_revision:revision(body.revision),p_data:{...safe,answer_hash:answerHash(id,solution),answer_mask:'_'.repeat(solution.length)}})});
  }
  if(segments[0]==='puzzles'&&segments.length===3){
   authorized(who,'content:publish');const id=uuid(segments[1]);
   if(segments[2]==='schedule'){exact(body,['revision']);return reply({item:await rpc(db,'schedule_puzzle',{p_actor:who.id,p_id:id,p_revision:revision(body.revision)})});}
   if(segments[2]==='cancel'){exact(body,[]);await rpc(db,'cancel_puzzle',{p_actor:who.id,p_id:id});return reply({cancelled:true});}
  }
  throw new TradingError('not_found',404);
 }catch(e){const error=e instanceof TradingError?e:new TradingError('content_unavailable',503);return Response.json({error:error.code},{status:error.status,headers});}
}
