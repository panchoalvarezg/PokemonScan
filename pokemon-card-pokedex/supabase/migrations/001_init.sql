create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text unique,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.card_catalog (
  id uuid primary key default gen_random_uuid(),
  pricecharting_product_id text unique not null,
  product_name text not null,
  set_name text,
  card_number text,
  rarity text,
  card_type text,
  official_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_catalog_id uuid not null references public.card_catalog(id) on delete restrict,
  condition text not null default 'near_mint',
  language text default 'english',
  quantity integer not null default 1 check (quantity > 0),
  estimated_unit_value numeric(12,2) not null default 0,
  estimated_total_value numeric(12,2) generated always as (quantity * estimated_unit_value) stored,
  purchase_price numeric(12,2),
  for_trade boolean not null default false,
  notes text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scan_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  original_image_url text not null,
  extracted_text text,
  detected_name text,
  detected_number text,
  detected_set text,
  matched_pricecharting_product_id text,
  match_confidence numeric(5,2),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.price_snapshots (
  id uuid primary key default gen_random_uuid(),
  card_catalog_id uuid not null references public.card_catalog(id) on delete cascade,
  market_price numeric(12,2) not null,
  currency text not null default 'USD',
  captured_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Usamos drop + create para las vistas en lugar de `create or replace view`.
-- Esto hace que la migración sea re-ejecutable incluso si 004/005/007 ya
-- modificaron `user_cards_detailed` con columnas extra o renombradas
-- (`external_id`, `card_type`, `rarity`, `last_market_price`,
-- `price_updated_at`). Sin esto, un re-run dispararía:
--   ERROR 42P16: cannot drop columns from view
drop view if exists public.inventory_valuation_summary cascade;
create view public.inventory_valuation_summary as
select
  user_id,
  count(*)::int as distinct_entries,
  coalesce(sum(quantity), 0)::int as total_cards,
  coalesce(sum(estimated_total_value), 0)::numeric(12,2) as total_inventory_value,
  case
    when coalesce(sum(quantity), 0) = 0 then 0::numeric(12,2)
    else round((sum(estimated_total_value) / sum(quantity))::numeric, 2)
  end as average_card_value
from public.user_cards
group by user_id;

drop view if exists public.user_cards_detailed cascade;
create view public.user_cards_detailed as
select
  uc.id,
  uc.user_id,
  uc.condition,
  uc.language,
  uc.quantity,
  uc.estimated_unit_value,
  uc.estimated_total_value,
  uc.purchase_price,
  uc.for_trade,
  uc.notes,
  uc.image_url,
  uc.created_at,
  cc.product_name,
  cc.set_name,
  cc.card_number,
  cc.pricecharting_product_id
from public.user_cards uc
join public.card_catalog cc on cc.id = uc.card_catalog_id;
