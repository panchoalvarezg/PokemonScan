-- 002_policies.sql
-- Enable RLS + políticas por fila. Idempotente: se puede volver a correr
-- sin provocar 42710 (policy already exists).
--
-- Postgres no soporta `create policy if not exists`, así que usamos
-- `drop policy if exists` antes de cada `create policy`.

alter table public.profiles enable row level security;
alter table public.card_catalog enable row level security;
alter table public.user_cards enable row level security;
alter table public.scan_uploads enable row level security;
alter table public.price_snapshots enable row level security;

-- ---------- profiles ----------
drop policy if exists "Profiles are readable by owner" on public.profiles;
create policy "Profiles are readable by owner"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Profiles are insertable by owner" on public.profiles;
create policy "Profiles are insertable by owner"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Profiles are updatable by owner" on public.profiles;
create policy "Profiles are updatable by owner"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id);

-- ---------- card_catalog ----------
drop policy if exists "Card catalog readable by authenticated users" on public.card_catalog;
create policy "Card catalog readable by authenticated users"
on public.card_catalog for select
to authenticated
using (true);

-- ---------- user_cards ----------
drop policy if exists "User cards readable by owner" on public.user_cards;
create policy "User cards readable by owner"
on public.user_cards for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "User cards insertable by owner" on public.user_cards;
create policy "User cards insertable by owner"
on public.user_cards for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "User cards updatable by owner" on public.user_cards;
create policy "User cards updatable by owner"
on public.user_cards for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "User cards deletable by owner" on public.user_cards;
create policy "User cards deletable by owner"
on public.user_cards for delete
to authenticated
using ((select auth.uid()) = user_id);

-- ---------- scan_uploads ----------
drop policy if exists "Scan uploads readable by owner" on public.scan_uploads;
create policy "Scan uploads readable by owner"
on public.scan_uploads for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Scan uploads insertable by owner" on public.scan_uploads;
create policy "Scan uploads insertable by owner"
on public.scan_uploads for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- ---------- price_snapshots ----------
drop policy if exists "Price snapshots readable by authenticated users" on public.price_snapshots;
create policy "Price snapshots readable by authenticated users"
on public.price_snapshots for select
to authenticated
using (true);

-- ---------- limpieza de políticas huérfanas con otros nombres ----------
-- Si alguna vez creaste políticas con nombres distintos (ej. "Users can view
-- their own cards"), este bloque las elimina para evitar duplicados. Añade
-- aquí cualquier otra que aparezca en tu BD con el query:
--   select tablename, policyname from pg_policies where schemaname='public';
drop policy if exists "Users can view their own cards"     on public.user_cards;
drop policy if exists "Users can insert their own cards"   on public.user_cards;
drop policy if exists "Users can update their own cards"   on public.user_cards;
drop policy if exists "Users can delete their own cards"   on public.user_cards;
drop policy if exists "Users can view their own profile"   on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
