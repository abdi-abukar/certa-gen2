-- Backend-only account allocation and compliance. Reconcile the live baseline first.
begin;
create table public.ct_plans (
 id text primary key, evaluation_plan text not null unique, funded_plan text not null,
 enabled boolean not null default false, pass_only_verified boolean not null default false
);
create table public.ct_compliance_requirements (
 id text primary key check(id in ('kyc','tax','agreement')), version text not null
);
insert into public.ct_compliance_requirements values ('kyc','v1'),('tax','v1'),('agreement','v1');
create table public.ct_compliance_evidence (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 requirement text not null references public.ct_compliance_requirements(id), version text not null,
 status text not null check(status in ('approved','revoked','rejected')), source text not null unique,
 effective_at timestamptz not null, expires_at timestamptz, actor_id uuid not null references auth.users(id),
 evidence_reference text not null, created_at timestamptz not null default now()
);
create index on public.ct_compliance_evidence(user_id,requirement,effective_at desc);
create table public.ct_slot_orders (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 request_key text not null, kind text not null check(kind in ('evaluation','practice','funded')),
 plan_id text not null references public.ct_plans(id), quantity integer not null check(quantity between 1 and 3),
 state text not null default 'reserved' check(state in ('reserved','paid','cancelled')),
 expires_at timestamptz not null default now()+interval '30 minutes', payment_reference text unique,
 created_at timestamptz not null default now(), unique(user_id,request_key)
);
create table public.ct_slots (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 order_id uuid references public.ct_slot_orders(id), current_account_id uuid unique references public.ct_accounts(id),
 released_at timestamptz, created_at timestamptz not null default now()
);
create index on public.ct_slots(user_id) where released_at is null;
alter table public.ct_accounts drop column compliance_hold;
alter table public.ct_accounts add column slot_id uuid references public.ct_slots(id);
alter table public.ct_entitlements add column slot_id uuid references public.ct_slots(id);
alter table public.ct_entitlements add column origin text not null default 'grant' check(origin in ('purchase','pass','grant','replacement'));
alter table public.ct_entitlements add column replaces_id uuid references public.ct_accounts(id);
alter table public.ct_entitlements add column issued_account_id uuid unique references public.ct_accounts(id);
alter table public.ct_entitlements add column cancelled_at timestamptz;
alter table public.ct_entitlements drop column compliance_approved;
create unique index ct_one_upgrade on public.ct_entitlements(predecessor_id) where kind='funded' and origin='pass';
create unique index ct_one_replacement on public.ct_entitlements(replaces_id) where replaces_id is not null;
create index on public.ct_entitlements(user_id) where issued_account_id is null and cancelled_at is null;
create index on public.ct_accounts(user_id) where slot_id is null;
create table public.ct_closures (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 account_id uuid not null unique references public.ct_accounts(id), actor_id uuid not null references auth.users(id),
 reason text not null, created_at timestamptz not null default now()
);
create table public.ct_allocation_dirty (user_id uuid primary key references auth.users(id), updated_at timestamptz not null default now());

create function public.ct_compliance(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_object_agg(r.id,coalesce(e.status='approved' and e.version=r.version and (e.expires_at is null or e.expires_at>now()),false))
 from public.ct_compliance_requirements r left join lateral (
  select * from public.ct_compliance_evidence where user_id=p_user and requirement=r.id
  order by effective_at desc,(status='approved') asc,created_at desc,id desc limit 1
 ) e on true
$$;
create function public.ct_allocation_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.ct_allocation_dirty(user_id) values(new.user_id) on conflict(user_id) do update set updated_at=now();
 return new;
end $$;
create trigger ct_account_allocation_changed after insert or update of lifecycle,predecessor_id,successor_id,data on public.ct_accounts for each row execute function public.ct_allocation_changed();
create trigger ct_member_allocation_changed after insert or update of status on public.ct_memberships for each row execute function public.ct_allocation_changed();
create trigger ct_operation_allocation_changed after update of state on public.ct_operations for each row when(new.user_id is not null) execute function public.ct_allocation_changed();

-- Only local allocation records change here. Vendor account lifecycle is never synthesized.
create function public.ct_reconcile_allocations(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare a public.ct_accounts; prev public.ct_accounts; s public.ct_slots; e public.ct_entitlements; plan text; begin
 perform pg_advisory_xact_lock(hashtextextended('slots:'||p_user::text,0));
 -- Attach authoritative lineage before treating external accounts as new capacity.
 for a in select * from public.ct_accounts where user_id=p_user and slot_id is null order by (predecessor_id is null) desc,id loop
  select * into prev from public.ct_accounts where user_id=p_user and (vendor_id=a.predecessor_id or successor_id=a.vendor_id) limit 1;
  if prev.slot_id is not null and exists(select 1 from public.ct_slots where id=prev.slot_id and current_account_id=prev.id) then
   update public.ct_accounts set slot_id=prev.slot_id where id=a.id;
   update public.ct_slots set current_account_id=a.id,released_at=null where id=prev.slot_id;
   update public.ct_entitlements set issued_account_id=a.id where predecessor_id=prev.id and issued_account_id is null and kind='funded' and origin='pass';
  else
   insert into public.ct_slots(user_id,current_account_id) values(p_user,a.id) returning * into s;
   update public.ct_accounts set slot_id=s.id where id=a.id;
  end if;
 end loop;
 -- Merge a late successor only when it replaces its exact predecessor, never a sibling.
 for a in select a.* from public.ct_accounts a join public.ct_accounts prev on (prev.vendor_id=a.predecessor_id or prev.successor_id=a.vendor_id) and prev.user_id=a.user_id
 join public.ct_slots s on s.id=prev.slot_id and s.current_account_id=prev.id
 where a.user_id=p_user and a.kind='funded' and a.slot_id<>prev.slot_id loop
  select * into prev from public.ct_accounts where (vendor_id=a.predecessor_id or successor_id=a.vendor_id) and user_id=p_user limit 1;
  if not exists(select 1 from public.ct_slots where id=prev.slot_id and current_account_id=prev.id) then continue; end if;
  update public.ct_slots set current_account_id=null,released_at=now() where id=a.slot_id;
  update public.ct_accounts set slot_id=prev.slot_id where id=a.id;
  update public.ct_slots set current_account_id=a.id,released_at=null where id=prev.slot_id;
 end loop;
 -- A pass creates exactly one durable obligation, including when no plan mapping exists yet.
 for a in select a.* from public.ct_accounts a join public.ct_slots s on s.id=a.slot_id
  where a.user_id=p_user and a.kind='evaluation' and a.lifecycle in ('passed','upgraded')
  and not exists(select 1 from public.ct_entitlements where predecessor_id=a.id and origin='pass') loop
  select p.funded_plan into plan from public.ct_plans p where p.evaluation_plan=a.data->>'plan_reference' and p.enabled and p.pass_only_verified limit 1;
  insert into public.ct_entitlements(user_id,kind,source,plan_reference,predecessor_id,slot_id,origin,issued_account_id)
   values(p_user,'funded','pass:'||a.id,coalesce(plan,''),a.id,a.slot_id,'pass',
    (select id from public.ct_accounts where user_id=p_user and (predecessor_id=a.vendor_id or vendor_id=a.successor_id) and kind='funded' and slot_id=a.slot_id limit 1))
   on conflict do nothing;
 end loop;
 update public.ct_entitlements e set plan_reference=p.funded_plan from public.ct_accounts a,public.ct_plans p
 where e.user_id=p_user and e.origin='pass' and e.plan_reference='' and a.id=e.predecessor_id and p.evaluation_plan=a.data->>'plan_reference' and p.enabled and p.pass_only_verified;
 -- Late vendor successors satisfy the obligation; a pending request must never create another.
 update public.ct_entitlements e set issued_account_id=a.id from public.ct_accounts a,public.ct_accounts prev
 where e.user_id=p_user and e.origin='pass' and e.issued_account_id is null and prev.id=e.predecessor_id
 and a.user_id=p_user and a.kind='funded' and a.slot_id=e.slot_id and (a.predecessor_id=prev.vendor_id or prev.successor_id=a.vendor_id);
 -- A closed/failed account frees capacity only when no unfulfilled entitlement remains.
 update public.ct_slots s set released_at=now() from public.ct_accounts a where s.user_id=p_user and s.released_at is null
 and a.id=s.current_account_id and a.lifecycle in ('closed','failed')
 and not exists(select 1 from public.ct_entitlements e where e.slot_id=s.id and e.issued_account_id is null and e.cancelled_at is null);
 -- Reopened externally? Count it again, even if that exposes an over-capacity exception.
 update public.ct_slots s set released_at=null from public.ct_accounts a where s.user_id=p_user and s.released_at is not null
 and a.id=s.current_account_id and a.lifecycle not in ('closed','failed');
end $$;

create function public.ct_allocation_snapshot(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('limit',3,'occupied',n,'available',greatest(0,3-n),'over_capacity',n>3,
 'compliance',public.ct_compliance(p_user),'requirements',(select jsonb_object_agg(id,version) from public.ct_compliance_requirements),'slots',coalesce((select jsonb_agg(jsonb_build_object(
 'id',s.id,'account_id',s.current_account_id,'account',case when a.id is null then null else jsonb_build_object('id',a.id,'vendor_id',a.vendor_id,'kind',a.kind,'lifecycle',a.lifecycle) end,
 'state',case when e.id is not null then case when e.consumed_by is not null then coalesce(o.state,'provisioning')
 when e.replaces_id is not null and a.lifecycle<>'closed' then 'awaiting_tradara_closure'
 when e.plan_reference='' then 'plan_mapping_required'
 when e.kind='funded' and public.ct_compliance(p_user)<>'{"kyc":true,"tax":true,"agreement":true}'::jsonb then 'compliance_pending'
 else 'ready' end when s.current_account_id is null then 'checkout_reserved' else coalesce(a.lifecycle,'unknown') end,
 'pending_entitlement_id',e.id,'operation_id',e.consumed_by,'blocked_reason',o.error_code)) from public.ct_slots s
 left join public.ct_accounts a on a.id=s.current_account_id
 left join lateral(select * from public.ct_entitlements where slot_id=s.id and issued_account_id is null and cancelled_at is null order by created_at limit 1) e on true
 left join public.ct_operations o on o.id=e.consumed_by where s.user_id=p_user and s.released_at is null),'[]'::jsonb),
 'reconciliation_pending',exists(select 1 from public.ct_allocation_dirty where user_id=p_user))
 from (select count(*)::integer n from public.ct_slots where user_id=p_user and released_at is null) c
$$;

-- Reservation is local; payment adapters must call settle only after verified payment evidence.
create function public.ct_evaluation_count(p_user uuid) returns integer language sql stable security definer set search_path='' as $$
 select count(*)::integer from public.ct_slots s left join public.ct_accounts a on a.id=s.current_account_id
 left join public.ct_slot_orders o on o.id=s.order_id
 where s.user_id=p_user and s.released_at is null and (
 a.kind='evaluation' and a.lifecycle not in ('passed','upgraded','closed','failed')
 or a.id is null and o.kind='evaluation' and o.state='reserved'
 or exists(select 1 from public.ct_entitlements e where e.slot_id=s.id and e.kind='evaluation' and e.issued_account_id is null and e.cancelled_at is null))
$$;

create function public.ct_reserve(p_user uuid,p_key text,p_plan text,p_quantity integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.ct_slot_orders; i integer; begin
 perform public.ct_reconcile_allocations(p_user);
 select * into o from public.ct_slot_orders where user_id=p_user and request_key=p_key;
 if found then
  if o.plan_id<>p_plan or o.quantity<>p_quantity or o.kind<>'evaluation' then raise exception 'conflict'; end if;
  return to_jsonb(o);
 end if;
 if p_quantity not between 1 and 3 or length(p_key) not between 8 and 100 then raise exception 'conflict'; end if;
 if not exists(select 1 from public.ct_plans where id=p_plan and enabled and pass_only_verified) then raise exception 'plan_unavailable'; end if;
 if (select count(*) from public.ct_slots where user_id=p_user and released_at is null)+p_quantity>3 then raise exception 'slots_full'; end if;
 if p_quantity+public.ct_evaluation_count(p_user)>1
 and not (public.ct_compliance(p_user)->>'kyc')::boolean then raise exception 'kyc_required'; end if;
 insert into public.ct_slot_orders(user_id,request_key,kind,plan_id,quantity) values(p_user,p_key,'evaluation',p_plan,p_quantity) returning * into o;
 for i in 1..p_quantity loop insert into public.ct_slots(user_id,order_id) values(p_user,o.id); end loop;
 return to_jsonb(o);
end $$;

create function public.ct_settle_order(p_actor uuid,p_order uuid,p_result text,p_reference text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.ct_slot_orders; s public.ct_slots; plan text; begin
 select * into o from public.ct_slot_orders where id=p_order;
 if not found then raise exception 'not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('slots:'||o.user_id::text,0));
 select * into o from public.ct_slot_orders where id=p_order for update;
 if p_result not in ('paid','cancelled') or length(p_reference)<8 or length(p_reason)<3 then raise exception 'conflict'; end if;
 if o.state<>'reserved' then
  if o.state=p_result and o.payment_reference=p_reference then return to_jsonb(o); end if;
  raise exception 'conflict';
 end if;
 if p_result='paid' then
  select evaluation_plan into plan from public.ct_plans where id=o.plan_id and enabled and pass_only_verified;
  if plan is null then raise exception 'plan_unavailable'; end if;
  for s in select * from public.ct_slots where order_id=o.id loop
   insert into public.ct_entitlements(user_id,kind,source,plan_reference,slot_id,origin)
   values(o.user_id,o.kind,'order:'||o.id||':'||s.id,plan,s.id,'purchase');
  end loop;
 else
  update public.ct_slots set released_at=now() where order_id=o.id;
 end if;
 update public.ct_slot_orders set state=p_result,payment_reference=p_reference where id=o.id returning * into o;
 insert into public.ct_audit(actor_id,user_id,action,data) values(p_actor,o.user_id,'settle-order',jsonb_build_object('order',o.id,'result',p_result,'reference',p_reference,'reason',p_reason));
 insert into public.ct_allocation_dirty(user_id) values(o.user_id) on conflict do nothing;
 return to_jsonb(o);
end $$;

create function public.ct_record_compliance(p_actor uuid,p_user uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.ct_compliance_evidence; begin
 perform pg_advisory_xact_lock(hashtextextended('slots:'||p_user::text,0));
 select * into e from public.ct_compliance_evidence where source=p_data->>'source';
 if found then
  if e.user_id<>p_user or e.requirement<>p_data->>'requirement' or e.version<>p_data->>'version' or e.status<>p_data->>'status'
   or e.effective_at<>(p_data->>'effective_at')::timestamptz or e.expires_at is distinct from (p_data->>'expires_at')::timestamptz or e.evidence_reference<>p_data->>'evidence_reference' then raise exception 'conflict'; end if;
  return public.ct_compliance(p_user);
 end if;
 if (p_data->>'effective_at')::timestamptz>now() or length(p_data->>'evidence_reference')<3 then raise exception 'conflict'; end if;
 insert into public.ct_compliance_evidence(user_id,requirement,version,status,source,effective_at,expires_at,actor_id,evidence_reference)
 values(p_user,p_data->>'requirement',p_data->>'version',p_data->>'status',p_data->>'source',(p_data->>'effective_at')::timestamptz,(p_data->>'expires_at')::timestamptz,p_actor,p_data->>'evidence_reference');
 insert into public.ct_audit(actor_id,user_id,action,data) values(p_actor,p_user,'compliance-evidence',p_data);
 insert into public.ct_allocation_dirty(user_id) values(p_user) on conflict do nothing;
 insert into public.ct_changes(user_id,kind) values(p_user,'compliance');
 return public.ct_compliance(p_user);
end $$;

create function public.ct_grant_account(p_actor uuid,p_user uuid,p_key text,p_plan text,p_kind text,p_replace uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.ct_entitlements; s public.ct_slots; a public.ct_accounts; plan text; begin
 perform public.ct_reconcile_allocations(p_user);
 select * into e from public.ct_entitlements where source='grant:'||p_user||':'||p_key;
 if found then
  if e.kind<>p_kind or e.replaces_id is distinct from p_replace or e.plan_reference<>p_plan then raise exception 'conflict'; end if;
  return to_jsonb(e);
 end if;
 if p_kind not in ('funded','practice','evaluation') or length(p_reason)<3 or length(p_key) not between 8 and 100 then raise exception 'conflict'; end if;
 -- Admin supplies an approved vendor plan reference, never an arbitrary template.
 if not exists(select 1 from public.ct_plans where enabled and pass_only_verified and case when p_kind='funded' then funded_plan=p_plan else evaluation_plan=p_plan end) then raise exception 'plan_unavailable'; end if;
 if p_replace is not null then
  select * into a from public.ct_accounts where id=p_replace and user_id=p_user;
  if not found then raise exception 'not_found'; end if;
  select * into s from public.ct_slots where id=a.slot_id and current_account_id=a.id;
  if not found or exists(select 1 from public.ct_entitlements where slot_id=s.id and issued_account_id is null and cancelled_at is null) then raise exception 'account_busy'; end if;
  update public.ct_slots set released_at=null where id=s.id;
  insert into public.ct_closures(user_id,account_id,actor_id,reason) values(p_user,a.id,p_actor,p_reason) on conflict do nothing;
 else
  if (select count(*) from public.ct_slots where user_id=p_user and released_at is null)>=3 then raise exception 'slots_full'; end if;
  insert into public.ct_slots(user_id) values(p_user) returning * into s;
 end if;
 if (select count(*) from public.ct_slots where user_id=p_user and released_at is null)>3 then raise exception 'slots_full'; end if;
 insert into public.ct_entitlements(user_id,kind,source,plan_reference,slot_id,origin,replaces_id)
 values(p_user,p_kind,'grant:'||p_user||':'||p_key,p_plan,s.id,case when p_replace is null then 'grant' else 'replacement' end,p_replace) returning * into e;
 insert into public.ct_audit(actor_id,user_id,account_id,action,data) values(p_actor,p_user,p_replace,'grant-account',jsonb_build_object('entitlement',e.id,'reason',p_reason));
 insert into public.ct_allocation_dirty(user_id) values(p_user) on conflict do nothing;
 return to_jsonb(e);
end $$;

create function public.ct_assert_provision(p_entitlement uuid,p_operation uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.ct_entitlements; c jsonb; begin
 select * into e from public.ct_entitlements where id=p_entitlement;
 if not found then raise exception 'not_entitled'; end if;
 perform public.ct_reconcile_allocations(e.user_id);
 select * into e from public.ct_entitlements where id=p_entitlement for update;
 if e.slot_id is null or e.cancelled_at is not null or e.issued_account_id is not null or e.expires_at<=now()
 or e.consumed_by is distinct from p_operation then raise exception 'not_entitled'; end if;
 if not exists(select 1 from public.ct_slots where id=e.slot_id and user_id=e.user_id and released_at is null) then raise exception 'not_entitled'; end if;
 if exists(select 1 from public.ct_slots where id=e.slot_id and current_account_id is not null and current_account_id is distinct from e.predecessor_id and current_account_id is distinct from e.replaces_id) then raise exception 'account_busy'; end if;
 if (select count(*) from public.ct_slots where user_id=e.user_id and released_at is null)>3 then raise exception 'slots_full'; end if;
 if not exists(select 1 from public.ct_plans where enabled and pass_only_verified and case when e.kind='funded' then funded_plan=e.plan_reference else evaluation_plan=e.plan_reference end) then raise exception 'plan_unavailable'; end if;
 c:=public.ct_compliance(e.user_id);
 if e.kind='funded' and c<>'{"kyc":true,"tax":true,"agreement":true}'::jsonb then raise exception 'compliance_required'; end if;
 if e.kind='evaluation' and not (c->>'kyc')::boolean and public.ct_evaluation_count(e.user_id)>1 then raise exception 'kyc_required'; end if;
 if e.origin='pass' and not exists(select 1 from public.ct_accounts where id=e.predecessor_id and user_id=e.user_id and lifecycle in ('passed','upgraded') and successor_id is null) then raise exception 'account_busy'; end if;
 if e.replaces_id is not null and not exists(select 1 from public.ct_accounts where id=e.replaces_id and user_id=e.user_id and lifecycle='closed') then raise exception 'closure_required'; end if;
 if not exists(select 1 from public.ct_memberships where user_id=e.user_id and status='ACTIVE') then raise exception 'invitation_required'; end if;
 return to_jsonb(e);
end $$;

-- Replace the original admission implementation, preserving non-provisioning behavior.
create or replace function public.ct_enqueue(p_actor uuid,p_user uuid,p_account uuid,p_action text,p_key text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.ct_operations; ent public.ct_entitlements; target_key text; begin
 if p_user is not null then perform pg_advisory_xact_lock(hashtextextended('slots:'||p_user::text,0)); end if;
 if length(p_key)<8 or length(p_key)>100 then raise exception 'conflict'; end if;
 select * into op from public.ct_operations where actor_id=p_actor and request_key=p_key;
 if found then
  if op.action<>p_action or op.payload<>p_payload or op.account_id is distinct from p_account or op.user_id is distinct from p_user then raise exception 'conflict'; end if;
  return to_jsonb(op);
 end if;
 if p_action='provision' then
  perform public.ct_assert_provision((p_payload->>'entitlement_id')::uuid);
  select * into ent from public.ct_entitlements where id=(p_payload->>'entitlement_id')::uuid and user_id=p_user;
  if not found then raise exception 'not_entitled'; end if;
 end if;
 target_key:=case when p_action='provision' then 'slot:'||ent.slot_id else coalesce(p_account::text,p_user::text,'firm') end;
 perform pg_advisory_xact_lock(hashtextextended(target_key,0));
 if p_account is not null and not exists(select 1 from public.ct_accounts where id=p_account and user_id=p_user) then raise exception 'not_found'; end if;
 if p_action in ('invite','access-check','refresh') and exists(select 1 from public.ct_operations where target=target_key and action=p_action and created_at>now()-case when p_action='invite' then interval '60 seconds' else interval '30 seconds' end) then raise exception 'cooldown'; end if;
 if p_action='invite' and (select count(*) from public.ct_operations where user_id=p_user and action='invite' and created_at>now()-interval '1 day')>=5 then raise exception 'cooldown'; end if;
 if exists(select 1 from public.ct_operations where target=target_key and state in ('queued','running','unknown')) then raise exception 'account_busy'; end if;
 insert into public.ct_operations(actor_id,user_id,account_id,action,request_key,target,payload) values(p_actor,p_user,p_account,p_action,p_key,target_key,p_payload) returning * into op;
 if p_action='provision' then update public.ct_entitlements set consumed_by=op.id where id=ent.id; end if;
 insert into public.ct_audit(actor_id,user_id,account_id,action,operation_id,data) values(p_actor,p_user,p_account,p_action,op.id,p_payload);
 return to_jsonb(op);
end $$;

create or replace function public.ct_ingest(p_event jsonb,p_owner text default null) returns text language plpgsql security definer set search_path='' as $$
declare allocation_user uuid; a public.ct_accounts; m public.ct_memberships; d jsonb; fam text; typ text; at_time timestamptz; old text; state_value text; record_id text; chan text; changed boolean:=false; begin
 select user_id into allocation_user from public.ct_accounts where vendor_id=p_event->>'account' and firm_id=p_event->>'firm';
 if allocation_user is null then select user_id into allocation_user from public.ct_memberships where vendor_user_id=p_event->>'user' and firm_id=p_event->>'firm'; end if;
 if allocation_user is not null then perform pg_advisory_xact_lock(hashtextextended('slots:'||allocation_user::text,0)); end if;
 chan:=p_event->>'channel';
 if chan like 'ws:%' and not exists(select 1 from public.ct_runtime where id='worker' and owner=p_owner and expires_at>now()) then raise exception 'conflict'; end if;
 insert into public.ct_events(id,payload) values(p_event->>'id',p_event) on conflict do nothing;
 if not found then return 'duplicate'; end if;
 if chan like 'ws:%' then
  insert into public.ct_runtime(id,cursor,updated_at) values(chan,p_event->>'seq',now()) on conflict(id) do update set cursor=excluded.cursor,updated_at=now() where coalesce(public.ct_runtime.cursor,'0')::numeric<excluded.cursor::numeric;
 end if;
 if (p_event->>'ignored')::boolean then update public.ct_events set state='ignored',processed_at=now() where id=p_event->>'id'; return 'ignored'; end if;
 fam:=p_event->>'family'; typ:=p_event->>'type'; d:=p_event->'data'; at_time:=(p_event->>'at')::timestamptz;
 if fam in ('users','relationships') then
  select * into m from public.ct_memberships where vendor_user_id=p_event->>'user' and firm_id=p_event->>'firm' for update;
  if not found then update public.ct_events set state='unmapped' where id=p_event->>'id'; return 'unmapped'; end if;
  if fam='users' then
   update public.ct_memberships set data=data||d where id=m.id;
  elsif m.checked_at is null or m.checked_at<=at_time then
   update public.ct_memberships set status=case when typ='relationships.revoked' then 'REVOKED' when fam='relationships' then coalesce(upper(d->>'status'),status) else status end,checked_at=at_time,data=data||d where id=m.id;
   insert into public.ct_changes(user_id,kind,data) values(m.user_id,'access',jsonb_build_object('status',case when typ='relationships.revoked' then 'REVOKED' else coalesce(upper(d->>'status'),m.status) end,'checked_at',at_time));
  end if;
 else
  select * into a from public.ct_accounts where vendor_id=p_event->>'account' and firm_id=p_event->>'firm' for update;
  if not found and fam='accounts' and coalesce((d->>'is_shadow')::boolean,false)=false then
   select * into m from public.ct_memberships where vendor_user_id=p_event->>'user' and firm_id=p_event->>'firm';
   if found and (lower(coalesce(d->>'stage',d->>'account_type','')) like '%eval%' or lower(coalesce(d->>'stage',d->>'account_type','')) like '%funded%') then
    insert into public.ct_accounts(user_id,vendor_id,firm_id,kind)
    values(m.user_id,p_event->>'account',p_event->>'firm',case when lower(coalesce(d->>'stage',d->>'account_type','')) like '%funded%' then 'funded' else 'evaluation' end)
    on conflict(vendor_id) do nothing;
    select * into a from public.ct_accounts where vendor_id=p_event->>'account' and firm_id=p_event->>'firm' for update;
   end if;
  end if;
  if a.id is null then update public.ct_events set state='unmapped' where id=p_event->>'id'; return 'unmapped'; end if;
  if fam in ('accounts','risk') then
   if a.vendor_updated_at is null or a.vendor_updated_at<=at_time then
    state_value:=coalesce(p_event->>'lifecycle',a.lifecycle);
    if typ in ('accounts.locked','accounts.unlocked','risk.account_locked') and a.lifecycle in ('passed','upgraded','failed','closed') and not (d ? 'status') then state_value:=a.lifecycle; end if;
    update public.ct_accounts set data=data||d,lifecycle=state_value,vendor_updated_at=at_time,
     predecessor_id=coalesce(d->>'predecessor_account_id',predecessor_id),successor_id=coalesce(d->>'successor_account_id',successor_id) where id=a.id;
    changed:=found;
    if state_value<>a.lifecycle then
     insert into public.ct_transitions(account_id,event_id,transition) values(a.id,p_event->>'id',state_value) on conflict do nothing;
    end if;
   end if;
  else
   record_id:=case when fam in ('balances','stats') then a.vendor_id else coalesce(d->>'trade_id',d->>'order_id',d->>'execution_id',d->>'id',case when fam='positions' then a.vendor_id||':'||(d->>'instrument_id') else null end) end;
   if record_id is null then update public.ct_events set state='error',error_code='missing_record_id' where id=p_event->>'id'; return 'error'; end if;
   insert into public.ct_records(account_id,user_id,kind,vendor_id,data,vendor_updated_at) values(a.id,a.user_id,fam,record_id,d,at_time)
   on conflict(kind,vendor_id) do update set data=public.ct_records.data||excluded.data,vendor_updated_at=excluded.vendor_updated_at,version=public.ct_records.version+1
   where public.ct_records.vendor_updated_at<=excluded.vendor_updated_at;
   changed:=found;
  end if;
  if changed then insert into public.ct_changes(user_id,account_id,kind,data) values(a.user_id,a.id,fam,jsonb_build_object('patch',d,'vendor_updated_at',at_time)); end if;
 end if;
 update public.ct_events set state='applied',processed_at=now() where id=p_event->>'id'; return 'applied';
end $$;

-- Binding succeeds whether the HTTP response or account-created event arrived first.
create function public.ct_bind_provision(p_operation uuid,p_vendor text,p_firm text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.ct_operations; e public.ct_entitlements; a public.ct_accounts; old_slot uuid; begin
 select * into op from public.ct_operations where id=p_operation and action='provision';
 if not found then raise exception 'not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('slots:'||op.user_id::text,0));
 select * into e from public.ct_entitlements where id=(op.payload->>'entitlement_id')::uuid and consumed_by=op.id and user_id=op.user_id for update;
 if not found then raise exception 'not_entitled'; end if;
 select * into a from public.ct_accounts where vendor_id=p_vendor;
 if found and (a.user_id<>e.user_id or a.firm_id<>p_firm or (a.kind='funded')<>(e.kind='funded')) then raise exception 'conflict'; end if;
 if e.issued_account_id is not null and e.issued_account_id is distinct from a.id then raise exception 'conflict'; end if;
 if exists(select 1 from public.ct_slots where id=e.slot_id and current_account_id is not null and current_account_id is distinct from a.id and current_account_id is distinct from e.predecessor_id and current_account_id is distinct from e.replaces_id) then raise exception 'conflict'; end if;
 if a.id is null then
  insert into public.ct_accounts(user_id,vendor_id,firm_id,kind,data,predecessor_id,slot_id)
  values(e.user_id,p_vendor,p_firm,e.kind,p_data,(select vendor_id from public.ct_accounts where id=e.predecessor_id),e.slot_id) returning * into a;
 else
  old_slot:=a.slot_id;
  if old_slot is not null and old_slot<>e.slot_id and exists(select 1 from public.ct_entitlements where slot_id=old_slot) then raise exception 'conflict'; end if;
  if old_slot is not null and old_slot<>e.slot_id then update public.ct_slots set current_account_id=null,released_at=now() where id=old_slot; end if;
  update public.ct_accounts set slot_id=e.slot_id,kind=e.kind where id=a.id;
 end if;
 update public.ct_slots set current_account_id=a.id,released_at=null where id=e.slot_id;
 update public.ct_entitlements set issued_account_id=a.id where id=e.id;
 insert into public.ct_changes(user_id,account_id,kind) values(e.user_id,a.id,'allocation');
 return jsonb_build_object('vendor_account_id',p_vendor,'account_id',a.id,'slot_id',e.slot_id);
end $$;

-- Runs only for changed users, with no vendor reads. One local batch precedes the worker's claim.
create function public.ct_schedule_allocations(p_owner text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid; e public.ct_entitlements; pending public.ct_operations; begin
 if not exists(select 1 from public.ct_runtime where id='worker' and owner=p_owner and expires_at>now()) then raise exception 'conflict'; end if;
 for u in select user_id from public.ct_allocation_dirty order by updated_at limit 20 loop
  perform pg_advisory_xact_lock(hashtextextended('slots:'||u::text,0));
  delete from public.ct_allocation_dirty where user_id=u;
  perform public.ct_reconcile_allocations(u);
  for pending in select * from public.ct_operations o where o.user_id=u and o.action='provision' and o.state='failed'
   and o.error_code in ('compliance_required','kyc_required','invitation_required','invitation_not_accepted','closure_required','plan_unavailable','slots_full')
   and not exists(select 1 from public.ct_operations busy where busy.target=o.target and busy.state in ('queued','running','unknown')) limit 3 loop
   begin
    perform public.ct_assert_provision((pending.payload->>'entitlement_id')::uuid,pending.id);
    update public.ct_operations set state='queued',error_code=null,started_at=null,finished_at=null where id=pending.id;
   exception when raise_exception then
    if sqlerrm not in ('not_entitled','slots_full','plan_unavailable','compliance_required','kyc_required','closure_required','invitation_required','account_busy') then raise; end if;
   end;
  end loop;
  for e in select * from public.ct_entitlements where user_id=u and consumed_by is null and cancelled_at is null and issued_account_id is null order by created_at limit 3 loop
   begin
    perform public.ct_enqueue(u,u,null,'provision','issue:'||e.id,jsonb_build_object('entitlement_id',e.id));
   exception when raise_exception then
    if sqlerrm not in ('not_entitled','slots_full','plan_unavailable','compliance_required','kyc_required','closure_required','invitation_required','account_busy') then raise; end if;
   end;
  end loop;
  insert into public.ct_changes(user_id,kind) values(u,'allocation');
 end loop;
end $$;

create function public.ct_request_closure(p_actor uuid,p_account uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.ct_accounts; c public.ct_closures; begin
 select * into a from public.ct_accounts where id=p_account;
 if not found then raise exception 'not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('slots:'||a.user_id::text,0));
 if length(p_reason)<3 then raise exception 'conflict'; end if;
 insert into public.ct_closures(user_id,account_id,actor_id,reason) values(a.user_id,a.id,p_actor,p_reason) on conflict do nothing returning * into c;
 if c.id is null then select * into c from public.ct_closures where account_id=a.id; end if;
 insert into public.ct_audit(actor_id,user_id,account_id,action,data) values(p_actor,a.user_id,a.id,'request-closure',jsonb_build_object('reason',p_reason));
 return to_jsonb(c)||jsonb_build_object('status',case when a.lifecycle='closed' then 'confirmed' else 'awaiting_tradara_closure' end,'action_required','Close the account in Tradara; Certa waits for its authoritative closure event.');
end $$;

-- No obsolete compliance boolean or unallocated entitlement bypass remains.
create or replace function public.ct_admin_edit(p_actor uuid,p_user uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; inv public.ct_operations; begin
 if p_action='link' then
  insert into public.ct_memberships(user_id,vendor_user_id,firm_id) values(p_user,p_data->>'vendor_user_id',p_data->>'firm_id') returning to_jsonb(ct_memberships.*) into result;
 elsif p_action='adopt-account' then
  select * into inv from public.ct_operations where id=(p_data->>'inventory_operation_id')::uuid and user_id=p_user and state='confirmed' and action='refresh' and payload->>'resource'='accounts';
  if not found or not exists(select 1 from jsonb_array_elements(inv.result->'items') x where coalesce(x->>'id',x->>'account_id')=p_data->>'vendor_account_id') then raise exception 'not_found'; end if;
  insert into public.ct_accounts(user_id,vendor_id,firm_id,kind) values(p_user,p_data->>'vendor_account_id',p_data->>'firm_id',p_data->>'kind') returning to_jsonb(ct_accounts.*) into result;
 else raise exception 'unsupported_account_edit'; end if;
 insert into public.ct_audit(actor_id,user_id,action,data) values(p_actor,p_user,p_action,p_data);
 return result;
end $$;

create function public.ct_configure_plan(p_actor uuid,p_id text,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.ct_plans(id,evaluation_plan,funded_plan,enabled,pass_only_verified)
 values(p_id,p_data->>'evaluation_plan',p_data->>'funded_plan',(p_data->>'enabled')::boolean,(p_data->>'pass_only_verified')::boolean)
 on conflict(id) do update set evaluation_plan=excluded.evaluation_plan,funded_plan=excluded.funded_plan,enabled=excluded.enabled,pass_only_verified=excluded.pass_only_verified;
 insert into public.ct_audit(actor_id,action,data) values(p_actor,'configure-plan',p_data||jsonb_build_object('id',p_id));
 insert into public.ct_allocation_dirty(user_id) select distinct user_id from public.ct_entitlements where issued_account_id is null and cancelled_at is null on conflict do nothing;
end $$;

-- Evidence versions change only through an audited staff configuration action.
create function public.ct_compliance_version(p_actor uuid,p_requirement text,p_version text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.ct_compliance_requirements set version=p_version where id=p_requirement;
 if not found then raise exception 'not_found'; end if;
 insert into public.ct_audit(actor_id,action,data) values(p_actor,'compliance-version',jsonb_build_object('requirement',p_requirement,'version',p_version,'reason',p_reason));
 insert into public.ct_allocation_dirty(user_id) select distinct user_id from public.ct_entitlements where issued_account_id is null and cancelled_at is null on conflict do nothing;
end $$;

create function public.ct_recover_provision(p_actor uuid,p_operation uuid,p_inventory uuid,p_vendor text,p_firm text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.ct_operations; inv public.ct_operations; e public.ct_entitlements; item jsonb; recovered jsonb; begin
 select * into op from public.ct_operations where id=p_operation;
 if not found then raise exception 'not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('slots:'||op.user_id::text,0));
 select * into op from public.ct_operations where id=p_operation for update;
 select * into inv from public.ct_operations where id=p_inventory and user_id=op.user_id and action='refresh' and state='confirmed' and payload->>'resource'='accounts';
 if op.action<>'provision' or op.state not in ('unknown','failed') or inv.id is null or not exists(select 1 from jsonb_array_elements(inv.result->'items') x where coalesce(x->>'id',x->>'account_id')=p_vendor) then raise exception 'conflict'; end if;
 select * into e from public.ct_entitlements where id=(op.payload->>'entitlement_id')::uuid;
 select x into item from jsonb_array_elements(inv.result->'items') x where coalesce(x->>'id',x->>'account_id')=p_vendor;
 if item->>'plan_reference' is distinct from e.plan_reference or (e.kind='funded' and lower(coalesce(item->>'stage',item->>'account_type','')) not like '%funded%') or (e.kind<>'funded' and lower(coalesce(item->>'stage',item->>'account_type','')) not like '%eval%') then raise exception 'conflict'; end if;
 recovered:=public.ct_bind_provision(op.id,p_vendor,p_firm,item);
 update public.ct_operations set state='confirmed',result=recovered,error_code=null,finished_at=now() where id=op.id;
 insert into public.ct_audit(actor_id,user_id,operation_id,action,data) values(p_actor,op.user_id,op.id,'recover-provision',jsonb_build_object('inventory_operation',p_inventory,'vendor_account',p_vendor,'reason',p_reason));
 return recovered;
end $$;

create function public.ct_cancel_entitlement(p_actor uuid,p_entitlement uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.ct_entitlements; op public.ct_operations; begin
 select * into e from public.ct_entitlements where id=p_entitlement;
 if not found then raise exception 'not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('slots:'||e.user_id::text,0));
 select * into e from public.ct_entitlements where id=p_entitlement for update;
 if e.issued_account_id is not null then raise exception 'account_busy'; end if;
 if e.cancelled_at is not null then return to_jsonb(e); end if;
 if e.consumed_by is not null then
  select * into op from public.ct_operations where id=e.consumed_by for update;
  if op.state<>'queued' then raise exception 'account_busy'; end if;
  update public.ct_operations set state='failed',error_code='entitlement_cancelled',finished_at=now() where id=op.id;
 end if;
 update public.ct_entitlements set cancelled_at=now() where id=e.id returning * into e;
 update public.ct_slots set released_at=now() where id=e.slot_id and current_account_id is null;
 perform public.ct_reconcile_allocations(e.user_id);
 insert into public.ct_audit(actor_id,user_id,action,data) values(p_actor,e.user_id,'cancel-entitlement',jsonb_build_object('entitlement',e.id,'reason',p_reason));
 insert into public.ct_allocation_dirty(user_id) values(e.user_id) on conflict do nothing;
 return to_jsonb(e);
end $$;

create or replace function public.ct_resolve(p_id uuid,p_actor uuid,p_resolution text,p_evidence text) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.ct_operations; begin
 if length(p_evidence)<10 or length(p_evidence)>1000 or p_resolution not in ('confirmed','not_applied','retry_read') then raise exception 'conflict'; end if;
 select * into op from public.ct_operations where id=p_id;
 if op.user_id is not null then perform pg_advisory_xact_lock(hashtextextended('slots:'||op.user_id::text,0)); end if;
 select * into op from public.ct_operations where id=p_id for update;
 if not found or op.state not in ('unknown','failed') then raise exception 'conflict'; end if;
 if p_resolution='retry_read' and op.action not in ('access-check','refresh','catalog-refresh','usage-refresh','correction-preview') then raise exception 'conflict'; end if;
 update public.ct_operations set state=case when p_resolution='confirmed' then 'confirmed' else 'queued' end,started_at=null,finished_at=null,error_code=null where id=p_id returning * into op;
 insert into public.ct_audit(actor_id,user_id,account_id,operation_id,action,data) values(p_actor,op.user_id,op.account_id,op.id,'resolve-operation',jsonb_build_object('resolution',p_resolution,'evidence',p_evidence));
 return to_jsonb(op);
end $$;

-- Initial reconciliation is deferred to the worker, never guessed from old checkout JSON.
insert into public.ct_allocation_dirty(user_id) select distinct user_id from public.ct_accounts on conflict do nothing;
do $$ declare t text; r record; begin
 foreach t in array array['plans','compliance_requirements','compliance_evidence','slot_orders','slots','closures','allocation_dirty'] loop
  execute format('alter table public.ct_%I enable row level security',t);
  execute format('revoke all on public.ct_%I from public, anon, authenticated',t);
  execute format('grant all on public.ct_%I to service_role',t);
 end loop;
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ct_%' loop
  execute format('revoke all on function %s from public, anon, authenticated',r.signature);
  execute format('grant execute on function %s to service_role',r.signature);
 end loop;
end $$;
commit;
