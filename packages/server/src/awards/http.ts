import 'server-only';
import {journeyProgress} from './progress';
import { createHash } from 'node:crypto';
import { authorized, cors, principal } from '../request';
import { TradingError, object, string, uuid, exact, readBody } from '../tradara/contracts';
import { awardsStore, checked, rpc } from './store';
import { design, designs, templateFixtures, validateCopy, editableCopy } from './catalog';
import { renderCert } from './render';
import { DiscordStore } from '../discord/store';
import { verifiedPnl } from '../discord/stats';
const issueColumns='id,user_id,award_id,source,account_id,payout_id,template_id,template_version,fields,snapshot,earned_at,created_at';
const renderColumns='id,issue_id,revision,template_id,template_version,state,error,created_at';
function revision(v:unknown){if(!Number.isInteger(v)||Number(v)<1)throw new TradingError('invalid_revision');return Number(v);}
function clean(v:unknown,name:string,max=200){const s=string(v,name,max);if(/[\u0000-\u001f<>]/.test(s))throw new TradingError(`invalid_${name}`);return s;}
export function look(value:unknown){const obj=object(value);const keys=['gender','hair','skinTone','hairColor','outfitColor','top','accessory','facialHair','background'];exact(obj,keys);return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,clean(v,k,40)]));}
export async function awardsResponse(request:Request,segments:string[],staff=false){
 let headers=new Headers({'Cache-Control':'private, no-store'});
 try{
  headers=cors(request);if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const who=await principal(request,staff);if(staff)authorized(who,'awards:read');
  const db=awardsStore(),path=segments.join('/'),url=new URL(request.url);
  const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
  const owner=staff&&url.searchParams.has('user_id')?uuid(url.searchParams.get('user_id')):who.id;
  const offset=Number(url.searchParams.get('offset')??0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new TradingError('invalid_offset');
  const getIssue=async(id:string)=>{let q=db.from('ca_issues').select(issueColumns).eq('id',uuid(id));if(!staff)q=q.eq('user_id',who.id);return checked(await q.maybeSingle());};
  if(request.method==='GET'){
   if(path==='catalog')return reply({items:checked(await db.from('ca_catalog').select('*').order('display_order'))});
   if(path==='issues'){let q=db.from('ca_issues').select(issueColumns).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+49);if(!staff||url.searchParams.has('user_id'))q=q.eq('user_id',owner);return reply({items:checked(await q)});}
   if(path==='accounts'){let q=db.from('ct_accounts').select('id,kind,lifecycle,vendor_updated_at').eq('user_id',owner).order('id').range(offset,offset+49);return reply({items:checked(await q)});}
   if(path==='look')return reply({look:checked(await db.from('ca_looks').select('look').eq('user_id',owner).limit(1))[0]?.look??{}});
   if(path==='templates'&&staff)return reply({items:checked(await db.from('ca_templates').select('*').order('id').order('version',{ascending:false}).range(offset,offset+49)),defaults:Object.fromEntries(Object.entries(designs).map(([id,spec])=>[id,Object.fromEntries(Object.entries(spec.defaults).filter(([key])=>editableCopy.has(key)))])),fixtures:templateFixtures,fields:Object.fromEntries(Object.entries(designs).map(([id,spec])=>[id,Object.keys(spec.layout)]))});
   if(path==='audit'&&staff)return reply({items:checked(await db.from('ca_audit').select('*').order('id',{ascending:false}).range(offset,offset+49))});
   if(segments[0]==='issues'&&segments.length===2){const issue=await getIssue(segments[1]);return reply({issue,renders:checked(await db.from('ca_renders').select(renderColumns).eq('issue_id',issue.id).order('revision',{ascending:false}).limit(50))});}
   if(segments[0]==='renders'&&segments.length===2){const item=checked(await db.from('ca_renders').select('id,issue_id,state,path').eq('id',uuid(segments[1])).single());await getIssue(item.issue_id);if(item.state!=='ready'||!item.path)throw new TradingError('render_not_ready',409);const file=checked(await db.storage.from('certa-awards').download(item.path));return new Response(file,{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','Content-Disposition':`inline; filename="certa-${item.id}.png"`}});}
   if(segments[0]==='accounts'&&segments.length===3&&segments[2]==='game'){
    const a=checked(await db.from('ct_accounts').select('id,user_id,kind,lifecycle,vendor_updated_at,data').eq('id',uuid(segments[1])).eq('user_id',owner).single());
    const awards=checked(await db.from('ca_issues').select('id,award_id,earned_at').eq('account_id',a.id).eq('user_id',owner).order('id').limit(50));
    let eligibility=null;if(a.kind==='funded'&&['active','locked'].includes(a.lifecycle)){const res=await db.rpc('cp_eligibility',{p_user:owner,p_account:a.id});if(!res.error)eligibility=res.data;}
    const stats=checked(await db.from('ct_records').select('data,vendor_updated_at').eq('account_id',a.id).eq('user_id',owner).eq('kind','stats').order('vendor_updated_at',{ascending:false}).limit(1))[0];
    const compliance=checked(await db.rpc('ct_compliance',{p_user:owner}));
    return reply({account:{id:a.id,kind:a.kind,lifecycle:a.lifecycle,compliance_pending:!(compliance.kyc&&compliance.tax&&compliance.agreement),as_of:a.vendor_updated_at},awards,eligibility,look:checked(await db.from('ca_looks').select('look').eq('user_id',owner).limit(1))[0]?.look??{},vendor_progress:{...journeyProgress(a,stats?.data??null),as_of:stats?.vendor_updated_at??null},funded_issued:a.kind==='funded'&&['active','locked'].includes(a.lifecycle)});
   }
   throw new TradingError('not_found',404);
  }
  if(request.method!=='POST')throw new TradingError('method_not_allowed',405);
  let b;try{b=object(JSON.parse(new TextDecoder().decode(await readBody(request,16000))));}catch(e){if(e instanceof TradingError)throw e;throw new TradingError('invalid_json');}
  if(path==='look'&&!staff){exact(b,['look']);const value=look(b.look);const res=await db.from('ca_looks').upsert({user_id:who.id,look:value});if(res.error)throw new TradingError('awards_store_unavailable',503);return reply({look:value});}
  if(!staff&&segments[0]==='issues'&&segments.length===3&&segments[2]==='share'){exact(b,['hide_name','hide_amount']);if(typeof b.hide_name!=='boolean'||typeof b.hide_amount!=='boolean')throw new TradingError('invalid_privacy');await getIssue(segments[1]);await rpc(db,'budget',{p_user:who.id});return reply({id:await rpc(db,'share',{p_user:who.id,p_issue:uuid(segments[1]),p_hide_name:b.hide_name,p_hide_amount:b.hide_amount})},202);}
  if(path==='share'&&!staff){
   exact(b,['account_id','period','hide_name','hide_amount']);if(typeof b.hide_name!=='boolean'||typeof b.hide_amount!=='boolean')throw new TradingError('invalid_privacy');
   await rpc(db,'budget',{p_user:who.id});
   const account=uuid(b.account_id),period=clean(b.period,'period',120);
   const result=await verifiedPnl(new DiscordStore(),who.id,account,period),card=result.embeds[0];
   const pnl=card.description.slice(card.description.lastIndexOf(': ')+2);const template=pnl.startsWith('-')?'loss':'win';
   const fields=Object.fromEntries(Object.keys(designs[template].layout).map(k=>[k,'']));
   Object.assign(fields,{brand:'CERTA FUTURES',title:card.title.toUpperCase(),handle:'CERTA TRADER',symbol:period.startsWith('trade:')?'TRADE':period,pnl:b.hide_amount?'HIDDEN':pnl,pnlLabel:'P&L',symbolLabel:'PERIOD',site:'CERTAFUTURES.COM',sign1:template==='loss'?'ROUGH':'GREEN',sign2:'TRADE',entryLabel:'SNAPSHOT',entry:card.footer.text.replace('Certa · ','')});
   const snapshot={period,account_id:account,evidence:card.footer.text,hide_name:b.hide_name,hide_amount:b.hide_amount};
   const hash=createHash('sha256').update(JSON.stringify({fields,snapshot})).digest('hex');
   const id=await rpc(db,'issue',{p_user:who.id,p_award:null,p_source:`share:${who.id}:${hash}`,p_account:account,p_payout:null,p_template:template,p_fields:fields,p_snapshot:snapshot,p_time:new Date().toISOString()});return reply({id},202);
  }
  if(!staff)throw new TradingError('not_found',404);
  authorized(who,'awards:write');
  if(path==='preview'){
   exact(b,['template','copy']);await rpc(db,'budget',{p_user:who.id});const id=clean(b.template,'template',30);let copy;try{copy=validateCopy(id,b.copy);}catch{throw new TradingError('invalid_copy');}
   const image=await renderCert(design(id,copy),{...templateFixtures[id],...copy,name:id==='passed'?'SAMPLE — NOT ISSUED':undefined,certNo:'SAMPLE — NOT ISSUED'});
   return reply({image:`data:image/png;base64,${image.toString('base64')}`});
  }
  if(path==='cohort'){exact(b,['user_id','reason']);authorized(who,'awards:issue');const result=await db.rpc('cd_founding',{p_actor:who.id,p_user:uuid(b.user_id),p_reason:clean(b.reason,'reason',1000)});if(result.error)throw new TradingError('awards_store_unavailable',503);return reply({issued:true});}
  if(segments.length!==2)throw new TradingError('not_found',404);
  exact(b,['revision','data','reason']);const reason=clean(b.reason,'reason',1000),rev=revision(b.revision);let data=object(b.data);const action=segments[0],id=segments[1];
  if(action==='catalog'){exact(data,['name','kicker','description','instructions','display_order']);data={name:clean(data.name,'name'),kicker:clean(data.kicker,'kicker'),description:clean(data.description,'description',2000),instructions:clean(data.instructions,'instructions',1000),display_order:data.display_order};if(!Number.isInteger(data.display_order)||Number(data.display_order)<0||Number(data.display_order)>1000)throw new TradingError('invalid_order');}
  else if(action==='draft'){try{data=validateCopy(id,data);}catch{throw new TradingError('invalid_copy');}}
  else if(action==='publish'){authorized(who,'awards:publish');exact(data,[]);}
  else if(action==='retry'){uuid(id);exact(data,[]);}
  else if(action==='correct'){authorized(who,'awards:issue');uuid(id);exact(data,['handle','name']);data=Object.fromEntries(Object.entries(data).map(([k,v])=>[k,clean(v,k,60)]));}
  else throw new TradingError('not_found',404);
  return reply({item:await rpc(db,'edit',{p_actor:who.id,p_kind:action,p_id:id,p_revision:rev,p_data:data,p_reason:reason})});
 }catch(e){const error=e instanceof TradingError?e:new TradingError('awards_unavailable',503);return Response.json({error:error.code},{status:error.status,headers});}
}
