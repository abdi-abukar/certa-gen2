-- Additive awards ledger. Reconcile live baseline before deployment. No remote data import.
begin;
create table public.ca_catalog(id text primary key,name text not null,kicker text not null,description text not null,instructions text not null,accent text not null,rule text not null,display_order int not null default 0,revision int not null default 1);
create table public.ca_templates(id text not null,version int not null,copy jsonb not null default '{}',state text not null check(state in ('draft','published')),created_at timestamptz not null default now(),primary key(id,version));
create table public.ca_issues(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),award_id text references public.ca_catalog(id),source text not null unique,account_id uuid references public.ct_accounts(id),payout_id uuid references public.cp_payouts(id),template_id text,template_version int,fields jsonb not null default '{}',snapshot jsonb not null default '{}',earned_at timestamptz not null default now(),created_at timestamptz not null default now(),foreign key(template_id,template_version) references public.ca_templates(id,version));
create index on public.ca_issues(user_id,created_at desc,id desc);
create index on public.ca_issues(created_at desc,id desc);
create index on public.ca_issues(account_id,award_id);
create table public.ca_renders(id uuid primary key default gen_random_uuid(),issue_id uuid not null references public.ca_issues(id),revision int not null default 1,template_id text not null,template_version int not null,fields jsonb not null,state text not null default 'queued' check(state in ('queued','running','ready','failed')),lease uuid,leased_at timestamptz,attempts int not null default 0,path text,error text,created_at timestamptz not null default now(),unique(issue_id,revision),foreign key(template_id,template_version) references public.ca_templates(id,version));
create index on public.ca_renders(state,created_at);
create table public.ca_audit(id bigint generated always as identity primary key,actor_id uuid references auth.users(id),action text not null,target text not null,reason text not null,data jsonb not null default '{}',created_at timestamptz not null default now());
create table public.ca_looks(user_id uuid primary key references auth.users(id),look jsonb not null default '{}');
insert into public.ca_catalog(id,name,kicker,description,instructions,accent,rule,display_order) values
('trophy','Summit Trophy','Evaluation pass','The cup for clearing a Certa evaluation. Hit the profit target without taking the max loss, and it goes in your cabinet for that account.','Pass an evaluation.','#dce4e9','pass',0),
('bronze','Bronze Ascent','First payout','The first marker on the funded ladder. After you are funded, complete your first paid payout and this medal is yours.','Take your first payout for this account.','#d58b52','payout',1),
('crown','Gold Continuity Crown','Repeat payout','A crown for staying in the game. Every completed payout after the first adds another one to your cabinet.','Take another payout for this account.','#e0b040','payout',2),
('ribbon','Beta Tester Coin','Opening cohort','For traders who open a Certa evaluation during the opening cohort. One coin per trader.','Verified opening-cohort membership.','#e8c66f','cohort',3),
('medal-bronze','Bronze','Design collection','First milestone','No earning rule assigned.','#a9612d','design',4),
('medal-silver','Silver','Design collection','Consistency earned','No earning rule assigned.','#aeb8bf','design',5),
('medal-gold','Gold','Design collection','Evaluation complete','No earning rule assigned.','#d2a43b','design',6),
('champion-cup','Champion’s Cup','Design collection','Highest distinction','No earning rule assigned.','#d8aa39','design',7),
('showcase-crown','Certa Crown','Design collection','Legacy achievement','No earning rule assigned.','#c89b32','design',8);
insert into public.ca_templates(id,version,state) select id,1,'published' from unnest(array['passed','payout-express','payout-funded','win','loss','ticket']) id;
-- Account lock serializes payout cycle assignment. Evidence and artifacts are immutable;
-- corrections create a new render revision, never overwrite an existing artifact.
create function public.ca_issue(p_user uuid,p_award text,p_source text,p_account uuid,p_payout uuid,p_template text,p_fields jsonb,p_snapshot jsonb,p_time timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; v int; f jsonb;begin
 if p_template is not null then select max(version) into v from public.ca_templates where id=p_template and state='published';if v is null then raise exception 'template_unavailable';end if;end if;
 result=gen_random_uuid();f=p_fields||jsonb_build_object('certNo','CERTA-'||upper(result::text));
 insert into public.ca_issues(id,user_id,award_id,source,account_id,payout_id,template_id,template_version,fields,snapshot,earned_at) values(result,p_user,p_award,p_source,p_account,p_payout,p_template,v,f,p_snapshot,coalesce(p_time,now())) on conflict(source) do nothing;
 if not found then select id into result from public.ca_issues where source=p_source;return result;end if;
 if p_template is not null then insert into public.ca_renders(issue_id,template_id,template_version,fields) values(result,p_template,v,f);end if;
 return result;
end $$;
create function public.ca_account(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.ct_accounts;begin
 select * into a from public.ct_accounts where id=p_id;
 if a.kind='evaluation' and a.lifecycle in ('passed','upgraded') then
 perform public.ca_issue(a.user_id,'trophy','pass:'||a.id,a.id,null,'passed',jsonb_build_object('name','CERTA TRADER','date',upper(to_char(coalesce(a.vendor_updated_at,now()) at time zone 'UTC','FMMonth DD, YYYY'))),jsonb_build_object('vendor_id',a.vendor_id,'lifecycle',a.lifecycle),a.vendor_updated_at);
 end if;
end $$;
create function public.ca_payout(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.cp_payouts; n int; t text;begin
 select * into p from public.cp_payouts where id=p_id;
 if p.kind<>'trader' or p.state<>'paid' then return;end if;
 perform 1 from public.ct_accounts where id=p.account_id for update;
 if exists(select 1 from public.ca_issues where source='payout:'||p.id) then return;end if;
 select count(*)+1 into n from public.ca_issues where account_id=p.account_id and payout_id is not null;
 t=case when p.eligibility->>'payout_path'='express' then 'payout-express' else 'payout-funded' end;
 perform public.ca_issue(p.user_id,case when n=1 then 'bronze' else 'crown' end,'payout:'||p.id,p.account_id,p.id,t,jsonb_build_object('handle','CERTA TRADER','amount','+$'||to_char(p.amount_cents/100.0,'FM999,999,990.00'),'date',to_char(p.paid_at at time zone 'UTC','MM.DD.YYYY'),'cycle',lpad(n::text,2,'0'),'day',case when n=1 then 'BRONZE' else 'CROWN' end,'certified',case when t='payout-express' then 'CERTIFIED EXPRESS PAYOUT' else 'CERTIFIED FUNDED PAYOUT' end),jsonb_build_object('amount_cents',p.amount_cents::text,'currency',p.currency,'cycle',n,'payout_path',t,'paid_at',p.paid_at),p.paid_at);
end $$;
create function public.ca_event() returns trigger language plpgsql security definer set search_path='' as $$
begin if tg_table_name='ct_accounts' then perform public.ca_account(new.id);else perform public.ca_payout(new.id);end if;return new;end $$;
create trigger ca_account_event after insert or update of lifecycle on public.ct_accounts for each row execute function public.ca_event();
create trigger ca_payout_event after insert or update of state on public.cp_payouts for each row execute function public.ca_event();
-- Merge the former Discord-specific evidence into the common ledger.
insert into public.ca_issues(user_id,award_id,source,earned_at,snapshot) select user_id,case when kind='summit' then 'trophy' else 'ribbon' end,case when kind='summit' then 'pass:'||source else 'beta:'||user_id end,created_at,jsonb_build_object('import','discord-evidence','source',source) from public.cd_awards on conflict(source) do nothing;
-- Rebuild pass entries with canonical account evidence where it exists, without messaging.
delete from public.ca_issues where award_id='trophy' and template_id is null and source in(select 'pass:'||id from public.ct_accounts where kind='evaluation' and lifecycle in ('passed','upgraded'));
select public.ca_account(id) from public.ct_accounts where kind='evaluation' and lifecycle in ('passed','upgraded');
select public.ca_payout(id) from public.cp_payouts where kind='trader' and state='paid' order by paid_at,id;
create or replace function public.cd_account_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.lifecycle is not distinct from old.lifecycle and new.kind=old.kind then return new;end if;
 perform public.cd_queue_roles(new.user_id);
 if new.kind='evaluation' and new.lifecycle in ('passed','upgraded') then insert into public.cd_jobs(dedupe,user_id,kind,payload) values('pass:'||new.id,new.user_id,'milestone',jsonb_build_object('event','evaluation_passed','account_id',new.id)) on conflict do nothing;end if;return new;
end $$;
create or replace function public.cd_founding(p_actor uuid,p_user uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if length(trim(p_reason))<3 then raise exception 'reason_required';end if;
 perform public.ca_issue(p_user,'ribbon','beta:'||p_user,null,null,null,'{}',jsonb_build_object('evidence',p_reason),now());
 perform public.cd_queue_roles(p_user);
 insert into public.ca_audit(actor_id,action,target,reason) values(p_actor,'cohort',p_user::text,p_reason);
end $$;
-- Keep the existing Discord read contract as a view, not a second writable ledger.
drop table public.cd_awards;
create view public.cd_awards with(security_invoker=true) as select user_id,case when award_id='trophy' then 'summit' else 'founding' end kind,case when award_id='trophy' then replace(source,'pass:','') else 'staff-verified-opening-cohort' end source,earned_at created_at from public.ca_issues where award_id in ('trophy','ribbon');
revoke all on public.cd_awards from public,anon,authenticated;
grant select on public.cd_awards to service_role;
create function public.ca_edit(p_actor uuid,p_kind text,p_id text,p_revision int,p_data jsonb,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;v int; item public.ca_renders;begin
 if length(trim(p_reason)) not between 3 and 1000 then raise exception 'reason_required';end if;
 if p_kind='catalog' then
 update public.ca_catalog set name=p_data->>'name',kicker=p_data->>'kicker',description=p_data->>'description',instructions=p_data->>'instructions',display_order=(p_data->>'display_order')::int,revision=revision+1 where id=p_id and revision=p_revision returning to_jsonb(ca_catalog.*) into result;
 elsif p_kind='draft' then
 perform pg_advisory_xact_lock(hashtextextended('ca-template:'||p_id,0));
 select max(version) into v from public.ca_templates where id=p_id;
 if v is null or v<>p_revision then raise exception 'conflict';end if;
 insert into public.ca_templates(id,version,copy,state) values(p_id,v+1,p_data,'draft') returning to_jsonb(ca_templates.*) into result;
 elsif p_kind='publish' then
 update public.ca_templates set state='published' where id=p_id and version=p_revision and state='draft' returning to_jsonb(ca_templates.*) into result;
 elsif p_kind='retry' then
 update public.ca_renders set state='queued',attempts=0,error=null where id=p_id::uuid and state='failed' returning to_jsonb(ca_renders.*) into result;
 elsif p_kind='correct' then
 perform 1 from public.ca_issues where id=p_id::uuid for update;
 select * into item from public.ca_renders where issue_id=p_id::uuid order by revision desc limit 1;
 if item.id is null or item.revision<>p_revision then raise exception 'conflict';end if;
 -- Only public recipient/copy version can change. Financial evidence stays intact.
 select max(version) into v from public.ca_templates where id=item.template_id and state='published';
 insert into public.ca_renders(issue_id,revision,template_id,template_version,fields) values(item.issue_id,item.revision+1,item.template_id,v,item.fields||p_data) returning to_jsonb(ca_renders.*) into result;
 end if;
 if result is null then raise exception 'conflict';end if;
 insert into public.ca_audit(actor_id,action,target,reason,data) values(p_actor,p_kind,p_id,p_reason,jsonb_build_object('revision',p_revision,'data',p_data));return result;
end $$;
create function public.ca_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.ca_renders;begin
 update public.ca_renders set state=case when attempts>=3 then 'failed' else 'queued' end,error='render_interrupted',lease=null where state='running' and leased_at<now()-interval '3 minutes';
 select * into job from public.ca_renders where state='queued' order by created_at for update skip locked limit 1;
 if job.id is null then return null;end if;
 update public.ca_renders set state='running',lease=gen_random_uuid(),leased_at=now(),attempts=attempts+1 where id=job.id returning * into job;return to_jsonb(job);
end $$;
create function public.ca_finish(p_id uuid,p_lease uuid,p_path text,p_error text) returns void language plpgsql security definer set search_path='' as $$
begin update public.ca_renders set state=case when p_error is null then 'ready' else 'failed' end,path=p_path,error=p_error,lease=null where id=p_id and lease=p_lease and state='running';if not found then raise exception 'lease_lost';end if;end $$;
-- Authenticated clients cannot read or mutate ledgers directly, including through the view.
do $$ declare t text;f record;begin
 foreach t in array array['ca_catalog','ca_templates','ca_issues','ca_renders','ca_audit','ca_looks'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'ca_%' loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated';execute 'grant execute on function '||f.signature||' to service_role';end loop;
end $$;
grant usage,select on sequence public.ca_audit_id_seq to service_role;
-- Private artifacts: only server-authorized download routes access them.
do $$ begin if to_regclass('storage.buckets') is not null then insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('certa-awards','certa-awards',false,20000000,array['image/png']) on conflict(id) do nothing;end if;end $$;
create table public.ca_budgets(user_id uuid primary key references auth.users(id),window_at timestamptz not null default now(),used int not null default 0);
alter table public.ca_budgets enable row level security;
revoke all on public.ca_budgets from public,anon,authenticated;
grant all on public.ca_budgets to service_role;
create function public.ca_budget(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare used int;begin
 insert into public.ca_budgets(user_id,used) values(p_user,1) on conflict(user_id) do update set used=case when ca_budgets.window_at<now()-interval '1 minute' then 1 else ca_budgets.used+1 end,window_at=case when ca_budgets.window_at<now()-interval '1 minute' then now() else ca_budgets.window_at end returning ca_budgets.used into used;
 if used>10 then raise exception 'rate_limited';end if;
end $$;
revoke all on function public.ca_budget(uuid) from public,anon,authenticated;
grant execute on function public.ca_budget(uuid) to service_role;
create table public.ca_legacy_refs(legacy_id text primary key,issue_id uuid not null references public.ca_issues(id),certificate_number text unique,imported_by uuid not null references auth.users(id),imported_at timestamptz not null default now());
alter table public.ca_legacy_refs enable row level security;
revoke all on public.ca_legacy_refs from public,anon,authenticated;
grant all on public.ca_legacy_refs to service_role;
create function public.ca_import_reference(p_actor uuid,p_user uuid,p_source text,p_legacy text,p_certificate text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare issue public.ca_issues;render public.ca_renders;prior public.ca_legacy_refs;begin
 if length(p_legacy) not between 1 and 200 or length(trim(p_reason)) not between 3 and 1000 or (p_certificate is not null and p_certificate !~ '^[A-Za-z0-9_-]{1,100}$') then raise exception 'invalid_reference';end if;
 select * into issue from public.ca_issues where source=p_source and user_id=p_user for update;
 if issue.id is null then raise exception 'canonical_evidence_required';end if;
 select * into prior from public.ca_legacy_refs where legacy_id=p_legacy;
 if prior.legacy_id is not null then if prior.issue_id<>issue.id or prior.certificate_number is distinct from p_certificate then raise exception 'conflict';end if;return issue.id;end if;
 insert into public.ca_legacy_refs values(p_legacy,issue.id,p_certificate,p_actor,now());
 if p_certificate is not null and issue.template_id is not null then
 select * into render from public.ca_renders where issue_id=issue.id order by revision desc limit 1;
 insert into public.ca_renders(issue_id,revision,template_id,template_version,fields) values(issue.id,render.revision+1,render.template_id,render.template_version,render.fields||jsonb_build_object('certNo',p_certificate));
 end if;
 insert into public.ca_audit(actor_id,action,target,reason,data) values(p_actor,'import_reference',issue.id::text,p_reason,jsonb_build_object('legacy_id',p_legacy,'certificate_number',p_certificate));return issue.id;
end $$;
revoke all on function public.ca_import_reference(uuid,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ca_import_reference(uuid,uuid,text,text,text,text) to service_role;
create or replace function public.cd_roles_wanted(p_user uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(role_id),'[]') from public.cd_roles r where active and (
 kind='connected' or
 kind='evaluation' and exists(select 1 from public.ct_accounts where user_id=p_user and kind='evaluation' and lifecycle in ('active','locked')) or
 kind='funded' and exists(select 1 from public.ct_accounts where user_id=p_user and kind='funded' and lifecycle in ('active','locked')) or
 exists(select 1 from public.ca_issues a where a.user_id=p_user and a.award_id=case r.kind when 'summit' then 'trophy' when 'founding' then 'ribbon' when 'bronze' then 'bronze' when 'crown' then 'crown' else null end));
$$;
create function public.ca_share(p_user uuid,p_issue uuid,p_hide_name boolean,p_hide_amount boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare original public.ca_issues;r public.ca_renders;result uuid;src text;f jsonb;begin
 select * into original from public.ca_issues where id=p_issue and user_id=p_user;
 if original.id is null then raise exception 'not_found';end if;
 select * into r from public.ca_renders where issue_id=p_issue order by revision desc limit 1;
 if r.id is null then raise exception 'certificate_required';end if;
 src='share:'||r.id||':'||p_hide_name||':'||p_hide_amount;
 f=r.fields;
 if p_hide_name then f=f||'{"handle":"HIDDEN","name":"HIDDEN","username":"HIDDEN"}'::jsonb;end if;
 if p_hide_amount then f=f||'{"amount":"HIDDEN","pnl":"HIDDEN"}'::jsonb;end if;
 insert into public.ca_issues(user_id,source,account_id,template_id,template_version,fields,snapshot,earned_at) values(p_user,src,original.account_id,r.template_id,r.template_version,f,jsonb_build_object('source_issue',p_issue,'source_revision',r.revision,'hide_name',p_hide_name,'hide_amount',p_hide_amount),original.earned_at) on conflict(source) do nothing returning id into result;
 if result is null then select id into result from public.ca_issues where source=src;return result;end if;
 insert into public.ca_renders(issue_id,template_id,template_version,fields) values(result,r.template_id,r.template_version,f);
 return result;
end $$;
revoke all on function public.ca_share(uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.ca_share(uuid,uuid,boolean,boolean) to service_role;
commit;
