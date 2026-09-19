-- Exact finite prize inventory. Server-only; never apply before baseline reconciliation.
create table public.tk_pools (
 id uuid primary key, title text not null check(length(title) between 1 and 100),
 mode text not null check(mode in ('shared','individual','reward')), per_user integer not null,
 quantity integer not null check(quantity between 1 and 2000), state text not null default 'draft' check(state in ('draft','active','paused')),
 config jsonb not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(per_user between 1 and quantity)
);
create table public.tk_codes (
 code text primary key check(code ~ '^CT-[A-F0-9]{24}$'), pool_id uuid not null references public.tk_pools(id),
 capacity integer not null check(capacity between 1 and 2000), claimed integer not null default 0 check(claimed>=0 and claimed<=capacity)
);
create index tk_codes_pool on public.tk_codes(pool_id);
create table public.tk_tickets (
 id uuid primary key default gen_random_uuid(), pool_id uuid not null references public.tk_pools(id), position integer not null,
 title text not null, prize jsonb not null, user_id uuid references auth.users(id), source_key text,
 claimed_at timestamptz, revealed_at timestamptz, used_at timestamptz,
 checkout_id uuid, submitted boolean not null default false, discount_cents integer,
 manual_state text check(manual_state in ('requested','completed')), manual_reference text,
 unique(pool_id,position),unique(user_id,source_key),check((user_id is null)=(claimed_at is null))
);
create index tk_tickets_owner on public.tk_tickets(user_id,claimed_at desc);
create index tk_tickets_unclaimed on public.tk_tickets(pool_id,position) where user_id is null;
create index tk_tickets_manual on public.tk_tickets(manual_state,claimed_at desc) where manual_state is not null;
create table public.tk_audit (
 id bigint generated always as identity primary key, actor uuid references auth.users(id),
 pool_id uuid references public.tk_pools(id), ticket_id uuid references public.tk_tickets(id), action text not null, created_at timestamptz not null default now()
);
create index tk_audit_pool on public.tk_audit(pool_id,id);

create function public.tk_create(p_actor uuid,p_id uuid,p_config jsonb,p_prizes jsonb,p_codes jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.tk_pools; n integer; i integer; p jsonb; expected integer; begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,610));
 select * into existing from public.tk_pools where id=p_id;
 if found then
  if existing.created_by<>p_actor or existing.config<>p_config then raise exception 'conflict';end if;
  return jsonb_build_object('id',p_id,'state',existing.state);
 end if;
 n=jsonb_array_length(p_prizes);
 if n<1 or n>2000 or jsonb_typeof(p_config->'prizes')<>'array' or jsonb_array_length(p_config->'prizes')<>n then raise exception 'invalid_input';end if;
 -- The shuffled array must be exactly the staff-approved multiset, including duplicates.
 if (select jsonb_agg(x order by x::text) from jsonb_array_elements(p_prizes)x) is distinct from
    (select jsonb_agg(x order by x::text) from jsonb_array_elements(p_config->'prizes')x) then raise exception 'invalid_input';end if;
 for p in select value from jsonb_array_elements(p_prizes) loop
  if jsonb_typeof(p->'name') is distinct from 'string' or jsonb_typeof(p->'description') is distinct from 'string' or jsonb_typeof(p->'kind') is distinct from 'string' or p->>'kind' not in ('percentage_off','amount_off','manual','none') or length(p->>'name') not between 1 and 80 or length(p->>'description')>400
   or jsonb_typeof(p->'value')<>'number' or (p->>'value')::numeric<>trunc((p->>'value')::numeric)
   or (p->>'kind'='percentage_off' and (p->>'value')::integer not between 1 and 100)
   or (p->>'kind'='amount_off' and (p->>'value')::integer not between 1 and 10000000)
   or (p->>'kind' in ('manual','none') and (p->>'value')::integer<>0)
   or not(p ?& array['name','description','kind','value']) then raise exception 'invalid_input';end if;
 end loop;
 expected=case p_config->>'mode' when 'reward' then 0 when 'shared' then 1 when 'individual' then n else -1 end;
 if jsonb_array_length(p_codes)<>expected then raise exception 'invalid_input';end if;
 insert into public.tk_pools(id,title,mode,per_user,quantity,config,created_by)
 values(p_id,p_config->>'title',p_config->>'mode',(p_config->>'per_user')::integer,n,p_config,p_actor);
 insert into public.tk_tickets(pool_id,position,title,prize)
 select p_id,ordinality::integer,p_config->>'title',value from jsonb_array_elements(p_prizes) with ordinality;
 insert into public.tk_codes(code,pool_id,capacity)
 select value,p_id,case when p_config->>'mode'='shared' then n else 1 end from jsonb_array_elements_text(p_codes);
 insert into public.tk_audit(actor,pool_id,action) values(p_actor,p_id,'create');
 return jsonb_build_object('id',p_id,'state','draft');
end $$;

create function public.tk_state(p_actor uuid,p_id uuid,p_state text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_state is null or p_state not in ('active','paused') then raise exception 'invalid_input';end if;
 update public.tk_pools set state=p_state where id=p_id;if not found then raise exception 'not_found';end if;
 insert into public.tk_audit(actor,pool_id,action) values(p_actor,p_id,p_state);
 return jsonb_build_object('id',p_id,'state',p_state);
end $$;

create function public.tk_claim(p_user uuid,p_code text,p_key text,p_pool uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare pool public.tk_pools; ticket public.tk_tickets; c public.tk_codes; pid uuid; begin
 if p_user is null or p_key is null or length(p_key) not between 1 and 150 or (p_code is null)=(p_pool is null) then raise exception 'invalid_input';end if;
 -- Serialize same-source retries before any pool lock, even if callers change pools.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||':'||p_key,611));
 if p_code is not null then select * into c from public.tk_codes where code=p_code;pid=c.pool_id;else pid=p_pool;end if;
 if pid is null then raise exception 'invalid_code';end if;
 select * into pool from public.tk_pools where id=pid for update;if not found then raise exception 'not_found';end if;
 select * into ticket from public.tk_tickets where user_id=p_user and source_key=p_key;
 if found then if ticket.pool_id<>pid then raise exception 'conflict';end if;return to_jsonb(ticket);end if;
 if pool.state<>'active' then raise exception 'not_active';end if;
 if p_pool is not null and pool.mode<>'reward' then raise exception 'invalid_input';end if;
 if p_code is not null then select * into c from public.tk_codes where code=p_code for update;if c.claimed>=c.capacity then raise exception 'sold_out';end if;end if;
 if (select count(*) from public.tk_tickets where pool_id=pid and user_id=p_user)>=pool.per_user then raise exception 'claim_limit';end if;
 select * into ticket from public.tk_tickets where pool_id=pid and user_id is null order by position limit 1 for update;
 if not found then raise exception 'sold_out';end if;
 update public.tk_tickets set user_id=p_user,source_key=p_key,claimed_at=now() where id=ticket.id returning * into ticket;
 if p_code is not null then update public.tk_codes set claimed=claimed+1 where code=p_code;end if;
 insert into public.tk_audit(actor,pool_id,ticket_id,action) values(p_user,pid,ticket.id,'claim');
 return to_jsonb(ticket);
end $$;

create function public.tk_reveal(p_user uuid,p_ticket uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket public.tk_tickets;begin
 update public.tk_tickets set revealed_at=coalesce(revealed_at,now()) where id=p_ticket and user_id=p_user returning * into ticket;
 if not found then raise exception 'not_found';end if;
 return to_jsonb(ticket);
end $$;

create function public.tk_checkout(p_user uuid,p_ticket uuid,p_checkout uuid,p_action text,p_subtotal integer default 0) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket public.tk_tickets; discount integer;begin
 select * into ticket from public.tk_tickets where id=p_ticket and user_id=p_user for update;
 if not found then raise exception 'not_found';end if;
 if p_checkout is null then raise exception 'invalid_input';end if;
 if ticket.revealed_at is null then raise exception 'not_revealed';end if;
 if ticket.prize->>'kind' not in ('percentage_off','amount_off') then raise exception 'not_discount';end if;
 if ticket.used_at is not null then
  if p_action='settle' and ticket.checkout_id=p_checkout then return jsonb_build_object('discount_cents',ticket.discount_cents);end if;
  raise exception 'already_used';
 end if;
 if ticket.checkout_id is not null and ticket.checkout_id<>p_checkout then raise exception 'ticket_held';end if;
 if p_action='reserve' then
  if p_subtotal is null or p_subtotal<0 then raise exception 'invalid_input';end if;
  discount=case when ticket.prize->>'kind'='percentage_off' then floor(p_subtotal::numeric*(ticket.prize->>'value')::integer/100)::integer else least(p_subtotal,(ticket.prize->>'value')::integer) end;
  if ticket.submitted and ticket.discount_cents is distinct from discount then raise exception 'ticket_held';end if;
  update public.tk_tickets set checkout_id=p_checkout,discount_cents=discount where id=p_ticket;
 elsif p_action in ('submit','settle','decline','release') then
  if ticket.checkout_id is distinct from p_checkout then raise exception 'conflict';end if;
  if p_action='submit' then update public.tk_tickets set submitted=true where id=p_ticket;
  elsif p_action='settle' then update public.tk_tickets set used_at=now(),submitted=false where id=p_ticket;
  elsif p_action='decline' then update public.tk_tickets set submitted=false where id=p_ticket;
  elsif ticket.submitted then raise exception 'ticket_held';
  else update public.tk_tickets set checkout_id=null,discount_cents=null where id=p_ticket;
  end if;
  discount=ticket.discount_cents;
 else raise exception 'invalid_input';end if;
 insert into public.tk_audit(actor,pool_id,ticket_id,action) values(p_user,ticket.pool_id,p_ticket,'checkout_'||p_action);
 return jsonb_build_object('discount_cents',discount);
end $$;

create function public.tk_manual(p_user uuid,p_actor uuid,p_ticket uuid,p_reference text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ticket public.tk_tickets;begin
 select * into ticket from public.tk_tickets where id=p_ticket for update;
 if not found or (p_user is not null and ticket.user_id is distinct from p_user) then raise exception 'not_found';end if;
 if ticket.prize->>'kind'<>'manual' or ticket.revealed_at is null then raise exception 'invalid_input';end if;
 if p_user is not null and p_actor is null then
  update public.tk_tickets set manual_state=coalesce(manual_state,'requested') where id=p_ticket;
 elsif p_actor is not null and p_user is null then
  if ticket.manual_state is null or p_reference is null or length(p_reference) not between 1 and 200 then raise exception 'invalid_input';end if;
  if ticket.manual_state='completed' and ticket.manual_reference is distinct from p_reference then raise exception 'conflict';end if;
  update public.tk_tickets set manual_state='completed',manual_reference=p_reference,used_at=coalesce(used_at,now()) where id=p_ticket;
 else raise exception 'invalid_input';end if;
 insert into public.tk_audit(actor,pool_id,ticket_id,action) values(coalesce(p_actor,p_user),ticket.pool_id,p_ticket,case when p_user is not null then 'request_prize' else 'fulfill_prize' end);
 return jsonb_build_object('id',p_ticket,'state',case when p_user is not null then coalesce(ticket.manual_state,'requested') else 'completed' end);
end $$;

-- No client reads: even an owner must use the sanitized projection to hide an unscratched prize.
do $$declare t text; f record;begin
 foreach t in array array['tk_pools','tk_codes','tk_tickets','tk_audit'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'tk\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

-- New correct answers grant a real ticket in the same transaction. An exhausted
-- pool cannot leave an acknowledged reward without inventory. Historical pending
-- rewards use the retrying dispatcher below and preserve their source key.
alter table public.cn_puzzle_rewards add column retry_after timestamptz not null default now();
create index cn_reward_retry on public.cn_puzzle_rewards(retry_after,id) where state='pending';
create function public.tk_puzzle_grant() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;begin
 result=public.tk_claim(new.user_id,null,'puzzle-reward/'||new.id::text,new.reward_ticket_id::uuid);
 perform public.cn_complete_reward(new.id,result->>'id');
 return new;
end $$;
create trigger tk_puzzle_grant after insert on public.cn_puzzle_rewards for each row execute function public.tk_puzzle_grant();
create function public.tk_puzzle_configuration() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare pool public.tk_pools;begin
 if new.state='scheduled' and (tg_op='INSERT' or old.state is distinct from new.state or old.reward_ticket_id is distinct from new.reward_ticket_id or old.reward_cap is distinct from new.reward_cap) then
  select * into pool from public.tk_pools where id=new.reward_ticket_id::uuid for update;
  if not found or pool.mode<>'reward' or pool.state<>'active' then raise exception 'invalid_input';end if;
  if (select count(*) from public.tk_tickets where pool_id=pool.id and user_id is null)<new.reward_cap-new.claimed then raise exception 'sold_out';end if;
 end if;
 return new;
end $$;
create trigger tk_puzzle_configuration before insert or update on public.cn_puzzles for each row execute function public.tk_puzzle_configuration();
revoke all on function public.tk_puzzle_grant(),public.tk_puzzle_configuration() from public,anon,authenticated;
