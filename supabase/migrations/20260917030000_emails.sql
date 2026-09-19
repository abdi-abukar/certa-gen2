-- Transactional templates are immutable revisions. Sending stays opt-in.
create table public.ce_templates (
 id text primary key, revision integer not null default 1 check(revision>0),
 enabled boolean not null default false, sensitive boolean not null default false,
 category text not null check(category in ('authentication','transactional','marketing','internal')),
 required_fields text[] not null, allowed_fields text[] not null,
 updated_at timestamptz not null default now()
);
create table public.ce_revisions (
 template_id text not null references public.ce_templates(id), revision integer not null,
 copy jsonb not null check(jsonb_typeof(copy)='object'), created_by uuid references auth.users(id),
 created_at timestamptz not null default now(), primary key(template_id,revision)
);
create table public.ce_outbox (
 id uuid primary key default gen_random_uuid(), event_id text not null check(length(event_id) between 1 and 200),
 template_id text not null, template_revision integer not null, user_id uuid not null references auth.users(id),
 data jsonb not null check(jsonb_typeof(data)='object'), state text not null default 'pending' check(state in ('pending','sending','accepted','failed','unknown','suppressed')),
 attempts integer not null default 0, available_at timestamptz not null default now(), first_attempt_at timestamptz,
 lease_token uuid, lease_until timestamptz, recipient text, rendered jsonb, sender text, reply_to text,
 provider_id text, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(event_id,template_id,user_id), foreign key(template_id,template_revision) references public.ce_revisions(template_id,revision)
);
create index ce_outbox_claim on public.ce_outbox(state,available_at);
create table public.ce_suppressions(email text primary key,reason text not null check(reason in ('bounce','complaint','manual')),created_at timestamptz not null default now());
create table public.ce_generations(id uuid primary key,created_by uuid not null references auth.users(id),template_id text not null references public.ce_templates(id),state text not null check(state in ('running','complete','unknown','failed')),result jsonb,error text,created_at timestamptz not null default now());
alter table public.ce_templates enable row level security;
alter table public.ce_revisions enable row level security;
alter table public.ce_outbox enable row level security;
alter table public.ce_suppressions enable row level security;
alter table public.ce_generations enable row level security;
revoke all on public.ce_templates,public.ce_revisions,public.ce_outbox,public.ce_suppressions,public.ce_generations from public,anon,authenticated;
grant select,insert,update,delete on public.ce_templates,public.ce_revisions,public.ce_outbox,public.ce_suppressions,public.ce_generations to service_role;

create function public.ce_save(p_id text,p_revision integer,p_copy jsonb,p_actor uuid) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare current_version integer;
begin
 select revision into current_version from ce_templates where id=p_id for update;
 if not found then raise exception 'not_found'; end if;
 if current_version<>p_revision then raise exception 'conflict'; end if;
 if jsonb_typeof(p_copy)<>'object' or length(p_copy::text)>30000 then raise exception 'invalid_input'; end if;
 insert into ce_revisions(template_id,revision,copy,created_by) values(p_id,current_version+1,p_copy,p_actor);
 update ce_templates set revision=current_version+1,updated_at=now() where id=p_id;
 return current_version+1;
end $$;
create function public.ce_enqueue(p_event_id text,p_template_id text,p_user_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare t ce_templates; result uuid;
begin
 select * into t from ce_templates where id=p_template_id;
 if not found or t.sensitive or t.category<>'transactional' then raise exception 'invalid_template'; end if;
 if jsonb_typeof(p_data)<>'object' or length(p_data::text)>50000 or length(p_event_id) not between 1 and 200 then raise exception 'invalid_input'; end if;
 if exists(select 1 from unnest(t.required_fields) k where not(p_data ? k) or jsonb_typeof(p_data->k)<>'string' or length(p_data->>k)=0) or exists(select 1 from jsonb_each(p_data) e where not(e.key=any(t.allowed_fields)) or jsonb_typeof(e.value)<>'string' or length(e.value::text)>12002) then raise exception 'invalid_input'; end if;
 insert into ce_outbox(event_id,template_id,template_revision,user_id,data) values(p_event_id,p_template_id,t.revision,p_user_id,p_data) on conflict(event_id,template_id,user_id) do nothing returning id into result;
 if result is null then select id into result from ce_outbox where event_id=p_event_id and template_id=p_template_id and user_id=p_user_id and data=p_data;if result is null then raise exception 'conflict';end if;end if;
 return result;
end $$;
create function public.ce_claim() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare job ce_outbox; body jsonb;
begin
 -- Beyond the provider's 24h idempotency window, ambiguity requires manual evidence.
 update ce_outbox set state='unknown',last_error='idempotency_window_expired',lease_token=null,lease_until=null where state in ('pending','sending') and first_attempt_at<now()-interval '23 hours';
 select o.* into job from ce_outbox o join ce_templates t on t.id=o.template_id where t.enabled and (o.state='pending' or o.state='sending' and o.lease_until<now()) and o.available_at<=now() and o.attempts<6 order by o.created_at for update of o skip locked limit 1;
 if not found then return null;end if;
 update ce_outbox set state='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now() where id=job.id returning * into job;
 select copy into body from ce_revisions where template_id=job.template_id and revision=job.template_revision;
 return to_jsonb(job)||jsonb_build_object('copy',body);
end $$;
create function public.ce_prepare(p_id uuid,p_lease uuid,p_recipient text,p_rendered jsonb,p_sender text,p_reply_to text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare job ce_outbox;
begin
 select * into job from ce_outbox where id=p_id and lease_token=p_lease and state='sending' for update;
 if not found or job.lease_until<now() then raise exception 'conflict';end if;
 if exists(select 1 from ce_suppressions where email=lower(p_recipient)) then update ce_outbox set state='suppressed',lease_token=null,lease_until=null,updated_at=now() where id=p_id;return false;end if;
 if job.rendered is null then
  if p_sender is null or jsonb_typeof(p_rendered)<>'object' or length(p_rendered::text)>250000 then raise exception 'invalid_input';end if;
  update ce_outbox set recipient=p_recipient,rendered=p_rendered,sender=p_sender,reply_to=p_reply_to where id=p_id;
 end if;
 return true;
end $$;
create function public.ce_finish(p_id uuid,p_lease uuid,p_provider text,p_error text,p_retry boolean,p_delay integer default 0) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare job ce_outbox;
begin
 select * into job from ce_outbox where id=p_id and lease_token=p_lease and state='sending' for update;if not found then raise exception 'conflict';end if;
 update ce_outbox set state=case when p_provider is not null then 'accepted' when p_retry and attempts<6 and first_attempt_at>now()-interval '23 hours' then 'pending' when p_error in ('network','response','unknown') then 'unknown' else 'failed' end,provider_id=p_provider,last_error=p_error,available_at=now()+make_interval(secs=>greatest(30*attempts,least(greatest(p_delay,0),3600))),lease_token=null,lease_until=null,updated_at=now() where id=p_id;
end $$;
create function public.ce_start_generation(p_id uuid,p_actor uuid,p_template text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,492));
 if exists(select 1 from ce_generations where id=p_id) then return false;end if;
 if (select count(*) from ce_generations where created_by=p_actor and created_at>now()-interval '1 hour')>=20 then raise exception 'rate_limited';end if;
 insert into ce_generations values(p_id,p_actor,p_template,'running',null,null,now());return true;
end $$;
revoke all on function public.ce_save(text,integer,jsonb,uuid),public.ce_enqueue(text,text,uuid,jsonb),public.ce_claim(),public.ce_prepare(uuid,uuid,text,jsonb,text,text),public.ce_finish(uuid,uuid,text,text,boolean,integer),public.ce_start_generation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ce_save(text,integer,jsonb,uuid),public.ce_enqueue(text,text,uuid,jsonb),public.ce_claim(),public.ce_prepare(uuid,uuid,text,jsonb,text,text),public.ce_finish(uuid,uuid,text,text,boolean,integer),public.ce_start_generation(uuid,uuid,text) to service_role;

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('login_pin',true,'authentication',ARRAY['pin','expiresInMinutes']::text[],ARRAY['pin','expiresInMinutes']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('login_pin',1,'{"subject": "Your {{firm.shortName}} login code", "title": "Your login code", "body": "Use this code to finish signing in to your {{firm.name}} account.\n\n{{pin}}\n\nThis code expires in {{expiresInMinutes}} minutes. If you did not request it, you can ignore this email.", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "", "ctaUrl": "", "cta2Label": "", "cta2Url": "", "footer": "Never share this code. Certa staff will never ask for it.", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('signup_pin',true,'authentication',ARRAY['pin','expiresInMinutes']::text[],ARRAY['pin','expiresInMinutes']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('signup_pin',1,'{"subject": "Verify your {{firm.shortName}} email", "title": "Verify your email", "body": "Use this code to confirm you own this email before we create your {{firm.name}} account.\n\n{{pin}}\n\nThis code expires in {{expiresInMinutes}} minutes. If you did not request it, you can ignore this email.", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "", "ctaUrl": "", "cta2Label": "", "cta2Url": "", "footer": "Never share this code. Certa staff will never ask for it.", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('password_reset',true,'authentication',ARRAY['resetUrl']::text[],ARRAY['resetUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('password_reset',1,'{"subject": "Reset your {{firm.shortName}} password", "title": "Reset your password", "body": "We received a request to reset the password for your {{firm.name}} portal login.\n\nClick the button below to choose a new password. This link expires soon and can only be used once.", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Choose a new password", "ctaUrl": "{{resetUrl}}", "cta2Label": "", "cta2Url": "", "footer": "If you didn’t ask for this, you can ignore this email — your password will stay the same.", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('account_invite',true,'authentication',ARRAY['setupUrl']::text[],ARRAY['setupUrl','loginUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('account_invite',1,'{"subject": "You’re invited to {{firm.shortName}}", "title": "Your Certa portal is ready", "body": "You’ve been invited to {{firm.name}} — portal access so you can join Affiliates. This is not a trading account and nothing is billed.\n\nChoose a password and you’re in. KYC, your tax form, and a payout method are only needed before commissions are paid out.", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Set up your account", "ctaUrl": "{{setupUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Questions? Reply to this email.", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('checkout_receipt',false,'transactional',ARRAY['receipt.orderReference','receipt.total','receipt.lines','receipt.paidAt','loginUrl','siteUrl']::text[],ARRAY['receipt.total','receipt.lines','receipt.orderReference','receipt.paidAt','receipt.contentSha256','receipt.supportEmail','receipt.agreementSummary','siteUrl','loginUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('checkout_receipt',1,'{"subject": "Thanks for purchasing — {{firm.shortName}}", "title": "Payment received", "body": "Thanks for purchasing {{firm.shortName}}.\n\nWe received {{receipt.total}} for your evaluation. Sign in with the email and password you used at checkout.\n\nYour order\n{{receipt.lines}}\n\nOrder reference: {{receipt.orderReference}}\nPaid: {{receipt.paidAt}}\n\nKeep this email as your record of purchase. Terms, privacy, billing, and refund policies are at {{siteUrl}}/legal.", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Log in", "ctaUrl": "{{loginUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Questions? Reply to this email.", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('checkout_crypto_started',false,'transactional',ARRAY['ctaUrl','receipt.orderReference']::text[],ARRAY['receipt.total','receipt.orderReference','ctaUrl','siteUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('checkout_crypto_started',1,'{"subject": "Crypto checkout started — {{firm.shortName}}", "title": "Finish your crypto payment", "body": "We opened a crypto invoice for {{receipt.total}}.\n\nFinish payment in the checkout window. If you send a partial amount, open a support ticket — don’t start a second checkout.\n\nOrder {{receipt.orderReference}}", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Return to checkout", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "If you didn’t start this, you can ignore the email.", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('checkout_crypto_partial',false,'transactional',ARRAY['ctaUrl','receipt.orderReference']::text[],ARRAY['receipt.total','receipt.orderReference','statusLabel','statusDetail','ctaUrl','siteUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('checkout_crypto_partial',1,'{"subject": "Action needed: crypto payment underfunded — {{firm.shortName}}", "title": "Please open a support ticket", "body": "We received part of your crypto payment for the {{receipt.total}} invoice, but NOWPayments marked it underfunded.\n\nPlease open a support ticket so our team can review the transaction. Include order {{receipt.orderReference}} and your transaction hash. Do not send another payment or start a second checkout until support replies.", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Open support ticket", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Our team will review the payment and tell you the next step.", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('checkout_crypto_processing',false,'transactional',ARRAY['ctaUrl','supportUrl','receipt.orderReference']::text[],ARRAY['receipt.total','receipt.orderReference','statusLabel','statusDetail','ctaUrl','supportUrl','siteUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('checkout_crypto_processing',1,'{"subject": "We received your crypto payment — {{firm.shortName}}", "title": "Payment received — confirming", "body": "We received your crypto payment for {{receipt.total}}.\n\nThe network is still confirming it. We’ll email you again when your evaluation is ready — don’t send a second payment.\n\nOrder {{receipt.orderReference}}", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "See payment status", "ctaUrl": "{{ctaUrl}}", "cta2Label": "Open support ticket", "cta2Url": "{{supportUrl}}", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('checkout_crypto_failed',false,'transactional',ARRAY['ctaUrl','receipt.orderReference']::text[],ARRAY['receipt.total','receipt.orderReference','statusLabel','statusDetail','ctaUrl','siteUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('checkout_crypto_failed',1,'{"subject": "Crypto payment did not complete — {{firm.shortName}}", "title": "Payment did not finish", "body": "We could not complete the crypto payment for {{receipt.total}}.\n\n{{statusDetail}}\n\nOrder {{receipt.orderReference}}\nNo evaluation was created. If you already sent funds, reply to this email. If you didn’t, you can check out again.", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Check out again", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Include the order reference if you contact support.", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('ticket_claim_account',false,'transactional',ARRAY['ctaUrl']::text[],ARRAY['ticket.name','ticket.seat','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('ticket_claim_account',1,'{"subject": "Your {{ticket.name}} — seat #{{ticket.seat}}", "title": "Your ticket is ready", "body": "Seat #{{ticket.seat}} — a {{ticket.name}} — is already on your Certa account.\n\nSign in and scratch it in the dashboard.", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Open your ticket", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('ticket_claim_guest',true,'transactional',ARRAY['ctaUrl']::text[],ARRAY['ticket.name','ticket.seat','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('ticket_claim_guest',1,'{"subject": "Your {{ticket.name}} — seat #{{ticket.seat}}", "title": "Your ticket is ready", "body": "Seat #{{ticket.seat}} is yours — a {{ticket.name}}.\n\nIt''s tied to this email. Create a free Certa account with it (or sign in) and the ticket lands on your dashboard, ready to scratch.", "eyebrow": "", "greeting": "", "ctaLabel": "Claim your ticket", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('friend_invite_received',false,'marketing',ARRAY['ctaUrl']::text[],ARRAY['invite.from','invite.percent','ticket.code','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('friend_invite_received',1,'{"subject": "{{invite.from}} invited you to {{firm.name}} — {{invite.percent}}% off is waiting", "title": "Your buddy invited you to Certa", "body": "{{invite.from}} invited you to {{firm.name}}, and we''ve already put a {{invite.percent}}% off coupon on this email.\n\nIt''s a scratch ticket — code {{ticket.code}}. Create a free account with this email, scratch it, and the discount applies to your first evaluation at checkout.\n\nFirst evaluation only. One per person.", "eyebrow": "", "greeting": "", "ctaLabel": "Claim your {{invite.percent}}% off", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('friend_invite_rewarded',false,'marketing',ARRAY['ctaUrl']::text[],ARRAY['invite.friend','invite.percent','ticket.code','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('friend_invite_rewarded',1,'{"subject": "You got {{invite.percent}}% off — thanks for referring a friend", "title": "Your referral paid off", "body": "{{invite.friend}} just bought their first Certa evaluation with your invite.\n\nAs a thank-you, a {{invite.percent}}% off ticket ({{ticket.code}}) is on your account. Scratch it in your dashboard and use it on your next evaluation.", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Open your ticket", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('evaluation_failed',false,'transactional',ARRAY['ctaUrl','accountId']::text[],ARRAY['accountId','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('evaluation_failed',1,'{"subject": "Your evaluation ended — {{firm.shortName}}", "title": "This evaluation didn’t pass", "body": "Your evaluation is over. This was a fail against the published loss rules, not a rules breach.\n\nWe issued a Fail Ticket on your account. Scratch it for a coupon off your next evaluation. If you start checkout and back out, that ticket stays yours until you use it.\n\nAccount: {{accountId}}", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Open your Fail Ticket", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('sim_funded_onboarding_ready',false,'transactional',ARRAY['ctaUrl']::text[],ARRAY['accountId','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('sim_funded_onboarding_ready',1,'{"subject": "Your evaluation passed — finishing Sim Funded activation", "title": "Evaluation passed", "body": "Your evaluation account passed. Onboarding looks complete on our side — open your dashboard to finish Sim Funded activation.\n\nAccount: {{accountId}}", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Open your dashboard", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('sim_funded_onboarding_required',false,'transactional',ARRAY['ctaUrl']::text[],ARRAY['accountId','steps','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('sim_funded_onboarding_required',1,'{"subject": "Congrats, you passed — one step before you''re funded", "title": "Congrats on completing your evaluation", "body": "You passed. Your Certified Funded account is waiting on compliance before it can go live. Complete the steps below and we''ll switch it on:\n\n{{steps}}\n\nAccount: {{accountId}}", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Complete compliance", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('sim_funded_issued',false,'transactional',ARRAY['ctaUrl']::text[],ARRAY['accountId','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('sim_funded_issued',1,'{"subject": "Your Sim Funded account is ready", "title": "Account ready", "body": "Onboarding is complete and your Sim Funded account is live. Open your dashboard to start trading.\n\nAccount: {{accountId}}", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "Open your dashboard", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('waitlist_joined',false,'marketing',ARRAY['unsubscribeUrl']::text[],ARRAY['launchDate','homeUrl','discordUrl','fundedAgreementUrl','unsubscribeUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('waitlist_joined',1,'{"subject": "You’re on the Certa Futures waitlist", "title": "Thanks for joining us.", "body": "{{firm.name}} is one evaluation and one Certified Funded account — first payout up to $1K (Bronze), then up to $2K (Crown). You’ll be among the first to know when access opens.\n\nOne Day Pass presale: {{launchDate}}\n\nPass in as little as one trading day.\nOne simple simulated futures evaluation.\nOne Certified Funded account after validation.\n$500 minimum · $1K first max · $2K later max.\n\nHave feedback or thoughts? Reply to this email — we read every message.\n\nRead the Funded Account Agreement: {{fundedAgreementUrl}}", "eyebrow": "", "greeting": "", "ctaLabel": "Join the Certa Discord", "ctaUrl": "{{discordUrl}}", "cta2Label": "", "cta2Url": "", "footer": "You received this because this email joined the Certa Futures waitlist. If that wasn’t you, no action is needed.", "unsubscribeUrl": "{{unsubscribeUrl}}"}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('ops_payout_request',false,'internal',ARRAY['amount']::text[],ARRAY['amount','tradaraAccountId','methodLabel','methodDestination','cycleName']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('ops_payout_request',1,'{"subject": "Payout request · {{amount}}", "title": "New payout request", "body": "{{account.displayName}} requested {{amount}} from {{tradaraAccountId}}.\n\n{{methodLabel}} · {{methodDestination}} · {{cycleName}}", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "", "ctaUrl": "", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('payout_approved',false,'transactional',ARRAY['amount','estimate','ctaUrl']::text[],ARRAY['amount','methodLabel','estimate','kind','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('payout_approved',1,'{"subject": "Your {{amount}} payout was approved", "title": "Payout approved", "body": "Your {{amount}} payout was approved for {{methodLabel}}.\n\nArrival estimate: {{estimate}}.\n\nPending meant it was under review with our team. Approval does not confirm an external transfer. Check your dashboard for the recorded payment status.", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "View payouts", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('payout_rejected',false,'transactional',ARRAY['amount','rejectReason','ctaUrl']::text[],ARRAY['amount','methodLabel','rejectReason','kind','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('payout_rejected',1,'{"subject": "Update on your {{amount}} payout", "title": "This payout was not approved", "body": "We reviewed your {{amount}} {{methodLabel}} payout and could not approve it.\n\n{{rejectReason}}\n\nYou can submit a new request from your dashboard once the issue is resolved.", "eyebrow": "", "greeting": "{{account.greeting}}", "ctaLabel": "View payouts", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('ops_stripe_dispute',false,'internal',ARRAY['disputeId']::text[],ARRAY['disputeId','reason','amount','customerEmail','evidenceDueBy','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('ops_stripe_dispute',1,'{"subject": "Action required: ZEN chargeback {{disputeId}}", "title": "Review required", "body": "Dispute: {{disputeId}}\nReason: {{reason}}\nAmount: {{amount}}\nCustomer: {{customerEmail}}\nEvidence due: {{evidenceDueBy}}", "eyebrow": "", "greeting": "", "ctaLabel": "Open myZEN", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Read the cardholder claim first. Accept valid disputes; submit only concise, truthful, relevant evidence.", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('ops_fraud_warning',false,'internal',ARRAY['warningId']::text[],ARRAY['warningId','fraudType','actionable','ctaUrl']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('ops_fraud_warning',1,'{"subject": "Review payment fraud warning {{warningId}}", "title": "Review required", "body": "Warning: {{warningId}}\nFraud type: {{fraudType}}\nActionable: {{actionable}}", "eyebrow": "", "greeting": "", "ctaLabel": "Open processor dashboard", "ctaUrl": "{{ctaUrl}}", "cta2Label": "", "cta2Url": "", "footer": "Review payment authority and related access without presuming customer wrongdoing.", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('ops_refund_review',false,'internal',ARRAY['checkoutId']::text[],ARRAY['title','checkoutId','chargeId','refunded','tradaraAccountId']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('ops_refund_review',1,'{"subject": "{{title}}", "title": "{{title}}", "body": "Checkout: {{checkoutId}}\nCharge: {{chargeId}}\nRefunded: {{refunded}}\nTradara account: {{tradaraAccountId}}", "eyebrow": "", "greeting": "", "ctaLabel": "", "ctaUrl": "", "cta2Label": "", "cta2Url": "", "footer": "Review related access and payout eligibility. Do not remove unrelated customer rights.", "unsubscribeUrl": ""}'::jsonb);

insert into public.ce_templates(id,sensitive,category,required_fields,allowed_fields) values('ops_tradara_activation',false,'internal',ARRAY['checkoutId']::text[],ARRAY['checkoutId','customer','error']::text[]);
insert into public.ce_revisions(template_id,revision,copy) values('ops_tradara_activation',1,'{"subject": "Manual Tradara activation required: {{account.email}}", "title": "Manual Tradara activation required", "body": "Checkout: {{checkoutId}}\nCustomer: {{customer}}\nTradara error: {{error}}\n\nPayment is confirmed and the Certa login exists. Manually create or activate the Tradara evaluation, then update the checkout record.", "eyebrow": "", "greeting": "", "ctaLabel": "", "ctaUrl": "", "cta2Label": "", "cta2Url": "", "footer": "Certa Futures · certafutures.com", "unsubscribeUrl": ""}'::jsonb);

create function public.ce_catalog() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('copy',r.copy)),'[]'::jsonb) from ce_templates t join ce_revisions r on r.template_id=t.id and r.revision=t.revision
$$;
revoke all on function public.ce_catalog() from public,anon,authenticated;
grant execute on function public.ce_catalog() to service_role;

create function public.ce_ticket_claimed() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.claimed_at is null and new.claimed_at is not null then
  perform ce_enqueue('ticket-claimed/'||new.id::text,'ticket_claim_account',new.user_id,jsonb_build_object('ticket.name',new.title,'ticket.seat',new.position::text,'ctaUrl','https://certafutures.com/tickets'));
 end if;
 return new;
end $$;
revoke all on function public.ce_ticket_claimed() from public,anon,authenticated;
create trigger ce_ticket_claimed after update of claimed_at on public.tk_tickets for each row execute function public.ce_ticket_claimed();
