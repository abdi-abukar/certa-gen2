-- Customer email verification is tied to a verified Supabase session, never editable metadata.
create table public.cf_challenges (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null, email text not null, code_hash text not null check(length(code_hash)=64),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes',
 attempts int not null default 0, consumed_at timestamptz, delivery text not null default 'pending' check(delivery in ('pending','accepted','failed'))
);
create index cf_challenges_user_time on public.cf_challenges(user_id,created_at desc);
create table public.cf_verified_sessions (
 user_id uuid not null references auth.users(id) on delete cascade, session_id uuid not null,
 email text not null, verified_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '12 hours',
 primary key(user_id,session_id)
);
alter table public.cf_challenges enable row level security;
alter table public.cf_verified_sessions enable row level security;
revoke all on public.cf_challenges,public.cf_verified_sessions from public,anon,authenticated;
grant all on public.cf_challenges,public.cf_verified_sessions to service_role;
create table public.cf_totp_sessions (
 user_id uuid not null references auth.users(id) on delete cascade, session_id uuid not null, factor_id uuid not null,
 expires_at timestamptz not null default now()+interval '12 hours', primary key(user_id,session_id)
);
alter table public.cf_totp_sessions enable row level security;
revoke all on public.cf_totp_sessions from public,anon,authenticated;
grant all on public.cf_totp_sessions to service_role;
create function public.cf_verified(p_user uuid,p_session uuid,p_email text) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.cf_verified_sessions where user_id=p_user and session_id=p_session and email=p_email and expires_at>now());
$$;
create function public.cf_begin(p_user uuid,p_session uuid,p_email text,p_id uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare last_time timestamptz; begin
 perform pg_advisory_xact_lock(hashtextextended('cf:'||p_user,0));
 select max(created_at) into last_time from public.cf_challenges where user_id=p_user;
 if last_time>now()-interval '60 seconds' or (select count(*) from public.cf_challenges where user_id=p_user and created_at>now()-interval '15 minutes')>=5 then return jsonb_build_object('state','rate_limited'); end if;
 update public.cf_challenges set consumed_at=now() where user_id=p_user and session_id=p_session and consumed_at is null;
 insert into public.cf_challenges(id,user_id,session_id,email,code_hash) values(p_id,p_user,p_session,p_email,p_hash);
 return jsonb_build_object('state','created','id',p_id);
end $$;
create function public.cf_delivery(p_id uuid,p_user uuid,p_accepted boolean) returns void language sql security definer set search_path='' as $$
 update public.cf_challenges set delivery=case when p_accepted then 'accepted' else 'failed' end,
 consumed_at=case when p_accepted then consumed_at else now() end where id=p_id and user_id=p_user;
$$;
create function public.cf_verify(p_user uuid,p_session uuid,p_email text,p_id uuid,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.cf_challenges; begin
 perform pg_advisory_xact_lock(hashtextextended('cf:'||p_user,0));
 select * into c from public.cf_challenges where id=p_id and user_id=p_user and session_id=p_session and email=p_email for update;
 if not found or c.consumed_at is not null or c.expires_at<=now() or c.attempts>=5 or c.delivery<>'accepted' then return false; end if;
 update public.cf_challenges set attempts=attempts+1 where id=c.id;
 if c.code_hash<>p_hash then return false; end if;
 update public.cf_challenges set consumed_at=now() where id=c.id;
 insert into public.cf_verified_sessions(user_id,session_id,email) values(p_user,p_session,p_email)
 on conflict(user_id,session_id) do update set email=excluded.email,verified_at=now(),expires_at=now()+interval '12 hours';
 return true;
end $$;
create function public.cf_clear(p_user uuid,p_session uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('cf:'||p_user,0));
 update public.cf_challenges set consumed_at=now() where user_id=p_user and session_id=p_session and consumed_at is null;
 delete from public.cf_verified_sessions where user_id=p_user and session_id=p_session;
 delete from public.cf_totp_sessions where user_id=p_user and session_id=p_session;
end $$;
revoke all on function public.cf_verified(uuid,uuid,text),public.cf_begin(uuid,uuid,text,uuid,text),public.cf_delivery(uuid,uuid,boolean),public.cf_verify(uuid,uuid,text,uuid,text),public.cf_clear(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cf_verified(uuid,uuid,text),public.cf_begin(uuid,uuid,text,uuid,text),public.cf_delivery(uuid,uuid,boolean),public.cf_verify(uuid,uuid,text,uuid,text),public.cf_clear(uuid,uuid) to service_role;

-- Bounded cleanup is invoked by the existing content worker; no codes or proofs are archived.
create function public.cf_cleanup() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.cf_challenges where id in (select id from public.cf_challenges where expires_at<now()-interval '1 day' order by expires_at limit 1000);
 delete from public.cf_totp_sessions where (user_id,session_id) in (select user_id,session_id from public.cf_totp_sessions where expires_at<now() order by expires_at limit 1000);
 delete from public.cf_verified_sessions where (user_id,session_id) in (select user_id,session_id from public.cf_verified_sessions where expires_at<now() order by expires_at limit 1000);
end $$;
revoke all on function public.cf_cleanup() from public,anon,authenticated;
grant execute on function public.cf_cleanup() to service_role;

-- Supabase's public Auth API permits AAL1 enrollment. Only factors migrated from
-- the trusted baseline or enrolled after Certa admission may replace email proof.
create table public.cf_trusted_factors (
 factor_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index cf_trusted_factors_user on public.cf_trusted_factors(user_id);
alter table public.cf_trusted_factors enable row level security;
revoke all on public.cf_trusted_factors from public,anon,authenticated;
grant all on public.cf_trusted_factors to service_role;
do $$ begin
 if to_regclass('auth.mfa_factors') is not null then
  execute 'insert into public.cf_trusted_factors(factor_id,user_id) select id,user_id from auth.mfa_factors where factor_type=''totp'' and status=''verified'' on conflict do nothing';
 end if;
end $$;
create function public.cf_factors(p_user uuid) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(factor_id),'[]'::jsonb) from public.cf_trusted_factors where user_id=p_user;
$$;
create function public.cf_trust_factor(p_user uuid,p_factor uuid) returns void language sql security definer set search_path='' as $$
 insert into public.cf_trusted_factors(factor_id,user_id) values(p_factor,p_user) on conflict do nothing;
$$;
create function public.cf_remove_factor(p_user uuid,p_factor uuid) returns void language sql security definer set search_path='' as $$
 delete from public.cf_trusted_factors where factor_id=p_factor and user_id=p_user;
$$;
revoke all on function public.cf_factors(uuid),public.cf_trust_factor(uuid,uuid),public.cf_remove_factor(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cf_factors(uuid),public.cf_trust_factor(uuid,uuid),public.cf_remove_factor(uuid,uuid) to service_role;

create function public.cf_prove_totp(p_user uuid,p_session uuid,p_factor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.cf_trusted_factors where user_id=p_user and factor_id=p_factor) then raise exception 'untrusted_factor'; end if;
 insert into public.cf_totp_sessions(user_id,session_id,factor_id) values(p_user,p_session,p_factor)
 on conflict(user_id,session_id) do update set factor_id=excluded.factor_id,expires_at=now()+interval '12 hours';
end $$;
create function public.cf_verified_totp(p_user uuid,p_session uuid,p_factor uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.cf_totp_sessions where user_id=p_user and session_id=p_session and factor_id=p_factor and expires_at>now());
$$;
revoke all on function public.cf_prove_totp(uuid,uuid,uuid),public.cf_verified_totp(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.cf_prove_totp(uuid,uuid,uuid),public.cf_verified_totp(uuid,uuid,uuid) to service_role;
