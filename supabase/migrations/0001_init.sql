-- DealCheck schema. Run against your Supabase project (SQL editor, or
-- `supabase db push`). The app uses the service-role key from the server only;
-- RLS is enabled with no policies, so the anon key can read nothing.

create table if not exists checks (
  id          text primary key,
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists orders (
  id                 text primary key,
  check_id           text not null references checks(id),
  status             text not null default 'pending' check (status in ('pending', 'paid')),
  created_at         timestamptz not null default now(),
  paid_at            timestamptz,
  email              text,
  stripe_session_id  text,
  report             jsonb,
  cost               jsonb,   -- { dataCalls, inputTokens, outputTokens, estimatedUsd }
  emailed_at         timestamptz
);
create index if not exists orders_check_id_idx on orders(check_id);

create table if not exists webhook_events (
  id           text primary key,          -- Stripe event id (idempotency)
  received_at  timestamptz not null default now()
);

create table if not exists daily_counters (
  key    text not null,
  day    date not null,
  count  integer not null default 0,
  primary key (key, day)
);

create table if not exists api_cache (
  key         text primary key,
  value       jsonb not null,
  expires_at  timestamptz not null
);

create table if not exists coach_messages (
  id          bigserial primary key,
  order_id    text not null references orders(id),
  role        text not null check (role in ('seller', 'coach')),
  text        text not null,
  stop        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists coach_messages_order_idx on coach_messages(order_id, id);

-- Atomic per-day counter for the free-check limit.
create or replace function increment_daily_counter(p_key text, p_day date)
returns integer
language sql
as $$
  insert into daily_counters (key, day, count) values (p_key, p_day, 1)
  on conflict (key, day) do update set count = daily_counters.count + 1
  returning count;
$$;

alter table checks          enable row level security;
alter table orders          enable row level security;
alter table webhook_events  enable row level security;
alter table daily_counters  enable row level security;
alter table api_cache       enable row level security;
alter table coach_messages  enable row level security;
