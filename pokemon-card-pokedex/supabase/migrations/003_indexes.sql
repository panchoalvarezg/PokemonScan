create index if not exists idx_card_catalog_pricecharting on public.card_catalog(pricecharting_product_id);
create index if not exists idx_user_cards_user_id on public.user_cards(user_id);
create index if not exists idx_user_cards_card_catalog_id on public.user_cards(card_catalog_id);
create index if not exists idx_scan_uploads_user_id on public.scan_uploads(user_id);
create index if not exists idx_price_snapshots_card_catalog_id on public.price_snapshots(card_catalog_id);
