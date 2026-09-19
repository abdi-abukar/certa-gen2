import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commerceResponse } from '../packages/server/src/commerce/http';
const user='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',checkout='20000000-0000-4000-8000-000000000001',revision='30000000-0000-4000-8000-000000000001',order='40000000-0000-4000-8000-000000000001';
const token=[{alg:'HS256',typ:'JWT'},{sub:user,session_id:user,aal:'aal1',exp:4102444800},'synthetic'].map((v,i)=>Buffer.from(i<2?JSON.stringify(v):String(v)).toString('base64url')).join('.');
test('checkout creator, quote and issuance endpoints bind the verified owner and never call providers',async()=>{
 const savedEnv={...process.env},savedFetch=globalThis.fetch;Object.assign(process.env,{CERTA_APP:'web',CERTA_APP_ORIGIN:'https://web.example.test',CERTA_ALLOWED_ORIGINS:'https://web.example.test',CERTA_SUPABASE_URL:'https://supabase.example.test',CERTA_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',SUPABASE_SECRET_KEY:'sb_secret_synthetic'});
 const calls:{url:URL;body:Record<string,unknown>|null}[]=[];let verified=true,missingMigration=false;
 const tables:Record<string,Record<string,unknown>[]>= {
  cm_checkouts:[{id:checkout,user_id:user,current_revision:revision,slot_order:order,state:'paid'}],cm_revisions:[{id:revision,quantity:1,total_cents:10000}],cm_attempts:[],
  ct_entitlements:[{id:'own',user_id:user,origin:'purchase',source:`order:${order}:slot-one`,slot_id:'slot-one',issued_account_id:'purchased-account'}, {id:'sibling',user_id:user,origin:'purchase',source:'order:OTHER_CANARY:slot-other',slot_id:'other-slot',issued_account_id:'OTHER_CANARY'}, {id:'foreign',user_id:other,origin:'purchase',source:`order:${order}:foreign-slot`,slot_id:'foreign-slot',issued_account_id:'FOREIGN_CANARY'}],
  ct_memberships:[], cu_profiles:[{user_id:user,first_name:'Fixture',last_name:'Buyer',country:'CA'}],cm_coupons:[],
 };
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input)),body=init?.body?JSON.parse(String(init.body)):null;calls.push({url,body});assert.equal(url.origin,'https://supabase.example.test','no gateway/provisioning calls');
  if(url.pathname==='/auth/v1/user')return Response.json({id:user,email:'fixture@example.test',email_confirmed_at:'2026-09-17T00:00:00Z',app_metadata:{},factors:[]});
  if(url.pathname==='/rest/v1/rpc/cf_verified')return Response.json(verified);
  if(url.pathname==='/rest/v1/rpc/ct_compliance')return Response.json({kyc:false,tax:false,agreement:false});
  if(url.pathname.includes('/rpc/')){
   assert.equal(body.p_user,user,'all customer RPCs use verified identity');
   if(url.pathname.endsWith('cm_creator'))return missingMigration ? Response.json({code:'PGRST202',message:'Missing function with PRIVATE_DATABASE_DETAIL'}, {status:404}) : Response.json({code:'CREATOR',discount_bps:2000,available:true});
   if(url.pathname.endsWith('cm_quote'))return Response.json({total_cents:12000,affiliate_code:body.p_affiliate});
   if(url.pathname.endsWith('ct_allocation_snapshot'))return Response.json({available:2,occupied:1,slots:[{id:'slot-one',state:'active'},{id:'sibling',state:'compliance_pending'}]});
   if(url.pathname.endsWith('ct_evaluation_count'))return Response.json(1);
   throw new Error(`Unexpected RPC ${url.pathname}`);
  }
  const table=url.pathname.split('/').at(-1)!;assert.ok(table in tables);let rows=tables[table];
  for(const [key,value] of url.searchParams){if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[key])===value.slice(3));if(value.startsWith('like.'))rows=rows.filter(row=>String(row[key]).startsWith(value.slice(5).replace(/%$/, '')));}
  return Response.json(new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object')?rows[0]??null:rows);
 };
 const request=(path:string,body?:unknown,authorization=`Bearer ${token}`)=>commerceResponse(new Request(`https://web.example.test/api/commerce/${path}`,{method:body?'POST':'GET',headers:{Authorization:authorization,Origin:'https://web.example.test','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),path.split('?')[0].split('/'));
 try{
  assert.equal((await request('creator',undefined,'Basic invalid')).status,401);verified=false;assert.equal((await request('creator')).status,403);verified=true;
  const preference=await request(`creator?user_id=${other}`);assert.equal(preference.status,200);assert.match(preference.headers.get('cache-control')!,/private, no-store/);
  assert.equal((await request('creator',{code:'CREATOR',user_id:other})).status,400);
  assert.equal((await request('creator',{code:'CREATOR'})).status,200);
  assert.equal((await request('quote',{product_id:'evaluation',quantity:1,code:'CREATOR',total_cents:1})).status,400);
  assert.equal((await request('quote',{product_id:'evaluation',quantity:1,code:'CREATOR'})).status,200);
  const response=await request(`checkouts/${checkout}`);assert.equal(response.status,200);const purchase=await response.json();assert.deepEqual(purchase.issuance,[{slot_id:'slot-one',account_id:'purchased-account',state:'ready'}]);assert.ok(!JSON.stringify(purchase).includes('CANARY'));
  assert.equal((await request(`checkouts/${other}`)).status,404);
  tables.ct_memberships.push({user_id:user,status:'INVITED'});
  assert.equal((await (await request(`checkouts/${checkout}`)).json()).requires_acceptance,true);
  assert.equal((await request('context')).status,200);
  missingMigration=true;
  const unavailable=await request('context');
  assert.equal(unavailable.status,503);
  assert.deepEqual(await unavailable.json(),{error:'commerce_not_ready'});
  assert.match(unavailable.headers.get('cache-control')!,/private, no-store/);
  assert.ok(calls.filter(call=>call.url.pathname.endsWith('ct_entitlements')).every(call=>call.url.searchParams.get('user_id')===`eq.${user}`));
 }finally{globalThis.fetch=savedFetch;process.env=savedEnv;}
});
