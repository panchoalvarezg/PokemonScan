import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";
import { dualDeleteUserCard, dualUpdateUserCard } from "@/lib/pg-dual-write";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthUser(request);

    if (!user) {
      return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("user_cards")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    // Replica el delete al Docker (best-effort).
    await dualDeleteUserCard(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "No se pudo eliminar la carta." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/inventory/[id] – actualiza condición, cantidad o notas.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getAuthUser(request);

    if (!user) {
      return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    const allowed: Record<string, unknown> = {};
    if (body.condition) allowed.condition = body.condition;
    if (body.quantity != null) allowed.quantity = Math.max(1, Number(body.quantity));
    if (body.notes !== undefined) allowed.notes = body.notes;
    if (body.for_trade !== undefined) allowed.for_trade = Boolean(body.for_trade);

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
    }
    allowed.updated_at = new Date().toISOString();

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_cards")
      .update(allowed)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (error) throw error;

    // Replica el patch al Docker (best-effort). `allowed` sólo contiene las
    // columnas whitelisted, así que es seguro pasarlo tal cual.
    await dualUpdateUserCard(id, allowed);

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "No se pudo actualizar la carta." },
      { status: 500 }
    );
  }
}
