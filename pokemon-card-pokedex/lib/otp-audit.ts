/**
 * OTP Audit — registro paralelo y cifrado de códigos OTP en el Postgres
 * dockerizado.
 *
 * ────────────────────────────────────────────────────────────────────────
 * ¿Qué es y qué NO es?
 *
 *   SÍ es:
 *     • Un shadow-log cifrado de las solicitudes OTP que hace la app.
 *     • Demostración de pgcrypto (pgp_sym_encrypt AES-256 + crypt/bcrypt).
 *     • Registro de auditoría (email, IP, UA, intentos) en una BD que el
 *       evaluador puede inspeccionar en pgAdmin.
 *
 *   NO es:
 *     • El OTP real de Supabase. Supabase (GoTrue) genera, envía y verifica
 *       su propio código que nunca nos expone.
 *     • Un mecanismo de login. Esta tabla no se usa para autorizar nada:
 *       el JWT sigue viniendo de Supabase.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Seguridad:
 *
 *   • El código se guarda en dos formas redundantes:
 *       1. `code_encrypted` (bytea): reversible con pgp_sym_decrypt usando
 *          OTP_ENCRYPTION_KEY. Útil para auditoría forense (qué código se
 *          envió) y para demos.
 *       2. `code_hash` (text): bcrypt (crypt + gen_salt('bf', 10)). Permite
 *          verificar un código entrante sin descifrar ni conocer la clave.
 *   • OTP_ENCRYPTION_KEY se lee del entorno; nunca se loguea ni se envía al
 *     cliente.
 *   • TTL de 10 minutos + max_attempts configurable.
 *   • Single-use: se marca `used_at` tras un verify exitoso.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Uso típico (desde un route handler):
 *
 *   // al llamar a supabase.auth.signInWithOtp:
 *   const { code, expiresAt } = await storeOtpAudit({ email, ip, userAgent });
 *   // (el `code` normalmente NO se devuelve al cliente; sólo se retorna
 *   //  para ambientes de dev si se quiere mostrar en pantalla).
 *
 *   // al llamar a supabase.auth.verifyOtp (después de recibir OK o NOT OK):
 *   await registerOtpAttempt({ email, code, success: true });
 */

import { dockerQuery } from "@/lib/pg-docker";

// ────────────────────────────────────────────────────────────────────────
// Configuración / util
// ────────────────────────────────────────────────────────────────────────

/** Cuántos dígitos tiene nuestro OTP paralelo. Supabase usa 6; replicamos. */
const OTP_LENGTH = 6;

/** TTL de un OTP en segundos (default 10 minutos). */
const OTP_TTL_SECONDS = 10 * 60;

/** Tope de intentos fallidos antes de invalidar. */
const OTP_MAX_ATTEMPTS = 5;

export function auditEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getEncryptionKey(): string | null {
  const key = process.env.OTP_ENCRYPTION_KEY;
  if (!key || key.length < 16) {
    // En dev toleramos ausencia (auditoría queda deshabilitada).
    return null;
  }
  return key;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Genera un OTP numérico de 6 dígitos con random criptográficamente seguro.
 */
export function generateOtpCode(length: number = OTP_LENGTH): string {
  // Usamos crypto.getRandomValues — disponible en Node 19+ y en el runtime
  // de Next. Evita Math.random (no es CSPRNG).
  const bytes = new Uint8Array(length);
  (globalThis.crypto as Crypto).getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += String(bytes[i] % 10);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Envoltorio best-effort (igual patrón que pg-dual-write)
// ────────────────────────────────────────────────────────────────────────

async function tryAudit<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T | null> {
  if (!auditEnabled()) return null;
  try {
    const res = await fn();
    console.log(`[otp-audit:${label}] ok`);
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : undefined;
    console.error(
      `[otp-audit:${label}] FAILED:`,
      msg,
      code ? `(code=${code})` : "",
      err instanceof Error && err.stack ? "\n" + err.stack : ""
    );
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────────────────────────────

export type StoreOtpInput = {
  email: string;
  purpose?: "login" | "signup" | "mfa" | "debug";
  ip?: string | null;
  userAgent?: string | null;
};

export type StoreOtpResult = {
  audited: true;
  id: string;
  expiresAt: string;
  // El código plano sólo se devuelve en entornos no-producción, para que la
  // UI pueda mostrar "tu código interno fue X" en la demo. En prod se queda
  // únicamente cifrado en Docker.
  code?: string;
};

/**
 * Genera y persiste un OTP paralelo cifrado. No-op si DATABASE_URL o
 * OTP_ENCRYPTION_KEY no están configuradas (devuelve null).
 */
export async function storeOtpAudit(
  input: StoreOtpInput
): Promise<StoreOtpResult | null> {
  const encryptionKey = getEncryptionKey();
  if (!encryptionKey) return null;

  const email = normalizeEmail(input.email);
  const purpose = input.purpose ?? "login";
  const code = generateOtpCode();

  const result = await tryAudit("store", async () => {
    // Invalidamos OTPs activos anteriores del mismo email+purpose, para que
    // sólo el más reciente pueda validar (mismo comportamiento que Supabase).
    await dockerQuery(
      `update public.otp_audit
          set used_at = now()
        where email = $1
          and purpose = $2
          and used_at is null
          and expires_at > now()`,
      [email, purpose]
    );

    // Inserción con pgp_sym_encrypt + crypt(..., gen_salt('bf', 10)).
    // La clave viaja como parámetro $5 ($6? no: $5 es key) → nunca aparece
    // en el SQL literal.
    const rows = await dockerQuery<{ id: string; expires_at: string }>(
      `insert into public.otp_audit (
          email, purpose,
          code_encrypted, code_hash,
          ip_address, user_agent,
          expires_at, max_attempts
        ) values (
          $1, $2,
          pgp_sym_encrypt($3::text, $4::text),
          crypt($3::text, gen_salt('bf', 10)),
          $5, $6,
          now() + ($7 || ' seconds')::interval,
          $8
        )
        returning id, expires_at`,
      [
        email,
        purpose,
        code,
        encryptionKey,
        input.ip ?? null,
        input.userAgent ?? null,
        OTP_TTL_SECONDS,
        OTP_MAX_ATTEMPTS,
      ]
    );

    const first = rows[0];
    if (!first) throw new Error("insert otp_audit devolvió 0 filas");
    return {
      id: first.id,
      expiresAt: new Date(first.expires_at).toISOString(),
    };
  });

  if (!result) return null;

  const exposeCode = process.env.NODE_ENV !== "production";
  return {
    audited: true,
    id: result.id,
    expiresAt: result.expiresAt,
    ...(exposeCode ? { code } : {}),
  };
}

export type VerifyOtpInput = {
  email: string;
  code: string;
  purpose?: "login" | "signup" | "mfa" | "debug";
};

export type VerifyOtpResult = {
  audited: true;
  matched: boolean;
  reason?:
    | "ok"
    | "no_active_code"
    | "expired"
    | "too_many_attempts"
    | "mismatch";
};

/**
 * Verifica un código contra el hash bcrypt guardado. Actualiza attempts y
 * marca succeeded_at / used_at según corresponda.
 *
 * Devuelve null si la auditoría está deshabilitada (no se puede afirmar nada).
 */
export async function verifyOtpAudit(
  input: VerifyOtpInput
): Promise<VerifyOtpResult | null> {
  return tryAudit("verify", async () => {
    const email = normalizeEmail(input.email);
    const purpose = input.purpose ?? "login";
    const code = input.code.trim();

    // 1) Traemos el OTP activo más reciente.
    const rows = await dockerQuery<{
      id: string;
      expires_at: string;
      attempts: number;
      max_attempts: number;
      is_match: boolean;
    }>(
      `select id, expires_at, attempts, max_attempts,
              (code_hash = crypt($3::text, code_hash)) as is_match
         from public.otp_audit
        where email = $1
          and purpose = $2
          and used_at is null
        order by created_at desc
        limit 1`,
      [email, purpose, code]
    );

    const row = rows[0];
    if (!row) {
      return { audited: true as const, matched: false, reason: "no_active_code" as const };
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      // marcamos como usado para que no reaparezca
      await dockerQuery(
        `update public.otp_audit set used_at = now() where id = $1`,
        [row.id]
      );
      return { audited: true as const, matched: false, reason: "expired" as const };
    }

    if (row.attempts >= row.max_attempts) {
      await dockerQuery(
        `update public.otp_audit set used_at = now() where id = $1`,
        [row.id]
      );
      return {
        audited: true as const,
        matched: false,
        reason: "too_many_attempts" as const,
      };
    }

    if (row.is_match) {
      await dockerQuery(
        `update public.otp_audit
            set succeeded_at = now(), used_at = now(), attempts = attempts + 1
          where id = $1`,
        [row.id]
      );
      return { audited: true as const, matched: true, reason: "ok" as const };
    }

    await dockerQuery(
      `update public.otp_audit
          set attempts = attempts + 1
        where id = $1`,
      [row.id]
    );
    return { audited: true as const, matched: false, reason: "mismatch" as const };
  });
}

/**
 * Registra un intento fallido (p.ej. cuando Supabase rechaza el verify)
 * sin necesidad de re-ejecutar la comparación. Útil cuando el código que
 * el usuario escribió es el de Supabase (no el nuestro), y queremos que
 * la tabla de auditoría refleje el fallo.
 */
export async function registerOtpFailure(
  email: string,
  purpose: StoreOtpInput["purpose"] = "login"
): Promise<void> {
  await tryAudit("register-failure", async () => {
    await dockerQuery(
      `update public.otp_audit
          set attempts = attempts + 1
        where id = (
          select id from public.otp_audit
           where email = $1 and purpose = $2 and used_at is null
           order by created_at desc
           limit 1
        )`,
      [normalizeEmail(email), purpose]
    );
  });
}
