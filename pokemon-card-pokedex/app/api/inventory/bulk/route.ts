import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";

/**
 * PATCH /api/inventory/bulk
 *
 * Actualiza varias cartas del inventario a la vez. Hoy sólo soporta
 * `for_trade`, que es lo que necesita la UI de selección múltiple para
 * enviar cartas a la carpeta de Intercambios.
 *
 * Body esperado:
 *   { ids: string[], for_trade?: boolean }
 *
 * Nota de seguridad: filtramos por `user_id` del token además de por los ids,
 * así un cliente malicioso no puede actualizar cartas de otra cuenta aunque
 * use el service-role client en el servidor.
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const ids: unknown = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "Debes enviar un array 'ids' con al menos un id." },
        { status: 400 }
      );
    }
    // Saneamos para evitar que valores no-string se cuelen al WHERE IN.
    const cleanIds = ids.filter((v): v is string => typeof v === "string");
    if (cleanIds.length === 0) {
      return NextResponse.json(
        { error: "Los ids enviados no son válidos." },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = {};
    if (body.for_trade !== undefined) {
      patch.for_trade = Boolean(body.for_trade);
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No hay campos válidos para actualizar." },
        { status: 400 }
      );
    }
    patch.updated_at = new Date().toISOString();

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_cards")
      .update(patch)
      .in("id", cleanIds)
      .eq("user_id", user.id)
      .select("id, for_trade");

    if (error) throw error;

    return NextResponse.json({
      updated: data?.length ?? 0,
      requested: cleanIds.length,
      items: data ?? [],
    });
  } catch (error) {
    console.error("PATCH /api/inventory/bulk error:", error);
    const msg =
      error instanceof Error
        ? error.message
        : "No se pudo actualizar el inventario.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
