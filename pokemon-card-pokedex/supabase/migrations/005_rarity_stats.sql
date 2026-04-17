-- Añade rareza al user_card (card_catalog ya la tenía) para que los filtros
-- y las estadísticas del inventario puedan agruparla aunque el catálogo
-- oficial no la conozca.
alter table public.user_cards
  add column if not exists rarity text;

-- Recreación de la vista para exponer rarity con coalesce.
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
