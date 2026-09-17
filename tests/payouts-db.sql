begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.ct_memberships(user_id,vendor_user_id,firm_id,status) values ('11111111-1111-4111-8111-111111111111','payout-user','firm','ACTIVE');
insert into public.ct_accounts(id,user_id,vendor_id,firm_id,kind,lifecycle) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','payout-account','firm','funded','active');
select public.ct_lease('worker','payout-test');
do $$ declare u uuid:='11111111-1111-4111-8111-111111111111'; other_user uuid:='22222222-2222-4222-8222-222222222222'; account uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; method uuid; p uuid; op uuid; result jsonb; again jsonb; d jsonb; i integer; earning uuid; session uuid; begin
 for i in 1..3 loop
 perform public.ct_record_compliance(u,u,jsonb_build_object('requirement',(array['kyc','tax','agreement'])[i],'version','v1','status','approved','source','payout-evidence-'||i,'effective_at',now(),'evidence_reference','fixture'));
 end loop;
 method:=(public.cp_command(u,u,'method-001','method','{"kind":"bank","label":"Bank","masked":"1234","encrypted":"fixture","fingerprint":"same"}')->>'id')::uuid;
 again:=public.cp_command(u,u,'method-001','method','{"kind":"bank","label":"Bank","masked":"1234","encrypted":"new-random-ciphertext","fingerprint":"same"}');
 if (again->>'id')::uuid<>method then raise exception 'method replay duplicated'; end if;
 begin perform public.cp_command(u,u,'method-001','method','{"kind":"bank","label":"Bank","masked":"1234","encrypted":"changed","fingerprint":"different"}'); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm<>'conflict' then raise; end if; end;
 insert into public.ct_records(account_id,user_id,kind,vendor_id,data,vendor_updated_at) values(account,u,'balances','payout-account','{"balance":"2000.00","starting_balance":"0.00"}',now());
 select jsonb_build_object('items',jsonb_agg(jsonb_build_object('session_date',((now() at time zone 'America/Toronto')::date-day_number)::text,'net_pnl','250.00','closing_balance','2000.00'))) into d from generate_series(1,5) day_number;
 insert into public.ct_records(account_id,user_id,kind,vendor_id,data,vendor_updated_at) values(account,u,'daily-stats','payout-account',d,now());
 result:=public.cp_eligibility(u,account);
 if not (result->>'eligible')::boolean or (result->>'maximum_cents')::integer<>100000 then raise exception 'wrong initial eligibility %',result; end if;
 begin perform public.cp_eligibility(other_user,account); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm<>'not_found' then raise; end if; end;
 result:=public.cp_command(u,u,'request-001','request',jsonb_build_object('account_id',account,'method_id',method,'amount_cents',100000)); p:=(result->>'id')::uuid;
 again:=public.cp_command(u,u,'request-001','request',jsonb_build_object('account_id',account,'method_id',method,'amount_cents',100000));
 if result<>again then raise exception 'request replay changed'; end if;
 begin perform public.cp_command(u,u,'request-002','request',jsonb_build_object('account_id',account,'method_id',method,'amount_cents',25000)); raise exception 'unexpected success'; exception when unique_violation then null; end;
 perform public.cp_command(other_user,u,'approve-001','approve',jsonb_build_object('id',p,'cap_offset','0','reason','Reviewed settled sessions'));
 select operation_id into op from public.cp_payouts where id=p;
 if (select state from public.cp_payouts where id=p)<>'approved' then raise exception 'approval state'; end if;
 begin perform public.cp_command(other_user,u,'pay-too-early','mark-paid',jsonb_build_object('id',p,'transfer_reference','early')); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm<>'conflict' then raise; end if; end;
 update public.ct_operations set state='running' where id=op;
 perform public.cp_checkpoint(p,op,'not_started','cap_dispatching');
 perform public.cp_checkpoint(p,op,'cap_dispatching','cap_confirmed','{"max_drawdown_limit":"0"}');
 perform public.cp_checkpoint(p,op,'cap_confirmed','withdrawal_dispatching');
 update public.ct_operations set state='unknown' where id=op;
 begin perform public.cp_command(other_user,u,'unsafe-resume','resume',jsonb_build_object('id',p,'reason','Retry')); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm<>'reconciliation_required' then raise; end if; end;
 begin perform public.ct_resolve(op,other_user,'not_applied','unverified guess'); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm<>'reconciliation_required' then raise; end if; end;
 perform public.cp_command(other_user,u,'reconcile-001','reconcile',jsonb_build_object('id',p,'adjustment_id','adjustment-001','offset',0,'reason','Found adjustment'));
 update public.ct_operations set state='running' where id=op;
 perform public.cp_checkpoint(p,op,'withdrawal_dispatching','withdrawal_confirmed','{"id":"adjustment-001"}');
 perform public.ct_finish(op,'confirmed','{}');
 begin perform public.cp_command(other_user,u,'pay-before-contract','mark-paid',jsonb_build_object('id',p,'transfer_reference','bank-ref')); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm<>'contracts_confirmation_required' then raise; end if; end;
 perform public.cp_command(other_user,u,'contracts-001','contracts-confirm',jsonb_build_object('id',p,'evidence','2 minis / 20 micros changed to 5 / 50 in Tradara'));
 perform public.cp_command(other_user,u,'paid-001','mark-paid',jsonb_build_object('id',p,'transfer_reference','bank-ref'));
 if (select state from public.cp_payouts where id=p)<>'paid' then raise exception 'paid state'; end if;
 if (public.cp_eligibility(u,account)->>'eligible')::boolean then raise exception 'reused prior cycle days'; end if;
 -- A later payout uses remaining cash, not cash minus historical payouts again.
 update public.ct_records set data='{"balance":"4000.00","starting_balance":"0.00"}' where kind='balances';
 update public.ct_records set data=replace(data::text,'2000.00','4000.00')::jsonb where kind='daily-stats';
 update public.cp_payouts set approved_at=now()-interval '10 days' where id=p;
 result:=public.cp_eligibility(u,account);
 if (result->>'maximum_cents')::integer<>200000 or not (result->>'eligible')::boolean then raise exception 'double subtracted payout %',result; end if;
 -- Same day repeated five times cannot create five qualifying days.
 update public.ct_records set data=jsonb_build_object('items',(select jsonb_agg(d->'items'->0) from generate_series(1,5))) where kind='daily-stats';
 if (public.cp_eligibility(u,account)->>'eligible')::boolean then raise exception 'duplicate day counted'; end if;
 update public.ct_records set vendor_updated_at=now()-interval '10 minutes';
 begin perform public.cp_eligibility(u,account); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm<>'fresh_evidence_required' then raise; end if; end;
 -- Affiliate review and exact-once award/session allocation.
 perform public.cp_command(u,u,'enroll-001','affiliate-enroll','{}');
 result:=public.cp_command(u,u,'code-001','code-apply','{"code":"CREATOR","application":"Fixture application"}');
 perform public.cp_command(other_user,u,'code-review-001','code-review',jsonb_build_object('id',result->>'id','state','approved','reason','Reviewed'));
 result:=public.cp_command(u,u,'content-001','content-submit','{"platform":"youtube","url":"https://example.test/video","note":""}');
 perform public.cp_command(other_user,u,'content-review-001','content-review',jsonb_build_object('id',result->>'id','state','approved','views',10000,'reward_cents',5000,'evidence','Verified 10000 views'));
 perform public.cp_command(other_user,u,'content-review-001','content-review',jsonb_build_object('id',result->>'id','state','approved','views',10000,'reward_cents',5000,'evidence','Verified 10000 views'));
 if (select count(*) from public.cp_earnings where kind='content')<>1 then raise exception 'duplicate content award'; end if;
 insert into public.cp_earnings(user_id,source,kind,amount_cents,available_at) values(u,'fixture-commission','commission',1000,now()-interval '40 days') returning id into earning;
 update public.cp_earnings set approved_at=now()-interval '40 days',available_at=now()-interval '40 days' where kind='content';
 perform public.cp_schedule('payout-test'); perform public.cp_schedule('payout-test');
 if (select count(*) from public.cp_payouts where kind='affiliate')<>1 then raise exception 'duplicate session payout'; end if;
 if (select state from public.cp_earnings where id=earning)<>'pending' then raise exception 'hold expired auto-approved'; end if;
 select id,session_id into p,session from public.cp_payouts where kind='affiliate';
 if (select amount_cents from public.cp_payouts where id=p)<>5000 then raise exception 'wrong affiliate amount'; end if;
 perform public.cp_command(other_user,u,'affiliate-approve','approve',jsonb_build_object('id',p,'reason','Verified'));
 if (select state from public.cp_earnings where kind='content')<>'approved' then raise exception 'approval marked paid'; end if;
 perform public.cp_command(other_user,u,'affiliate-paid','mark-paid',jsonb_build_object('id',p,'transfer_reference','affiliate-bank-reference'));
 if (select state from public.cp_earnings where kind='content')<>'paid' then raise exception 'earning not paid'; end if;
 -- Trusted checkout hook freezes rates and only pays commissions on verified paid orders.
 insert into public.ct_plans values('payout-quote','payout-eval','payout-funded',true,true);
 insert into public.ct_slot_orders(id,user_id,request_key,kind,plan_id,quantity) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',other_user,'commission-sale','evaluation','payout-quote',1);
 perform public.cp_attribute_order('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',other_user,'CREATOR',10000);
 perform public.cp_attribute_order('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',other_user,'CREATOR',10000);
 if exists(select 1 from public.cp_earnings where source='order:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then raise exception 'unpaid order earned commission'; end if;
 update public.cp_affiliates set commission_bps=1700 where user_id=u;
 update public.ct_slot_orders set state='paid',payment_reference='verified-sale' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 update public.ct_slot_orders set state='paid' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 if (select amount_cents from public.cp_earnings where source='order:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')<>800 then raise exception 'rate not frozen'; end if;
 insert into public.ct_slot_orders(id,user_id,request_key,kind,plan_id,quantity) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc',u,'self-referral','evaluation','payout-quote',1);
 begin perform public.cp_attribute_order('cccccccc-cccc-4ccc-8ccc-cccccccccccc',u,'CREATOR',10000); raise exception 'unexpected success'; exception when raise_exception then if sqlerrm<>'invalid_affiliate' then raise; end if; end;
end $$;
-- Direct database access cannot expose another customer's destination or bypass APIs.
do $$ declare t text; r record; begin
 foreach t in array array['methods','affiliates','codes','content','attributions','earnings','sessions','payouts','allocations','events','commands'] loop
 if has_table_privilege('authenticated','public.cp_'||t,'SELECT') or has_table_privilege('anon','public.cp_'||t,'SELECT') or has_table_privilege('authenticated','public.cp_'||t,'INSERT') then raise exception 'client access to %',t; end if;
 if not (select relrowsecurity from pg_class where oid=('public.cp_'||t)::regclass) then raise exception 'RLS missing'; end if;
 end loop;
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cp_%' loop
 if has_function_privilege('authenticated',r.signature,'EXECUTE') then raise exception 'client RPC access'; end if;
 end loop;
end $$;
rollback;
