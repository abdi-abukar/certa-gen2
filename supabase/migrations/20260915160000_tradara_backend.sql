-- Additive namespace. Apply only after reconciling the existing project's baseline.
-- No existing account/payment tables are modified or imported automatically.
begin;
create table public.ct_memberships (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users(id),
 vendor_user_id text not null unique, firm_id text not null, status text not null default 'UNKNOWN',
 checked_at timestamptz, data jsonb not null default '{}'
);
create table public.ct_accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 vendor_id text not null unique, firm_id text not null, kind text not null check(kind in ('evaluation','practice','funded')),
 lifecycle text not null default 'unknown', vendor_updated_at timestamptz, data jsonb not null default '{}',
 predecessor_id text, successor_id text, compliance_hold boolean not null default true
);
create index on public.ct_accounts(user_id,id);
create table public.ct_records (
 id uuid primary key default gen_random_uuid(), account_id uuid references public.ct_accounts(id),
 user_id uuid references auth.users(id), kind text not null, vendor_id text not null,
 data jsonb not null, vendor_updated_at timestamptz not null, version bigint not null default 1,
 unique(kind,vendor_id)
);
create index on public.ct_records(user_id,account_id,kind,id);
create table public.ct_events (
 id text primary key, payload jsonb not null, state text not null default 'pending' check(state in ('pending','applied','ignored','unmapped','error')),
 received_at timestamptz not null default now(), processed_at timestamptz, error_code text
);
create index on public.ct_events(state,received_at);
create table public.ct_entitlements (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), kind text not null check(kind in ('evaluation','practice','funded')),
 source text not null unique, plan_reference text not null, expires_at timestamptz,
 compliance_approved boolean not null default false, consumed_by uuid, predecessor_id uuid references public.ct_accounts(id),
 created_at timestamptz not null default now()
);
create index on public.ct_entitlements(user_id,id);
create table public.ct_operations (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id), user_id uuid references auth.users(id), account_id uuid references public.ct_accounts(id),
 action text not null, request_key text not null, target text not null, payload jsonb not null,
 state text not null default 'queued' check(state in ('queued','running','confirmed','failed','unknown')),
 result jsonb, error_code text, created_at timestamptz not null default now(), started_at timestamptz, finished_at timestamptz,
 unique(actor_id,request_key)
);
create index on public.ct_operations(state,created_at);
create index on public.ct_operations(user_id,id);
create unique index ct_one_pending_target on public.ct_operations(target) where state in ('queued','running','unknown');
create table public.ct_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid, user_id uuid, account_id uuid, action text not null,
 operation_id uuid, data jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.ct_transitions (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.ct_accounts(id),
 event_id text not null, transition text not null, created_at timestamptz not null default now(), unique(account_id,event_id)
);
create table public.ct_runtime (
 id text primary key, owner text, expires_at timestamptz, cursor text, updated_at timestamptz not null default now(), data jsonb not null default '{}'
);
create table public.ct_budgets (id text primary key, window_at timestamptz not null, used integer not null);
create table public.ct_tickets (
 id text primary key, user_id uuid not null references auth.users(id), staff boolean not null, expires_at timestamptz not null, consumed_at timestamptz
);
create table public.ct_changes (
 id bigint generated always as identity primary key, user_id uuid, account_id uuid, kind text not null, data jsonb not null default '{}', created_at timestamptz not null default now()
);
create index on public.ct_changes(created_at);

-- Browser/native clients cannot mutate mirror/ledger data, including owner columns.
do $$ declare t text; begin
 foreach t in array array['memberships','accounts','records','events','entitlements','operations','audit','transitions','runtime','budgets','tickets','changes'] loop
  execute format('alter table public.ct_%I enable row level security',t);
  execute format('revoke all on public.ct_%I from public, anon, authenticated',t);
  execute format('grant all on public.ct_%I to service_role',t);
 end loop;
 foreach t in array array['memberships','accounts','records'] loop
  execute format('grant select on public.ct_%I to authenticated',t);
  execute format('create policy owner_read on public.ct_%I for select to authenticated using (user_id = (select auth.uid()))',t);
 end loop;
end $$;
grant usage,select on sequence public.ct_changes_id_seq to service_role;

create function public.ct_budget(p_kind text) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; ceiling integer; duration interval; b public.ct_budgets; begin
 ceiling := case p_kind when 'read' then 10 when 'firm' then 5 when 'admin' then 2 when 'write' then 2 when 'connect' then 6 else 0 end;
 if ceiling=0 then return false; end if;
 duration := case when p_kind='connect' then interval '1 minute' else interval '1 second' end;
 insert into public.ct_budgets values(p_kind,clock_timestamp(),0) on conflict do nothing;
 select * into b from public.ct_budgets where id=p_kind for update;
 if b.window_at+duration<=clock_timestamp() then b.used:=0; b.window_at:=clock_timestamp(); end if;
 if b.used>=ceiling then return false; end if;
 update public.ct_budgets set used=b.used+1,window_at=b.window_at where id=p_kind; return true;
end $$;

create function public.ct_lease(p_id text,p_owner text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 insert into public.ct_runtime(id,owner,expires_at) values(p_id,p_owner,now()+interval '30 seconds') on conflict(id) do update
 set owner=excluded.owner,expires_at=excluded.expires_at,updated_at=now()
 where public.ct_runtime.owner=p_owner or public.ct_runtime.expires_at<now();
 return found;
end $$;

create function public.ct_enqueue(p_actor uuid,p_user uuid,p_account uuid,p_action text,p_key text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.ct_operations; ent public.ct_entitlements; target_key text; begin
 if length(p_key)<8 or length(p_key)>100 then raise exception 'conflict'; end if;
 select * into op from public.ct_operations where actor_id=p_actor and request_key=p_key;
 if found then
  if op.action<>p_action or op.payload<>p_payload or op.account_id is distinct from p_account or op.user_id is distinct from p_user then raise exception 'conflict'; end if;
  return to_jsonb(op);
 end if;
 target_key:=coalesce(p_account::text,p_user::text,'firm');
 perform pg_advisory_xact_lock(hashtextextended(target_key,0));
 if p_account is not null and not exists(select 1 from public.ct_accounts where id=p_account and user_id=p_user) then raise exception 'not_found'; end if;
 if p_action in ('invite','access-check','refresh') and exists(select 1 from public.ct_operations where target=target_key and action=p_action and created_at>now()-case when p_action='invite' then interval '60 seconds' else interval '30 seconds' end) then raise exception 'cooldown'; end if;
 if p_action='invite' and (select count(*) from public.ct_operations where user_id=p_user and action='invite' and created_at>now()-interval '1 day')>=5 then raise exception 'cooldown'; end if;
 if exists(select 1 from public.ct_operations where target=target_key and state in ('queued','running','unknown')) then raise exception 'account_busy'; end if;
 if p_action='provision' then
  select * into ent from public.ct_entitlements where id=(p_payload->>'entitlement_id')::uuid and user_id=p_user for update;
  if not found or ent.consumed_by is not null or ent.expires_at<=now() then raise exception 'not_entitled'; end if;
  if ent.kind='funded' and (not ent.compliance_approved or ent.predecessor_id is null or not exists(select 1 from public.ct_accounts where id=ent.predecessor_id and user_id=p_user and lifecycle in ('passed','upgraded'))) then raise exception 'compliance_required'; end if;
 end if;
 insert into public.ct_operations(actor_id,user_id,account_id,action,request_key,target,payload) values(p_actor,p_user,p_account,p_action,p_key,target_key,p_payload) returning * into op;
 if p_action='provision' then update public.ct_entitlements set consumed_by=op.id where id=ent.id; end if;
 insert into public.ct_audit(actor_id,user_id,account_id,action,operation_id,data) values(p_actor,p_user,p_account,p_action,op.id,p_payload);
 return to_jsonb(op);
end $$;

create function public.ct_claim(p_owner text) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.ct_operations; begin
 if not exists(select 1 from public.ct_runtime where id='worker' and owner=p_owner and expires_at>now()) then raise exception 'conflict'; end if;
 -- Crashed writes are never automatically replayed.
 update public.ct_operations set state='unknown',error_code='worker_interrupted',finished_at=now() where state='running' and started_at<now()-interval '2 minutes';
 select * into op from public.ct_operations where state='queued' order by created_at for update skip locked limit 1;
 if not found then return null; end if;
 update public.ct_operations set state='running',started_at=now() where id=op.id returning * into op;
 return to_jsonb(op);
end $$;

create function public.ct_finish(p_id uuid,p_state text,p_result jsonb,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare op public.ct_operations; begin
 if p_state not in ('confirmed','failed','unknown') then raise exception 'conflict'; end if;
 update public.ct_operations set state=p_state,result=p_result,error_code=p_error,finished_at=now() where id=p_id and state='running' returning * into op;
 if not found then raise exception 'conflict'; end if;
 insert into public.ct_changes(user_id,account_id,kind) values(op.user_id,op.account_id,'operation');
end $$;

create function public.ct_ingest(p_event jsonb,p_owner text default null) returns text language plpgsql security definer set search_path='' as $$
declare a public.ct_accounts; m public.ct_memberships; d jsonb; fam text; typ text; at_time timestamptz; old text; state_value text; record_id text; chan text; changed boolean:=false; begin
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
    values(m.user_id,p_event->>'account',p_event->>'firm',case when exists(select 1 from public.ct_entitlements where user_id=m.user_id and kind='practice' and plan_reference=d->>'plan_reference') then 'practice' when lower(coalesce(d->>'stage',d->>'account_type','')) like '%funded%' then 'funded' else 'evaluation' end)
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
     predecessor_id=coalesce(d->>'predecessor_account_id',predecessor_id),successor_id=coalesce(d->>'successor_account_id',successor_id),
     compliance_hold=case when state_value in ('passed','upgraded') then true else compliance_hold end where id=a.id;
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

create function public.ct_ticket(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.ct_tickets; begin
 update public.ct_tickets set consumed_at=now() where id=p_hash and consumed_at is null and expires_at>now() returning * into t;
 if not found then return null; end if; return to_jsonb(t);
end $$;

create function public.ct_reprocess(p_id text,p_owner text) returns text language plpgsql security definer set search_path='' as $$
declare ev jsonb; begin
 if not exists(select 1 from public.ct_runtime where id='worker' and owner=p_owner and expires_at>now()) then raise exception 'conflict'; end if;
 delete from public.ct_events where id=p_id and state='unmapped' returning payload into ev;
 if ev is null then return 'skipped'; end if;
 ev:=ev||jsonb_build_object('channel','repair');
 return public.ct_ingest(ev,null);
end $$;

-- All local mapping/entitlement edits and their audit record commit together.
create function public.ct_admin_edit(p_actor uuid,p_user uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; inv public.ct_operations; a public.ct_accounts; begin
 if p_action='link' then
  insert into public.ct_memberships(user_id,vendor_user_id,firm_id) values(p_user,p_data->>'vendor_user_id',p_data->>'firm_id') returning to_jsonb(ct_memberships.*) into result;
 elsif p_action='adopt-account' then
  select * into inv from public.ct_operations where id=(p_data->>'inventory_operation_id')::uuid and user_id=p_user and state='confirmed' and action='refresh' and payload->>'resource'='accounts';
  if not found or not exists(select 1 from jsonb_array_elements(inv.result->'items') x where coalesce(x->>'id',x->>'account_id')=p_data->>'vendor_account_id') then raise exception 'not_found'; end if;
  insert into public.ct_accounts(user_id,vendor_id,firm_id,kind) values(p_user,p_data->>'vendor_account_id',p_data->>'firm_id',p_data->>'kind') returning to_jsonb(ct_accounts.*) into result;
 elsif p_action='entitlement' then
  if p_data->>'predecessor_id' is not null and not exists(select 1 from public.ct_accounts where id=(p_data->>'predecessor_id')::uuid and user_id=p_user) then raise exception 'not_found'; end if;
  insert into public.ct_entitlements(user_id,kind,source,plan_reference,expires_at,predecessor_id) values(p_user,p_data->>'kind',p_data->>'source',p_data->>'plan_reference',(p_data->>'expires_at')::timestamptz,(p_data->>'predecessor_id')::uuid) returning to_jsonb(ct_entitlements.*) into result;
 elsif p_action='compliance-approved' then
  update public.ct_entitlements set compliance_approved=true where id=(p_data->>'entitlement_id')::uuid and consumed_by is null returning to_jsonb(ct_entitlements.*) into result;
  if result is null then raise exception 'not_found'; end if;
  p_user:=(result->>'user_id')::uuid;
 else raise exception 'conflict'; end if;
 insert into public.ct_audit(actor_id,user_id,action,data) values(p_actor,p_user,p_action,p_data);
 return result;
end $$;

create function public.ct_ingest_batch(p_events jsonb,p_owner text) returns void language plpgsql security definer set search_path='' as $$
declare ev jsonb; begin
 if jsonb_array_length(p_events)>250 then raise exception 'conflict'; end if;
 for ev in select value from jsonb_array_elements(p_events) loop perform public.ct_ingest(ev,p_owner); end loop;
end $$;

create function public.ct_resolve(p_id uuid,p_actor uuid,p_resolution text,p_evidence text) returns jsonb language plpgsql security definer set search_path='' as $$
declare op public.ct_operations; begin
 if length(p_evidence)<10 or length(p_evidence)>1000 or p_resolution not in ('confirmed','not_applied','retry_read') then raise exception 'conflict'; end if;
 select * into op from public.ct_operations where id=p_id for update;
 if not found or op.state not in ('unknown','failed') then raise exception 'conflict'; end if;
 if p_resolution='retry_read' and op.action not in ('access-check','refresh','catalog-refresh','usage-refresh','correction-preview') then raise exception 'conflict'; end if;
 update public.ct_operations set state=case when p_resolution='confirmed' then 'confirmed' else 'queued' end,started_at=null,finished_at=null,error_code=null where id=p_id returning * into op;
 insert into public.ct_audit(actor_id,user_id,account_id,operation_id,action,data) values(p_actor,op.user_id,op.account_id,op.id,'resolve-operation',jsonb_build_object('resolution',p_resolution,'evidence',p_evidence));
 return to_jsonb(op);
end $$;

create function public.ct_reprocess_batch(p_ids text[],p_owner text) returns void language plpgsql security definer set search_path='' as $$
declare id text; begin
 if cardinality(p_ids)>100 then raise exception 'conflict'; end if;
 foreach id in array p_ids loop perform public.ct_reprocess(id,p_owner); end loop;
end $$;

create function public.ct_backoff(p_kind text,p_seconds integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_kind not in ('read','firm','admin','write','connect') then raise exception 'conflict'; end if;
 insert into public.ct_budgets(id,window_at,used) values(p_kind,now()+make_interval(secs=>least(3600,greatest(1,p_seconds))),1000000)
 on conflict(id) do update set window_at=greatest(public.ct_budgets.window_at,excluded.window_at),used=1000000;
end $$;

-- Function execution is backend-only; never expose a privileged RPC through default PUBLIC grants.
do $$ declare r record; begin
 for r in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ct_%' loop
  execute format('revoke all on function %s from public, anon, authenticated',r.signature);
  execute format('grant execute on function %s to service_role',r.signature);
 end loop;
end $$;
commit;
