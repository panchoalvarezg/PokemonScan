import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuthUser = {
  id: string;
  email: string | null;
};

/**
 * Resuelve el usuario autenticado a partir de la cabecera
 * `Authorization: Bearer <access_token>` que el cliente envía desde
 * `lib/supabase/client.ts` (el access_token se guarda en localStorage).
 *
 * Fallback: acepta también `?userId=` como query param para facilitar
 * peticiones locales/test. En producción, el frontend siempre mandará el
 * Bearer token.
 */
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();

    if (token) {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data.user) {
        return { id: data.user.id, email: data.user.email ?? null };
      }
      if (error) {
        console.warn("auth.getUser(bearer) error:", error.message);
      }
    }
  } catch (err) {
    console.error("getAuthUser failed", err);
  }

  const fromQuery = request.nextUrl.searchParams.get("userId");
  if (fromQuery) return { id: fromQuery, email: null };

  return null;
}
