import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Callback para OAuth (Google, etc.). Supabase redirige aquí con ?code=...
 * y nosotros lo intercambiamos por una sesión que queda en cookies.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("OAuth exchange error:", error.message);
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
