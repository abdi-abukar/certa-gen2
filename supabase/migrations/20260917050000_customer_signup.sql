-- Customer signup: legal identity, public @username and pre-account email proof.
-- Ported from the original two-step signup (trader_usernames + email_pin_challenges).
create table public.cu_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[a-z][a-z0-9]{0,11}$'),
 first_name text not null check(length(first_name) between 1 and 60),
 last_name text not null check(length(last_name) between 1 and 60),
 country text not null check(country ~ '^[A-Z]{2}$'),
 terms_accepted_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
alter table public.cu_profiles enable row level security;
revoke all on public.cu_profiles from public,anon,authenticated;
grant all on public.cu_profiles to service_role;

-- A guest proves mailbox ownership before any auth user exists. Only keyed hashes are stored.
create table public.cu_signup_challenges (
 id uuid primary key, email text not null, ip_hash text not null check(length(ip_hash)=64),
 code_hash text not null check(length(code_hash)=64),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes',
 attempts int not null default 0, consumed_at timestamptz,
 delivery text not null default 'pending' check(delivery in ('pending','accepted','failed')),
 verified_at timestamptz, proof_hash text check(proof_hash is null or length(proof_hash)=64), claimed_at timestamptz
);
create index cu_signup_challenges_email_time on public.cu_signup_challenges(email,created_at desc);
create index cu_signup_challenges_ip_time on public.cu_signup_challenges(ip_hash,created_at desc);
alter table public.cu_signup_challenges enable row level security;
revoke all on public.cu_signup_challenges from public,anon,authenticated;
grant all on public.cu_signup_challenges to service_role;

create function public.cu_username_available(p_username text) returns boolean language sql security definer set search_path='' as $$
 select not exists(select 1 from public.cu_profiles where username=lower(p_username));
$$;
-- plpgsql defers column resolution so the disposable test fixture can add auth.users.email itself.
create function public.cu_email_registered(p_email text) returns boolean language plpgsql security definer set search_path='' as $$
declare found boolean; begin
 select exists(select 1 from auth.users where lower(email)=lower(p_email)) into found; return found;
end $$;
create function public.cu_signup_begin(p_email text,p_ip_hash text,p_id uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare last_time timestamptz; begin
 perform pg_advisory_xact_lock(hashtextextended('cu:'||p_email,0));
 select max(created_at) into last_time from public.cu_signup_challenges where email=p_email;
 if last_time>now()-interval '60 seconds'
  or (select count(*) from public.cu_signup_challenges where email=p_email and created_at>now()-interval '15 minutes')>=5
  or (select count(*) from public.cu_signup_challenges where ip_hash=p_ip_hash and created_at>now()-interval '15 minutes')>=15
 then return jsonb_build_object('state','rate_limited'); end if;
 update public.cu_signup_challenges set consumed_at=now() where email=p_email and consumed_at is null;
 insert into public.cu_signup_challenges(id,email,ip_hash,code_hash) values(p_id,p_email,p_ip_hash,p_hash);
 return jsonb_build_object('state','created','id',p_id);
end $$;
create function public.cu_signup_delivery(p_id uuid,p_accepted boolean) returns void language sql security definer set search_path='' as $$
 update public.cu_signup_challenges set delivery=case when p_accepted then 'accepted' else 'failed' end,
 consumed_at=case when p_accepted then consumed_at else now() end where id=p_id;
$$;
create function public.cu_signup_verify(p_email text,p_id uuid,p_hash text,p_proof_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.cu_signup_challenges; begin
 perform pg_advisory_xact_lock(hashtextextended('cu:'||p_email,0));
 select * into c from public.cu_signup_challenges where id=p_id and email=p_email for update;
 if not found or c.consumed_at is not null or c.expires_at<=now() or c.attempts>=5 or c.delivery<>'accepted' then return false; end if;
 update public.cu_signup_challenges set attempts=attempts+1 where id=c.id;
 if c.code_hash<>p_hash then return false; end if;
 update public.cu_signup_challenges set consumed_at=now(),verified_at=now(),proof_hash=p_proof_hash where id=c.id;
 return true;
end $$;
-- Proof is single-use for two hours; a failed account creation releases it for one retry window.
create function public.cu_signup_claim(p_email text,p_id uuid,p_proof_hash text) returns boolean language plpgsql security definer set search_path='' as $$
declare c public.cu_signup_challenges; begin
 perform pg_advisory_xact_lock(hashtextextended('cu:'||p_email,0));
 select * into c from public.cu_signup_challenges where id=p_id and email=p_email for update;
 if not found or c.verified_at is null or c.proof_hash is null or c.proof_hash<>p_proof_hash or c.claimed_at is not null or c.verified_at<=now()-interval '2 hours' then return false; end if;
 update public.cu_signup_challenges set claimed_at=now() where id=c.id;
 return true;
end $$;
create function public.cu_signup_release(p_email text,p_id uuid) returns void language sql security definer set search_path='' as $$
 update public.cu_signup_challenges set claimed_at=null where id=p_id and email=p_email;
$$;
create function public.cu_register(p_user uuid,p_username text,p_first text,p_last text,p_country text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 insert into public.cu_profiles(user_id,username,first_name,last_name,country) values(p_user,lower(p_username),p_first,p_last,upper(p_country));
 return jsonb_build_object('state','registered');
exception when unique_violation then return jsonb_build_object('state','username_taken');
end $$;
-- The signup mailbox proof doubles as the first session's second factor, as the original 2FA cookie did.
create function public.cu_grant_session(p_user uuid,p_session uuid,p_email text) returns void language sql security definer set search_path='' as $$
 insert into public.cf_verified_sessions(user_id,session_id,email) values(p_user,p_session,p_email)
 on conflict(user_id,session_id) do update set email=excluded.email,verified_at=now(),expires_at=now()+interval '12 hours';
$$;
create function public.cu_profile(p_user uuid) returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(p)-'user_id' from public.cu_profiles p where user_id=p_user;
$$;
revoke all on function public.cu_username_available(text),public.cu_email_registered(text),public.cu_signup_begin(text,text,uuid,text),public.cu_signup_delivery(uuid,boolean),public.cu_signup_verify(text,uuid,text,text),public.cu_signup_claim(text,uuid,text),public.cu_signup_release(text,uuid),public.cu_register(uuid,text,text,text,text),public.cu_grant_session(uuid,uuid,text),public.cu_profile(uuid) from public,anon,authenticated;
grant execute on function public.cu_username_available(text),public.cu_email_registered(text),public.cu_signup_begin(text,text,uuid,text),public.cu_signup_delivery(uuid,boolean),public.cu_signup_verify(text,uuid,text,text),public.cu_signup_claim(text,uuid,text),public.cu_signup_release(text,uuid),public.cu_register(uuid,text,text,text,text),public.cu_grant_session(uuid,uuid,text),public.cu_profile(uuid) to service_role;

-- Extend the existing bounded auth cleanup so no extra worker is needed.
create or replace function public.cf_cleanup() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.cf_challenges where id in (select id from public.cf_challenges where expires_at<now()-interval '1 day' order by expires_at limit 1000);
 delete from public.cf_totp_sessions where (user_id,session_id) in (select user_id,session_id from public.cf_totp_sessions where expires_at<now() order by expires_at limit 1000);
 delete from public.cf_verified_sessions where (user_id,session_id) in (select user_id,session_id from public.cf_verified_sessions where expires_at<now() order by expires_at limit 1000);
 delete from public.cu_signup_challenges where id in (select id from public.cu_signup_challenges where created_at<now()-interval '1 day' order by created_at limit 1000);
end $$;
