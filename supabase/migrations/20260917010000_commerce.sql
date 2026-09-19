-- Authenticated durable checkout. Never apply until the existing Supabase baseline is reconciled.
create table public.cm_products (
 id text primary key references public.ct_plans(id), label text not null check(length(label) between 1 and 100),
 price_cents integer not null check(price_cents between 50 and 10000000), enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
create table public.cm_processors (
 id text primary key check(id in ('authnet','nmi','crypto')), enabled boolean not null default false,
 routing_version integer not null check(routing_version>0), updated_at timestamptz not null default now()
);
insert into public.cm_processors(id,routing_version) values('authnet',1),('nmi',1),('crypto',1);
create table public.cm_checkouts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 state text not null default 'open' check(state in ('open','pending','paid','cancelled')),
 current_revision uuid, slot_order uuid references public.ct_slot_orders(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index cm_one_active_user on public.cm_checkouts(user_id) where state in ('open','pending');
create index cm_checkout_history on public.cm_checkouts(user_id,created_at desc,id);
create table public.cm_revisions (
 id uuid primary key default gen_random_uuid(), checkout_id uuid not null references public.cm_checkouts(id),
 product_id text not null references public.cm_products(id), product_label text not null, quantity integer not null check(quantity between 1 and 3),
 subtotal_cents integer not null check(subtotal_cents>=0), total_cents integer not null check(total_cents>=0 and total_cents<=subtotal_cents), currency text not null default 'USD' check(currency='USD'),
 ticket_id uuid, affiliate_code text, coupon_code text, evidence jsonb not null, created_at timestamptz not null default now()
);
alter table public.cm_checkouts add foreign key(current_revision) references public.cm_revisions(id);
create table public.cm_attempts (
 id uuid primary key default gen_random_uuid(), checkout_id uuid not null references public.cm_checkouts(id), revision_id uuid not null references public.cm_revisions(id),
 processor text not null references public.cm_processors(id), routing_version integer not null, invoice text not null unique default substr(replace(gen_random_uuid()::text,'-',''),1,20),
 state text not null default 'prepared' check(state in ('prepared','submitted','unknown','declined','paid','superseded')),
 provider_reference text, payment_url text, submitted_at timestamptz, resolved_at timestamptz, created_at timestamptz not null default now(), next_check_at timestamptz not null default now(), checks integer not null default 0
);
create unique index cm_attempt_provider on public.cm_attempts(processor,provider_reference) where provider_reference is not null;
create index cm_attempt_queue on public.cm_attempts(next_check_at) where state in ('submitted','unknown');
create table public.cm_events (id bigint generated always as identity primary key, checkout_id uuid references public.cm_checkouts(id), actor_id uuid references auth.users(id), action text not null, data jsonb not null default '{}', created_at timestamptz not null default now());
create table public.cm_callbacks (id uuid primary key default gen_random_uuid(),processor text not null references public.cm_processors(id),event_key text not null,provider_reference text not null,invoice text, state text not null default 'pending' check(state in ('pending','done','review')), next_check_at timestamptz not null default now(), checks integer not null default 0,created_at timestamptz not null default now(),unique(processor,event_key));

create table public.cm_coupons (
 code text primary key check(code=upper(code) and length(code) between 3 and 60), kind text not null check(kind in ('percent','amount')), value integer not null check(value>0),
 enabled boolean not null default true, total_limit integer check(total_limit>0), per_user_limit integer not null default 1 check(per_user_limit>0),
 starts_at timestamptz, ends_at timestamptz, email text, check(kind<>'percent' or value<=100)
);
create table public.cm_coupon_holds (
 checkout_id uuid primary key references public.cm_checkouts(id), code text not null references public.cm_coupons(code), user_id uuid not null references auth.users(id), email text not null,
 state text not null check(state in ('reserved','submitted','used','released')), discount_cents integer not null
);
create index cm_coupon_usage on public.cm_coupon_holds(code,state,user_id);
create function public.cm_email(p_email text) returns text language sql immutable set search_path='' as $$
 select case when split_part(lower(trim(p_email)),'@',2) in ('gmail.com','googlemail.com') then replace(split_part(split_part(lower(trim(p_email)),'@',1),'+',1),'.','')||'@gmail.com'
 else split_part(split_part(lower(trim(p_email)),'@',1),'+',1)||'@'||split_part(lower(trim(p_email)),'@',2) end
$$;
create function public.cm_coupon(p_user uuid,p_checkout uuid,p_code text,p_action text,p_subtotal integer default 0,p_email text default '') returns integer language plpgsql security definer set search_path='' as $$
declare c public.cm_coupons; h public.cm_coupon_holds; discount integer; begin
 p_email:=public.cm_email(p_email);
 select * into c from public.cm_coupons where code=p_code for update;
 if not found then raise exception 'coupon_unavailable'; end if;
 select * into h from public.cm_coupon_holds where checkout_id=p_checkout for update;
 if p_action='reserve' then
 if not c.enabled or c.starts_at>now() or c.ends_at<=now() or (c.email is not null and public.cm_email(c.email)<>p_email) then raise exception 'coupon_unavailable'; end if;
 if h.state='used' or h.state='submitted' then raise exception 'payment_pending'; end if;
 if c.total_limit is not null and (select count(*) from public.cm_coupon_holds where code=c.code and state<>'released' and checkout_id<>p_checkout)>=c.total_limit then raise exception 'coupon_limit'; end if;
 if (select count(*) from public.cm_coupon_holds where code=c.code and state<>'released' and (user_id=p_user or email=p_email) and checkout_id<>p_checkout)>=c.per_user_limit then raise exception 'coupon_limit'; end if;
 discount:=least(p_subtotal,case c.kind when 'percent' then floor(p_subtotal*c.value/100.0)::integer else c.value end);
 if p_subtotal-discount between 1 and 49 then discount:=greatest(0,p_subtotal-50); end if;
 insert into public.cm_coupon_holds values(p_checkout,c.code,p_user,p_email,'reserved',discount) on conflict(checkout_id) do update set code=excluded.code,user_id=excluded.user_id,email=excluded.email,state='reserved',discount_cents=excluded.discount_cents;
 return discount;
 end if;
 if h.code<>p_code or h.user_id<>p_user then raise exception 'coupon_unavailable'; end if;
 if p_action='submit' and h.state='reserved' then update public.cm_coupon_holds set state='submitted' where checkout_id=p_checkout;
 elsif p_action='settle' and h.state in ('submitted','used') then update public.cm_coupon_holds set state='used' where checkout_id=p_checkout;
 elsif p_action='decline' and h.state='submitted' or p_action='release' and h.state in ('reserved','released') then update public.cm_coupon_holds set state='released' where checkout_id=p_checkout;
 else raise exception 'payment_pending'; end if;
 return h.discount_cents;
end $$;

create function public.cm_immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'immutable_history'; end $$;
create trigger cm_revision_immutable before update or delete on public.cm_revisions for each row execute function public.cm_immutable();
create trigger cm_event_immutable before update or delete on public.cm_events for each row execute function public.cm_immutable();

create function public.cm_save(p_user uuid,p_product text,p_quantity integer,p_ticket uuid default null,p_affiliate text default null,p_coupon text default null,p_evidence jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cm_checkouts; r public.cm_revisions; p public.cm_products; discount jsonb; amount integer; begin
 if p_ticket is not null and p_coupon is not null then raise exception 'discounts_do_not_stack'; end if;
 if coalesce(p_evidence->>'terms_version','')='' or p_evidence->>'accepted'<>'true' or coalesce(length(p_evidence->>'name'),0)<2 or coalesce(length(p_evidence->>'country'),0)<>2 then raise exception 'purchase_evidence_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_user::text,0));
 select * into c from public.cm_checkouts where user_id=p_user and state in ('open','pending') for update;
 if c.state='pending' then raise exception 'payment_pending'; end if;
 select * into p from public.cm_products where id=p_product and enabled;
 if not found or p_quantity not between 1 and 3 or not exists(select 1 from public.ct_plans where id=p_product and enabled and pass_only_verified) then raise exception 'product_unavailable'; end if;
 if c.id is null then insert into public.cm_checkouts(user_id) values(p_user) returning * into c; end if;
 select * into r from public.cm_revisions where id=c.current_revision;
 if r.id is not null and r.product_id=p_product and r.quantity=p_quantity and r.ticket_id is not distinct from p_ticket and r.affiliate_code is not distinct from nullif(upper(p_affiliate),'') and r.coupon_code is not distinct from p_coupon and r.evidence=p_evidence and r.subtotal_cents=p.price_cents*p_quantity then return to_jsonb(c); end if;
 if c.slot_order is not null then
 perform public.ct_settle_order(p_user,c.slot_order,'cancelled','revision:'||c.id,'Unsubmitted checkout revision replaced');
 end if;
 if r.coupon_code is not null then perform public.cm_coupon(p_user,c.id,r.coupon_code,'release'); end if;
 if r.ticket_id is not null then execute 'select public.tk_checkout($1,$2,$3,$4,$5)' using p_user,r.ticket_id,c.id,'release',0; end if;
 amount:=p.price_cents*p_quantity;
 if p_ticket is not null then execute 'select public.tk_checkout($1,$2,$3,$4,$5)' into discount using p_user,p_ticket,c.id,'reserve',amount; amount:=amount-(discount->>'discount_cents')::integer; end if;
 if p_coupon is not null then amount:=amount-public.cm_coupon(p_user,c.id,p_coupon,'reserve',amount,p_evidence->>'email'); end if;
 if amount between 1 and 49 then amount:=least(p.price_cents*p_quantity,50); end if;
 insert into public.cm_revisions(checkout_id,product_id,product_label,quantity,subtotal_cents,total_cents,ticket_id,affiliate_code,coupon_code,evidence)
 values(c.id,p.id,p.label,p_quantity,p.price_cents*p_quantity,amount,p_ticket,nullif(upper(p_affiliate),''),p_coupon,p_evidence) returning * into r;
 update public.cm_attempts set state='superseded' where checkout_id=c.id and state='prepared';
 update public.cm_checkouts set current_revision=r.id,slot_order=null,updated_at=now() where id=c.id returning * into c;
 insert into public.cm_events(checkout_id,actor_id,action,data) values(c.id,p_user,'revision',jsonb_build_object('revision',r.id));
 return to_jsonb(c);
end $$;

create function public.cm_prepare(p_user uuid,p_checkout uuid,p_revision uuid,p_processor text,p_routing integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cm_checkouts; r public.cm_revisions; a public.cm_attempts; o jsonb; begin
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_user::text,0));
 select * into c from public.cm_checkouts where id=p_checkout and user_id=p_user for update;
 if c.id is null then raise exception 'not_found'; end if;
 if c.current_revision<>p_revision or c.state<>'open' then raise exception 'payment_pending'; end if;
 select * into r from public.cm_revisions where id=p_revision;
 if p_processor='crypto' and r.total_cents between 1 and 999 then raise exception 'crypto_minimum'; end if;
 if r.total_cents>0 and not exists(select 1 from public.cm_processors where id=p_processor and enabled and routing_version=p_routing) then raise exception 'processor_unavailable'; end if;
 if not exists(select 1 from public.cm_products where id=r.product_id and enabled and price_cents*r.quantity=r.subtotal_cents) then raise exception 'quote_changed'; end if;
 select * into a from public.cm_attempts where checkout_id=c.id and state='prepared' order by created_at desc limit 1;
 if a.id is not null and a.processor=p_processor and a.routing_version=p_routing then return to_jsonb(a); end if;
 update public.cm_attempts set state='superseded' where checkout_id=c.id and state='prepared';
 if c.slot_order is null then
 o:=public.ct_reserve(p_user,'checkout:'||r.id,r.product_id,r.quantity);
 update public.cm_checkouts set slot_order=(o->>'id')::uuid where id=c.id;
 end if;
 insert into public.cm_attempts(checkout_id,revision_id,processor,routing_version) values(c.id,r.id,p_processor,p_routing) returning * into a;
 return to_jsonb(a);
end $$;

create function public.cm_claim(p_user uuid,p_attempt uuid,p_routing integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cm_checkouts; a public.cm_attempts; r public.cm_revisions; discount jsonb; begin
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_user::text,0));
 select c0.* into c from public.cm_checkouts c0 join public.cm_attempts a0 on a0.checkout_id=c0.id where a0.id=p_attempt and c0.user_id=p_user for update of c0;
 select * into a from public.cm_attempts where id=p_attempt for update;
 if c.id is null then raise exception 'not_found'; end if;
 if c.state<>'open' or a.state<>'prepared' or c.current_revision<>a.revision_id then raise exception 'payment_pending'; end if;
 select * into r from public.cm_revisions where id=a.revision_id;
 if r.total_cents>0 and (a.routing_version<>p_routing or not exists(select 1 from public.cm_processors where id=a.processor and enabled and routing_version=a.routing_version)) then raise exception 'processor_unavailable'; end if;
 if not exists(select 1 from public.cm_products where id=r.product_id and enabled and price_cents*r.quantity=r.subtotal_cents) then raise exception 'quote_changed'; end if;
 if r.ticket_id is not null then
 execute 'select public.tk_checkout($1,$2,$3,$4,$5)' into discount using p_user,r.ticket_id,c.id,'reserve',r.subtotal_cents;
 if (case when r.subtotal_cents-(discount->>'discount_cents')::integer between 1 and 49 then least(r.subtotal_cents,50) else r.subtotal_cents-(discount->>'discount_cents')::integer end)<>r.total_cents then raise exception 'quote_changed'; end if;
 execute 'select public.tk_checkout($1,$2,$3,$4,$5)' using p_user,r.ticket_id,c.id,'submit',0;
 end if;
 if r.coupon_code is not null then
 if r.subtotal_cents-public.cm_coupon(p_user,c.id,r.coupon_code,'reserve',r.subtotal_cents,r.evidence->>'email')<>r.total_cents then raise exception 'quote_changed'; end if;
 perform public.cm_coupon(p_user,c.id,r.coupon_code,'submit'); end if;
 if r.affiliate_code is not null and r.total_cents>0 then perform public.cp_attribute_order(c.slot_order,c.user_id,r.affiliate_code,r.total_cents); end if;
 update public.cm_attempts set state='submitted',submitted_at=now(),next_check_at=now()+interval '2 minutes' where id=a.id returning * into a;
 update public.cm_checkouts set state='pending',updated_at=now() where id=c.id;
 insert into public.cm_events(checkout_id,actor_id,action,data) values(c.id,p_user,'submitted',jsonb_build_object('attempt',a.id));
 return jsonb_build_object('attempt',to_jsonb(a),'revision',to_jsonb(r),'user_id',p_user);
end $$;

-- Only verified provider adapter results enter this transaction. No customer can call it.
create function public.cm_result(p_attempt uuid,p_state text,p_reference text,p_amount integer,p_currency text,p_invoice text,p_url text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cm_checkouts; a public.cm_attempts; r public.cm_revisions; begin
 select c0.* into c from public.cm_checkouts c0 join public.cm_attempts a0 on a0.checkout_id=c0.id where a0.id=p_attempt;
 if c.id is null then raise exception 'not_found'; end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||c.user_id::text,0));
 select * into c from public.cm_checkouts where id=c.id for update;
 select * into a from public.cm_attempts where id=p_attempt for update;
 select * into r from public.cm_revisions where id=a.revision_id;
 if p_state not in ('paid','declined','unknown') or p_amount is distinct from r.total_cents or p_currency is distinct from r.currency or p_invoice is distinct from a.invoice then raise exception 'provider_mismatch'; end if;
 if a.state='paid' and p_state='paid' and a.provider_reference=p_reference then return to_jsonb(c); end if;
 if a.state='declined' and p_state='declined' then return to_jsonb(c); end if;
 if a.state not in ('submitted','unknown') or c.current_revision<>a.revision_id then raise exception 'reconciliation_required'; end if;
 if p_state in ('paid','declined') and coalesce(length(p_reference),0)=0 then raise exception 'provider_mismatch'; end if;
 if a.provider_reference is not null and p_reference is not null and a.provider_reference<>p_reference then raise exception 'provider_mismatch'; end if;
 if p_state='paid' then
 if r.coupon_code is not null then perform public.cm_coupon(c.user_id,c.id,r.coupon_code,'settle'); end if;
 if r.affiliate_code is not null and r.total_cents>0 then perform public.cp_attribute_order(c.slot_order,c.user_id,r.affiliate_code,r.total_cents); end if;
 if r.ticket_id is not null then execute 'select public.tk_checkout($1,$2,$3,$4,$5)' using c.user_id,r.ticket_id,c.id,'settle',0; end if;
 perform public.ct_settle_order(c.user_id,c.slot_order,'paid',a.processor||':'||p_reference,'Verified checkout payment');
 -- Durable receipt insertion participates in settlement; missing email migration fails closed.
 execute 'select public.ce_enqueue($1,$2,$3,$4)' using 'checkout:'||c.id||':paid','checkout_receipt',c.user_id,jsonb_build_object('receipt.total',to_char(r.total_cents/100.0,'FM999999990.00')||' USD','receipt.lines',r.quantity||' × '||r.product_label,'receipt.orderReference',c.id::text,'receipt.paidAt',now()::text,'siteUrl','https://certafutures.com','loginUrl','https://certafutures.com/login');
 elsif p_state='declined' then
 if r.coupon_code is not null then perform public.cm_coupon(c.user_id,c.id,r.coupon_code,'decline'); end if;
 if r.ticket_id is not null then execute 'select public.tk_checkout($1,$2,$3,$4,$5)' using c.user_id,r.ticket_id,c.id,'decline',0; end if;
 end if;
 update public.cm_attempts set state=p_state,provider_reference=coalesce(p_reference,provider_reference),payment_url=coalesce(p_url,payment_url),resolved_at=case when p_state<>'unknown' then now() end,next_check_at=now()+interval '5 minutes' where id=a.id;
 update public.cm_checkouts set state=case p_state when 'paid' then 'paid' when 'declined' then 'open' else 'pending' end,updated_at=now() where id=c.id returning * into c;
 insert into public.cm_events(checkout_id,actor_id,action,data) values(c.id,c.user_id,p_state,jsonb_build_object('attempt',a.id));
 return to_jsonb(c);
end $$;

create function public.cm_cancel(p_user uuid,p_checkout uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.cm_checkouts; r public.cm_revisions; begin
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_user::text,0));
 select * into c from public.cm_checkouts where id=p_checkout and user_id=p_user for update;
 if c.id is null then raise exception 'not_found'; end if;
 if c.state<>'open' then raise exception 'payment_pending'; end if;
 select * into r from public.cm_revisions where id=c.current_revision;
 if r.ticket_id is not null then execute 'select public.tk_checkout($1,$2,$3,$4,$5)' using p_user,r.ticket_id,c.id,'release',0; end if;
 if r.coupon_code is not null then perform public.cm_coupon(p_user,c.id,r.coupon_code,'release'); end if;
 if c.slot_order is not null then perform public.ct_settle_order(p_user,c.slot_order,'cancelled','cancel:'||c.id,'Unsubmitted checkout cancelled'); end if;
 update public.cm_attempts set state='superseded' where checkout_id=c.id and state='prepared';
 update public.cm_checkouts set state='cancelled',updated_at=now() where id=c.id;
 insert into public.cm_events(checkout_id,actor_id,action) values(c.id,p_user,'cancelled');
end $$;

create function public.cm_configure(p_actor uuid,p_kind text,p_id text,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if length(trim(p_data->>'reason'))<3 then raise exception 'reason_required'; end if;
 if p_kind='product' then
 insert into public.cm_products(id,label,price_cents,enabled) values(p_id,p_data->>'label',(p_data->>'price_cents')::integer,(p_data->>'enabled')::boolean)
 on conflict(id) do update set label=excluded.label,price_cents=excluded.price_cents,enabled=excluded.enabled,updated_at=now();
 elsif p_kind='coupon' then
 insert into public.cm_coupons(code,kind,value,enabled,total_limit,per_user_limit,starts_at,ends_at,email) values(upper(p_id),p_data->>'kind',(p_data->>'value')::integer,(p_data->>'enabled')::boolean,(p_data->>'total_limit')::integer,(p_data->>'per_user_limit')::integer,(p_data->>'starts_at')::timestamptz,(p_data->>'ends_at')::timestamptz,case when p_data->>'email' is null then null else public.cm_email(p_data->>'email') end);
 elsif p_kind='coupon-status' then
 update public.cm_coupons set enabled=(p_data->>'enabled')::boolean where code=upper(p_id);
 if not found then raise exception 'not_found'; end if;
 elsif p_kind='processor' then
 update public.cm_processors set enabled=(p_data->>'enabled')::boolean,routing_version=(p_data->>'routing_version')::integer,updated_at=now() where id=p_id and (p_data->>'routing_version')::integer>=routing_version;
 if not found then raise exception 'routing_version_conflict'; end if;
 else raise exception 'conflict'; end if;
 insert into public.cm_events(actor_id,action,data) values(p_actor,'configure-'||p_kind,jsonb_build_object('id',p_id,'config',p_data));
end $$;

do $$ declare t text; f record; begin
 foreach t in array array['products','processors','checkouts','revisions','attempts','events','callbacks','coupons','coupon_holds'] loop
 execute format('alter table public.cm_%I enable row level security',t);
 execute format('revoke all on public.cm_%I from public, anon, authenticated',t);
 execute format('grant all on public.cm_%I to service_role',t);
 end loop;
 grant usage,select on sequence public.cm_events_id_seq to service_role;
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname like 'cm\_%' escape '\' loop
 execute format('revoke all on function %s from public, anon, authenticated',f.sig);
 execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
