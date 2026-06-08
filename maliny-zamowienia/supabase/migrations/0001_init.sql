-- Maliny: Zamówienia — schemat początkowy
-- Uruchom w Supabase: SQL Editor → wklej całość → Run

-- ── customers ──────────────────────────────────────────────
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name  text not null default '',
  phone      text,            -- 9 cyfr, bez spacji; może być null
  notes      text,            -- np. drugi telefon, uwagi
  created_at timestamptz default now()
);
create index if not exists customers_name_idx on customers (last_name, first_name);

-- ── deliveries ─────────────────────────────────────────────
create table if not exists deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null,
  note text,                  -- np. godzina, miejsce
  status text not null default 'open',  -- 'open' | 'closed'
  created_at timestamptz default now(),
  unique (delivery_date)
);

-- ── orders ─────────────────────────────────────────────────
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  delivery_id uuid not null references deliveries(id) on delete cascade,
  kg_second  numeric not null default 0,   -- II gatunek (przetwory)
  kg_premium numeric not null default 0,    -- Premium (I klasa)
  delivered  boolean not null default false,
  notes text,
  created_at timestamptz default now()
);
create index if not exists orders_delivery_idx on orders (delivery_id);
create index if not exists orders_customer_idx on orders (customer_id);

-- ── settings (ceny) — NIE hardcode'uj cen w kodzie ─────────
create table if not exists settings (
  key text primary key,
  value numeric not null
);
insert into settings (key, value) values
  ('price_second', 20),   -- cena 1 kg II gat
  ('price_premium', 40)   -- cena 1 kg Premium
on conflict (key) do nothing;
