alter table public.profiles enable row level security;
alter table public.card_catalog enable row level security;
alter table public.user_cards enable row level security;
alter table public.scan_uploads enable row level security;
alter table public.price_snapshots enable row level security;

create policy "Profiles are readable by owner"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "Profiles are insertable by owner"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

create policy "Profiles are updatable by owner"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id);

create policy "Card catalog readable by authenticated users"
on public.card_catalog for select
to authenticated
using (true);

create policy "User cards readable by owner"
on public.user_cards for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "User cards insertable by owner"
on public.user_cards for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "User cards updatable by owner"
on public.user_cards for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "User cards deletable by owner"
on public.user_cards for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Scan uploads readable by owner"
on public.scan_uploads for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Scan uploads insertable by owner"
on public.scan_uploads for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Price snapshots readable by authenticated users"
on public.price_snapshots for select
to authenticated
using (true);
