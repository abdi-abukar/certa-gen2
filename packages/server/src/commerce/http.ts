import 'server-only';
import { authorized, cors, principal } from '../request';
import { exact, object, readBody, string, uuid, TradingError, type Row } from '../tradara/contracts';
import { assertPurchaseEmail, purchaseEvidence, purchaseTerms } from './policy';
import { CommerceStore, commerceUnavailable } from './store';
import { tradingStore } from '../tradara/store';
import { charge, publicProcessor, routingVersion, type Processor } from './providers';
const processors:Processor[]=['authnet','nmi','crypto'];
const processor=(value:unknown):Processor=>{if(!processors.includes(value as Processor))throw new TradingError('invalid_processor');return value as Processor;};
const integer=(value:unknown,min:number,max:number)=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw new TradingError('invalid_amount');return value;};
async function checked<T extends {error:unknown,data:unknown}>(query:PromiseLike<T>){const result=await query;if(result.error)throw commerceUnavailable(result.error);return result.data;}
export async function commerceResponse(request:Request,segments:string[],staff=false):Promise<Response>{
 let headers=new Headers({'Cache-Control':'private, no-store'});
 try{
  headers=cors(request);if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const actor=await principal(request,staff);if(!staff&&(!actor.emailVerified||!actor.email))throw new TradingError('verified_email_required',403);
  const store=new CommerceStore();const path=segments.join('/');const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
  if(staff)authorized(actor,request.method==='GET'?'commerce:read':path.endsWith('/reconcile')?'commerce:recovery':'commerce:config');
  if(request.method==='GET'){
   if(path==='catalog'){
    const [products,rails]=await Promise.all([checked(store.db.from('cm_products').select('id,label,price_cents,enabled').order('id').limit(100)),checked(store.db.from('cm_processors').select('*').order('id'))]);
    return reply({terms:purchaseTerms(),products:staff?products:(products as Row[]).filter(p=>p.enabled),processors:(rails as Row[]).map(row=>staff?{...row,credential_status:'managed_on_web'}:{...row,...publicProcessor(row.id as Processor)})});
   }
   if(path==='creator'&&!staff)return reply(await store.rpc('creator',{p_user:actor.id}));
   if(path==='context'&&!staff){
    const [profile,creator,allocation,evaluation_count]=await Promise.all([checked(store.db.from('cu_profiles').select('first_name,last_name,country').eq('user_id',actor.id).maybeSingle()),store.rpc('creator',{p_user:actor.id}),tradingStore().rpc('allocation_snapshot',{p_user:actor.id}),tradingStore().rpc('evaluation_count',{p_user:actor.id})]);
    return reply({profile,creator,allocation,evaluation_count});
   }
   if(path==='creators'&&staff){const after=new URL(request.url).searchParams.get('after');let query=store.db.from('cp_codes').select('code,audience_discount_bps').eq('state','approved').order('code').limit(101);if(after)query=query.gt('code',string(after,'after',32));const rows=await checked(query) as Row[];return reply({items:rows.slice(0,100),next:rows.length>100?rows[99].code:null});}
   if(path==='current'&&!staff){const rows=await checked(store.db.from('cm_checkouts').select('id').eq('user_id',actor.id).in('state',['open','pending']).limit(1)) as Row[];return reply(rows[0]?await store.snapshot(String(rows[0].id),actor.id):null);}
   if(staff&&path==='coupons')return reply(await checked(store.db.from('cm_coupons').select('*').order('code').limit(100)));
   if(path==='history'){const cursor=new URL(request.url).searchParams.get('before');let query=store.db.from('cm_checkouts').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(51);if(!staff)query=query.eq('user_id',actor.id);if(cursor)query=query.lt('created_at',new Date(string(cursor,'before',60)).toISOString());const rows=await checked(query) as Row[];return reply({items:rows.slice(0,50),next:rows.length>50?rows[49].created_at:null});}
   if(/^checkouts\/[^/]+$/.test(path))return reply(await store.snapshot(uuid(segments[1]),staff?undefined:actor.id));
  }
  if(request.method!=='POST')throw new TradingError('not_found',404);
  let body:Row;try{body=object(JSON.parse(new TextDecoder().decode(await readBody(request,20000))));}catch(error){if(error instanceof TradingError)throw error;throw new TradingError('invalid_json',400);}
  if(staff){
   if(path==='creator-discount'){exact(body,['code','discount_bps','reason']);await store.rpc('creator_configure',{p_actor:actor.id,p_code:string(body.code,'code',32),p_bps:integer(body.discount_bps,0,10000),p_reason:string(body.reason,'reason',500)});return reply({saved:true});}
   if(path==='coupons'){exact(body,['code','kind','value','enabled','total_limit','per_user_limit','starts_at','ends_at','email','reason']);if(!['percent','amount'].includes(String(body.kind))||typeof body.enabled!=='boolean')throw new TradingError('invalid_coupon');await store.rpc('configure',{p_actor:actor.id,p_kind:'coupon',p_id:string(body.code,'code',60).toUpperCase(),p_data:{...body,value:integer(body.value,1,body.kind==='percent'?100:10000000),per_user_limit:integer(body.per_user_limit,1,1000000),total_limit:body.total_limit===null?null:integer(body.total_limit,1,1000000),reason:string(body.reason,'reason',500)}});return reply({saved:true});}
   if(path==='coupon-status'){exact(body,['code','enabled','reason']);if(typeof body.enabled!=='boolean')throw new TradingError('invalid_enabled');await store.rpc('configure',{p_actor:actor.id,p_kind:'coupon-status',p_id:string(body.code,'code',60),p_data:{enabled:body.enabled,reason:string(body.reason,'reason',500)}});return reply({saved:true});}
   if(path==='products'){exact(body,['id','label','price_cents','enabled','reason']);if(typeof body.enabled!=='boolean')throw new TradingError('invalid_enabled');await store.rpc('configure',{p_actor:actor.id,p_kind:'product',p_id:string(body.id,'id',100),p_data:{label:string(body.label,'label',100),price_cents:integer(body.price_cents,50,10000000),enabled:body.enabled,reason:string(body.reason,'reason',500)}});return reply({saved:true});}
   if(path==='processors'){exact(body,['id','enabled','routing_version','reason']);if(typeof body.enabled!=='boolean')throw new TradingError('invalid_enabled');await store.rpc('configure',{p_actor:actor.id,p_kind:'processor',p_id:processor(body.id),p_data:{enabled:body.enabled,routing_version:integer(body.routing_version,1,1000000),reason:string(body.reason,'reason',500)}});return reply({saved:true});}
   if(/^attempts\/[^/]+\/reconcile$/.test(path)){exact(body,['reference','reason']);const id=uuid(segments[1]);const reason=string(body.reason,'reason',500);const reference=body.reference?string(body.reference,'reference',200):undefined;await checked(store.db.from('cm_events').insert({actor_id:actor.id,action:'reconcile-request',data:{attempt:id,reason,reference:reference??null}}));const {data:attempt}=await store.db.from('cm_attempts').select('processor,provider_reference,invoice').eq('id',id).maybeSingle();if(!attempt)throw new TradingError('not_found',404);const ref=reference??attempt.provider_reference;if(!ref)throw new TradingError('provider_reference_required',409);await checked(store.db.from('cm_callbacks').insert({processor:attempt.processor,event_key:`staff:${crypto.randomUUID()}`,provider_reference:ref,invoice:attempt.invoice}));return reply({queued:true});}
  }else{
   assertPurchaseEmail(actor.email!);
   if(path==='creator'){exact(body,['code']);return reply(await store.rpc('creator',{p_user:actor.id,p_code:body.code?string(body.code,'code',32):null,p_save:true}));}
   if(path==='quote'){
    exact(body,['product_id','quantity','ticket_id','affiliate_code','coupon_code','code']);
    let affiliate=body.affiliate_code?string(body.affiliate_code,'affiliate_code',32).toUpperCase():null;
    let coupon=body.coupon_code?string(body.coupon_code,'coupon_code',60).toUpperCase():null;
    if(body.code){const code=string(body.code,'code',60).toUpperCase();const match=await checked(store.db.from('cm_coupons').select('code').eq('code',code).maybeSingle());if(match)coupon=code;else affiliate=code;}
    return reply(await store.rpc('quote',{p_user:actor.id,p_product:string(body.product_id,'product_id',100),p_quantity:integer(body.quantity,1,3),p_ticket:body.ticket_id?uuid(body.ticket_id):null,p_affiliate:affiliate,p_coupon:coupon,p_email:actor.email}));
   }
   if(path==='save'){exact(body,['product_id','quantity','ticket_id','affiliate_code','coupon_code','evidence']);const cart=await store.rpc('save',{p_user:actor.id,p_product:string(body.product_id,'product_id',100),p_quantity:integer(body.quantity,1,3),p_ticket:body.ticket_id?uuid(body.ticket_id):null,p_affiliate:body.affiliate_code?string(body.affiliate_code,'affiliate_code',100):null,p_coupon:body.coupon_code?string(body.coupon_code,'coupon_code',60).toUpperCase():null,p_evidence:purchaseEvidence(object(body.evidence),actor.email!)});return reply(await store.snapshot(cart.id,actor.id));}
   if(path==='prepare'){exact(body,['checkout_id','revision_id','processor']);const snapshot=await store.snapshot(uuid(body.checkout_id),actor.id);
    let rail:Processor;
    if(body.processor==='card'){
     const rails=await checked(store.db.from('cm_processors').select('id,enabled,routing_version').in('id',['nmi','authnet'])) as Row[];
     // A deliberate retry after a confirmed decline can use the other configured card rail.
     const declined=snapshot.attempts?.find(a=>a.state==='declined')?.processor;
     const options=['nmi','authnet'].filter(id=>rails.some(r=>r.id===id&&r.enabled&&r.routing_version===routingVersion())&&publicProcessor(id as Processor).configured);
     rail=(options.find(id=>id!==declined)??options[0]??'nmi') as Processor;
    }else rail=processor(body.processor);if(snapshot.revision?.total_cents!==0&&!publicProcessor(rail).configured)throw new TradingError('processor_unavailable',503);return reply(await store.rpc('prepare',{p_user:actor.id,p_checkout:uuid(body.checkout_id),p_revision:uuid(body.revision_id),p_processor:rail,p_routing:routingVersion()}));}
   if(path==='cancel'){exact(body,['checkout_id']);await store.rpc('cancel',{p_user:actor.id,p_checkout:uuid(body.checkout_id)});return reply({cancelled:true});}
   if(path==='charge'){
    exact(body,['attempt_id','token']);const id=uuid(body.attempt_id);const token=body.token?object(body.token):{};exact(token,['paymentToken','dataDescriptor','dataValue']);
    const {data:attempt,error}=await store.db.from('cm_attempts').select('processor,checkout_id,cm_revisions(total_cents)').eq('id',id).maybeSingle();if(error||!attempt)throw new TradingError('not_found',404);await store.snapshot(attempt.checkout_id,actor.id);
    const {data:evidenceRevision}=await store.db.from('cm_attempts').select('revision_id').eq('id',id).single();const {data:accepted}=await store.db.from('cm_revisions').select('evidence').eq('id',evidenceRevision?.revision_id).single();if(!accepted)throw new TradingError('not_found',404);purchaseEvidence(object(accepted.evidence),actor.email!);
    const free=(attempt.cm_revisions as unknown as Row)?.total_cents===0;
    if(!free&&attempt.processor==='nmi')string(token.paymentToken,'payment_token',4096);if(!free&&attempt.processor==='authnet'){string(token.dataDescriptor,'data_descriptor',100);string(token.dataValue,'data_value',4096);}
    if(!free&&!publicProcessor(attempt.processor as Processor).configured)throw new TradingError('processor_unavailable',503);
    const claim=await store.rpc('claim',{p_user:actor.id,p_attempt:id,p_routing:routingVersion()});
    const payment={processor:claim.attempt.processor as Processor,invoice:claim.attempt.invoice,amount:claim.revision.total_cents,currency:claim.revision.currency,checkoutId:claim.attempt.checkout_id,billing:claim.revision.evidence};
    // Once claimed, even an exception is ambiguous. Never reset this operation or replay a card token.
    try {const result=await charge(payment,token,actor.email!);if(result.state==='declined'&&!result.reference)result.reference=`declined:${payment.invoice}`;await store.result(id,result);}catch{await store.result(id,{state:'unknown',reference:null,amount:payment.amount,currency:payment.currency,invoice:payment.invoice}).catch(()=>{});}
    return reply(await store.snapshot(claim.attempt.checkout_id,actor.id),202);
   }
  }
  throw new TradingError('not_found',404);
 }catch(error){const known=error instanceof TradingError;return Response.json({error:known?error.code:'commerce_unavailable'},{status:known?error.status:503,headers});}
}
