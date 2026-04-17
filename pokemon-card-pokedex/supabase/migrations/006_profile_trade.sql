-- Migración 006: amplía profiles con datos de contacto para intercambios.
--
-- La tabla original sólo tenía email/username/full_name/avatar_url. Para que
-- los usuarios puedan tratar sus Pokeintercambios necesitan exponer mínimos:
-- nombre público (nick), ubicación, handle de Discord y teléfono/WhatsApp.
-- Todos los campos son opcionales — la vista /profile es puramente informativa.

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists country text,
  add column if not exists city text,
  add column if not exists discord_handle text,
  add column if not exists phone text,
  add column if not exists trade_notes text,
  add column if not exists updated_at timestamptz not null default now();

-- Trigger para mantener updated_at cuando se edita el perfil.
create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated on public.profiles;
create trigger profiles_touch_updated
  before update on public.profiles
  for each row execute procedure public.touch_profiles_updated_at();
