import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback para OAuth (Google, etc.). Supabase redirige aquí con ?code=...
 * y nosotros lo intercambiamos por una sesión.
 *
 * Notas: como el cliente del navegador guarda la sesión en localStorage
 * (ver `lib/supabase/client.ts`), esta redirección sólo sirve para que
 * Google cierre el flujo OAuth y vuelva al dominio. El intercambio de código
 * por sesión también lo hace el cliente en /auth/callback si hace falta.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
      console.error("OAuth exchange error:", error.message);
    } catch (err) {
      console.error("OAuth exchange threw:", err);
    }
  }

  // Fallback: deja que el cliente procese el code (?code sigue en la URL).
  return NextResponse.redirect(`${origin}${next}`);
}
