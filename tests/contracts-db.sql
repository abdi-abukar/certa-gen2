begin;
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
select public.ct_lease('contracts-worker','contracts-test');
do $$ declare u uuid:='11111111-1111-4111-8111-111111111111'; r jsonb; replay jsonb; job jsonb; old uuid;begin
 begin perform public.cc_begin(u,'trader@example.test','kyc','kyc-fixture');raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'template_not_configured' then raise;end if;end;
 perform public.cc_publish(u,'kyc','v1',null,null,'fixture activation');
 perform public.cc_publish(u,'sim_funded','2026-09-04.1','5607795','First Party','fixture activation');
 perform public.cc_publish(u,'w9','v1','5461743','First Party','fixture activation');
 perform public.cc_publish(u,'w8ben','v1','5607884','First Party','fixture activation');
 r:=public.cc_begin(u,'trader@example.test','kyc','kyc-fixture');
 replay:=public.cc_begin(u,'trader@example.test','kyc','kyc-fixture');
 if r->>'id'<>replay->>'id' then raise exception 'duplicate KYC';end if;
 replay:=public.cc_begin(u,'trader@example.test','kyc','different-key');
 if r->>'id'<>replay->>'id' then raise exception 'two active KYC sessions';end if;
 job:=public.cc_claim('contracts-test');
 if job->>'type'<>'create' then raise exception 'missing create job';end if;
 perform public.cc_bind((r->>'id')::uuid,'verification-1',null,'https://magic.veriff.me/test');
 perform public.cc_apply((r->>'id')::uuid,'verification-1','approved',now(),'[]');
 perform public.cc_apply((r->>'id')::uuid,'verification-1','approved',now(),'[]');
 if not (public.ct_compliance(u)->>'kyc')::boolean then raise exception 'KYC did not feed compliance';end if;
 if (select count(*) from public.ct_compliance_evidence where requirement='kyc')<>1 then raise exception 'callback repeated approval';end if;
 -- A page refresh/new session request cannot reset approved KYC.
 begin perform public.cc_begin(u,'trader@example.test','kyc','another-key');raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'already_approved' then raise;end if;end;
 perform public.cc_apply((r->>'id')::uuid,'verification-1','pending',now()+interval '1 second','[]');
 if not (public.ct_compliance(u)->>'kyc')::boolean then raise exception 'pending event downgraded KYC';end if;
 begin perform public.cc_begin(u,'trader@example.test','w9','tax-fixture');raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'tax_choice_required' then raise;end if;end;
 perform public.cc_choose_tax(u,'w9');
 r:=public.cc_begin(u,'trader@example.test','w9','tax-fixture'); old:=(r->>'id')::uuid;
 job:=public.cc_claim('contracts-test');
 perform public.cc_bind(old,'101','201','https://docuseal.com/s/fixture');
 perform public.cc_apply(old,'101','approved',now(),'[{"name":"Signed form","url":"https://docuseal.com/file/fixture.pdf"}]');
 -- Switching declared form invalidates the old form. Its callback cannot restore approval.
 perform public.cc_choose_tax(u,'w8ben');
 perform public.cc_apply(old,'101','approved',now()+interval '1 second','[]');
 if (public.ct_compliance(u)->>'tax')::boolean then raise exception 'wrong tax choice approved';end if;
 -- Fixture calls share one transaction clock; model a choice recorded before signing.
 update public.ct_compliance_evidence set effective_at=now()-interval '1 second' where requirement='tax';
 r:=public.cc_begin(u,'trader@example.test','w8ben','new-tax-fixture');
 perform public.cc_claim('contracts-test');
 perform public.cc_bind((r->>'id')::uuid,'102','202','https://docuseal.com/s/fixture2');
 perform public.cc_apply((r->>'id')::uuid,'102','approved',now(),'[]');
 -- Advancing agreement version blocks completion of an old pending form.
 r:=public.cc_begin(u,'trader@example.test','sim_funded','agreement-fixture');
 perform public.cc_claim('contracts-test');
 perform public.cc_publish(u,'sim_funded','v2','9000000','First Party','new terms');
 perform public.cc_bind((r->>'id')::uuid,'103','203','https://docuseal.com/s/fixture3');
 perform public.cc_apply((r->>'id')::uuid,'103','approved',now(),'[]');
 if (public.ct_compliance(u)->>'agreement')::boolean then raise exception 'old agreement version approved';end if;
 r:=public.cc_begin(u,'trader@example.test','sim_funded','current-agreement');
 perform public.cc_claim('contracts-test');
 perform public.cc_bind((r->>'id')::uuid,'104','204','https://docuseal.com/s/fixture4');
 perform public.cc_apply((r->>'id')::uuid,'104','approved',now(),'[]');
 if public.ct_compliance(u)<>'{"kyc":true,"tax":true,"agreement":true}'::jsonb then raise exception 'requirements did not all approve';end if;
 insert into public.ct_memberships(user_id,vendor_user_id,firm_id,status) values(u,'contracts-trader','firm','ACTIVE');
 insert into public.ct_plans values('contract-plan','eval-contract','funded-contract',true,true);
 insert into public.ct_accounts(user_id,vendor_id,firm_id,kind,lifecycle,data) values(u,'passed-contract-eval','firm','evaluation','passed','{"plan_reference":"eval-contract"}');
 perform public.ct_lease('worker','contracts-funding-test');
 perform public.ct_schedule_allocations('contracts-funding-test');
 if not exists(select 1 from public.ct_entitlements where user_id=u and kind='funded' and consumed_by is not null) then raise exception 'verified contracts did not release funded issuance';end if;
 -- Provider callbacks do not save identity/tax payloads, just a durable lookup hint.
 perform public.cc_callback('fixture-hook','docuseal','103',(r->>'id')::uuid);
 perform public.cc_callback('fixture-hook','docuseal','103',(r->>'id')::uuid);
 if (select count(*) from public.cc_callbacks where id='fixture-hook')<>1 then raise exception 'duplicate callback';end if;
 begin perform public.cc_publish(u,'sim_funded','v2','9999999','First Party','mutate historical template');raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'immutable_template_version' then raise;end if;end;
end $$;
do $$ declare t text;begin
 foreach t in array array['templates','tax_choices','requests','callbacks','budgets'] loop
  if has_table_privilege('authenticated','public.cc_'||t,'SELECT') or has_table_privilege('authenticated','public.cc_'||t,'INSERT') then raise exception 'client exposed %',t;end if;
 end loop;
 if has_function_privilege('authenticated','public.cc_apply(uuid,text,text,timestamptz,jsonb)','EXECUTE') then raise exception 'client can approve compliance';end if;
end $$;
rollback;

begin;
insert into auth.users values ('11111111-1111-4111-8111-111111111111');
select public.ct_lease('contracts-worker','recovery-test');
do $$ declare u uuid:='11111111-1111-4111-8111-111111111111'; r jsonb; again jsonb;begin
 perform public.cc_publish(u,'kyc','v1',null,null,'recovery fixture');
 r:=public.cc_begin(u,'trader@example.test','kyc','unknown-create');
 perform public.cc_claim('recovery-test');
 update public.cc_requests set started_at=now()-interval '3 minutes' where id=(r->>'id')::uuid;
 insert into public.cc_callbacks(id,provider,provider_id,state,attempts,started_at) values('exhausted-crash','veriff','fixture','running',5,now()-interval '3 minutes');
 perform public.cc_claim('recovery-test');
 if (select state from public.cc_callbacks where id='exhausted-crash')<>'failed' then raise exception 'exhausted callback stranded running';end if;
 if (select state from public.cc_requests where id=(r->>'id')::uuid)<>'unknown' then raise exception 'crashed creation did not become unknown';end if;
 again:=public.cc_begin(u,'trader@example.test','kyc','another-create-key');
 if again->>'id'<>r->>'id' then raise exception 'unknown create duplicated';end if;
 begin perform public.cc_admin_action(u,(r->>'id')::uuid,'retry','blind retry');raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'request_busy' then raise;end if;end;
 perform public.cc_admin_action(u,(r->>'id')::uuid,'not-created','Vendor support confirmed no creation');
 perform public.cc_admin_action(u,(r->>'id')::uuid,'retry','Retry after verified absence');
 if (select state from public.cc_requests where id=(r->>'id')::uuid)<>'queued' then raise exception 'audited recovery failed';end if;
 perform public.cc_claim('recovery-test');
 perform public.cc_bind((r->>'id')::uuid,'kyc-recovered',null,'https://magic.veriff.me/fixture');
 begin perform public.cc_bind((r->>'id')::uuid,'different-provider-id',null,null);raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'conflict' then raise;end if;end;
 begin perform public.cc_admin_action(u,(r->>'id')::uuid,'cancel','Cancel active external session');raise exception 'unexpected success';
 exception when raise_exception then if sqlerrm<>'request_busy' then raise;end if;end;
end $$;
rollback;
