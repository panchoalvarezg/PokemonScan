-- Stub del esquema `auth` de Supabase para que las migraciones existentes se
-- apliquen sobre un Postgres plano dentro del contenedor Docker.
--
-- Supabase provee auth.users, auth.uid(), auth.role() y auth.jwt() como parte
-- de su servicio gestionado. Fuera de Supabase estos objetos no existen, así
-- que creamos lo mínimo para que los FK y las policies con `auth.uid()` de
-- 001_init.sql y 002_policies.sql no fallen.
--
-- Notas:
--   * Este stub NO implementa autenticación real: auth.uid() devuelve NULL.
--   * En local la app se conecta con service_role (ignora RLS), así que las
--     policies son efectivamente inertes. Para probar RLS, inserta filas a
--     mano en auth.users y usa GRANTs/roles manualmente.
--   * Si luego migras a la pila completa de Supabase (via supabase-cli),
--     este stub desaparece y queda el auth real.

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$ select null::uuid $$;

create or replace function auth.role()
returns text
language sql stable
as $$ select null::text $$;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$ select null::jsonb $$;
