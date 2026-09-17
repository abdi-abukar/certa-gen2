begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.ct_memberships(user_id,vendor_user_id,firm_id,status) values('11111111-1111-4111-8111-111111111111','vendor-user','firm','ACTIVE');
insert into public.ct_plans values ('50k','eval-50k','funded-50k',true,true);
select public.ct_lease('worker','slot-test');
do $$ declare u uuid:='11111111-1111-4111-8111-111111111111'; o jsonb; again jsonb; ent uuid; op uuid; account uuid; i integer; begin
 o:=public.ct_reserve(u,'first-checkout','50k',1);
 again:=public.ct_reserve(u,'first-checkout','50k',1);
 if o->>'id'<>again->>'id' then raise exception 'reservation duplicated'; end if;
 begin perform public.ct_reserve(u,'second-checkout','50k',1); raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'kyc_required' then raise; end if; end;
 perform public.ct_settle_order(u,(o->>'id')::uuid,'paid','payment-001','verified fixture payment');
 perform public.ct_settle_order(u,(o->>'id')::uuid,'paid','payment-001','replayed payment');
 perform public.ct_schedule_allocations('slot-test');
 select id into ent from public.ct_entitlements where user_id=u and kind='evaluation';
 select consumed_by into op from public.ct_entitlements where id=ent;
 if op is null then raise exception 'first evaluation incorrectly requires compliance'; end if;
 perform public.ct_assert_provision(ent,op);
 perform public.ct_bind_provision(op,'evaluation-1','firm','{"plan_reference":"eval-50k"}');
 perform public.ct_bind_provision(op,'evaluation-1','firm','{"plan_reference":"eval-50k"}');
 update public.ct_operations set state='confirmed' where id=op;
 select id into account from public.ct_accounts where vendor_id='evaluation-1';
 -- A lock is not a pass.
 update public.ct_accounts set lifecycle='locked' where id=account;
 perform public.ct_schedule_allocations('slot-test');
 if exists(select 1 from public.ct_entitlements where kind='funded') then raise exception 'lock created funded entitlement'; end if;
 update public.ct_accounts set lifecycle='passed' where id=account;
 perform public.ct_schedule_allocations('slot-test');
 perform public.ct_reconcile_allocations(u);
 if (select count(*) from public.ct_entitlements where origin='pass')<>1 then raise exception 'pass duplicate'; end if;
 if (public.ct_allocation_snapshot(u)->>'occupied')::integer<>1 then raise exception 'pass freed/doubled slot'; end if;
 if exists(select 1 from public.ct_entitlements where origin='pass' and consumed_by is not null) then raise exception 'funded issued before compliance'; end if;
 for i in 1..3 loop
  perform public.ct_record_compliance(u,u,jsonb_build_object('requirement',(array['kyc','tax','agreement'])[i],'version','v1','status','approved','source','compliance-'||i,'effective_at',now(),'evidence_reference','fixture-document-'||i));
 end loop;
 perform public.ct_schedule_allocations('slot-test');
 select id,consumed_by into ent,op from public.ct_entitlements where origin='pass';
 if op is null then raise exception 'compliance did not release funding'; end if;
 perform public.ct_assert_provision(ent,op);
 -- Simulate webhook winning the race with the HTTP result.
 insert into public.ct_accounts(user_id,vendor_id,firm_id,kind,predecessor_id) values(u,'funded-1','firm','funded','evaluation-1');
 perform public.ct_reconcile_allocations(u);
 perform public.ct_bind_provision(op,'funded-1','firm','{}');
 if (public.ct_allocation_snapshot(u)->>'occupied')::integer<>1 then raise exception 'successor consumed extra slot'; end if;
 update public.ct_operations set state='confirmed' where id=op;
 -- Staff can grant without a pretend evaluation pass, but still uses capacity.
 perform public.ct_grant_account(u,u,'staff-funded-2','funded-50k','funded',null,'customer remediation');
 perform public.ct_grant_account(u,u,'staff-funded-3','funded-50k','funded',null,'customer remediation');
 begin perform public.ct_grant_account(u,u,'staff-funded-4','funded-50k','funded',null,'would exceed cap'); raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'slots_full' then raise; end if; end;
 perform public.ct_schedule_allocations('slot-test');
 if (select count(*) from public.ct_entitlements where origin='grant' and consumed_by is not null)<>2 then raise exception 'did not release all eligible entitlements'; end if;
 -- Revoking compliance after queuing is caught immediately before the vendor write.
 perform public.ct_record_compliance(u,u,jsonb_build_object('requirement','agreement','version','v1','status','revoked','source','revoke-agreement','effective_at',now()+interval '-1 microsecond','evidence_reference','revocation-proof'));
 -- Use later effective timestamp than the approvals in this transaction.
 update public.ct_compliance_evidence set effective_at=now()-interval '1 day' where status='approved';
 select id,consumed_by into ent,op from public.ct_entitlements where origin='grant' limit 1;
 begin perform public.ct_assert_provision(ent,op); raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'compliance_required' then raise; end if; end;
 update public.ct_operations set state='failed',error_code='compliance_required' where id=op;
 perform public.ct_schedule_allocations('slot-test');
 if (select state from public.ct_operations where id=op)<>'failed' then raise exception 'preflight failure hot-looped'; end if;
 if exists(select 1 from public.ct_allocation_dirty where user_id=u) then raise exception 'blocked preflight continuously rescheduled'; end if;
end $$;
-- All new tables and privileged functions deny client access, even for the owner.
do $$ declare t text; begin
 foreach t in array array['slots','slot_orders','compliance_evidence','compliance_requirements','plans','closures','allocation_dirty'] loop
  if has_table_privilege('authenticated','public.ct_'||t,'INSERT') or has_table_privilege('authenticated','public.ct_'||t,'SELECT') then raise exception 'client leaked %',t; end if;
 end loop;
 if has_function_privilege('authenticated','public.ct_reserve(uuid,text,text,integer)','EXECUTE') then raise exception 'client can call reservation RPC'; end if;
end $$;
rollback;

-- Independent replacement and out-of-order event cases.
begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
insert into public.ct_memberships(user_id,vendor_user_id,firm_id,status) values('11111111-1111-4111-8111-111111111111','replacement-user','firm','ACTIVE');
insert into public.ct_plans values ('50k','eval-50k','funded-50k',true,true);
select public.ct_lease('worker','slot-test');
do $$ declare u uuid:='11111111-1111-4111-8111-111111111111'; a uuid; e jsonb; op uuid; id uuid; r text; begin
 foreach r in array array['kyc','tax','agreement'] loop
  perform public.ct_record_compliance(u,u,jsonb_build_object('requirement',r,'version','v1','status','approved','source','proof-'||r,'effective_at',now()-interval '1 hour','evidence_reference','fixture-doc'));
 end loop;
 insert into public.ct_accounts(user_id,vendor_id,firm_id,kind,lifecycle) values(u,'replace-old','firm','funded','active') returning ct_accounts.id into a;
 e:=public.ct_grant_account(u,u,'replace-request','funded-50k','funded',a,'replace faulty account');
 perform public.ct_schedule_allocations('slot-test');
 if exists(select 1 from public.ct_entitlements where consumed_by is not null) then raise exception 'replacement issued before closure'; end if;
 perform public.ct_ingest(jsonb_build_object('id','close-event','type','accounts.closed','family','accounts','firm','firm','user','replacement-user','account','replace-old','at',now(),'channel','webhook','ignored',false,'lifecycle','closed','data','{}'::jsonb));
 perform public.ct_schedule_allocations('slot-test');
 select consumed_by into op from public.ct_entitlements where ct_entitlements.id=(e->>'id')::uuid;
 if op is null then raise exception 'closed replacement did not issue'; end if;
 if (public.ct_allocation_snapshot(u)->>'occupied')::integer<>1 then raise exception 'closure freed reserved replacement'; end if;
 perform public.ct_assert_provision((e->>'id')::uuid,op);
 perform public.ct_bind_provision(op,'replace-new','firm','{}');
 update public.ct_operations set state='confirmed' where ct_operations.id=op;
 if (public.ct_allocation_snapshot(u)->>'occupied')::integer<>1 then raise exception 'replacement doubled capacity'; end if;
 -- Unknown creation must stay allocated and cannot be automatically cancelled or retried.
 e:=public.ct_grant_account(u,u,'unknown-request','funded-50k','funded',null,'fixture ambiguous issuance');
 perform public.ct_schedule_allocations('slot-test');
 select consumed_by into op from public.ct_entitlements where ct_entitlements.id=(e->>'id')::uuid;
 update public.ct_operations set state='unknown' where ct_operations.id=op;
 perform public.ct_schedule_allocations('slot-test');
 if (select state from public.ct_operations where ct_operations.id=op)<>'unknown' then raise exception 'unknown write retried'; end if;
 begin perform public.ct_cancel_entitlement(u,(e->>'id')::uuid,'cancel unknown'); raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'account_busy' then raise; end if; end;
 -- A vendor event without lineage is kept separate until explicit result binding.
 insert into public.ct_accounts(user_id,vendor_id,firm_id,kind) values(u,'unknown-created','firm','funded');
 perform public.ct_reconcile_allocations(u);
 if (public.ct_allocation_snapshot(u)->>'occupied')::integer<>3 then raise exception 'unidentified external account ignored'; end if;
 perform public.ct_bind_provision(op,'unknown-created','firm','{}');
 if (public.ct_allocation_snapshot(u)->>'occupied')::integer<>2 then raise exception 'response/event race not merged'; end if;
 -- Unissued staff grants can be cancelled with audit; no vendor call needed.
 e:=public.ct_grant_account(u,u,'cancel-request','funded-50k','funded',null,'fixture cancellation');
 perform public.ct_schedule_allocations('slot-test');
 perform public.ct_cancel_entitlement(u,(e->>'id')::uuid,'cancel queued grant');
 if (public.ct_allocation_snapshot(u)->>'occupied')::integer<>2 then raise exception 'cancelled grant retained empty slot'; end if;
 -- Version changes invalidate old evidence. Stale approval cannot override revocation.
 perform public.ct_compliance_version(u,'agreement','v2','new terms');
 if (public.ct_compliance(u)->>'agreement')::boolean then raise exception 'old agreement accepted'; end if;
 perform public.ct_record_compliance(u,u,jsonb_build_object('requirement','agreement','version','v2','status','revoked','source','revoked-v2','effective_at',now(),'evidence_reference','revocation-doc'));
 perform public.ct_record_compliance(u,u,jsonb_build_object('requirement','agreement','version','v2','status','approved','source','stale-v2','effective_at',now()-interval '1 day','evidence_reference','old-doc'));
 if (public.ct_compliance(u)->>'agreement')::boolean then raise exception 'stale callback reapproved user'; end if;
end $$;
rollback;

-- Multiple external successors must not collapse into one slot during a late-lineage batch.
begin;
insert into auth.users values ('11111111-1111-4111-8111-111111111111');
insert into public.ct_accounts(user_id,vendor_id,firm_id,kind,lifecycle) values
 ('11111111-1111-4111-8111-111111111111','parent','firm','evaluation','passed'),
 ('11111111-1111-4111-8111-111111111111','child-one','firm','funded','active'),
 ('11111111-1111-4111-8111-111111111111','child-two','firm','funded','active');
select public.ct_reconcile_allocations('11111111-1111-4111-8111-111111111111');
update public.ct_accounts set predecessor_id='parent' where vendor_id like 'child-%';
select public.ct_reconcile_allocations('11111111-1111-4111-8111-111111111111');
do $$ begin
 if (public.ct_allocation_snapshot('11111111-1111-4111-8111-111111111111')->>'occupied')::integer<>2 then raise exception 'duplicate vendor successors hidden in one slot'; end if;
end $$;
rollback;
