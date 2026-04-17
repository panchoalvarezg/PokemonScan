-- 007_ensure_detailed_view.sql
--
-- Migración idempotente de "rescate": garantiza que `user_cards_detailed`
-- exponga card_type y rarity. Soluciona el error
--   "column user_cards_detailed.card_type does not exist"
-- que aparece cuando la BD tiene sólo 001/002/003 aplicadas y falta enriquecer
-- el esquema con 004/005.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. Se puede volver a correr
-- sin problema: todos los pasos usan IF NOT EXISTS o create or replace.

-- 1) Asegurar columnas enriquecidas en card_catalog
alter table public.card_catalog
  add column if not exists card_type text,
  add column if not exists official_image_url text,
  add column if not exists last_market_price numeric(12,2),
  add column if not exists price_updated_at timestamptz,
  add column if not exists rarity text;

-- 2) Asegurar columnas enriquecidas en user_cards
alter table public.user_cards
  add column if not exists card_type text,
  add column if not exists set_name text,
  add column if not exists card_number text,
  add column if not exists image_url text,
  add column if not exists rarity text;

-- 3) Recrear la vista detallada con todos los campos
drop view if exists public.user_cards_detailed cascade;

create or replace view public.user_cards_detailed as
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
  coalesce(uc.image_url, cc.official_image_url) as image_url,
  uc.created_at,
  cc.product_name,
  coalesce(uc.set_name, cc.set_name) as set_name,
  coalesce(uc.card_number, cc.card_number) as card_number,
  coalesce(uc.card_type, cc.card_type) as card_type,
  coalesce(uc.rarity, cc.rarity) as rarity,
  cc.pricecharting_product_id as external_id,
  cc.last_market_price,
  cc.price_updated_at
from public.user_cards uc
join public.card_catalog cc on cc.id = uc.card_catalog_id;
