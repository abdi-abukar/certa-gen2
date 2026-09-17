-- Standard requirements lifecycle. No production deployment or vendor activation.
begin;
create table public.cc_templates (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('kyc','sim_funded','w9','w8ben')),
 requirement text not null check(requirement in ('kyc','agreement','tax')), version text not null,
 provider text not null check(provider in ('veriff','docuseal')), provider_template_id text,
 signer_role text, enabled boolean not null default false, created_at timestamptz not null default now(),
 unique(kind,version), check((kind='kyc' and provider='veriff' and requirement='kyc') or (kind='sim_funded' and provider='docuseal' and requirement='agreement') or (kind in ('w9','w8ben') and provider='docuseal' and requirement='tax'))
);
create unique index cc_active_template on public.cc_templates(kind) where enabled;
-- Existing identifiers are references only. Verify template ownership/content/role before enabling.
insert into public.cc_templates(kind,requirement,version,provider,provider_template_id,signer_role) values
 ('kyc','kyc','v1','veriff',null,null),
 ('sim_funded','agreement','2026-09-04.1','docuseal','5607795','First Party'),
 ('w9','tax','v1','docuseal','5461743','First Party'),
 ('w8ben','tax','v1','docuseal','5607884','First Party');
create table public.cc_tax_choices (
 user_id uuid primary key references auth.users(id), kind text not null check(kind in ('w9','w8ben')),
 revision uuid not null default gen_random_uuid(), updated_at timestamptz not null default now()
);
create table public.cc_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 template_id uuid not null references public.cc_templates(id), kind text not null, requirement text not null,
 version text not null, provider text not null, provider_template_id text, signer_role text,
 email text not null, request_key text not null, tax_revision uuid,
 provider_id text, signer_id text, launch_url text, artifacts jsonb not null default '[]',
 state text not null default 'queued' check(state in ('queued','creating','pending','approved','rejected','expired','unknown','failed','cancelled')),
 provider_updated_at timestamptz, error_code text, created_at timestamptz not null default clock_timestamp(), started_at timestamptz,
 checked_at timestamptz, completed_at timestamptz, unique(user_id,request_key), unique(provider,provider_id)
);
create index on public.cc_requests(user_id,id);
create index on public.cc_requests(state,created_at);
create unique index cc_one_active_requirement on public.cc_requests(user_id,requirement) where state in ('queued','creating','pending','unknown');
create table public.cc_callbacks (
 id text primary key, provider text not null check(provider in ('veriff','docuseal')), provider_id text not null,
 request_id uuid references public.cc_requests(id), terminal_expected boolean not null default false, state text not null default 'queued' check(state in ('queued','running','done','failed')),
 attempts integer not null default 0, next_at timestamptz not null default now(), started_at timestamptz,
 error_code text, created_at timestamptz not null default now()
);
create index on public.cc_callbacks(state,next_at);
create table public.cc_budgets (id text primary key, window_at timestamptz not null, used integer not null);

create function public.cc_budget(p_id text,p_limit integer,p_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare b public.cc_budgets; begin
 insert into public.cc_budgets values(p_id,clock_timestamp(),0) on conflict do nothing;
 select * into b from public.cc_budgets where id=p_id for update;
 if b.window_at+make_interval(secs=>p_seconds)<=clock_timestamp() then b.used:=0;b.window_at:=clock_timestamp();end if;
 if b.used>=p_limit then return false;end if;
 update public.cc_budgets set used=b.used+1,window_at=b.window_at where id=p_id;
 return true;
end $$;
create function public.cc_choose_tax(p_user uuid,p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cc_tax_choices; begin
 perform pg_advisory_xact_lock(hashtextextended('slots:'||p_user::text,0));
 if p_kind not in ('w9','w8ben') then raise exception 'invalid_tax_choice';end if;
 select * into c from public.cc_tax_choices where user_id=p_user;
 if c.kind=p_kind then return to_jsonb(c);end if;
 if exists(select 1 from public.cc_requests where user_id=p_user and requirement='tax' and state in ('queued','creating','pending','unknown')) then raise exception 'request_busy';end if;
 insert into public.cc_tax_choices(user_id,kind) values(p_user,p_kind) on conflict(user_id) do update set kind=excluded.kind,revision=gen_random_uuid(),updated_at=clock_timestamp() returning * into c;
 perform public.ct_record_compliance(p_user,p_user,jsonb_build_object('requirement','tax','version',(select version from public.ct_compliance_requirements where id='tax'),'status','revoked','source','tax-choice:'||c.revision,'effective_at',now(),'evidence_reference','tax-choice:'||c.revision));
 return to_jsonb(c);
end $$;
create function public.cc_begin(p_user uuid,p_email text,p_kind text,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.cc_requests; t public.cc_templates; c public.cc_tax_choices; begin
 perform pg_advisory_xact_lock(hashtextextended('slots:'||p_user::text,0));
 select * into r from public.cc_requests where user_id=p_user and request_key=p_key;
 if found then if r.kind<>p_kind then raise exception 'conflict';end if;return to_jsonb(r);end if;
 select * into t from public.cc_templates where kind=p_kind and enabled;
 if not found or t.version<>(select version from public.ct_compliance_requirements where id=t.requirement) then raise exception 'template_not_configured';end if;
 if p_kind in ('w9','w8ben') then
  select * into c from public.cc_tax_choices where user_id=p_user;
  if c.kind is distinct from p_kind then raise exception 'tax_choice_required';end if;
 end if;
 select * into r from public.cc_requests where user_id=p_user and requirement=t.requirement and state in ('queued','creating','pending','unknown');
 if found then if r.kind<>p_kind or r.version<>t.version then raise exception 'request_busy';end if;return to_jsonb(r);end if;
 if (public.ct_compliance(p_user)->>t.requirement)::boolean then raise exception 'already_approved';end if;
 if not public.cc_budget('start:'||p_user,5,86400) then raise exception 'cooldown';end if;
 if length(p_key) not between 8 and 100 or length(p_email)>320 then raise exception 'conflict';end if;
 insert into public.cc_requests(user_id,template_id,kind,requirement,version,provider,provider_template_id,signer_role,email,request_key,tax_revision)
 values(p_user,t.id,t.kind,t.requirement,t.version,t.provider,t.provider_template_id,t.signer_role,lower(p_email),p_key,c.revision) returning * into r;
 insert into public.ct_audit(actor_id,user_id,action,data) values(p_user,p_user,'contract-request',jsonb_build_object('request_id',r.id,'kind',r.kind,'version',r.version));
 return to_jsonb(r);
end $$;
create function public.cc_callback(p_id text,p_provider text,p_provider_id text,p_request uuid default null,p_terminal boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cc_budget('callback:'||p_provider,100,1) then raise exception 'cooldown';end if;
 -- Correlation is only a lookup hint. The worker must verify it against the provider API.
 insert into public.cc_callbacks(id,provider,provider_id,request_id,terminal_expected)
 values(p_id,p_provider,p_provider_id,(select id from public.cc_requests where id=p_request and provider=p_provider),p_terminal) on conflict do nothing;
end $$;
create function public.cc_claim(p_owner text) returns jsonb language plpgsql security definer set search_path='' as $$
declare cb public.cc_callbacks; r public.cc_requests; begin
 if not exists(select 1 from public.ct_runtime where id='contracts-worker' and owner=p_owner and expires_at>now()) then raise exception 'conflict';end if;
 -- A creation interrupted by process death is ambiguous, never automatically repeated.
 update public.cc_requests set state='unknown',error_code='worker_interrupted' where state='creating' and started_at<now()-interval '2 minutes';
 update public.cc_callbacks set state=case when attempts<5 then 'queued' else 'failed' end,error_code='worker_interrupted' where state='running' and started_at<now()-interval '2 minutes';
 select * into cb from public.cc_callbacks where state='queued' and next_at<=now() order by next_at for update skip locked limit 1;
 if found then
  update public.cc_callbacks set state='running',attempts=attempts+1,started_at=now() where id=cb.id returning * into cb;
  return jsonb_build_object('type','verify','callback',to_jsonb(cb));
 end if;
 select * into r from public.cc_requests where state='queued' order by created_at for update skip locked limit 1;
 if not found then return null;end if;
 update public.cc_requests set state='creating',started_at=now() where id=r.id returning * into r;
 return jsonb_build_object('type','create','request',to_jsonb(r));
end $$;
create function public.cc_bind(p_request uuid,p_provider_id text,p_signer text,p_url text) returns void language plpgsql security definer set search_path='' as $$
declare r public.cc_requests;begin
 select * into r from public.cc_requests where id=p_request;
 perform pg_advisory_xact_lock(hashtextextended('slots:'||r.user_id::text,0));
 select * into r from public.cc_requests where id=p_request for update;
 if not found or r.state not in ('creating','unknown','pending','approved','rejected','expired') or r.provider_id is not null and r.provider_id<>p_provider_id then raise exception 'conflict';end if;
 update public.cc_requests set provider_id=p_provider_id,signer_id=coalesce(p_signer,signer_id),launch_url=coalesce(p_url,launch_url),state=case when state in ('creating','unknown') then 'pending' else state end,error_code=null where id=r.id;
 insert into public.ct_changes(user_id,kind) values(r.user_id,'compliance');
end $$;
create function public.cc_apply(p_request uuid,p_provider_id text,p_state text,p_at timestamptz,p_artifacts jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.cc_requests; effective timestamptz; begin
 select * into r from public.cc_requests where id=p_request;
 perform pg_advisory_xact_lock(hashtextextended('slots:'||r.user_id::text,0));
 select * into r from public.cc_requests where id=p_request for update;
 if not found or r.provider_id is distinct from p_provider_id or p_state not in ('pending','approved','rejected','expired') then raise exception 'conflict';end if;
 if r.state='cancelled' or r.provider_updated_at>p_at or r.state in ('approved','rejected','expired') and p_state='pending' then return;end if;
 if r.provider_updated_at=p_at and r.state=p_state then
  update public.cc_requests set checked_at=now(),artifacts=case when jsonb_array_length(p_artifacts)>0 then p_artifacts else artifacts end where id=r.id;
  return;
 end if;
 if p_at>now()+interval '5 minutes' then raise exception 'invalid_provider_time';end if;
 effective:=least(greatest(p_at,r.created_at),now());
 update public.cc_requests set state=p_state,provider_updated_at=case when p_state='pending' then provider_updated_at else p_at end,checked_at=now(),artifacts=case when jsonb_array_length(p_artifacts)>0 then p_artifacts else artifacts end,error_code=null,
 completed_at=case when p_state='approved' then p_at else completed_at end where id=r.id;
 -- Old versions and superseded tax selections can never authorize current issuance.
 if p_state in ('approved','rejected','expired') and r.version=(select version from public.ct_compliance_requirements where id=r.requirement)
 and (r.requirement<>'tax' or exists(select 1 from public.cc_tax_choices where user_id=r.user_id and revision=r.tax_revision and kind=r.kind))
 and not exists(select 1 from public.cc_requests newer where newer.user_id=r.user_id and newer.requirement=r.requirement and newer.created_at>r.created_at) then
  perform public.ct_record_compliance(r.user_id,r.user_id,jsonb_build_object('requirement',r.requirement,'version',r.version,
   'status',case when p_state='approved' then 'approved' else 'rejected' end,
   'source','contract:'||r.id||':'||p_state||':'||p_at::text,'effective_at',effective,'evidence_reference',r.provider||':'||p_provider_id));
 end if;
 insert into public.ct_audit(user_id,action,data) values(r.user_id,'contract-provider-result',jsonb_build_object('request_id',r.id,'state',p_state,'provider_id',p_provider_id));
 insert into public.ct_changes(user_id,kind) values(r.user_id,'compliance');
end $$;
create function public.cc_refresh(p_actor uuid,p_request uuid,p_provider_id text default null,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.cc_requests; vendor_id text;begin
 select * into r from public.cc_requests where id=p_request;
 if not found then raise exception 'not_found';end if;
 perform pg_advisory_xact_lock(hashtextextended('slots:'||r.user_id::text,0));
 vendor_id:=coalesce(r.provider_id,p_provider_id);
 if vendor_id is null then raise exception 'provider_id_required';end if;
 if p_provider_id is not null and r.provider_id is not null and p_provider_id<>r.provider_id then raise exception 'conflict';end if;
 if not public.cc_budget('refresh:'||r.id,1,60) then raise exception 'cooldown';end if;
 perform public.cc_callback('refresh:'||gen_random_uuid(),r.provider,vendor_id,r.id);
 insert into public.ct_audit(actor_id,user_id,action,data) values(p_actor,r.user_id,'contract-refresh',jsonb_build_object('request_id',r.id,'reason',p_reason));
end $$;
create function public.cc_admin_action(p_actor uuid,p_request uuid,p_action text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.cc_requests;begin
 select * into r from public.cc_requests where id=p_request;
 if not found then raise exception 'not_found';end if;
 perform pg_advisory_xact_lock(hashtextextended('slots:'||r.user_id::text,0));
 select * into r from public.cc_requests where id=p_request for update;
 if p_action='not-created' and r.state='unknown' and r.provider_id is null and length(p_reason)>=10 then
  update public.cc_requests set state='failed',error_code='operator_confirmed_not_created' where id=r.id;
 elsif p_action='retry' and r.state='failed' and r.provider_id is null then
  update public.cc_requests set state='queued',error_code=null where id=r.id;
 elsif p_action='cancel' and r.state in ('queued','failed') and r.provider_id is null then
  update public.cc_requests set state='cancelled',launch_url=null where id=r.id;
 else raise exception 'request_busy';end if;
 insert into public.ct_audit(actor_id,user_id,action,data) values(p_actor,r.user_id,'contract-'||p_action,jsonb_build_object('request_id',r.id,'reason',p_reason));
end $$;
create function public.cc_publish(p_actor uuid,p_kind text,p_version text,p_template text,p_role text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.cc_templates; requirement_name text;begin
 perform pg_advisory_xact_lock(hashtextextended('contracts:templates',0));
 requirement_name:=case p_kind when 'kyc' then 'kyc' when 'sim_funded' then 'agreement' when 'w9' then 'tax' when 'w8ben' then 'tax' else null end;
 if requirement_name is null then raise exception 'invalid_kind';end if;
 select * into t from public.cc_templates where kind=p_kind and version=p_version;
 if found and (t.provider_template_id is distinct from p_template or t.signer_role is distinct from p_role) then raise exception 'immutable_template_version';end if;
 update public.cc_templates set enabled=false where kind=p_kind;
 insert into public.cc_templates(kind,requirement,version,provider,provider_template_id,signer_role,enabled)
 values(p_kind,requirement_name,p_version,case when p_kind='kyc' then 'veriff' else 'docuseal' end,p_template,p_role,true)
 on conflict(kind,version) do update set enabled=true returning * into t;
 perform public.ct_compliance_version(p_actor,requirement_name,p_version,p_reason);
 insert into public.ct_audit(actor_id,action,data) values(p_actor,'publish-contract-template',jsonb_build_object('template_id',t.id,'reason',p_reason));
 return to_jsonb(t);
end $$;

do $$ declare t text; r record;begin
 foreach t in array array['templates','tax_choices','requests','callbacks','budgets'] loop
  execute format('alter table public.cc_%I enable row level security',t);
  execute format('revoke all on public.cc_%I from public,anon,authenticated',t);
  execute format('grant all on public.cc_%I to service_role',t);
 end loop;
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cc_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',r.signature);
  execute format('grant execute on function %s to service_role',r.signature);
 end loop;
end $$;
commit;
