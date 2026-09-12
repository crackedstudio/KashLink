-- Dashboard queries. Run these in the Supabase SQL editor (it bypasses RLS, so it can read).

-- Headline numbers.
select
  count(distinct device_id)                                          as users,
  count(*) filter (where type = 'created')                           as links_created,
  count(*) filter (where type = 'claimed')                           as links_claimed,
  round(sum(value_luna) filter (where type = 'created') / 1e5, 2)    as nim_sent,
  round(sum(value_luna) filter (where type = 'claimed') / 1e5, 2)    as nim_claimed,
  round(100.0 * count(*) filter (where type = 'claimed')
              / nullif(count(*) filter (where type = 'created'), 0), 1) as claim_rate_pct
from public.events;

-- Day by day.
select
  created_at::date                                                as day,
  count(distinct device_id)                                       as users,
  count(*) filter (where type = 'created')                        as created,
  count(*) filter (where type = 'claimed')                        as claimed,
  round(sum(value_luna) filter (where type = 'created') / 1e5, 2) as nim_sent
from public.events
group by day
order by day desc;

-- Typical amount people send.
select
  round(avg(value_luna) / 1e5, 2)                                                   as avg_nim,
  round(percentile_cont(0.5) within group (order by value_luna)::numeric / 1e5, 2)  as median_nim,
  round(max(value_luna) / 1e5, 2)                                                   as largest_nim
from public.events
where type = 'created';

-- New vs returning: how many links each device has created.
select links_created, count(*) as devices
from (
  select device_id, count(*) as links_created
  from public.events where type = 'created' group by device_id
) t
group by links_created
order by links_created;

-- Unclaimed links still holding NIM (money in flight). Verify any row on-chain with
-- its link_address at https://nimiq.watch
select e.link_address, round(e.value_luna / 1e5, 2) as nim, e.created_at
from public.events e
where e.type = 'created'
  and not exists (
    select 1 from public.events x
    where x.link_address = e.link_address and x.type in ('claimed', 'reverted')
  )
order by e.created_at desc;
