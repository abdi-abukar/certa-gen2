import assert from 'node:assert/strict';
export async function ticketConcurrency(sql){
 const users=Array.from({length:12},(_,i)=>`44444444-4444-4444-8444-${String(i).padStart(12,'0')}`),pool='cccccccc-cccc-4ccc-8ccc-ccccccccccc7';
 await sql(`insert into auth.users(id) values ${users.map(id=>`('${id}')`).join(',')};
 select public.tk_create('${users[0]}','${pool}',jsonb_build_object('title','Concurrent','mode','shared','per_user',1,'prizes',(select jsonb_agg(jsonb_build_object('name','Discount','description','Fixture','kind','percentage_off','value',n*10)) from generate_series(1,10)n)),(select jsonb_agg(jsonb_build_object('name','Discount','description','Fixture','kind','percentage_off','value',n*10)) from generate_series(1,10)n),'["CT-CCCCCCCCCCCCCCCCCCCCCCCC"]');
 select public.tk_state('${users[0]}','${pool}','active');`);
 const claims=await Promise.allSettled(users.map(u=>sql(`select public.tk_claim('${u}','CT-CCCCCCCCCCCCCCCCCCCCCCCC','concurrent',null)->>'id'`)));
 assert.equal(claims.filter(r=>r.status==='fulfilled').length,10,'exactly ten of twelve simultaneous claims win');
 assert.equal(claims.filter(r=>r.status==='rejected'&&r.reason.message.includes('sold_out')).length,2);
 assert.equal((await sql(`select count(*) from public.tk_tickets where pool_id='${pool}' and user_id is not null`)).trim(),'10');
 assert.equal((await sql(`select sum((prize->>'value')::int) from public.tk_tickets where pool_id='${pool}' and user_id is not null`)).trim(),'550','chosen inventory preserved');
 const index=claims.findIndex(r=>r.status==='fulfilled'),winner=users[index];
 const duplicate=await Promise.all([0,1].map(()=>sql(`select public.tk_claim('${winner}','CT-CCCCCCCCCCCCCCCCCCCCCCCC','concurrent',null)->>'id'`)));
 assert.equal(duplicate[0],duplicate[1],'source replay stays one ticket even when sold out');
 const id=duplicate[0].trim();await sql(`select public.tk_reveal('${winner}','${id}')`);
 const holds=await Promise.allSettled([users[10],users[11]].map(checkout=>sql(`select public.tk_checkout('${winner}','${id}','${checkout}','reserve',1000)`)));
 assert.equal(holds.filter(r=>r.status==='fulfilled').length,1,'only one checkout may reserve a ticket');
 console.log('PASS: exact ticket inventory under concurrent claims, sold-out fencing, idempotent source replay and exclusive checkout reservation.');
}
