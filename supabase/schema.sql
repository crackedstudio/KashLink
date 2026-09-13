-- KashLink analytics. Paste into the Supabase SQL editor and run once.
--
-- Records one row per KashLink lifecycle event. Deliberately stores nothing secret:
-- no link key (that is the money), no user wallet address, nothing from the page URL.
-- link_address is the link's PUBLIC address, so every number here can be verified on-chain.

create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  type         text        not null check (type in ('created', 'claimed', 'reverted')),
  token        text        not null default 'nim' check (token in ('nim', 'usdt')),
  -- Each token's smallest unit: luna for NIM, 6 decimals for USDT. Never add them together.
  value_units  bigint      not null check (value_units >= 0 and value_units < 1e15),
  -- Nimiq "NQ12 ABCD ..." (2 digits plus 8 groups of 4), or an Ethereum 0x address.
  link_address text        not null check (
    link_address ~ '^NQ[0-9]{2}( [A-Z0-9]{4}){8}$' or link_address ~ '^0x[0-9a-fA-F]{40}$'
  ),
  -- Random per-install id from localStorage. Not a wallet address, not a person.
  device_id    text        not null check (device_id ~ '^[a-f0-9-]{8,64}$'),
  created_at   timestamptz not null default now()
);

-- A link can only be created, claimed, and reverted once each, so duplicate sends (retries,
-- reopened pages) cannot inflate the numbers: the second one is rejected with a 409 the app ignores.
-- The app must not use PostgREST's ignore-duplicates upsert here — that needs an UPDATE policy,
-- which would let anyone holding the public key rewrite recorded history.
create unique index if not exists events_link_type_idx on public.events (link_address, type);
create index if not exists events_created_at_idx on public.events (created_at desc);

alter table public.events enable row level security;

-- The anon key ships inside the app bundle and is therefore public. Visitors may only
-- append rows: there is no select/update/delete policy, so nobody can read the table,
-- enumerate links, or erase history with that key. You read it from the dashboard.
drop policy if exists "anon can append events" on public.events;
drop policy if exists "append events" on public.events;
create policy "append events" on public.events
  for insert with check (true);

-- Verification. Must print exactly one row: append events | INSERT | PERMISSIVE.
-- If it is empty, the app cannot record anything.
select policyname, cmd, permissive, roles::text from pg_policies
where schemaname = 'public' and tablename = 'events';
