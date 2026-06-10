-- Spaceship Logistics Analytics — initial schema
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query),
-- then seed with: npm run seed
--
-- The dataset is mock, read-only logistics data with no PII, so the demo
-- policies below are intentionally open. See README → Limitations.

create table if not exists public.orders (
  order_id            text primary key,
  client_id           text not null,
  order_date          date not null,
  delivery_date       date,
  carrier             text not null,
  origin_city         text not null,
  destination_city    text not null,
  status              text not null check (status in ('delivered','delayed','in_transit','exception','canceled')),
  sku                 text not null,
  product_category    text not null,
  quantity            integer not null,
  unit_price_usd      numeric(10,2) not null,
  order_value_usd     numeric(12,2) not null,
  is_promo            boolean not null default false,
  promo_discount_pct  numeric(5,2) not null default 0,
  region              text not null,
  warehouse           text not null
);

create index if not exists orders_order_date_idx on public.orders (order_date);
create index if not exists orders_carrier_idx on public.orders (carrier);
create index if not exists orders_status_idx on public.orders (status);

alter table public.orders enable row level security;

drop policy if exists "orders_public_read" on public.orders;
create policy "orders_public_read"
  on public.orders for select
  using (true);

-- Needed once so `npm run seed` can insert with the publishable key.
-- After seeding you may lock the table down again with:
--   drop policy "orders_public_insert_demo" on public.orders;
drop policy if exists "orders_public_insert_demo" on public.orders;
create policy "orders_public_insert_demo"
  on public.orders for insert
  with check (true);

-- ---------------------------------------------------------------------------
-- Agent knowledge filesystem — small markdown files the agent reads/writes,
-- evolving as it works (insights, user preferences, playbooks).
-- ---------------------------------------------------------------------------

create table if not exists public.knowledge_files (
  path        text primary key,
  content     text not null default '',
  updated_at  timestamptz not null default now()
);

alter table public.knowledge_files enable row level security;

drop policy if exists "knowledge_public_read" on public.knowledge_files;
create policy "knowledge_public_read"
  on public.knowledge_files for select
  using (true);

drop policy if exists "knowledge_public_write_demo" on public.knowledge_files;
create policy "knowledge_public_write_demo"
  on public.knowledge_files for insert
  with check (true);

drop policy if exists "knowledge_public_update_demo" on public.knowledge_files;
create policy "knowledge_public_update_demo"
  on public.knowledge_files for update
  using (true);

drop policy if exists "knowledge_public_delete_demo" on public.knowledge_files;
create policy "knowledge_public_delete_demo"
  on public.knowledge_files for delete
  using (true);
