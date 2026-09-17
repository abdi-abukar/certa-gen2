-- Run against an isolated PostgreSQL fixture with migration applied. Rolls back all data.
begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.ct_memberships(user_id,vendor_user_id,firm_id) values('11111111-1111-4111-8111-111111111111','vendor-user','firm');
insert into public.ct_accounts(id,user_id,vendor_id,firm_id,kind) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','vendor-account','firm','evaluation');
select public.ct_lease('worker','test-worker');
select public.ct_ingest('{"id":"evt-pass","type":"accounts.passed","family":"accounts","firm":"firm","user":"vendor-user","account":"vendor-account","at":"2026-09-15T15:00:00Z","channel":"webhook","known":true,"ignored":false,"lifecycle":"passed","data":{"status":"PASSED"}}');
select public.ct_ingest('{"id":"evt-pass","type":"accounts.passed","family":"accounts","firm":"firm","user":"vendor-user","account":"vendor-account","at":"2026-09-15T15:00:00Z","channel":"webhook","known":true,"ignored":false,"lifecycle":"passed","data":{"status":"PASSED"}}');
select public.ct_ingest('{"id":"evt-old","type":"accounts.updated","family":"accounts","firm":"firm","user":"vendor-user","account":"vendor-account","at":"2026-09-14T15:00:00Z","channel":"webhook","known":true,"ignored":false,"lifecycle":"active","data":{"status":"ACTIVE"}}');
do $$ begin
 if (select lifecycle from public.ct_accounts limit 1)<>'passed' then raise exception 'stale event changed lifecycle'; end if;
 if (select count(*) from public.ct_transitions)<>1 then raise exception 'duplicate pass side effect'; end if;
end $$;
select public.ct_ingest('{"id":"ws:firm:10","type":"balances.updated","family":"balances","firm":"firm","user":"vendor-user","account":"vendor-account","at":"2026-09-15T15:00:00Z","channel":"ws:balances","seq":"10","known":true,"ignored":false,"data":{"balance":"50000.00"}}','test-worker');
select public.ct_ingest('{"id":"ws:firm:9","type":"balances.updated","family":"balances","firm":"firm","user":"vendor-user","account":"vendor-account","at":"2026-09-14T15:00:00Z","channel":"ws:balances","seq":"9","known":true,"ignored":false,"data":{"balance":"1.00"}}','test-worker');
do $$ begin
 if (select data->>'balance' from public.ct_records limit 1)<>'50000.00' then raise exception 'stale balance changed snapshot'; end if;
 if (select cursor from public.ct_runtime where id='ws:balances')<>'10' then raise exception 'cursor regressed'; end if;
 if exists(select 1 from public.ct_changes where data->'patch'->>'balance'='1.00') then raise exception 'stale balance reached live clients'; end if;
 if public.ct_lease('worker','other-worker') then raise exception 'duplicate leader'; end if;
end $$;
select public.ct_enqueue('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','lock','unique-key','{"reason":"test","expires_at":"2027-01-01"}');
select public.ct_enqueue('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','lock','unique-key','{"reason":"test","expires_at":"2027-01-01"}');
do $$ begin
 if (select count(*) from public.ct_operations)<>1 then raise exception 'duplicate operation'; end if;
 begin
  perform public.ct_enqueue('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','unlock','unique-key','{}');
  raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm not like '%conflict%' then raise; end if; end;
end $$;

select public.ct_admin_edit('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','link','{"vendor_user_id":"vendor-second","firm_id":"firm","reason":"fixture ownership link"}');
select public.ct_admin_edit('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','entitlement','{"kind":"practice","source":"fixture-purchase","plan_reference":"practice-plan","reason":"fixture paid entitlement"}');
select public.ct_ingest('{"id":"evt-new","type":"accounts.created","family":"accounts","firm":"firm","user":"vendor-second","account":"vendor-second-account","at":"2026-09-15T15:00:00Z","channel":"webhook","known":true,"ignored":false,"lifecycle":"active","data":{"status":"ACTIVE","stage":"evaluation"}}');
do $$ begin
 if not exists(select 1 from public.ct_accounts where vendor_id='vendor-second-account' and user_id='22222222-2222-4222-8222-222222222222') then raise exception 'new vendor account not linked'; end if;
 if (select count(*) from public.ct_audit where action in ('link','entitlement'))<>2 then raise exception 'missing transactional audit'; end if;
end $$;
select public.ct_backoff('read',60);
do $$ begin if public.ct_budget('read') then raise exception 'provider retry-after ignored';end if;end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if exists(select 1 from public.ct_accounts where user_id<>'22222222-2222-4222-8222-222222222222') then raise exception 'cross-user account leak'; end if;
 if (select count(*) from public.ct_records)<>0 then raise exception 'cross-user balance leak'; end if;
 begin update public.ct_accounts set lifecycle='passed';raise exception 'unexpected write';exception when insufficient_privilege then null;end;
 begin perform public.ct_lease('worker','attacker');raise exception 'unexpected RPC permission';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin if (select count(*) from public.ct_accounts)<>1 then raise exception 'owner cannot read own account';end if;end $$;
reset role;
rollback;
