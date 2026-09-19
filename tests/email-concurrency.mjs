import assert from 'node:assert/strict';
export async function emailConcurrency(sql) {
 const user='ee000000-0000-4000-8000-000000000001';
 await sql(`insert into auth.users(id) values('${user}'); update ce_templates set enabled=true where id='checkout_receipt';`);
 const payload=JSON.stringify({'receipt.total':'150 USD','receipt.lines':'Evaluation','receipt.orderReference':'parallel','receipt.paidAt':'2026-09-17',siteUrl:'https://certafutures.com',loginUrl:'https://certafutures.com/login'});
 const ids=await Promise.all([1,2].map(()=>sql(`select ce_enqueue('concurrent-email','checkout_receipt','${user}','${payload}')`)));
 assert.equal(ids[0],ids[1],'concurrent event enqueue must deduplicate');
 const claims=await Promise.all([1,2].map(()=>sql('select ce_claim()')));
 assert.equal(claims.filter(value=>value.trim()).length,1,'only one worker can acquire the delivery lease');
 const job=JSON.parse(claims.find(value=>value.trim()));
 await sql(`select ce_finish('${job.id}','${job.lease_token}','synthetic-provider-reference',null,false,0); update ce_templates set enabled=false where id='checkout_receipt';`);
 console.log('PASS: concurrent email event deduplication and exclusive delivery leases.');
}
