-- Additive, server-only Discord projection/outbox. No OAuth tokens or avatars stored.
begin;
create table public.cd_identities(user_id uuid primary key references auth.users(id), epoch uuid not null default gen_random_uuid());
create table public.cd_oauth(hash text primary key,user_id uuid not null references auth.users(id),epoch uuid not null,expires_at timestamptz not null);
create index on public.cd_oauth(expires_at);
create table public.cd_links(
 user_id uuid primary key references auth.users(id),discord_id text not null unique check(discord_id ~ '^[0-9]{17,20}$'),
 generation uuid not null default gen_random_uuid(),username text not null,state text not null default 'linked' check(state in ('linked','disconnecting')),
 weekly_pnl boolean not null default false,last_digest_day date,daily_pnl boolean not null default false,milestones boolean not null default false,show_amount boolean not null default false,
 nickname text,nickname_requested boolean not null default false,member boolean not null default false,
 connected_at timestamptz not null default now(),synced_at timestamptz,error_code text
);
create index cd_links_repair on public.cd_links(synced_at asc nulls first,user_id) where state='linked';
create index cd_links_digest on public.cd_links(last_digest_day,user_id) where state='linked' and (daily_pnl or weekly_pnl);
create table public.cd_roles(role_id text primary key check(role_id ~ '^[0-9]{17,20}$'),kind text not null check(kind in ('connected','evaluation','funded','summit','bronze','crown','founding')),active boolean not null default true);
create unique index cd_active_role on public.cd_roles(kind) where active;
create table public.cd_awards(user_id uuid references auth.users(id),kind text not null check(kind in ('summit','founding')),source text not null,created_at timestamptz not null default now(),primary key(user_id,kind,source));
create table public.cd_jobs(
 id uuid primary key default gen_random_uuid(),dedupe text not null unique,user_id uuid references auth.users(id),generation uuid,
 kind text not null check(kind in ('roles','cleanup','nickname','milestone','share','daily','weekly','alert','commands')),
 payload jsonb not null default '{}',state text not null default 'queued' check(state in ('queued','running','sent','failed','unknown','cancelled')),
 attempts integer not null default 0,next_at timestamptz not null default now(),started_at timestamptz,finished_at timestamptz,
 channel_id text,message_id text,error_code text,created_at timestamptz not null default now()
);
create index on public.cd_jobs(state,next_at);
create index on public.cd_jobs(user_id,id);
create index on public.cd_jobs(state,id);
create index cd_public_feed on public.cd_jobs(finished_at desc) where kind='milestone' and state='sent';
create index cd_running_users on public.cd_jobs(user_id) where state='running';
create unique index cd_role_coalesce on public.cd_jobs(user_id) where kind='roles' and state='queued';
create table public.cd_audit(id uuid primary key default gen_random_uuid(),actor_id uuid,user_id uuid,action text not null,data jsonb not null default '{}',created_at timestamptz not null default now());
create index on public.cd_audit(user_id,created_at);
create index on public.cd_audit(created_at desc);
create index cd_paid_trader_roles on public.cp_payouts(user_id) where kind='trader' and state='paid';
create table public.cd_digest_dirty(user_id uuid primary key references auth.users(id));
create table public.cd_runtime(id text primary key,data jsonb not null default '{}',updated_at timestamptz not null default now());
create table public.cd_limits(id text primary key,window_at timestamptz not null,used integer not null default 0,blocked_until timestamptz);
create function public.cd_limit(p_id text,p_max integer,p_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.cd_limits;begin
 insert into public.cd_limits(id,window_at) values(p_id,now()) on conflict do nothing;
 select * into r from public.cd_limits where id=p_id for update;
 if r.blocked_until>now() then return false;end if;
 if r.window_at<=now()-make_interval(secs=>p_seconds) then r.used:=0;r.window_at:=now();end if;
 if r.used>=p_max then return false;end if;
 update public.cd_limits set used=r.used+1,window_at=r.window_at where id=p_id;return true;
end $$;
create function public.cd_pause(p_id text,p_seconds integer) returns void language sql security definer set search_path='' as $$
 insert into public.cd_limits(id,window_at,blocked_until) values(p_id,now(),now()+make_interval(secs=>least(greatest(p_seconds,1),86400)))
 on conflict(id) do update set blocked_until=greatest(cd_limits.blocked_until,excluded.blocked_until);
$$;
create function public.cd_queue_roles(p_user uuid) returns void language sql security definer set search_path='' as $$
 insert into public.cd_jobs(dedupe,user_id,generation,kind)
 select 'roles:'||gen_random_uuid(),user_id,generation,'roles' from public.cd_links where user_id=p_user and state='linked'
 on conflict do nothing;
$$;
create function public.cd_oauth_begin(p_user uuid,p_hash text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('discord:'||p_user,0));
 if not public.cd_limit('oauth:'||p_user,5,600) then raise exception 'cooldown';end if;
 if exists(select 1 from public.cd_links where user_id=p_user) then raise exception 'already_linked';end if;
 insert into public.cd_identities(user_id) values(p_user) on conflict do nothing;
 delete from public.cd_oauth where user_id=p_user or expires_at<now();
 insert into public.cd_oauth select p_hash,p_user,epoch,now()+interval '10 minutes' from public.cd_identities where user_id=p_user;
end $$;
create function public.cd_oauth_consume(p_user uuid,p_hash text) returns uuid language plpgsql security definer set search_path='' as $$
declare e uuid;begin
 delete from public.cd_oauth where hash=p_hash and user_id=p_user and expires_at>now() returning epoch into e;
 if e is null then raise exception 'oauth_expired';end if;return e;
end $$;
create function public.cd_link(p_user uuid,p_epoch uuid,p_discord text,p_username text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('discord:'||p_user,0));
 if not exists(select 1 from public.cd_identities where user_id=p_user and epoch=p_epoch) then raise exception 'oauth_expired';end if;
 if exists(select 1 from public.cd_links where user_id=p_user or discord_id=p_discord) then raise exception 'already_linked';end if;
 insert into public.cd_links(user_id,discord_id,username) values(p_user,p_discord,left(p_username,100));
 perform public.cd_queue_roles(p_user);
 insert into public.cd_audit(actor_id,user_id,action) values(p_user,p_user,'linked');
end $$;
create function public.cd_disconnect(p_actor uuid,p_user uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare l public.cd_links;begin
 perform pg_advisory_xact_lock(hashtextextended('discord:'||p_user,0));
 insert into public.cd_identities(user_id) values(p_user) on conflict(user_id) do update set epoch=gen_random_uuid();
 delete from public.cd_oauth where user_id=p_user;
 select * into l from public.cd_links where user_id=p_user for update;
 if l.user_id is null or l.state='disconnecting' then return;end if;
 update public.cd_links set state='disconnecting',daily_pnl=false,weekly_pnl=false,milestones=false where user_id=p_user;
 update public.cd_jobs set state='cancelled',finished_at=now() where user_id=p_user and generation=l.generation and state='queued' and kind<>'cleanup';
 insert into public.cd_jobs(dedupe,user_id,generation,kind,payload) values('cleanup:'||l.generation,p_user,l.generation,'cleanup',jsonb_build_object('discord_id',l.discord_id));
 insert into public.cd_audit(actor_id,user_id,action,data) values(p_actor,p_user,'disconnect',jsonb_build_object('reason',p_reason));
end $$;
create function public.cd_preferences(p_user uuid,p_daily boolean,p_milestones boolean,p_amount boolean,p_weekly boolean default null) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.cd_links set daily_pnl=p_daily,weekly_pnl=coalesce(p_weekly,weekly_pnl),milestones=p_milestones,show_amount=p_amount where user_id=p_user and state='linked';
 if not found then raise exception 'not_linked';end if;
 insert into public.cd_audit(actor_id,user_id,action,data) values(p_user,p_user,'preferences',jsonb_build_object('daily_pnl',p_daily,'weekly_pnl',p_weekly,'milestones',p_milestones,'show_amount',p_amount));
end $$;
create function public.cd_roles_wanted(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(role_id),'[]') from public.cd_roles r where active and (
 kind='connected' or
 kind='evaluation' and exists(select 1 from public.ct_accounts where user_id=p_user and kind='evaluation' and lifecycle in ('active','locked')) or
 kind='funded' and exists(select 1 from public.ct_accounts where user_id=p_user and kind='funded' and lifecycle in ('active','locked')) or
 kind in ('summit','founding') and exists(select 1 from public.cd_awards a where a.user_id=p_user and a.kind=r.kind) or
 kind='bronze' and exists(select 1 from public.cp_payouts where user_id=p_user and kind='trader' and state='paid') or
 kind='crown' and (select count(*) from (select 1 from public.cp_payouts where user_id=p_user and kind='trader' and state='paid' limit 2) q)=2);
$$;
create function public.cd_account_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.lifecycle is not distinct from old.lifecycle and new.kind=old.kind then return new;end if;
 perform public.cd_queue_roles(new.user_id);
 if new.kind='evaluation' and new.lifecycle in ('passed','upgraded') then
 insert into public.cd_awards(user_id,kind,source) values(new.user_id,'summit',new.id::text) on conflict do nothing;
 insert into public.cd_jobs(dedupe,user_id,kind,payload) values('pass:'||new.id,new.user_id,'milestone',jsonb_build_object('event','evaluation_passed','account_id',new.id)) on conflict do nothing;
 end if;return new;
end $$;
create trigger cd_account_event after insert or update of lifecycle,kind on public.ct_accounts for each row execute function public.cd_account_event();
create function public.cd_payout_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state='paid' and (tg_op='INSERT' or old.state is distinct from new.state) and new.kind='trader' then
 perform public.cd_queue_roles(new.user_id);
 insert into public.cd_jobs(dedupe,user_id,kind,payload) values('payout:'||new.id,new.user_id,'milestone',jsonb_build_object('event','payout_paid','payout_id',new.id,'amount_cents',new.amount_cents::text)) on conflict do nothing;
 end if;return new;
end $$;
create trigger cd_payout_event after insert or update of state on public.cp_payouts for each row execute function public.cd_payout_event();
-- Durable staff alerts, one per operation failure; no provider payload or personal data.
create function public.cd_operation_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state in ('failed','unknown') and new.state is distinct from old.state then
 insert into public.cd_jobs(dedupe,user_id,kind,payload) values('alert:'||new.id||':'||new.state,new.user_id,'alert',jsonb_build_object('operation_id',new.id,'state',new.state)) on conflict do nothing;
 end if;return new;
end $$;
create trigger cd_operation_event after update of state on public.ct_operations for each row execute function public.cd_operation_event();
create function public.cd_claim(p_owner text) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.cd_jobs;begin
 if not exists(select 1 from public.ct_runtime where id='discord-worker' and owner=p_owner and expires_at>now()) then raise exception 'lease_required';end if;
 update public.cd_jobs r set state='cancelled' where r.state='running' and r.kind='roles' and r.started_at<now()-interval '2 minutes' and exists(select 1 from public.cd_jobs q where q.user_id=r.user_id and q.kind='roles' and q.state='queued');
 update public.cd_jobs set state=case when kind in ('roles','cleanup','nickname') then 'queued' else 'unknown' end,error_code='worker_interrupted',next_at=now() where state='running' and started_at<now()-interval '2 minutes';
 select * into j from public.cd_jobs q where state='queued' and next_at<=now() and not exists(select 1 from public.cd_jobs r where r.user_id=q.user_id and r.state='running') order by case when kind='cleanup' then 0 else 1 end,created_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.cd_jobs set state='running',started_at=now(),attempts=attempts+1 where id=j.id returning * into j;return to_jsonb(j);
end $$;
create function public.cd_finish(p_id uuid,p_state text,p_error text default null,p_channel text default null,p_message text default null,p_delay integer default 60) returns void language plpgsql security definer set search_path='' as $$
declare j public.cd_jobs;begin
 if p_state not in ('sent','queued','failed','unknown','cancelled') then raise exception 'invalid_state';end if;
 select * into j from public.cd_jobs where id=p_id for update;
 if j.state<>'running' then return;end if;
 if p_state='queued' and j.kind='roles' and exists(select 1 from public.cd_jobs where user_id=j.user_id and kind='roles' and state='queued' and id<>j.id) then p_state:='cancelled';end if;
 update public.cd_jobs set state=case when p_state='queued' and attempts>=8 and p_error is distinct from 'discord_budget' then 'failed' else p_state end,attempts=case when p_error='discord_budget' then greatest(attempts-1,0) else attempts end,error_code=p_error,channel_id=coalesce(p_channel,channel_id),message_id=coalesce(p_message,message_id),next_at=now()+make_interval(secs=>greatest(p_delay,1)),finished_at=case when p_state='queued' then null else now() end where id=p_id;
 if j.kind='cleanup' and p_state='sent' then
 delete from public.cd_links where user_id=j.user_id and generation=j.generation and state='disconnecting';
 end if;
end $$;
create function public.cd_recover(p_actor uuid,p_job uuid,p_action text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare j public.cd_jobs;begin
 select * into j from public.cd_jobs where id=p_job for update;
 if j.id is null then raise exception 'not_recoverable';end if;
 if j.state not in ('failed','unknown') then raise exception 'not_recoverable';end if;
 if p_action not in ('retry','cancel') or length(p_reason)<10 then raise exception 'evidence_required';end if;
 if p_action='retry' and j.kind='roles' and exists(select 1 from public.cd_jobs where user_id=j.user_id and kind='roles' and state='queued') then p_action:='cancel';end if;
 -- Unknown message retries require staff to verify non-delivery; never automatic.
 update public.cd_jobs set state=case when p_action='retry' then 'queued' else 'cancelled' end,attempts=0,next_at=now(),error_code=null where id=p_job;
 if j.kind='cleanup' and p_action='cancel' then raise exception 'cleanup_required';end if;
 insert into public.cd_audit(actor_id,user_id,action,data) values(p_actor,j.user_id,p_action,jsonb_build_object('job_id',p_job,'reason',p_reason));
end $$;
create function public.cd_config_role(p_actor uuid,p_kind text,p_role text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('discord-config',0));
 if p_role is not null and exists(select 1 from public.cd_roles where role_id=p_role and kind<>p_kind) then raise exception 'conflict';end if;
 update public.cd_roles set active=false where kind=p_kind;
 if p_role is not null then insert into public.cd_roles(role_id,kind) values(p_role,p_kind) on conflict(role_id) do update set active=true;end if;
 update public.cd_links set synced_at=null;
 insert into public.cd_audit(actor_id,action,data) values(p_actor,'role_config',jsonb_build_object('kind',p_kind,'role_id',p_role,'reason',p_reason));
end $$;
create function public.cd_nickname(p_user uuid,p_nickname text) returns void language plpgsql security definer set search_path='' as $$
declare l public.cd_links;begin
 update public.cd_links set nickname=p_nickname,nickname_requested=true where user_id=p_user and state='linked' returning * into l;
 if not found then raise exception 'not_linked';end if;
 insert into public.cd_jobs(dedupe,user_id,generation,kind) values('nick:'||gen_random_uuid(),p_user,l.generation,'nickname');
 insert into public.cd_audit(actor_id,user_id,action) values(p_user,p_user,'nickname');
end $$;
create function public.cd_daily(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare l public.cd_links;r record;x jsonb;today date:=(now() at time zone 'America/Toronto')::date;week_start date:=(date_trunc('week',now() at time zone 'America/Toronto')::date-7);begin
 select * into l from public.cd_links where user_id=p_user and state='linked' and (daily_pnl or weekly_pnl);
 if not found then return;end if;
 for r in select distinct on (account_id) account_id,data from public.ct_records where user_id=p_user and kind='daily-stats' and vendor_updated_at>now()-interval '8 days' order by account_id,vendor_updated_at desc limit 100 loop
 for x in select value from jsonb_array_elements(case when jsonb_typeof(r.data->'items')='array' then r.data->'items' else '[]' end) loop
 if l.daily_pnl and x->>'session_date'= (today-1)::text and coalesce(x->>'net_pnl','') ~ '^-?[0-9]+([.][0-9]+)?$' then
 insert into public.cd_jobs(dedupe,user_id,generation,kind,payload) values('daily:'||l.generation||':'||r.account_id||':'||(today-1),p_user,l.generation,'daily',jsonb_build_object('account_id',r.account_id,'period',(today-1)::text)) on conflict do nothing;
 end if;
 if l.weekly_pnl and x->>'session_date'>=week_start::text and x->>'session_date'<(week_start+7)::text then
 insert into public.cd_jobs(dedupe,user_id,generation,kind,payload) values('weekly:'||l.generation||':'||r.account_id||':'||week_start,p_user,l.generation,'weekly',jsonb_build_object('account_id',r.account_id,'period','week:'||week_start)) on conflict do nothing;
 end if;end loop;end loop;
end $$;
create function public.cd_stats_event() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.kind='daily-stats' and exists(select 1 from public.cd_links where user_id=new.user_id and (daily_pnl or weekly_pnl) and state='linked') then insert into public.cd_digest_dirty values(new.user_id) on conflict do nothing;end if;return new;end $$;
create trigger cd_stats_event after insert or update of data on public.ct_records for each row execute function public.cd_stats_event();
create function public.cd_schedule(p_owner text) returns void language plpgsql security definer set search_path='' as $$
declare l record;begin
 if not exists(select 1 from public.ct_runtime where id='discord-worker' and owner=p_owner and expires_at>now()) then raise exception 'lease_required';end if;
 for l in select user_id from public.cd_links where state='linked' and (synced_at is null or synced_at<now()-interval '1 day') order by synced_at nulls first limit 100 loop perform public.cd_queue_roles(l.user_id);end loop;
 for l in select user_id from public.cd_links where state='linked' and (daily_pnl or weekly_pnl) and (last_digest_day is null or last_digest_day<(now() at time zone 'America/Toronto')::date) limit 100 for update skip locked loop
 perform public.cd_daily(l.user_id);
 update public.cd_links set last_digest_day=(now() at time zone 'America/Toronto')::date where user_id=l.user_id;
 end loop;
 for l in select user_id from public.cd_digest_dirty limit 100 for update skip locked loop
 perform public.cd_daily(l.user_id);delete from public.cd_digest_dirty where user_id=l.user_id;end loop;
 delete from public.cd_oauth where expires_at<now();
end $$;
create function public.cd_founding(p_actor uuid,p_user uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.cd_awards(user_id,kind,source) values(p_user,'founding','staff-verified-opening-cohort') on conflict do nothing;
 perform public.cd_queue_roles(p_user);
 insert into public.cd_audit(actor_id,user_id,action,data) values(p_actor,p_user,'founding',jsonb_build_object('reason',p_reason));
end $$;
create function public.cd_register_commands(p_actor uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.cd_jobs(dedupe,kind) values('commands:v1','commands') on conflict do nothing;
 insert into public.cd_audit(actor_id,action,data) values(p_actor,'commands',jsonb_build_object('reason',p_reason));
end $$;
create function public.cd_live(p_owner text,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.ct_runtime where id='discord-worker' and owner=p_owner and expires_at>now()) then raise exception 'lease_required';end if;
 insert into public.cd_runtime(id,data) values('live',p_data) on conflict(id) do update set data=excluded.data,updated_at=now();
end $$;
-- Historical role evidence only: no unsolicited replay of historical public posts.
insert into public.cd_awards(user_id,kind,source) select user_id,'summit',id::text from public.ct_accounts where kind='evaluation' and lifecycle in ('passed','upgraded') on conflict do nothing;
do $$ declare t text; f record;begin
 foreach t in array array['identities','oauth','links','roles','awards','jobs','audit','runtime','limits','digest_dirty'] loop
 execute format('alter table public.cd_%I enable row level security',t);
 execute format('revoke all on public.cd_%I from public,anon,authenticated',t);
 execute format('grant all on public.cd_%I to service_role',t);
 end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'cd\_%' escape '\' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
commit;
