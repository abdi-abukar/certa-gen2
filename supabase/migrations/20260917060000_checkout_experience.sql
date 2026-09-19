-- Checkout experience: creator preference, non-stacking quotes and immutable attribution.
-- Additive; run only after reconciling the existing migration baseline.
begin;
alter table public.cp_codes add column audience_discount_bps integer not null default 0 check(audience_discount_bps between 0 and 10000);
alter table public.cm_revisions add column discount_kind text check(discount_kind in ('creator','coupon','ticket'));
create table public.cm_creator_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 code_id uuid not null references public.cp_codes(id), updated_at timestamptz not null default now()
);
alter table public.cm_creator_preferences enable row level security;
revoke all on public.cm_creator_preferences from public,anon,authenticated;
grant all on public.cm_creator_preferences to service_role;

create function public.cm_creator(p_user uuid,p_code text default null,p_save boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cp_codes; available boolean; begin
 if p_save then
  perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_user::text,0));
  if nullif(trim(p_code),'') is null then delete from public.cm_creator_preferences where user_id=p_user;return null;end if;
  select * into c from public.cp_codes where code=upper(trim(p_code));
 else
  select c0.* into c from public.cp_codes c0 join public.cm_creator_preferences pref on pref.code_id=c0.id where pref.user_id=p_user;
 end if;
 if c.id is null then if p_save then raise exception 'invalid_affiliate';else return null;end if;end if;
 available:=c.state='approved' and c.user_id<>p_user and exists(select 1 from public.cp_affiliates where user_id=c.user_id and status='active');
 if p_save then
  if not available then raise exception 'invalid_affiliate';end if;
  insert into public.cm_creator_preferences(user_id,code_id) values(p_user,c.id) on conflict(user_id) do update set code_id=excluded.code_id,updated_at=now();
 end if;
 return jsonb_build_object('code',c.code,'discount_bps',c.audience_discount_bps,'available',available);
end $$;

create function public.cm_creator_configure(p_actor uuid,p_code text,p_bps integer,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if length(trim(p_reason))<3 then raise exception 'reason_required';end if;
 update public.cp_codes set audience_discount_bps=p_bps where code=upper(trim(p_code)) and state='approved';
 if not found then raise exception 'invalid_affiliate';end if;
 insert into public.cm_events(actor_id,action,data) values(p_actor,'creator-discount',jsonb_build_object('code',upper(trim(p_code)),'discount_bps',p_bps,'reason',p_reason));
end $$;

-- Read-only estimate. Reservation and eligibility checks still happen transactionally
-- in cm_save/cm_prepare/cm_claim; a preview never consumes a code or ticket.
create function public.cm_quote(p_user uuid,p_product text,p_quantity integer,p_ticket uuid default null,p_affiliate text default null,p_coupon text default null,p_email text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.cm_products; c public.cp_codes; coupon public.cm_coupons; ticket public.tk_tickets;
 subtotal integer; discount integer:=0; candidate integer:=0; kind text; active_checkout uuid; begin
 if p_ticket is not null and p_coupon is not null then raise exception 'discounts_do_not_stack';end if;
 select * into p from public.cm_products where id=p_product and enabled;
 if not found or p_quantity not between 1 and 3 or not exists(select 1 from public.ct_plans where id=p_product and enabled and pass_only_verified) then raise exception 'product_unavailable';end if;
 subtotal:=p.price_cents*p_quantity;
 p_affiliate:=nullif(upper(trim(p_affiliate)),'');p_coupon:=nullif(upper(trim(p_coupon)),'');
 select id into active_checkout from public.cm_checkouts where user_id=p_user and state in ('open','pending');
 if p_affiliate is not null then
  select * into c from public.cp_codes where code=p_affiliate and state='approved' and user_id<>p_user;
  if c.id is null or not exists(select 1 from public.cp_affiliates where user_id=c.user_id and status='active') then raise exception 'invalid_affiliate';end if;
  discount:=floor(subtotal::numeric*c.audience_discount_bps/10000.0)::integer;
  if discount>0 then kind:='creator';end if;
 end if;
 if p_coupon is not null then
  select * into coupon from public.cm_coupons where code=p_coupon and enabled and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now()) and (email is null or public.cm_email(email)=public.cm_email(p_email));
  if coupon.code is null then raise exception 'coupon_unavailable';end if;
  candidate:=least(subtotal,case coupon.kind when 'percent' then floor(subtotal::numeric*coupon.value/100.0)::integer else coupon.value end);
  if candidate>discount then discount:=candidate;kind:='coupon';end if;
 end if;
 if p_ticket is not null then
  select * into ticket from public.tk_tickets where id=p_ticket and user_id=p_user;
  if ticket.id is null or ticket.used_at is not null or ticket.revealed_at is null or ticket.prize->>'kind' not in ('percentage_off','amount_off') then raise exception 'ticket_unavailable';end if;
  if ticket.checkout_id is not null and ticket.checkout_id is distinct from active_checkout then raise exception 'ticket_held';end if;
  candidate:=least(subtotal,case ticket.prize->>'kind' when 'percentage_off' then floor(subtotal::numeric*(ticket.prize->>'value')::integer/100.0)::integer else (ticket.prize->>'value')::integer end);
  if candidate>discount then discount:=candidate;kind:='ticket';end if;
 end if;
 if subtotal-discount between 1 and 49 then discount:=subtotal-50;end if;
 return jsonb_build_object('product_id',p.id,'product_label',p.label,'quantity',p_quantity,'subtotal_cents',subtotal,'total_cents',subtotal-discount,'discount_kind',kind,'affiliate_code',p_affiliate,'coupon_code',case when kind='coupon' then p_coupon end,'ticket_id',case when kind='ticket' then p_ticket end,'currency','USD');
end $$;
create or replace function public.cm_coupon(p_user uuid,p_checkout uuid,p_code text,p_action text,p_subtotal integer default 0,p_email text default '') returns integer language plpgsql security definer set search_path='' as $$
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
 discount:=least(p_subtotal,case c.kind when 'percent' then floor(p_subtotal::numeric*c.value/100.0)::integer else c.value end);
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

create or replace function public.cm_save(p_user uuid,p_product text,p_quantity integer,p_ticket uuid default null,p_affiliate text default null,p_coupon text default null,p_evidence jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.cm_checkouts; r public.cm_revisions; p public.cm_products; discount jsonb; amount integer; q jsonb; begin
 if p_ticket is not null and p_coupon is not null then raise exception 'discounts_do_not_stack'; end if;
 if coalesce(p_evidence->>'terms_version','')='' or p_evidence->>'accepted'<>'true' or coalesce(length(p_evidence->>'name'),0)<2 or coalesce(length(p_evidence->>'country'),0)<>2 then raise exception 'purchase_evidence_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('checkout:'||p_user::text,0));
 select * into c from public.cm_checkouts where user_id=p_user and state in ('open','pending') for update;
 if c.state='pending' then raise exception 'payment_pending'; end if;
 select * into p from public.cm_products where id=p_product and enabled;
 if not found or p_quantity not between 1 and 3 or not exists(select 1 from public.ct_plans where id=p_product and enabled and pass_only_verified) then raise exception 'product_unavailable'; end if;
 q:=public.cm_quote(p_user,p_product,p_quantity,p_ticket,p_affiliate,p_coupon,p_evidence->>'email');
 p_ticket:=(q->>'ticket_id')::uuid;p_coupon:=q->>'coupon_code';p_affiliate:=q->>'affiliate_code';
 if c.id is null then insert into public.cm_checkouts(user_id) values(p_user) returning * into c; end if;
 select * into r from public.cm_revisions where id=c.current_revision;
 if r.id is not null and r.product_id=p_product and r.quantity=p_quantity and r.ticket_id is not distinct from p_ticket and r.affiliate_code is not distinct from nullif(upper(p_affiliate),'') and r.coupon_code is not distinct from p_coupon and r.evidence=p_evidence and r.subtotal_cents=p.price_cents*p_quantity and r.total_cents=(q->>'total_cents')::integer then return to_jsonb(c); end if;
 if c.slot_order is not null then
 perform public.ct_settle_order(p_user,c.slot_order,'cancelled','revision:'||c.id,'Unsubmitted checkout revision replaced');
 end if;
 if r.coupon_code is not null then perform public.cm_coupon(p_user,c.id,r.coupon_code,'release'); end if;
 if r.ticket_id is not null then execute 'select public.tk_checkout($1,$2,$3,$4,$5)' using p_user,r.ticket_id,c.id,'release',0; end if;
 amount:=p.price_cents*p_quantity;
 if p_ticket is not null then execute 'select public.tk_checkout($1,$2,$3,$4,$5)' into discount using p_user,p_ticket,c.id,'reserve',amount; amount:=amount-(discount->>'discount_cents')::integer; end if;
 if p_coupon is not null then amount:=amount-public.cm_coupon(p_user,c.id,p_coupon,'reserve',amount,p_evidence->>'email'); end if;
 if amount between 1 and 49 then amount:=least(p.price_cents*p_quantity,50); end if;
 if q->>'discount_kind'='creator' then amount:=(q->>'total_cents')::integer;end if;
 if amount<>(q->>'total_cents')::integer then raise exception 'quote_changed';end if;
 insert into public.cm_revisions(checkout_id,product_id,product_label,quantity,subtotal_cents,total_cents,ticket_id,affiliate_code,coupon_code,evidence,discount_kind)
 values(c.id,p.id,p.label,p_quantity,p.price_cents*p_quantity,amount,p_ticket,nullif(upper(p_affiliate),''),p_coupon,p_evidence,q->>'discount_kind') returning * into r;
 update public.cm_attempts set state='superseded' where checkout_id=c.id and state='prepared';
 update public.cm_checkouts set current_revision=r.id,slot_order=null,updated_at=now() where id=c.id returning * into c;
 insert into public.cm_events(checkout_id,actor_id,action,data) values(c.id,p_user,'revision',jsonb_build_object('revision',r.id));
 return to_jsonb(c);
end $$;

create or replace function public.cm_result(p_attempt uuid,p_state text,p_reference text,p_amount integer,p_currency text,p_invoice text,p_url text default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if r.affiliate_code is not null and r.total_cents>0 and not exists(select 1 from public.cp_attributions a0 join public.cp_codes code on code.id=a0.code_id where a0.order_id=c.slot_order and a0.buyer_id=c.user_id and code.code=r.affiliate_code and a0.sale_cents=r.total_cents) then raise exception 'reconciliation_required';end if;
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


revoke all on function public.cm_creator(uuid,text,boolean),public.cm_creator_configure(uuid,text,integer,text),public.cm_quote(uuid,text,integer,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.cm_creator(uuid,text,boolean),public.cm_creator_configure(uuid,text,integer,text),public.cm_quote(uuid,text,integer,uuid,text,text,text) to service_role;
commit;
