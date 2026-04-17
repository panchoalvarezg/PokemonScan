import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware vacío: el cliente guarda la sesión en localStorage y las API
 * routes resuelven el usuario mediante `Authorization: Bearer <token>` (ver
 * `lib/auth.ts`). Se deja la función y el matcher por si añadimos en el
 * futuro protección por rutas.
 */
export async function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
