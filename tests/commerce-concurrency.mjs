/** sql is the canonical runner's disposable localhost-only psql function. */
export async function commerceConcurrency(sql){
 const users=['ad000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000002'];
 await sql(`insert into auth.users(id) values('${users[0]}'),('${users[1]}');insert into public.ct_plans values('commerce-concurrent','commerce-eval-concurrent','commerce-funded-concurrent',true,true);insert into public.cm_products(id,label,price_cents,enabled) values('commerce-concurrent','Concurrent evaluation',15000,true);update public.cm_processors set enabled=true;insert into public.cm_coupons(code,kind,value,total_limit) values('CONCURRENT','percent',20,1);`);
 const evidence=user=>JSON.stringify({name:'Synthetic fixture',country:'CA',email:`${user}@example.test`,terms_version:'fixture',accepted:true});
 const save=(user,coupon='null')=>`select public.cm_save('${user}','commerce-concurrent',1,null,null,${coupon},'${evidence(user)}')->>'id'`;
 const carts=await Promise.all(Array.from({length:8},()=>sql(save(users[0]))));
 if(new Set(carts.map(x=>x.trim())).size!==1)throw new Error('Concurrent cart creation violated one active checkout');
 const outcomes=await Promise.allSettled(users.map(user=>sql(save(user,"'CONCURRENT'"))));
 if(outcomes.filter(r=>r.status==='fulfilled').length!==1||!outcomes.some(r=>r.status==='rejected'&&r.reason.message.includes('coupon_limit')))throw new Error('Global coupon cap was oversold');
 const winner=users[outcomes.findIndex(r=>r.status==='fulfilled')];
 const cart=(await sql(`select id from public.cm_checkouts where user_id='${winner}' and state='open'`)).trim();
 const revision=(await sql(`select current_revision from public.cm_checkouts where id='${cart}'`)).trim();
 const prepared=await Promise.all([0,1].map(()=>sql(`select public.cm_prepare('${winner}','${cart}','${revision}','nmi',1)->>'id'`)));
 if(prepared[0]!==prepared[1])throw new Error('Concurrent preparation duplicated processor attempt');
 const attempt=prepared[0].trim();
 const claims=await Promise.allSettled([0,1].map(()=>sql(`select public.cm_claim('${winner}','${attempt}',1)`)));
 if(claims.filter(r=>r.status==='fulfilled').length!==1)throw new Error('Concurrent payment claims admitted duplicate dispatch');
 const invoice=(await sql(`select invoice from public.cm_attempts where id='${attempt}'`)).trim();
 await Promise.all([0,1].map(()=>sql(`select public.cm_result('${attempt}','paid','concurrent-provider-payment',12000,'USD','${invoice}')`)));
 if((await sql(`select count(*) from public.ct_entitlements where user_id='${winner}' and origin='purchase'`)).trim()!=='1')throw new Error('Concurrent paid callbacks duplicated fulfillment');
 if((await sql(`select count(*) from public.ce_outbox where event_id='checkout:${cart}:paid'`)).trim()!=='1')throw new Error('Concurrent paid callbacks duplicated receipt');
}
