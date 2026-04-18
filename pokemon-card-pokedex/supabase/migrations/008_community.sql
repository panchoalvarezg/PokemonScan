-- 008_community.sql
--
-- Apartado "Comunidad": permite que los usuarios publiquen su carpeta de
-- intercambios (cartas con for_trade = true) para que otros usuarios
-- logueados puedan verlas, junto con su @handle, ubicación (país · ciudad)
-- y, opcionalmente, un contacto público (Discord).
--
-- Decisiones:
--   1. El @handle reutiliza `profiles.username` (ya es UNIQUE).
--   2. Una nueva columna `is_public` (bool, default false) es el opt-in
--      explícito para aparecer en Comunidad. Sin este flag en true, el
--      perfil NO es visible para otros.
--   3. Creamos dos VIEWs (`community_profiles`, `community_cards`) que
--      proyectan sólo columnas seguras (nunca email ni phone). Las vistas
--      corren con los privilegios de su dueño (postgres) y bypassan RLS,
--      por eso el filtrado por `is_public` y `for_trade` se hace DENTRO
--      de la vista — nunca como responsabilidad del caller.
--   4. Los GRANTs a `authenticated` y `anon` habilitan que el cliente
--      Supabase (tanto en server components como API routes con la
--      anon key) pueda leer las vistas.
--
-- Idempotente: usa `add column if not exists` y `drop view if exists ...
-- cascade` + `create view` para poder re-ejecutarse sin romperse.

-- 1) Nueva columna opt-in
alter table public.profiles
  add column if not exists is_public boolean not null default false;

-- 2) Vista pública de perfiles (sólo los que han optado y tienen @handle)
drop view if exists public.community_profiles cascade;
create view public.community_profiles as
select
  p.id,
  p.username        as handle,
  p.display_name,
  p.country,
  p.city,
  p.discord_handle,
  p.trade_notes,
  p.avatar_url,
  p.updated_at
from public.profiles p
where p.is_public = true
  and p.username is not null
  and length(trim(p.username)) > 0;

-- 3) Vista pública de cartas para intercambio (cruzando perfiles públicos)
--    Reusamos user_cards_detailed (004/007) para herencia de campos
--    enriquecidos (card_type, rarity, image_url, last_market_price).
drop view if exists public.community_cards cascade;
create view public.community_cards as
select
  uc.id,
  uc.user_id,
  p.username           as owner_handle,
  p.display_name       as owner_display_name,
  p.country            as owner_country,
  p.city               as owner_city,
  p.discord_handle     as owner_discord,
  uc.product_name,
  uc.set_name,
  uc.card_number,
  uc.card_type,
  uc.rarity,
  uc.image_url,
  uc.condition,
  uc.language,
  uc.quantity,
  uc.estimated_unit_value,
  uc.last_market_price,
  uc.notes,
  uc.created_at
from public.user_cards_detailed uc
join public.profiles p on p.id = uc.user_id
where uc.for_trade = true
  and p.is_public = true
  and p.username is not null
  and length(trim(p.username)) > 0;

-- 4) GRANTs: las vistas necesitan ser legibles por el rol que usa el
--    cliente Supabase. `authenticated` cubre usuarios logueados; `anon`
--    permite ver Comunidad sin sesión (útil para landing pública).
grant select on public.community_profiles to authenticated, anon;
grant select on public.community_cards    to authenticated, anon;

-- 5) Validación blanda del @handle: entre 3 y 20 caracteres, sólo
--    alfanuméricos + guion bajo. Lo hacemos con CHECK en vez de trigger
--    para que falle temprano en el UPDATE del /api/profile.
--    Usamos DO $$ ... $$ para poder droppear sin romper si no existe.
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'profiles'
      and constraint_name = 'profiles_username_format'
  ) then
    alter table public.profiles
      add constraint profiles_username_format
      check (
        username is null
        or username ~ '^[a-zA-Z0-9_]{3,20}$'
      );
  end if;
end;
$$;
