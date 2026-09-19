begin;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002') on conflict do nothing;
insert into tk_pools(id,title,mode,per_user,quantity,config,created_by) values('20000000-0000-4000-8000-000000000002','Email fixture','reward',1,1,'{}','10000000-0000-4000-8000-000000000001');
insert into tk_tickets(id,pool_id,title,position,prize) values('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','Gold ticket',1,'{"name":"Fixture","description":"","kind":"none","value":0}');
update tk_tickets set user_id='10000000-0000-4000-8000-000000000001',claimed_at=now() where id='20000000-0000-4000-8000-000000000001';
do $$begin if (select count(*) from ce_outbox where template_id='ticket_claim_account' and event_id='ticket-claimed/20000000-0000-4000-8000-000000000001')<>1 then raise exception 'ticket trigger missing';end if;end $$;
do $$
declare job uuid;again uuid;claim jsonb;body jsonb;copy jsonb;v integer;
begin
 body='{"receipt.total":"150 USD","receipt.lines":"Evaluation 150 USD","receipt.orderReference":"checkout-fixture","receipt.paidAt":"2026-09-17","siteUrl":"https://certafutures.com","loginUrl":"https://certafutures.com/login"}';
 job=ce_enqueue('checkout-fixture:paid','checkout_receipt','10000000-0000-4000-8000-000000000001',body);
 again=ce_enqueue('checkout-fixture:paid','checkout_receipt','10000000-0000-4000-8000-000000000001',body);
 if job<>again then raise exception 'duplicate receipt';end if;
 if ce_claim() is not null then raise exception 'disabled trigger claimed';end if;
 begin perform ce_enqueue('code','login_pin','10000000-0000-4000-8000-000000000001','{"pin":"123456","expiresInMinutes":"10"}');raise exception 'plaintext auth persisted';exception when others then if sqlerrm<>'invalid_template' then raise;end if;end;
 begin perform ce_enqueue('bad','checkout_receipt','10000000-0000-4000-8000-000000000001',body||'{"access_token":"secret"}');raise exception 'unknown field accepted';exception when others then if sqlerrm<>'invalid_input' then raise;end if;end;
 begin perform ce_enqueue('checkout-fixture:paid','checkout_receipt','10000000-0000-4000-8000-000000000001',body||'{"receipt.total":"1 USD"}');raise exception 'idempotency mutation';exception when others then if sqlerrm<>'conflict' then raise;end if;end;
 select r.copy into copy from ce_revisions r where template_id='checkout_receipt' and revision=1;
 v=ce_save('checkout_receipt',1,copy||'{"title":"Updated title"}','10000000-0000-4000-8000-000000000001');if v<>2 then raise exception 'revision missing';end if;
 begin perform ce_save('checkout_receipt',1,copy,'10000000-0000-4000-8000-000000000001');raise exception 'stale writer accepted';exception when others then if sqlerrm<>'conflict' then raise;end if;end;
 update ce_templates set enabled=true where id='checkout_receipt';claim=ce_claim();
 if claim->>'template_revision'<>'1' or claim->'copy'->>'title'='Updated title' then raise exception 'inflight revision mutated';end if;
 if ce_claim() is not null then raise exception 'lease not exclusive';end if;
 perform ce_prepare(job,(claim->>'lease_token')::uuid,'alex@example.test','{"html":"frozen","text":"frozen","subject":"frozen"}','sender@example.test',null);
 perform ce_finish(job,(claim->>'lease_token')::uuid,null,'network',true,0);
 update ce_outbox set available_at=now() where id=job;claim=ce_claim();
 if claim->'rendered'->>'subject'<>'frozen' then raise exception 'retry not frozen';end if;
 insert into ce_suppressions(email,reason) values('alex@example.test','complaint');
 if ce_prepare(job,(claim->>'lease_token')::uuid,'alex@example.test','{"subject":"changed"}','changed@example.test',null) then raise exception 'suppression ignored';end if;
 if (select state from ce_outbox where id=job)<>'suppressed' then raise exception 'suppression not durable';end if;
 job=ce_enqueue('second','checkout_receipt','10000000-0000-4000-8000-000000000002',body);
 update ce_outbox set first_attempt_at=now()-interval '25 hours' where id=job;perform ce_claim();
 if (select state from ce_outbox where id=job)<>'unknown' then raise exception 'expired retry window restarted';end if;
end $$;
set role authenticated;
do $$begin
 begin perform * from public.ce_outbox;raise exception 'cross-user read';exception when insufficient_privilege then null;end;
 begin perform public.ce_claim();raise exception 'customer claimed mail';exception when insufficient_privilege then null;end;
 begin perform public.ce_save('login_pin',1,'{}','10000000-0000-4000-8000-000000000001');raise exception 'customer edited copy';exception when insufficient_privilege then null;end;
end $$;
reset role;
set role anon;
do $$begin
 begin perform * from public.ce_revisions;raise exception 'anonymous read';exception when insufficient_privilege then null;end;
 begin perform public.ce_catalog();raise exception 'anonymous catalog';exception when insufficient_privilege then null;end;
end $$;
reset role;

rollback;
