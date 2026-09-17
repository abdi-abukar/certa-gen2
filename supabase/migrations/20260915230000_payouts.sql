-- Additive payout backend. Reconcile the live baseline before deployment.
begin;
create table public.cp_methods (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('bank','wise','paypal','crypto')), label text not null,
 masked text not null, encrypted text not null, active boolean not null default true, created_at timestamptz not null default now()
);
create index on public.cp_methods(user_id,id);
create table public.cp_affiliates (
 id uuid primary key references auth.users(id), user_id uuid not null unique references auth.users(id),
 status text not null default 'active' check(status in ('active','suspended')), commission_bps integer not null default 800 check(commission_bps between 0 and 10000),
 created_at timestamptz not null default now()
);
create table public.cp_codes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.cp_affiliates(user_id),
 code text not null unique check(code ~ '^[A-Z0-9_-]{4,32}$'), state text not null default 'pending' check(state in ('pending','approved','rejected','disabled')),
 application text not null, reviewed_by uuid references auth.users(id), reviewed_at timestamptz, reason text,
 created_at timestamptz not null default now()
);
create unique index cp_one_pending_code on public.cp_codes(user_id) where state='pending';
create index on public.cp_codes(user_id,id);
create table public.cp_content (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.cp_affiliates(user_id),
 platform text not null, url text not null unique, note text not null default '', state text not null default 'pending' check(state in ('pending','approved','rejected')),
 views bigint check(views>=0), reward_cents bigint check(reward_cents>=0), evidence text, reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index on public.cp_content(user_id,id);
create table public.cp_attributions (
 order_id uuid primary key references public.ct_slot_orders(id), buyer_id uuid not null references auth.users(id),
 user_id uuid not null references public.cp_affiliates(user_id), code_id uuid not null references public.cp_codes(id),
 commission_bps integer not null check(commission_bps between 0 and 10000), sale_cents bigint not null check(sale_cents>0), created_at timestamptz not null default now()
);
create table public.cp_earnings (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.cp_affiliates(user_id),
 source text not null unique, kind text not null check(kind in ('commission','content')), amount_cents bigint not null check(amount_cents>0), currency text not null default 'USD' check(currency='USD'),
 state text not null default 'pending' check(state in ('pending','approved','rejected','reversed','paid')), approved_at timestamptz, available_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id), reason text, created_at timestamptz not null default now()
);
create index on public.cp_earnings(user_id,state,id);
create index cp_earnings_ready on public.cp_earnings(approved_at,available_at,user_id) where state='approved';
create table public.cp_sessions (
 id uuid primary key default gen_random_uuid(), pay_date date not null unique, cutoff timestamptz not null, created_at timestamptz not null default now()
);
create table public.cp_payouts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), kind text not null check(kind in ('trader','affiliate')),
 account_id uuid references public.ct_accounts(id), session_id uuid references public.cp_sessions(id), method_id uuid not null references public.cp_methods(id),
 method_snapshot jsonb not null, amount_cents bigint not null check(amount_cents between 25000 and 1000000000 or kind='affiliate' and amount_cents>0), currency text not null default 'USD' check(currency='USD'),
 state text not null default 'requested' check(state in ('requested','approved','processing','ready','paid','rejected')),
 eligibility jsonb, rule_version text not null default 'cash-withdrawal-2026-09-15', cap_offset text,
 operation_id uuid references public.ct_operations(id), step text not null default 'not_started' check(step in ('not_started','cap_dispatching','cap_confirmed','withdrawal_dispatching','withdrawal_confirmed')),
 adjustment_id text unique, adjustment jsonb, cap_result jsonb, last_error text,
 contracts_required boolean not null default false, contracts_confirmed_by uuid references auth.users(id), contracts_evidence text,
 requested_at timestamptz not null default now(), approved_at timestamptz, approved_by uuid references auth.users(id),
 paid_at timestamptz, paid_by uuid references auth.users(id), transfer_reference text unique, reason text,
 check((kind='trader' and account_id is not null and session_id is null) or (kind='affiliate' and session_id is not null and account_id is null)),
 unique(session_id,user_id,currency)
);
create unique index cp_one_open_account on public.cp_payouts(account_id) where kind='trader' and state not in ('paid','rejected');
create index on public.cp_payouts(user_id,id);
create index on public.cp_payouts(kind,state,id);
create index on public.cp_payouts(account_id,approved_at) where approved_at is not null;
create index ct_payout_evidence on public.ct_records(account_id,kind,vendor_updated_at desc) where kind in ('balances','daily-stats');
create table public.cp_allocations (
 earning_id uuid primary key references public.cp_earnings(id), payout_id uuid not null references public.cp_payouts(id)
);
create index on public.cp_allocations(payout_id);
create table public.cp_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), entity_id uuid not null,
 action text not null, actor_id uuid references auth.users(id), data jsonb not null default '{}', created_at timestamptz not null default now()
);
create index on public.cp_events(user_id,entity_id,created_at);
create table public.cp_commands (
 actor_id uuid not null references auth.users(id), request_key text not null, action text not null, body jsonb not null, result jsonb, primary key(actor_id,request_key)
);
-- Evidence refresh is explicit and durable. Customer GET never calls Tradara.
create function public.cp_eligibility(p_user uuid,p_account uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.ct_accounts; b public.ct_records; d public.ct_records; prior integer; cutoff date; days jsonb; bal numeric; base numeric; max_cents bigint; begin
 select * into a from public.ct_accounts where id=p_account and user_id=p_user;
 if not found then raise exception 'not_found'; end if;
 if a.kind<>'funded' or a.lifecycle not in ('active','locked') then raise exception 'funded_active_required'; end if;
 if public.ct_compliance(p_user)<>'{"kyc":true,"tax":true,"agreement":true}'::jsonb
 or not exists(select 1 from public.ct_memberships where user_id=p_user and status='ACTIVE') then raise exception 'compliance_required'; end if;
 select * into b from public.ct_records where account_id=p_account and kind='balances' order by vendor_updated_at desc limit 1;
 select * into d from public.ct_records where account_id=p_account and kind='daily-stats' order by vendor_updated_at desc limit 1;
 if b.id is null or d.id is null or b.vendor_updated_at<now()-interval '5 minutes' or d.vendor_updated_at<now()-interval '5 minutes' then raise exception 'fresh_evidence_required'; end if;
 if coalesce(b.data->>'balance','') !~ '^-?[0-9]+([.][0-9]+)?$' then raise exception 'fresh_evidence_required'; end if;
 bal:=(b.data->>'balance')::numeric;
 if coalesce(b.data->>'starting_balance','') !~ '^-?[0-9]+([.][0-9]+)?$' then raise exception 'fresh_evidence_required'; end if;
 base:=(b.data->>'starting_balance')::numeric;
 if exists(select 1 from jsonb_array_elements(coalesce(d.data->'items','[]')) x group by x->>'session_date' having count(distinct x)>1) then raise exception 'fresh_evidence_required'; end if;
 select count(*),max((approved_at at time zone 'America/Toronto')::date) into prior,cutoff from public.cp_payouts where account_id=p_account and approved_at is not null;
 -- Exclude the current calendar date (unfinished session), deduplicate vendor session dates.
 select coalesce(jsonb_agg(session_date order by session_date),'[]') into days from (
 select x->>'session_date' session_date from jsonb_array_elements(coalesce(d.data->'items','[]')) x
 where (x->>'session_date') ~ '^\d{4}-\d{2}-\d{2}$'
 and (x->>'session_date')::date < (now() at time zone 'America/Toronto')::date
 and (cutoff is null or (x->>'session_date')::date>cutoff)
 and case when (x->>'net_pnl') ~ '^-?[0-9]+([.][0-9]+)?$' then (x->>'net_pnl')::numeric>=250 else false end group by x->>'session_date' having count(distinct x->>'net_pnl')=1) q;
 -- Cash is actually withdrawn in this policy. Never subtract paid payouts again.
 select least(bal,(x->>'closing_balance')::numeric) into bal from jsonb_array_elements(coalesce(d.data->'items','[]')) x
 where (x->>'session_date') ~ '^\d{4}-\d{2}-\d{2}$' and (x->>'session_date')::date<(now() at time zone 'America/Toronto')::date and (x->>'closing_balance') ~ '^-?[0-9]+([.][0-9]+)?$' order by x->>'session_date' desc limit 1;
 if bal is null then raise exception 'settled_balance_required'; end if;
 max_cents:=greatest(0,least(floor((bal-base)*50),case when prior=0 then 100000 else 200000 end));
 return jsonb_build_object('eligible',jsonb_array_length(days)>=5 and max_cents>=25000 and (prior=0 or bal-base>=4000),
 'balance',bal::text,'maximum_cents',max_cents,'minimum_cents',25000,'qualifying_dates',days,'prior_approvals',prior,
 'cycle_after',cutoff,'balance_checked_at',b.vendor_updated_at,'days_checked_at',d.vendor_updated_at,'rule_version','cash-withdrawal-2026-09-15');
end $$;

create function public.cp_event(p_user uuid,p_entity uuid,p_actor uuid,p_action text,p_data jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.cp_events(user_id,entity_id,actor_id,action,data) values(p_user,p_entity,p_actor,p_action,p_data)
$$;

-- Internal checkout boundary: call only with an authoritative immutable server quote.
-- No public endpoint accepts a sale amount or creates a commission.
create function public.cp_attribute_order(p_order uuid,p_buyer uuid,p_code text,p_sale_cents bigint) returns void language plpgsql security definer set search_path='' as $$
declare c public.cp_codes; a public.cp_affiliates; old public.cp_attributions; begin
 perform 1 from public.ct_slot_orders where id=p_order and user_id=p_buyer and state='reserved' for update;
 if not found or p_sale_cents<=0 then raise exception 'conflict'; end if;
 select * into c from public.cp_codes where code=upper(p_code) and state='approved';
 select * into a from public.cp_affiliates where user_id=c.user_id and status='active';
 if a.id is null or a.user_id=p_buyer then raise exception 'invalid_affiliate'; end if;
 select * into old from public.cp_attributions where order_id=p_order;
 if found then
 if old.code_id<>c.id or old.sale_cents<>p_sale_cents then raise exception 'conflict'; end if; return;
 end if;
 insert into public.cp_attributions values(p_order,p_buyer,a.user_id,c.id,a.commission_bps,p_sale_cents,now());
end $$;
create function public.cp_order_paid() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='paid' and old.state<>'paid' then
 insert into public.cp_earnings(user_id,source,kind,amount_cents)
 select user_id,'order:'||new.id,'commission',floor(sale_cents*commission_bps/10000.0) from public.cp_attributions
 where order_id=new.id and floor(sale_cents*commission_bps/10000.0)>0 on conflict(source) do nothing;
 end if; return new;
end $$;
create trigger cp_order_paid after update of state on public.ct_slot_orders for each row execute function public.cp_order_paid();

create function public.cp_command(p_actor uuid,p_user uuid,p_key text,p_action text,p_body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare old public.cp_commands; result jsonb; m public.cp_methods; p public.cp_payouts; e public.cp_earnings; c public.cp_codes; s public.cp_content; v_eligibility jsonb; op jsonb; ident uuid; cents bigint; begin
 if p_key !~ '^[A-Za-z0-9:_-]{8,100}$' then raise exception 'conflict'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cp-command:'||p_actor||':'||p_key,0));
 select * into old from public.cp_commands where actor_id=p_actor and request_key=p_key;
 if found then
 if old.action<>p_action or (old.body #- '{body,encrypted}')<>(jsonb_build_object('user',p_user,'body',p_body) #- '{body,encrypted}') then raise exception 'conflict'; end if;
 return old.result; end if;
 -- Serialize all payout/earning changes for an owner, including batch creation.
 perform pg_advisory_xact_lock(hashtextextended('cp-user:'||p_user,0));
 if p_action='method' then
 insert into public.cp_methods(user_id,kind,label,masked,encrypted) values(p_user,p_body->>'kind',p_body->>'label',p_body->>'masked',p_body->>'encrypted') returning id into ident;
 result:=jsonb_build_object('id',ident);
 elsif p_action='disable-method' then
 update public.cp_methods set active=false where id=(p_body->>'id')::uuid and user_id=p_user returning id into ident;
 if not found then raise exception 'not_found'; end if; result:=jsonb_build_object('id',ident);
 elsif p_action='affiliate-enroll' then
 insert into public.cp_affiliates(id,user_id) values(p_user,p_user) on conflict do nothing;
 result:=jsonb_build_object('user_id',p_user);
 elsif p_action='affiliate-manage' then
 update public.cp_affiliates set status=p_body->>'status',commission_bps=(p_body->>'commission_bps')::integer where user_id=p_user returning id into ident;
 if not found then raise exception 'not_found'; end if; result:=jsonb_build_object('id',ident);
 elsif p_action='code-apply' then
 insert into public.cp_codes(user_id,code,application) values(p_user,p_body->>'code',p_body->>'application') returning id into ident;
 result:=jsonb_build_object('id',ident);
 elsif p_action='code-review' then
 select * into c from public.cp_codes where id=(p_body->>'id')::uuid and user_id=p_user for update;
 if not found or c.state not in ('pending','approved','disabled') then raise exception 'conflict'; end if;
 update public.cp_codes set state=p_body->>'state',reason=p_body->>'reason',reviewed_by=p_actor,reviewed_at=now() where id=c.id;
 ident:=c.id; result:=jsonb_build_object('id',ident,'state',p_body->>'state');
 elsif p_action='content-submit' then
 insert into public.cp_content(user_id,platform,url,note) values(p_user,p_body->>'platform',p_body->>'url',coalesce(p_body->>'note','')) returning id into ident;
 result:=jsonb_build_object('id',ident);
 elsif p_action='content-review' then
 select * into s from public.cp_content where id=(p_body->>'id')::uuid and user_id=p_user for update;
 if not found or s.state<>'pending' then raise exception 'conflict'; end if;
 cents:=(p_body->>'reward_cents')::bigint;
 update public.cp_content set state=p_body->>'state',views=(p_body->>'views')::bigint,reward_cents=cents,evidence=p_body->>'evidence',reviewed_by=p_actor,reviewed_at=now() where id=s.id;
 if p_body->>'state'='approved' and cents>0 then
 insert into public.cp_earnings(user_id,source,kind,amount_cents,state,approved_at,reviewed_by) values(p_user,'content:'||s.id,'content',cents,'approved',now(),p_actor);
 end if;
 ident:=s.id; result:=jsonb_build_object('id',ident);
 elsif p_action='commission-review' then
 select * into e from public.cp_earnings where id=(p_body->>'id')::uuid and user_id=p_user and kind='commission' for update;
 if not found or e.state not in ('pending','approved','rejected') or exists(select 1 from public.cp_allocations where earning_id=e.id) then raise exception 'conflict'; end if;
 update public.cp_earnings set state=p_body->>'state',approved_at=case when p_body->>'state'='approved' then now() end,reviewed_by=p_actor,reason=p_body->>'reason' where id=e.id;
 ident:=e.id; result:=jsonb_build_object('id',ident);
 elsif p_action='request' then
 select * into m from public.cp_methods where id=(p_body->>'method_id')::uuid and user_id=p_user and active;
 if not found then raise exception 'method_required'; end if;
 v_eligibility:=public.cp_eligibility(p_user,(p_body->>'account_id')::uuid);
 cents:=(p_body->>'amount_cents')::bigint;
 if not (v_eligibility->>'eligible')::boolean or cents<25000 or cents>(v_eligibility->>'maximum_cents')::bigint then raise exception 'not_eligible'; end if;
 insert into public.cp_payouts(user_id,kind,account_id,method_id,method_snapshot,amount_cents,eligibility)
 values(p_user,'trader',(p_body->>'account_id')::uuid,m.id,to_jsonb(m)-'user_id'-'created_at',cents,v_eligibility) returning * into p;
 ident:=p.id; result:=jsonb_build_object('id',p.id,'state',p.state);
 elsif p_action='refresh-evidence' then
 if exists(select 1 from public.ct_operations where account_id=(p_body->>'account_id')::uuid and action='payout-evidence' and created_at>now()-interval '30 seconds') then raise exception 'cooldown'; end if;
 op:=public.ct_enqueue(p_actor,p_user,(p_body->>'account_id')::uuid,'payout-evidence','payout-evidence:'||gen_random_uuid(),'{}');
 ident:=(op->>'id')::uuid; result:=jsonb_build_object('operation_id',ident);
 else
 select * into p from public.cp_payouts where id=(p_body->>'id')::uuid and user_id=p_user for update;
 if not found then raise exception 'not_found'; end if;
 ident:=p.id;
 if p_action='reject' then
 if p.state<>'requested' then raise exception 'conflict'; end if;
 update public.cp_payouts set state='rejected',reason=p_body->>'reason' where id=p.id;
 -- Keep rejected session allocations frozen; staff must resolve it within that session.
 elsif p_action='reopen' then
 if p.kind<>'affiliate' or p.state<>'rejected' then raise exception 'conflict'; end if;
 select * into m from public.cp_methods where id=(p_body->>'method_id')::uuid and user_id=p_user and active;
 if not found then raise exception 'method_required'; end if;
 update public.cp_payouts set state='requested',method_id=m.id,method_snapshot=to_jsonb(m)-'user_id'-'created_at',reason=p_body->>'reason' where id=p.id;
 elsif p_action='approve' then
 if p.state<>'requested' then raise exception 'conflict'; end if;
 if not exists(select 1 from public.cp_methods where id=p.method_id and active) then raise exception 'method_required'; end if;
 if p.kind='trader' then
 v_eligibility:=public.cp_eligibility(p_user,p.account_id);
 if not (v_eligibility->>'eligible')::boolean or p.amount_cents>(v_eligibility->>'maximum_cents')::bigint then raise exception 'not_eligible'; end if;
 if coalesce(p_body->>'cap_offset','') !~ '^-?[0-9]{1,12}([.][0-9]{1,2})?$' then raise exception 'cap_required'; end if;
 update public.cp_payouts set eligibility=v_eligibility,cap_offset=p_body->>'cap_offset',contracts_required=(v_eligibility->>'prior_approvals')::integer=0 where id=p.id;
 -- One operation owns this account through cap and withdrawal, including ambiguity.
 op:=public.ct_enqueue(p_actor,p_user,p.account_id,'payout-settle','payout-settle:'||p.id,jsonb_build_object('payout_id',p.id));
 update public.cp_payouts set operation_id=(op->>'id')::uuid where id=p.id;
 else
 if not exists(select 1 from public.cp_affiliates where user_id=p_user and status='active') then raise exception 'affiliate_suspended'; end if;
 end if;
 update public.cp_payouts set state='approved',approved_by=p_actor,approved_at=now(),reason=p_body->>'reason' where id=p.id;
 elsif p_action='contracts-confirm' then
 if p.kind<>'trader' or p.approved_at is null or not p.contracts_required or p.contracts_confirmed_by is not null then raise exception 'conflict'; end if;
 update public.cp_payouts set contracts_confirmed_by=p_actor,contracts_evidence=p_body->>'evidence' where id=p.id;
 elsif p_action='mark-paid' then
 if not (p.kind='affiliate' and p.state='approved' or p.kind='trader' and p.state='ready') then raise exception 'conflict'; end if;
 if p.kind='trader' and not exists(select 1 from public.ct_operations where id=p.operation_id and state='confirmed') then raise exception 'reconciliation_required'; end if;
 if p.contracts_required and p.contracts_confirmed_by is null then raise exception 'contracts_confirmation_required'; end if;
 update public.cp_payouts set state='paid',paid_at=now(),paid_by=p_actor,transfer_reference=p_body->>'transfer_reference' where id=p.id;
 update public.cp_earnings set state='paid' where id in(select earning_id from public.cp_allocations where payout_id=p.id);
 elsif p_action='change-cap' then
 if p.kind<>'trader' or p.step<>'not_started' or p.approved_at is null or not exists(select 1 from public.ct_operations where id=p.operation_id and state='failed') then raise exception 'conflict'; end if;
 if coalesce(p_body->>'cap_offset','') !~ '^-?[0-9]{1,12}([.][0-9]{1,2})?$' then raise exception 'cap_required'; end if;
 update public.cp_payouts set cap_offset=p_body->>'cap_offset' where id=p.id;
 elsif p_action='not-applied' then
 if p.kind<>'trader' or p.step not in ('cap_dispatching','withdrawal_dispatching') or not exists(select 1 from public.ct_operations where id=p.operation_id and state in ('failed','unknown')) then raise exception 'conflict'; end if;
 if length(coalesce(p_body->>'evidence',''))<10 then raise exception 'reconciliation_required'; end if;
 update public.cp_payouts set step=case when step='cap_dispatching' then 'not_started' else 'cap_confirmed' end where id=p.id;
 update public.ct_operations set state='failed',error_code='operator_confirmed_not_applied' where id=p.operation_id;
 elsif p_action='resume' then
 -- Only requeue before a write, or after independently resolving the cap. A cash
 -- dispatch of unknown outcome requires adjustment reconciliation, never replay.
 if p.kind<>'trader' or p.state not in ('approved','processing') or p.step not in ('not_started','cap_confirmed') then raise exception 'reconciliation_required'; end if;
 perform 1 from public.ct_operations where id=p.operation_id and state in ('failed','unknown','confirmed') for update;
 if not found then raise exception 'conflict'; end if;
 update public.ct_operations set state='queued',action='payout-settle',payload=jsonb_build_object('payout_id',p.id),started_at=null,finished_at=null,error_code=null where id=p.operation_id;
 elsif p_action='reconcile' then
 if p.kind<>'trader' or p.step not in ('cap_dispatching','withdrawal_dispatching','withdrawal_confirmed') then raise exception 'conflict'; end if;
 perform 1 from public.ct_operations where id=p.operation_id and state in ('failed','unknown','confirmed') for update;
 if not found then raise exception 'conflict'; end if;
 update public.ct_operations set state='queued',action='payout-reconcile',payload=jsonb_build_object('payout_id',p.id,'adjustment_id',p_body->>'adjustment_id','offset',coalesce((p_body->>'offset')::integer,0)),started_at=null,finished_at=null where id=p.operation_id;
 else raise exception 'unsupported_action'; end if;
 result:=jsonb_build_object('id',p.id);
 end if;
 perform public.cp_event(p_user,coalesce(ident,p_user),p_actor,p_action,p_body-'encrypted');
 insert into public.cp_commands values(p_actor,p_key,p_action,jsonb_build_object('user',p_user,'body',p_body),result);
 return result;
end $$;

-- The calendar creates liabilities, never evidence that money was sent.
create function public.cp_schedule(p_owner text) returns integer language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/Toronto')::date; due date; session public.cp_sessions; u record; m public.cp_methods; p public.cp_payouts; total bigint; n integer:=0; begin
 if not exists(select 1 from public.ct_runtime where id='worker' and owner=p_owner and expires_at>now()) then raise exception 'conflict'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('cp-scheduler',0)) then return 0; end if;
 due:=date_trunc('month',today)::date+case when extract(day from today)>=15 then 14 else 0 end;
 insert into public.cp_sessions(pay_date,cutoff) values(due,due::timestamp at time zone 'America/Toronto') on conflict(pay_date) do nothing;
 select * into session from public.cp_sessions where pay_date=due;
 for u in select distinct e.user_id from public.cp_earnings e join public.cp_affiliates a on a.user_id=e.user_id
 where a.status='active' and exists(select 1 from public.cp_methods method_candidate where method_candidate.user_id=e.user_id and method_candidate.active) and e.state='approved' and e.approved_at<session.cutoff and e.available_at<=session.cutoff
 and not exists(select 1 from public.cp_allocations x where x.earning_id=e.id)
 and not exists(select 1 from public.cp_payouts existing_payout where existing_payout.user_id=e.user_id and existing_payout.session_id=session.id)
 order by e.user_id limit 100 loop
 perform pg_advisory_xact_lock(hashtextextended('cp-user:'||u.user_id,0));
 if not exists(select 1 from public.cp_affiliates where user_id=u.user_id and status='active') then continue; end if;
 select * into m from public.cp_methods where user_id=u.user_id and active order by created_at desc,id limit 1;
 if not found then continue; end if;
 select sum(amount_cents) into total from public.cp_earnings e where user_id=u.user_id and state='approved' and approved_at<session.cutoff and available_at<=session.cutoff
 and not exists(select 1 from public.cp_allocations x where x.earning_id=e.id);
 if coalesce(total,0)=0 then continue; end if;
 insert into public.cp_payouts(user_id,kind,session_id,method_id,method_snapshot,amount_cents)
 values(u.user_id,'affiliate',session.id,m.id,to_jsonb(m)-'user_id'-'created_at',total) returning * into p;
 insert into public.cp_allocations select e.id,p.id from public.cp_earnings e where user_id=u.user_id and state='approved' and approved_at<session.cutoff and available_at<=session.cutoff
 and not exists(select 1 from public.cp_allocations x where x.earning_id=e.id);
 perform public.cp_event(u.user_id,p.id,null,'session-created',jsonb_build_object('session_id',session.id)); n:=n+1;
 end loop; return n;
end $$;

-- Each external mutation is preceded by a committed checkpoint. A crash cannot
-- move a payout back to a dispatchable state.
create function public.cp_checkpoint(p_id uuid,p_operation uuid,p_expected text,p_next text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.cp_payouts; begin
 select * into p from public.cp_payouts where id=p_id and operation_id=p_operation for update;
 if not found or p.step<>p_expected or p.state not in ('approved','processing','ready') then raise exception 'conflict'; end if;
 if not exists(select 1 from public.ct_operations where id=p_operation and state='running') then raise exception 'conflict'; end if;
 if (p_expected,p_next) not in (('not_started','cap_dispatching'),('cap_dispatching','cap_confirmed'),('cap_confirmed','withdrawal_dispatching'),('withdrawal_dispatching','withdrawal_confirmed'),('withdrawal_confirmed','withdrawal_confirmed')) then raise exception 'conflict'; end if;
 update public.cp_payouts set step=p_next,state=case when p_next='withdrawal_confirmed' then 'ready' else 'processing' end,
 cap_result=case when p_next='cap_confirmed' then p_data else cap_result end,
 adjustment_id=case when p_next='withdrawal_confirmed' then p_data->>'id' else adjustment_id end,
 adjustment=case when p_next='withdrawal_confirmed' then p_data else adjustment end,last_error=null
 where id=p_id returning * into p;
 perform public.cp_event(p.user_id,p.id,null,p_next,p_data);
 return to_jsonb(p);
end $$;

-- Payout recovery cannot be bypassed through the generic operation resolver.
create function public.cp_guard_operation_recovery() returns trigger language plpgsql set search_path='' as $$
begin
 if old.action in ('payout-settle','payout-reconcile') and old.state in ('failed','unknown') and new.state in ('queued','confirmed') then
 if not exists(select 1 from public.cp_payouts where operation_id=old.id and
 (new.state='queued' and (step in ('not_started','cap_confirmed') or new.action='payout-reconcile') or new.state='confirmed' and step='withdrawal_confirmed')) then raise exception 'reconciliation_required'; end if;
 end if; return new;
end $$;
create trigger cp_guard_operation_recovery before update on public.ct_operations for each row execute function public.cp_guard_operation_recovery();

create function public.cp_summary(p_user uuid default null,p_session uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('currency','USD','session',(select to_jsonb(s) from public.cp_sessions s where s.id=p_session),
 'payouts',coalesce((select jsonb_agg(to_jsonb(q)) from (select kind,state,count(*) requests,sum(amount_cents) amount_cents from public.cp_payouts where (p_user is null or user_id=p_user) and (p_session is null or session_id=p_session) group by kind,state) q),'[]'),
 'earnings',coalesce((select jsonb_agg(to_jsonb(q)) from (select kind,state,count(*) entries,sum(amount_cents) amount_cents from public.cp_earnings where (p_user is null or user_id=p_user) group by kind,state) q),'[]'),
 'missing_method_affiliates',(select count(*) from public.cp_affiliates a where (p_user is null or a.user_id=p_user) and a.status='active' and exists(select 1 from public.cp_earnings e where e.user_id=a.user_id and e.state='approved' and not exists(select 1 from public.cp_allocations x where x.earning_id=e.id)) and not exists(select 1 from public.cp_methods m where m.user_id=a.user_id and m.active)))
$$;

-- Privileged tables are API-only. Customer DTOs exclude encrypted destinations,
-- staff evidence and other customers' attribution information.
do $$ declare t text; r record; begin
 foreach t in array array['methods','affiliates','codes','content','attributions','earnings','sessions','payouts','allocations','events','commands'] loop
 execute format('alter table public.cp_%I enable row level security',t);
 execute format('revoke all on public.cp_%I from public,anon,authenticated',t);
 execute format('grant select,insert,update on public.cp_%I to service_role',t);
 end loop;
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cp_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);
 execute format('grant execute on function %s to service_role',r.signature);
 end loop;
end $$;
revoke update on public.cp_events,public.cp_commands from service_role;
commit;
