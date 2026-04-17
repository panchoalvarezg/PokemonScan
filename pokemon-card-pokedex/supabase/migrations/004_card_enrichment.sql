-- Enrich card_catalog with type + image (si no existían) y permitir price_updated_at
alter table public.card_catalog
  add column if not exists card_type text,
  add column if not exists official_image_url text,
  add column if not exists last_market_price numeric(12,2),
  add column if not exists price_updated_at timestamptz;

-- Guarda el tipo de Pokémon detectado también a nivel del user_card (por si el
-- usuario añade notas propias o el catálogo aún no lo tenía resuelto).
alter table public.user_cards
  add column if not exists card_type text,
  add column if not exists set_name text,
  add column if not exists card_number text,
  add column if not exists image_url text;

-- Vista detallada enriquecida (se recrea para exponer los nuevos campos).
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
  cc.pricecharting_product_id as external_id,
  cc.last_market_price,
  cc.price_updated_at
from public.user_cards uc
join public.card_catalog cc on cc.id = uc.card_catalog_id;
