import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para el navegador usando @supabase/ssr.
 *
 * ¿Por qué ssr y no supabase-js puro? En el flujo de OAuth con Google el
 * callback `/auth/callback/route.ts` corre en el servidor y necesita acceder
 * al `code_verifier` (PKCE) para llamar a `exchangeCodeForSession`. Ese
 * verifier lo guarda Supabase en la misma capa de storage que usa el cliente
 * que inició el flujo: si aquí usáramos supabase-js (localStorage), el
 * servidor nunca lo vería y el intercambio fallaría silenciosamente, dejando
 * al usuario sin sesión tras volver de Google.
 *
 * `createBrowserClient` guarda sesión y verifier en cookies, así que el
 * servidor los lee sin fricción. `supabase.auth.getSession()` sigue
 * funcionando igual para leer el access_token desde el cliente.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseAnonKey) {
  throw new Error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function createClient() {
  return createBrowserClient(supabaseUrl!, supabaseAnonKey!);
}
