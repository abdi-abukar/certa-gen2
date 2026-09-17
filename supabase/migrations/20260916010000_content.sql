begin;
set local search_path=public,extensions;
-- Reconcile the existing project's newsletter baseline before applying. No legacy issue/sender is activated.
create extension if not exists pgcrypto;
create table if not exists public.newsletter_subscribers (
 id uuid primary key default gen_random_uuid(), email text not null unique,
 status text not null default 'active' check(status in ('active','unsubscribed','bounced')),
 source text not null default 'newsletter_page', consented_at timestamptz not null default now(),
 unsubscribed_at timestamptz, welcome_sent_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint newsletter_subscribers_email_normalized check(email=lower(trim(email)) and length(email) between 3 and 320 and email like '%_@_%._%')
);
alter table public.newsletter_subscribers add column if not exists unsubscribe_token text not null default encode(gen_random_bytes(32),'hex');
create unique index if not exists cn_subscriber_token on public.newsletter_subscribers(unsubscribe_token);
create index if not exists cn_subscriber_status on public.newsletter_subscribers(status,id);
create table public.cn_assets (
 id uuid primary key, path text not null unique, mime text not null check(mime in ('image/png','image/jpeg','image/webp')),
 bytes integer not null check(bytes between 1 and 4194304), created_by uuid not null references auth.users, created_at timestamptz not null default now()
);
create table public.cn_issues (
 id uuid primary key, created_by uuid not null references auth.users, revision integer not null default 1,
 content jsonb not null, template_version integer not null default 1,
 state text not null default 'draft' check(state in ('draft','sending','completed','attention','cancelled')),
 published_at timestamptz, rendered jsonb, sender text, reply_to text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((published_at is null)=(rendered is null))
);
create index cn_issue_sending on public.cn_issues(id) where state='sending';
create index cn_issue_list on public.cn_issues(created_at desc,id);
create table public.cn_deliveries (
 id uuid primary key default gen_random_uuid(), issue_id uuid not null references public.cn_issues,
 subscriber_id uuid not null references public.newsletter_subscribers, email text not null, unsubscribe_token text not null,
 state text not null default 'pending' check(state in ('pending','sending','accepted','delivered','bounced','complained','skipped','failed','unknown')),
 attempts integer not null default 0, first_attempt_at timestamptz, next_attempt_at timestamptz not null default now(), lease_until timestamptz, lease_token uuid,
 provider_id text unique, last_error text, updated_at timestamptz not null default now(), unique(issue_id,subscriber_id)
);
create index cn_delivery_queue on public.cn_deliveries(next_attempt_at) where state in ('pending','sending');
create index cn_delivery_issue on public.cn_deliveries(issue_id,state,id);
create table public.cn_email_events (
 id text primary key, provider_id text not null, kind text not null, received_at timestamptz not null default now()
);
create index cn_email_event_provider on public.cn_email_events(provider_id);
create table public.cn_generations (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references auth.users, request_key text not null,
 input_hash text not null, state text not null default 'running' check(state in ('running','completed','failed','unknown')),
 result jsonb, error text, created_at timestamptz not null default now(), unique(created_by,request_key)
);
create index cn_generation_budget on public.cn_generations(created_at);
create table public.cn_puzzles (
 id uuid primary key, created_by uuid not null references auth.users, revision integer not null default 1,
 prompt text not null check(length(prompt) between 1 and 2000), image_id uuid references public.cn_assets,
 answer_hash text not null, answer_mask text not null,
 reward_ticket_id text not null check(length(reward_ticket_id) between 1 and 128), reward_cap integer not null check(reward_cap between 1 and 10000), claimed integer not null default 0,
 live_on date not null check(extract(dow from live_on)=0), starts_at timestamptz not null, ends_at timestamptz not null,
 state text not null default 'draft' check(state in ('draft','scheduled','cancelled')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(claimed between 0 and reward_cap)
);
create unique index cn_puzzle_drop on public.cn_puzzles(live_on) where state='scheduled';
create table public.cn_puzzle_attempts (
 puzzle_id uuid not null references public.cn_puzzles, user_id uuid not null references auth.users,
 attempts integer not null default 0, window_at timestamptz not null default now(), primary key(puzzle_id,user_id)
);
-- Handoff: the ticket backend consumes this outbox. Reward IDs are stable idempotency keys.
create table public.cn_puzzle_rewards (
 id uuid primary key default gen_random_uuid(), puzzle_id uuid not null references public.cn_puzzles,
 user_id uuid not null references auth.users, reward_ticket_id text not null,
 state text not null default 'pending' check(state in ('pending','granted','failed')),
 ticket_grant_id text, last_error text, created_at timestamptz not null default now(), completed_at timestamptz,
 unique(puzzle_id,user_id), check((state='granted')=(ticket_grant_id is not null))
);
create unique index cn_reward_grant on public.cn_puzzle_rewards(ticket_grant_id) where ticket_grant_id is not null;
create index cn_reward_pending on public.cn_puzzle_rewards(created_at,id) where state='pending';
create index cn_reward_owner on public.cn_puzzle_rewards(user_id,created_at desc);
create table public.cn_audit (
 id bigint generated always as identity primary key, actor_id uuid references auth.users, action text not null,
 resource_id uuid, created_at timestamptz not null default now()
);

create function public.cn_save_issue(p_actor uuid,p_id uuid,p_revision integer,p_content jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r cn_issues;
begin
 if p_content->>'template' not in ('digest','announcement') or jsonb_typeof(p_content->'sections')<>'array' then raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 select * into r from cn_issues where id=p_id for update;
 if found then
  if r.state<>'draft' or r.revision<>p_revision then raise exception 'conflict'; end if;
  update cn_issues set content=p_content,revision=revision+1,updated_at=now() where id=p_id returning * into r;
 else
  if p_revision<>0 then raise exception 'not_found'; end if;
  insert into cn_issues(id,created_by,content) values(p_id,p_actor,p_content) returning * into r;
 end if;
 insert into cn_audit(actor_id,action,resource_id) values(p_actor,'newsletter.save',p_id);
 return to_jsonb(r);
end $$;
create function public.cn_publish_issue(p_actor uuid,p_id uuid,p_revision integer,p_rendered jsonb,p_sender text,p_reply_to text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r cn_issues;
begin
 select * into r from cn_issues where id=p_id for update;
 if not found then raise exception 'not_found'; end if;
 if r.published_at is not null then return to_jsonb(r)-'rendered'; end if;
 if r.state<>'draft' or r.revision<>p_revision then raise exception 'conflict'; end if;
 if length(p_rendered->>'html') not between 1 and 1000000 or length(p_rendered->>'text') not between 1 and 1000000 or length(p_sender) not between 3 and 320 then raise exception 'invalid_input'; end if;
 update cn_issues set state='sending',published_at=now(),rendered=p_rendered,sender=p_sender,reply_to=p_reply_to,updated_at=now() where id=p_id returning * into r;
 insert into cn_deliveries(issue_id,subscriber_id,email,unsubscribe_token)
 select p_id,id,email,unsubscribe_token from newsletter_subscribers where status='active' and consented_at is not null;
 if not found then update cn_issues set state='completed' where id=p_id returning * into r; end if;
 insert into cn_audit(actor_id,action,resource_id) values(p_actor,'newsletter.publish',p_id);
 return to_jsonb(r)-'rendered';
end $$;
create function public.cn_cancel_issue(p_actor uuid,p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from cn_issues where id=p_id for update;
 if not found then raise exception 'not_found'; end if;
 update cn_issues set state='cancelled',updated_at=now() where id=p_id;
 update cn_deliveries set state=case when first_attempt_at is null then 'skipped' else 'unknown' end,last_error='issue_cancelled',updated_at=now() where issue_id=p_id and state='pending';
 insert into cn_audit(actor_id,action,resource_id) values(p_actor,'newsletter.cancel',p_id);
end $$;
create function public.cn_subscribe(p_email text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Called only with the verified user's address and explicit consent. Suppressions are preserved.
 insert into newsletter_subscribers(email,source) values(lower(trim(p_email)),'verified_account') on conflict(email) do nothing;
 if exists(select 1 from newsletter_subscribers where email=lower(trim(p_email)) and status<>'active') then raise exception 'suppressed'; end if;
end $$;
create function public.cn_unsubscribe(p_token text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update newsletter_subscribers set status=case when status='bounced' then status else 'unsubscribed' end,unsubscribed_at=coalesce(unsubscribed_at,now()),updated_at=now() where unsubscribe_token=p_token;
 update cn_deliveries set state=case when first_attempt_at is null then 'skipped' else 'unknown' end,last_error='unsubscribed',updated_at=now() where unsubscribe_token=p_token and state='pending';
end $$;
create function public.cn_generation_begin(p_actor uuid,p_key text,p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r cn_generations;
begin
 perform pg_advisory_xact_lock(hashtextextended('cn_generation_budget',1));
 select * into r from cn_generations where created_by=p_actor and request_key=p_key;
 if found then
  if r.input_hash<>p_hash then raise exception 'conflict'; end if;
  return jsonb_build_object('run',false,'item',to_jsonb(r));
 end if;
 if (select count(*) from cn_generations where created_by=p_actor and created_at>now()-interval '24 hours')>=20
 or (select count(*) from cn_generations where created_at>now()-interval '24 hours')>=200
 or exists(select 1 from cn_generations where state='running' and created_at>now()-interval '2 minutes') then raise exception 'rate_limited'; end if;
 update cn_generations set state='unknown',error='generation_interrupted' where state='running' and created_at<=now()-interval '2 minutes';
 insert into cn_generations(created_by,request_key,input_hash) values(p_actor,p_key,p_hash) returning * into r;
 return jsonb_build_object('run',true,'item',to_jsonb(r));
end $$;

create function public.cn_claim_delivery() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job cn_deliveries; issue cn_issues;
begin
 -- A lost response may already have sent. Never repeat beyond the provider's 24-hour window.
 update cn_deliveries set state='unknown',last_error='reconciliation_required',lease_until=null
 where state in ('pending','sending') and first_attempt_at<now()-interval '23 hours';
 update cn_deliveries set state='unknown',last_error='attempts_exhausted',lease_until=null
 where state in ('pending','sending') and attempts>=5 and coalesce(lease_until,now())<=now();
 update cn_deliveries d set state=case when d.first_attempt_at is null then 'skipped' else 'unknown' end,last_error='suppressed_or_cancelled'
 where d.state='pending' and (exists(select 1 from newsletter_subscribers s where s.id=d.subscriber_id and s.status<>'active') or exists(select 1 from cn_issues i where i.id=d.issue_id and i.state='cancelled'));
 update cn_issues i set state=case when exists(select 1 from cn_deliveries d where d.issue_id=i.id and d.state in ('unknown','failed','bounced','complained')) then 'attention' else 'completed' end,updated_at=now()
 where i.state='sending' and not exists(select 1 from cn_deliveries d where d.issue_id=i.id and d.state in ('pending','sending'));
 select * into job from cn_deliveries where state in ('pending','sending') and next_attempt_at<=now() and coalesce(lease_until,now())<=now() order by next_attempt_at,id for update skip locked limit 1;
 if not found then return null; end if;
 -- Recheck suppression even for a crashed sending lease.
 if exists(select 1 from newsletter_subscribers where id=job.subscriber_id and status<>'active') or exists(select 1 from cn_issues where id=job.issue_id and state='cancelled') then
  update cn_deliveries set state=case when first_attempt_at is null then 'skipped' else 'unknown' end,last_error='suppressed_or_cancelled' where id=job.id;
  return null;
 end if;
 update cn_deliveries set state='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_until=now()+interval '90 seconds',lease_token=gen_random_uuid(),updated_at=now() where id=job.id returning * into job;
 select * into issue from cn_issues where id=job.issue_id;
 return jsonb_build_object('delivery',to_jsonb(job),'rendered',issue.rendered,'sender',issue.sender,'reply_to',issue.reply_to);
end $$;
create function public.cn_finish_delivery(p_id uuid,p_lease uuid,p_provider text,p_error text,p_retry boolean,p_retry_after integer default 0) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d cn_deliveries; outcome text;
begin
 if p_provider is not null then perform pg_advisory_xact_lock(hashtextextended('cn_email:'||p_provider,3)); end if;
 select * into d from cn_deliveries where id=p_id and lease_token=p_lease and state='sending' for update;
 if not found then raise exception 'conflict'; end if;
 if p_provider is not null then
  select kind into outcome from cn_email_events where provider_id=p_provider order by case kind when 'email.complained' then 1 when 'email.bounced' then 2 when 'email.delivered' then 3 else 4 end limit 1;
  outcome=case outcome when 'email.complained' then 'complained' when 'email.bounced' then 'bounced' when 'email.delivered' then 'delivered' else 'accepted' end;
 else outcome=case when p_retry then 'pending' else 'failed' end; end if;
 update cn_deliveries set state=outcome,provider_id=p_provider,last_error=p_error,lease_until=null,next_attempt_at=now()+make_interval(secs=>greatest(least(3600,greatest(0,coalesce(p_retry_after,0))),least(3600,60*power(2,d.attempts)::integer))),updated_at=now() where id=p_id;
 if outcome in ('bounced','complained') then update newsletter_subscribers set status='bounced',updated_at=now() where id=d.subscriber_id; end if;
end $$;
create function public.cn_email_event(p_id text,p_provider text,p_kind text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare d cn_deliveries;
begin
 if p_kind not in ('email.delivered','email.bounced','email.complained') then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('cn_email:'||p_provider,3));
 insert into cn_email_events(id,provider_id,kind) values(p_id,p_provider,p_kind) on conflict do nothing;
 if not found then return; end if;
 select * into d from cn_deliveries where provider_id=p_provider for update;
 if found then
  update cn_deliveries set state=case when p_kind='email.complained' then 'complained' when state='complained' then state when p_kind='email.bounced' then 'bounced' when state='bounced' then state else 'delivered' end,updated_at=now() where id=d.id;
  if p_kind in ('email.bounced','email.complained') then
   update newsletter_subscribers set status='bounced',updated_at=now() where id=d.subscriber_id;
   update cn_issues set state='attention',updated_at=now() where id=d.issue_id and state='completed';
  end if;
 end if;
end $$;

create function public.cn_save_puzzle(p_actor uuid,p_id uuid,p_revision integer,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r cn_puzzles; day date; starts timestamptz; ends timestamptz;
begin
 day=(p_data->>'live_on')::date;
 starts=(day+time '17:00') at time zone 'America/Toronto';
 ends=((day+7)+time '17:00') at time zone 'America/Toronto';
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,2));
 select * into r from cn_puzzles where id=p_id for update;
 if found then
  if r.state<>'draft' or r.revision<>p_revision then raise exception 'conflict'; end if;
  update cn_puzzles set prompt=p_data->>'prompt',image_id=(p_data->>'image_id')::uuid,answer_hash=p_data->>'answer_hash',answer_mask=p_data->>'answer_mask',reward_ticket_id=p_data->>'reward_ticket_id',reward_cap=(p_data->>'reward_cap')::integer,live_on=day,starts_at=starts,ends_at=ends,revision=revision+1,updated_at=now() where id=p_id returning * into r;
 else
  if p_revision<>0 then raise exception 'not_found'; end if;
  insert into cn_puzzles(id,created_by,prompt,image_id,answer_hash,answer_mask,reward_ticket_id,reward_cap,live_on,starts_at,ends_at) values(p_id,p_actor,p_data->>'prompt',(p_data->>'image_id')::uuid,p_data->>'answer_hash',p_data->>'answer_mask',p_data->>'reward_ticket_id',(p_data->>'reward_cap')::integer,day,starts,ends) returning * into r;
 end if;
 insert into cn_audit(actor_id,action,resource_id) values(p_actor,'puzzle.save',p_id);
 return to_jsonb(r)-'answer_hash';
end $$;
create function public.cn_schedule_puzzle(p_actor uuid,p_id uuid,p_revision integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r cn_puzzles;
begin
 select * into r from cn_puzzles where id=p_id for update;
 if not found then raise exception 'not_found'; end if;
 if r.state='scheduled' then return to_jsonb(r)-'answer_hash'; end if;
 if r.state<>'draft' or r.revision<>p_revision or r.ends_at<=now() then raise exception 'conflict'; end if;
 update cn_puzzles set state='scheduled',updated_at=now() where id=p_id returning * into r;
 insert into cn_audit(actor_id,action,resource_id) values(p_actor,'puzzle.schedule',p_id);
 return to_jsonb(r)-'answer_hash';
exception when unique_violation then raise exception 'conflict';
end $$;
create function public.cn_cancel_puzzle(p_actor uuid,p_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update cn_puzzles set state='cancelled',updated_at=now() where id=p_id;
 if not found then raise exception 'not_found'; end if;
 insert into cn_audit(actor_id,action,resource_id) values(p_actor,'puzzle.cancel',p_id);
end $$;
create function public.cn_guess(p_user uuid,p_id uuid,p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p cn_puzzles; a cn_puzzle_attempts; r cn_puzzle_rewards;
begin
 select * into p from cn_puzzles where id=p_id for update;
 if not found then raise exception 'not_found'; end if;
 select * into r from cn_puzzle_rewards where puzzle_id=p_id and user_id=p_user;
 if found then return jsonb_build_object('correct',true,'reward',to_jsonb(r)); end if;
 if p.state<>'scheduled' or now()<p.starts_at or now()>=p.ends_at then raise exception 'not_live'; end if;
 insert into cn_puzzle_attempts(puzzle_id,user_id) values(p_id,p_user) on conflict do nothing;
 select * into a from cn_puzzle_attempts where puzzle_id=p_id and user_id=p_user for update;
 if a.window_at<=now()-interval '1 hour' then a.attempts=0; a.window_at=now(); end if;
 if a.attempts>=10 then return jsonb_build_object('error','rate_limited','retry_at',a.window_at+interval '1 hour'); end if;
 update cn_puzzle_attempts set attempts=a.attempts+1,window_at=a.window_at where puzzle_id=p_id and user_id=p_user;
 if p_hash<>p.answer_hash then return jsonb_build_object('correct',false,'attempts_remaining',9-a.attempts); end if;
 if p.claimed>=p.reward_cap then return jsonb_build_object('error','sold_out'); end if;
 update cn_puzzles set claimed=claimed+1 where id=p_id;
 insert into cn_puzzle_rewards(puzzle_id,user_id,reward_ticket_id) values(p_id,p_user,p.reward_ticket_id) returning * into r;
 return jsonb_build_object('correct',true,'reward',to_jsonb(r));
end $$;
create function public.cn_complete_reward(p_id uuid,p_grant_id text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r cn_puzzle_rewards;
begin
 if length(trim(p_grant_id)) not between 1 and 128 then raise exception 'invalid_input'; end if;
 select * into r from cn_puzzle_rewards where id=p_id for update;
 if not found then raise exception 'not_found'; end if;
 if r.state='granted' then if r.ticket_grant_id<>p_grant_id then raise exception 'conflict'; end if; return; end if;
 update cn_puzzle_rewards set state='granted',ticket_grant_id=p_grant_id,last_error=null,completed_at=now() where id=p_id;
end $$;
-- API-only tables: browser tokens cannot read answers, subscribers, jobs or other users' rewards.
do $$ declare t text; f record; begin
 for t in select tablename from pg_tables where schemaname='public' and (tablename like 'cn\_%' escape '\' or tablename='newsletter_subscribers') loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to service_role',t);
 end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'cn\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant usage,select on sequence public.cn_audit_id_seq to service_role;
-- Public editorial images only; upload/download operations are controlled by server APIs.
-- Conditional for isolated PostgreSQL tests; Supabase has storage.buckets in deployed projects.
do $$ begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('certa-content','certa-content',true,4194304,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
 end if;
end $$;

commit;
