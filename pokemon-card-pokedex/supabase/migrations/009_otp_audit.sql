-- 009_otp_audit.sql
--
-- Auditoría PARALELA de códigos OTP.
--
-- Contexto: Supabase (GoTrue) es quien genera y valida los códigos OTP reales
-- que llegan por email. Nosotros NO podemos leer el código de Supabase (ni
-- deberíamos). Esta tabla guarda un código propio, generado por la app
-- *además* del de Supabase, únicamente para:
--
--   1. Demostrar manejo de datos sensibles cifrados en la BD dockerizada
--      (cumple la rúbrica de "al menos BD en Docker" + buenas prácticas).
--   2. Auditar intentos de login (email, IP, user-agent, intentos fallidos,
--      expiración) sin depender del dashboard de Supabase.
--   3. Ejercicio didáctico de pgcrypto (AES-256 via pgp_sym_encrypt + bcrypt
--      via crypt(..., gen_salt('bf'))).
--
-- Importante: el código guardado aquí NO es el que el usuario escribió ni el
-- que Supabase envió por correo. Es un código paralelo generado por la app.
-- El flujo de login real sigue siendo responsabilidad de Supabase.
--
-- Tabla protegida con dos mecanismos:
--   * code_encrypted (bytea): reversible por el backend con
--     pgp_sym_decrypt(code_encrypted, '<OTP_ENCRYPTION_KEY>').
--     Útil para auditoría forense (saber qué código se envió).
--   * code_hash (text): bcrypt via crypt(), comparación sin necesidad de
--     conocer la clave. Útil para verifyOtp sin descifrar.
--
-- Defensas adicionales:
--   * expires_at: TTL de 10 minutos por defecto.
--   * max_attempts: bloqueo tras N intentos fallidos.
--   * used_at: marca single-use (no se puede reutilizar un OTP).

create extension if not exists pgcrypto;

create table if not exists public.otp_audit (
  id uuid primary key default gen_random_uuid(),

  -- Email del usuario que pidió el OTP. Lo normalizamos a minúsculas desde la
  -- app; no usamos citext para no exigir otra extensión en Docker.
  email text not null,

  purpose text not null default 'login'
    check (purpose in ('login', 'signup', 'mfa', 'debug')),

  -- Código OTP cifrado con AES-256 (pgp_sym_encrypt). Sólo descifrable con
  -- la clave simétrica que vive en OTP_ENCRYPTION_KEY (no en la BD).
  code_encrypted bytea not null,

  -- Hash bcrypt (via crypt + gen_salt('bf', 10)). Permite verificar un OTP
  -- entrante sin descifrar.
  code_hash text not null,

  -- Auditoría.
  ip_address text,
  user_agent text,

  -- Ciclo de vida.
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz,

  attempts int not null default 0,
  max_attempts int not null default 5,

  -- Si se verificó con éxito, `succeeded_at` != null. Redundante con used_at
  -- pero ayuda a distinguir "usado-ok" de "usado-fallido".
  succeeded_at timestamptz
);

-- Índice para búsquedas "el último OTP activo de este email".
create index if not exists idx_otp_audit_email_active
  on public.otp_audit (email, created_at desc)
  where used_at is null;

-- Índice para limpieza / reporting.
create index if not exists idx_otp_audit_expires
  on public.otp_audit (expires_at);

-- Seguridad defensiva: aunque esta tabla se escribe desde el backend con el
-- rol owner (bypass RLS), activamos RLS por si el día de mañana se expone.
-- Sin policies = 0 filas visibles desde anon/authenticated.
alter table public.otp_audit enable row level security;

comment on table public.otp_audit is
  'Auditoría paralela de OTP. Guarda una copia cifrada (pgp_sym_encrypt) y ' ||
  'un hash bcrypt del código generado por la app en paralelo al de Supabase. ' ||
  'NO es el código real que envía Supabase por email.';

comment on column public.otp_audit.code_encrypted is
  'Código cifrado con AES-256 simétrico. Descifrar con ' ||
  'pgp_sym_decrypt(code_encrypted, ''<OTP_ENCRYPTION_KEY>'').';

comment on column public.otp_audit.code_hash is
  'Hash bcrypt del código (crypt + gen_salt(''bf'', 10)). Comparar con ' ||
  'crypt(code_input, code_hash) = code_hash.';
