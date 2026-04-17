"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Obtiene el access_token actual del navegador (guardado en localStorage por
 * @supabase/supabase-js) para enviárselo a las API routes como
 * `Authorization: Bearer <token>`.
 */
async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch (err) {
    console.error("getAccessToken error:", err);
    return null;
  }
}

/**
 * Fetch con cabecera Authorization: Bearer <token> añadida automáticamente.
 * Uso idéntico a `fetch`.
 */
export async function apiFetch(input: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && !headers.has("content-type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(input, { ...init, headers });
}
