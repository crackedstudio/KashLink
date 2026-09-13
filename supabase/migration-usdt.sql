-- Teach the analytics table about USDT. Run once in the Supabase SQL editor, whole file, nothing
-- highlighted (the editor runs only the selection if there is one).
--
-- Why: link_address only accepted Nimiq addresses, so every USDT event was rejected with a 400.
-- Analytics is deliberately fire-and-forget, so the app never surfaced it and the rows just vanished.

-- 1. Accept Ethereum addresses as well as Nimiq ones.
alter table public.events drop constraint if exists events_link_address_check;
alter table public.events add constraint events_link_address_check check (
  link_address ~ '^NQ[0-9]{2}( [A-Z0-9]{4}){8}$'   -- Nimiq
  or link_address ~ '^0x[0-9a-fA-F]{40}$'          -- Ethereum / Polygon
);

-- 2. Record which token, because luna and USDT units cannot be added together. Existing rows are all
--    NIM, which is what the default backfills.
alter table public.events add column if not exists token text not null default 'nim';
alter table public.events drop constraint if exists events_token_check;
alter table public.events add constraint events_token_check check (token in ('nim', 'usdt'));

-- 3. The column holds each token's smallest unit, not only luna, so give it an honest name.
alter table public.events rename column value_luna to value_units;

-- 4. Remove the rows left behind by connection tests.
delete from public.events where device_id = 'deadbeef';

-- Verification: expect the two constraints above, a token column, and value_units.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'events'
order by ordinal_position;
