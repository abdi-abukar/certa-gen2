-- Run only against the disposable test fixture, never production.
begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111117'),('22222222-2222-4222-8222-222222222227') on conflict do nothing;
do $$
declare u uuid='11111111-1111-4111-8111-111111111117';v uuid='22222222-2222-4222-8222-222222222227';p uuid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7';t uuid;r jsonb;config jsonb;prizes jsonb='[{"name":"Half off","description":"Fixture","kind":"percentage_off","value":50},{"name":"Free","description":"Fixture","kind":"percentage_off","value":100}]';begin
 config=jsonb_build_object('title','Fixture','mode','shared','per_user',1,'prizes',prizes);
 perform public.tk_create(u,p,config,prizes,'["CT-AAAAAAAAAAAAAAAAAAAAAAAA"]');
 perform public.tk_create(u,p,config,prizes,'["CT-BBBBBBBBBBBBBBBBBBBBBBBB"]');
 if (select count(*) from public.tk_codes where pool_id=p)<>1 then raise exception 'create replay duplicated codes';end if;
 begin perform public.tk_claim(u,'CT-AAAAAAAAAAAAAAAAAAAAAAAA','first',null);raise exception 'draft claim accepted';exception when others then if sqlerrm not like '%not_active%' then raise;end if;end;
 perform public.tk_state(u,p,'active');
 r=public.tk_claim(u,'CT-AAAAAAAAAAAAAAAAAAAAAAAA','first',null);t=(r->>'id')::uuid;
 if (public.tk_claim(u,'CT-AAAAAAAAAAAAAAAAAAAAAAAA','first',null)->>'id')::uuid<>t then raise exception 'claim rerolled';end if;
 begin perform public.tk_claim(u,'CT-AAAAAAAAAAAAAAAAAAAAAAAA','second',null);raise exception 'cap bypass';exception when others then if sqlerrm not like '%claim_limit%' then raise;end if;end;
 begin perform public.tk_reveal(v,t);raise exception 'cross user reveal';exception when others then if sqlerrm not like '%not_found%' then raise;end if;end;
 begin perform public.tk_checkout(u,t,p,'reserve',1000);raise exception 'sealed used';exception when others then if sqlerrm not like '%not_revealed%' then raise;end if;end;
 r=public.tk_reveal(u,t);if r->'prize'->>'value'<>'50' then raise exception 'prize changed';end if;
 if public.tk_reveal(u,t)->>'revealed_at'<>r->>'revealed_at' then raise exception 'reveal timestamp changed';end if;
 if public.tk_checkout(u,t,p,'reserve',1001)->>'discount_cents'<>'500' then raise exception 'rounding error';end if;
 perform public.tk_checkout(u,t,p,'submit');
 begin perform public.tk_checkout(u,t,p,'release');raise exception 'submitted released';exception when others then if sqlerrm not like '%ticket_held%' then raise;end if;end;
 begin perform public.tk_checkout(u,t,p,'reserve',900);raise exception 'submitted repriced';exception when others then if sqlerrm not like '%ticket_held%' then raise;end if;end;
 begin perform public.tk_checkout(u,t,u,'reserve',1001);raise exception 'held reused';exception when others then if sqlerrm not like '%ticket_held%' then raise;end if;end;
 perform public.tk_checkout(u,t,p,'decline');perform public.tk_checkout(u,t,p,'reserve',1001);perform public.tk_checkout(u,t,p,'submit');perform public.tk_checkout(u,t,p,'settle');perform public.tk_checkout(u,t,p,'settle');
 begin perform public.tk_checkout(u,t,p,'reserve',1001);raise exception 'used reused';exception when others then if sqlerrm not like '%already_used%' then raise;end if;end;
 if (select count(*) from public.tk_tickets where user_id=u and pool_id=p)<>1 then raise exception 'duplicate ticket';end if;
 perform public.tk_state(u,p,'paused');
 if (public.tk_claim(u,'CT-AAAAAAAAAAAAAAAAAAAAAAAA','first',null)->>'id')::uuid<>t then raise exception 'paused retry lost existing';end if;
end $$;
-- Manual prize requests are owner-scoped and require reviewed fulfillment evidence.
do $$declare u uuid='11111111-1111-4111-8111-111111111117';v uuid='22222222-2222-4222-8222-222222222227';p uuid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb7';t uuid;prizes jsonb='[{"name":"Certa jacket","description":"Staff arranges delivery","kind":"manual","value":0}]';begin
 perform public.tk_create(u,p,jsonb_build_object('title','Manual','mode','reward','per_user',1,'prizes',prizes),prizes,'[]');perform public.tk_state(u,p,'active');
 t=(public.tk_claim(u,null,'puzzle-reward/test',p)->>'id')::uuid;
 if (public.tk_claim(u,null,'puzzle-reward/test',p)->>'id')::uuid<>t then raise exception 'puzzle retry duplicated';end if;
 perform public.tk_reveal(u,t);
 begin perform public.tk_manual(v,null,t,null);raise exception 'cross user manual';exception when others then if sqlerrm not like '%not_found%' then raise;end if;end;
 perform public.tk_manual(u,null,t,null);perform public.tk_manual(null,v,t,'delivered-fixture');perform public.tk_manual(null,v,t,'delivered-fixture');
 if (select manual_state from public.tk_tickets where id=t)<>'completed' then raise exception 'manual not completed';end if;
end $$;
-- Puzzle claims atomically create a ticket and never manufacture a pending win.
do $$declare u uuid='11111111-1111-4111-8111-111111111117';v uuid='22222222-2222-4222-8222-222222222227';p uuid='dddddddd-dddd-4ddd-8ddd-ddddddddddd7';puzzle uuid='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee7';prizes jsonb='[{"name":"Puzzle prize","description":"Fixture","kind":"percentage_off","value":100}]';result jsonb;begin
 perform public.tk_create(u,p,jsonb_build_object('title','Puzzle','mode','reward','per_user',1,'prizes',prizes),prizes,'[]');perform public.tk_state(u,p,'active');
 insert into public.cn_puzzles(id,created_by,prompt,answer_hash,answer_mask,reward_ticket_id,reward_cap,live_on,starts_at,ends_at,state) values(puzzle,u,'Fixture clue','fixture-hash','____',p::text,1,'2026-09-27',now()-interval '1 hour',now()+interval '1 hour','scheduled');
 result=public.cn_guess(u,puzzle,'fixture-hash');
 if result->>'correct'<>'true' then raise exception 'correct puzzle failed';end if;
 if not exists(select 1 from public.cn_puzzle_rewards where puzzle_id=puzzle and state='granted' and ticket_grant_id is not null) then raise exception 'puzzle not atomically granted';end if;
 perform public.cn_guess(u,puzzle,'fixture-hash');
 if (select count(*) from public.tk_tickets where pool_id=p and user_id=u)<>1 then raise exception 'puzzle rerolled';end if;
 begin insert into public.cn_puzzle_rewards(puzzle_id,user_id,reward_ticket_id) values(puzzle,v,p::text);raise exception 'exhausted puzzle inventory granted';exception when others then if sqlerrm not like '%sold_out%' then raise;end if;end;
end $$;
do $$declare t text;f record;begin
 foreach t in array array['tk_pools','tk_codes','tk_tickets','tk_audit'] loop
  if has_table_privilege('authenticated','public.'||t,'select') or has_table_privilege('anon','public.'||t,'select') then raise exception 'private ticket table exposed';end if;
  if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then raise exception 'missing RLS';end if;
 end loop;
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'tk\_%' escape '\' loop
  if has_function_privilege('authenticated',f.oid,'execute') or has_function_privilege('anon',f.oid,'execute') then raise exception 'private RPC exposed';end if;
 end loop;
end $$;
rollback;
