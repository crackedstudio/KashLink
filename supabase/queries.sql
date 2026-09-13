-- Dashboard queries. Run these in the Supabase SQL editor (it bypasses RLS, so it can read).
-- NIM and USDT are different units, so every total is grouped by token rather than summed.

-- Headline numbers, per token.
select
  token,
  count(distinct device_id)                                             as users,
  count(*) filter (where type = 'created')                              as links_created,
  count(*) filter (where type = 'claimed')                              as links_claimed,
  round(sum(value_units) filter (where type = 'created')
        / case token when 'nim' then 1e5 else 1e6 end, 2)               as sent,
  round(sum(value_units) filter (where type = 'claimed')
        / case token when 'nim' then 1e5 else 1e6 end, 2)               as claimed,
  round(100.0 * count(*) filter (where type = 'claimed')
              / nullif(count(*) filter (where type = 'created'), 0), 1) as claim_rate_pct
from public.events
group by token;

-- Fee revenue. Charged on USDT only, 1% with a $0.10 floor, taken whenever a link is resolved
-- (claimed or reverted), so it mirrors what should have reached the treasury.
select
  count(*)                                                      as links_resolved,
  round(sum(greatest(value_units * 0.01, 100000)) / 1e6, 2)     as fees_usd
from public.events
where token = 'usdt' and type in ('claimed', 'reverted');

-- People, not links.
select
  count(distinct device_id)                                                  as total_users,
  count(distinct device_id) filter (where created_at > now() - interval '7 days') as active_7d,
  count(distinct device_id) filter (where token = 'usdt')                    as used_usdt
from public.events;

-- Day by day.
select
  created_at::date                          as day,
  token,
  count(distinct device_id)                 as users,
  count(*) filter (where type = 'created')  as created,
  count(*) filter (where type = 'claimed')  as claimed
from public.events
group by day, token
order by day desc, token;

-- Typical amount sent, per token.
select
  token,
  round(avg(value_units) / case token when 'nim' then 1e5 else 1e6 end, 2)   as avg,
  round(percentile_cont(0.5) within group (order by value_units)::numeric
        / case token when 'nim' then 1e5 else 1e6 end, 2)                    as median,
  round(max(value_units) / case token when 'nim' then 1e5 else 1e6 end, 2)   as largest
from public.events
where type = 'created'
group by token;

-- Money still in flight: created, never claimed or reverted. Any row can be checked on-chain with
-- its link_address — nimiq.watch for NQ addresses, polygonscan.com for 0x ones.
select e.token, e.link_address,
       round(e.value_units / case e.token when 'nim' then 1e5 else 1e6 end, 2) as amount,
       e.created_at
from public.events e
where e.type = 'created'
  and not exists (
    select 1 from public.events x
    where x.link_address = e.link_address and x.type in ('claimed', 'reverted')
  )
order by e.created_at desc;
