import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback para OAuth (Google, etc.).
 *
 * Flujo PKCE: Supabase redirige aquí con `?code=...`. Hacemos el intercambio
 * en el servidor usando @supabase/ssr, que escribe las cookies de sesión
 * (`sb-*-auth-token`) en la respuesta. Como el cliente del navegador también
 * usa `createBrowserClient` de @supabase/ssr, ambos comparten cookies y la
 * sesión queda visible inmediatamente tras redirigir al destino.
 *
 * Si el intercambio falla (verifier perdido, code caducado, error del
 * proveedor, etc.) redirigimos a /login con un parámetro `error` en vez de
 * enviarlo a /dashboard sin sesión, que es la experiencia rota anterior.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");
  const next = searchParams.get("next") ?? "/dashboard";

  if (providerError) {
    const url = new URL(`${origin}/login`);
    url.searchParams.set("error", providerError);
    return NextResponse.redirect(url);
  }

  if (!code) {
    const url = new URL(`${origin}/login`);
    url.searchParams.set("error", "Falta el código OAuth en el callback.");
    return NextResponse.redirect(url);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("OAuth exchange error:", error.message);
      const url = new URL(`${origin}/login`);
      url.searchParams.set("error", `OAuth: ${error.message}`);
      return NextResponse.redirect(url);
    }
    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error("OAuth exchange threw:", err);
    const url = new URL(`${origin}/login`);
    url.searchParams.set(
      "error",
      err instanceof Error ? err.message : "Error desconocido en OAuth."
    );
    return NextResponse.redirect(url);
  }
}
