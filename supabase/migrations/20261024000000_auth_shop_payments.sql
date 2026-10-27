-- Belot: profiles, cosmetics shop and Revolut payment orders.
-- Apply with `supabase db push` or paste into the Supabase SQL editor.
-- RLS: authenticated users can READ their own rows; all writes happen server-side with the service role.

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- auto-create a profile row when a user signs up (Google OAuth)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- skin catalog (server = price authority)
create table if not exists public.skin_catalog (
  id text primary key,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  sort_order integer not null default 0
);

insert into public.skin_catalog (id, name, price_cents, currency, sort_order) values
  ('default',      'Classic',      0,   'EUR', 0),
  ('classic-dark', 'Classic Dark', 0,   'EUR', 1),
  ('fire',         'Fire',         199, 'EUR', 2),
  ('forest',       'Forest',       199, 'EUR', 3),
  ('space',        'Space',        199, 'EUR', 4),
  ('nautical',     'Nautical',     199, 'EUR', 5),
  ('fantasy',      'Fantasy',      199, 'EUR', 6),
  ('deco',         'Art Deco',     199, 'EUR', 7),
  ('geometric',    'Geometric',    199, 'EUR', 8)
on conflict (id) do update
  set name = excluded.name, price_cents = excluded.price_cents, currency = excluded.currency, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------- payment orders
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  revolut_order_id text unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  skin_id text not null references public.skin_catalog (id),
  amount integer not null check (amount >= 0),
  currency text not null,
  state text not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_orders_user_idx on public.payment_orders (user_id);

-- ---------------------------------------------------------------- owned skins
create table if not exists public.user_skins (
  user_id uuid not null references auth.users (id) on delete cascade,
  skin_id text not null references public.skin_catalog (id),
  acquired_at timestamptz not null default now(),
  order_id uuid references public.payment_orders (id) on delete set null,
  primary key (user_id, skin_id) -- = unique(user_id, skin_id)
);

-- ---------------------------------------------------------------- updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
drop trigger if exists payment_orders_touch on public.payment_orders;
create trigger payment_orders_touch before update on public.payment_orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.skin_catalog enable row level security;
alter table public.payment_orders enable row level security;
alter table public.user_skins enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "skin_catalog: public read" on public.skin_catalog;
create policy "skin_catalog: public read" on public.skin_catalog
  for select to anon, authenticated using (true);

drop policy if exists "payment_orders: read own" on public.payment_orders;
create policy "payment_orders: read own" on public.payment_orders
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "user_skins: read own" on public.user_skins;
create policy "user_skins: read own" on public.user_skins
  for select to authenticated using (auth.uid() = user_id);

-- No insert/update/delete policies: only the service role (which bypasses RLS) can write.
