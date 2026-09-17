begin;
insert into auth.users(id) values('11111111-1234-4234-8234-111111111111'),('22222222-1234-4234-8234-222222222222');
create function pg_temp.expect_error(statement text, expected text) returns void language plpgsql as $$ begin
 begin execute statement; exception when others then if position(expected in sqlerrm)>0 then return; else raise; end if; end;
 raise exception 'expected error %',expected;
end $$;
select public.cn_subscribe('reader@example.com');
select public.cn_subscribe('reader@example.com');
insert into public.newsletter_subscribers(email,status) values('suppressed@example.com','bounced');
select pg_temp.expect_error($s$select public.cn_subscribe('suppressed@example.com')$s$,'suppressed');
select public.cn_save_issue('11111111-1234-4234-8234-111111111111','aaaaaaaa-1234-4234-8234-111111111111',0,'{"template":"digest","sections":[]}');
select pg_temp.expect_error($s$select public.cn_save_issue('11111111-1234-4234-8234-111111111111','aaaaaaaa-1234-4234-8234-111111111111',0,'{"template":"digest","sections":[]}')$s$,'conflict');
select public.cn_publish_issue('11111111-1234-4234-8234-111111111111','aaaaaaaa-1234-4234-8234-111111111111',1,'{"html":"frozen","text":"frozen"}','Certa <news@example.com>',null);
select public.cn_publish_issue('11111111-1234-4234-8234-111111111111','aaaaaaaa-1234-4234-8234-111111111111',1,'{"html":"changed","text":"changed"}','Certa <news@example.com>',null);
do $$ declare job jsonb; begin
 if (select count(*) from public.cn_deliveries)<>1 then raise exception 'audience not deduped or suppressed'; end if;
 if (select rendered->>'html' from public.cn_issues limit 1)<>'frozen' then raise exception 'render changed'; end if;
 job=public.cn_claim_delivery();
 if public.cn_claim_delivery() is not null then raise exception 'lease claimed twice'; end if;
 perform public.cn_email_event('event-before-response','provider-1','email.bounced');
 perform public.cn_finish_delivery((job->'delivery'->>'id')::uuid,(job->'delivery'->>'lease_token')::uuid,'provider-1',null,false);
 if (select status from public.newsletter_subscribers where email='reader@example.com')<>'bounced' then raise exception 'early bounce not suppressed'; end if;
 perform public.cn_email_event('event-delivered-late','provider-1','email.delivered');
 if (select state from public.cn_deliveries limit 1)<>'bounced' then raise exception 'late delivery undid bounce'; end if;
 perform public.cn_unsubscribe((select unsubscribe_token from public.newsletter_subscribers where email='reader@example.com'));
 if (select status from public.newsletter_subscribers where email='reader@example.com')<>'bounced' then raise exception 'unsubscribe cleared suppression'; end if;
end $$;
-- Unknown send outcomes are not replayed outside the provider window.
update public.newsletter_subscribers set status='active' where email='reader@example.com';
update public.cn_deliveries set state='sending',provider_id=null,first_attempt_at=now()-interval '24 hours',lease_until=now()-interval '1 minute';
select public.cn_claim_delivery();
do $$ begin if (select state from public.cn_deliveries limit 1)<>'unknown' then raise exception 'expired delivery retried'; end if; end $$;
select public.cn_generation_begin('11111111-1234-4234-8234-111111111111','generation-1','hash');
do $$ begin
 if (public.cn_generation_begin('11111111-1234-4234-8234-111111111111','generation-1','hash')->>'run')::boolean then raise exception 'duplicate billed generation'; end if;
end $$;
select pg_temp.expect_error($s$select public.cn_generation_begin('11111111-1234-4234-8234-111111111111','generation-1','different')$s$,'conflict');
select pg_temp.expect_error($s$select public.cn_generation_begin('11111111-1234-4234-8234-111111111111','generation-2','hash')$s$,'rate_limited');
-- DST follows civil Sundays: March 8 is EDT, November 1 is EST.
select public.cn_save_puzzle('11111111-1234-4234-8234-111111111111','bbbbbbbb-1234-4234-8234-111111111111',0,'{"prompt":"Clue","image_id":null,"answer_hash":"secret-hash","answer_mask":"____","reward_ticket_id":"replace-with-ticket-id","reward_cap":1,"live_on":"2026-03-08"}');
do $$ begin
 if (select starts_at from public.cn_puzzles limit 1)<>'2026-03-08T21:00:00Z'::timestamptz then raise exception 'wrong spring schedule'; end if;
end $$;
select public.cn_save_puzzle('11111111-1234-4234-8234-111111111111','bbbbbbbb-1234-4234-8234-111111111111',1,'{"prompt":"Clue","image_id":null,"answer_hash":"secret-hash","answer_mask":"____","reward_ticket_id":"replace-with-ticket-id","reward_cap":1,"live_on":"2026-11-01"}');
do $$ begin
 if (select starts_at from public.cn_puzzles limit 1)<>'2026-11-01T22:00:00Z'::timestamptz then raise exception 'wrong autumn schedule'; end if;
end $$;
update public.cn_puzzles set ends_at=now()+interval '1 year';
select public.cn_schedule_puzzle('11111111-1234-4234-8234-111111111111','bbbbbbbb-1234-4234-8234-111111111111',2);
update public.cn_puzzles set starts_at=now()+interval '1 minute';
select pg_temp.expect_error($s$select public.cn_guess('11111111-1234-4234-8234-111111111111','bbbbbbbb-1234-4234-8234-111111111111','secret-hash')$s$,'not_live');
update public.cn_puzzles set starts_at=now()-interval '1 minute',ends_at=now()+interval '1 hour';
do $$ declare result jsonb; i integer; reward uuid; begin
 for i in 1..10 loop
  result=public.cn_guess('11111111-1234-4234-8234-111111111111','bbbbbbbb-1234-4234-8234-111111111111','wrong');
  if (result->>'correct')::boolean then raise exception 'wrong answer awarded'; end if;
 end loop;
 result=public.cn_guess('11111111-1234-4234-8234-111111111111','bbbbbbbb-1234-4234-8234-111111111111','secret-hash');
 if result->>'error'<>'rate_limited' then raise exception 'limit not durable'; end if;
 update public.cn_puzzle_attempts set window_at=now()-interval '2 hours';
 result=public.cn_guess('11111111-1234-4234-8234-111111111111','bbbbbbbb-1234-4234-8234-111111111111','secret-hash');
 reward=(result->'reward'->>'id')::uuid;
 if reward is null or result->'reward'->>'state'<>'pending' then raise exception 'missing pending reward'; end if;
 if (public.cn_guess('11111111-1234-4234-8234-111111111111','bbbbbbbb-1234-4234-8234-111111111111','secret-hash')->'reward'->>'id')::uuid<>reward then raise exception 'duplicate reward'; end if;
 if public.cn_guess('22222222-1234-4234-8234-222222222222','bbbbbbbb-1234-4234-8234-111111111111','secret-hash')->>'error'<>'sold_out' then raise exception 'capacity exceeded'; end if;
 perform public.cn_complete_reward(reward,'ticket-grant-1'); perform public.cn_complete_reward(reward,'ticket-grant-1');
 if (select claimed from public.cn_puzzles limit 1)<>1 then raise exception 'capacity counted twice'; end if;
end $$;
set local role authenticated;
select pg_temp.expect_error('select * from public.cn_puzzles','permission denied');
select pg_temp.expect_error('select * from public.cn_puzzle_rewards','permission denied');
select pg_temp.expect_error('select * from public.newsletter_subscribers','permission denied');
select pg_temp.expect_error('select * from public.cn_deliveries','permission denied');
select pg_temp.expect_error($s$select public.cn_guess('22222222-1234-4234-8234-222222222222','bbbbbbbb-1234-4234-8234-111111111111','secret-hash')$s$,'permission denied');
select pg_temp.expect_error('select public.cn_claim_delivery()','permission denied');
reset role;
set local role anon;
select pg_temp.expect_error('select * from public.cn_issues','permission denied');
select pg_temp.expect_error('select * from public.cn_generations','permission denied');
reset role;
rollback;
