import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";

/**
 * Convierte errores de Supabase (PostgrestError) en un mensaje legible para
 * el frontend incluyendo hint/details cuando existan.
 */
function formatError(err: unknown): string {
  if (!err) return "Error desconocido.";
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts = [
      e.message && String(e.message),
      e.details && `Detalle: ${e.details}`,
      e.hint && `Sugerencia: ${e.hint}`,
      e.code && `Código: ${e.code}`,
    ].filter(Boolean);
    if (parts.length) return parts.join(" · ");
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "Error desconocido.";
  }
}

/**
 * Asegura que exista una fila en `profiles` para el user_id. Usuarios creados
 * vía Google OAuth a veces no tienen la fila si el trigger falló.
 */
async function ensureProfile(userId: string, email: string | null) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .upsert(
      { id: userId, email: email ?? undefined },
      { onConflict: "id", ignoreDuplicates: false }
    );
  if (error) {
    console.error("ensureProfile error:", error);
  }
}

function isMissingColumn(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const msg = String(e.message ?? "").toLowerCase();
  return (
    String(e.code ?? "") === "PGRST204" ||
    String(e.code ?? "") === "42703" ||
    (msg.includes("column") && (msg.includes("does not exist") || msg.includes("no existe")))
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_cards_detailed")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    console.error("GET /api/inventory error:", error);
    return NextResponse.json({ error: formatError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const authUser = await getAuthUser(request);
    const userId = (body?.userId as string | undefined) || authUser?.id || null;
    const email = authUser?.email ?? null;

    const externalId = body?.externalId as string | undefined;
    const productName = body?.productName as string | undefined;
    const setName = (body?.setName as string | null | undefined) ?? null;
    const cardNumber = (body?.cardNumber as string | null | undefined) ?? null;
    const cardType = (body?.cardType as string | null | undefined) ?? null;
    const rarity = (body?.rarity as string | null | undefined) ?? null;
    const imageUrl = (body?.imageUrl as string | null | undefined) ?? null;
    const condition = (body?.condition as string | undefined) || "near_mint";
    const quantity = Math.max(1, Number(body?.quantity || 1));
    const estimatedUnitValue = Math.max(0, Number(body?.estimatedUnitValue || 0));

    if (!userId) {
      return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    }
    if (!externalId || !productName) {
      return NextResponse.json(
        { error: "Faltan datos (externalId, productName)." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 0) Garantiza que el usuario tenga fila en profiles (FK de user_cards).
    await ensureProfile(userId, email);

    // 1) Busca o crea la entrada en card_catalog.
    const { data: existingCatalog, error: lookupError } = await admin
      .from("card_catalog")
      .select("id")
      .eq("pricecharting_product_id", externalId)
      .maybeSingle();

    if (lookupError) throw lookupError;

    let catalogId = existingCatalog?.id as string | undefined;

    const catalogBase = {
      pricecharting_product_id: externalId,
      product_name: productName,
      set_name: setName,
      card_number: cardNumber,
      official_image_url: imageUrl,
    };
    const catalogExtras = {
      card_type: cardType,
      rarity: rarity,
      last_market_price: estimatedUnitValue || null,
      price_updated_at: estimatedUnitValue ? new Date().toISOString() : null,
    };

    if (!catalogId) {
      let insertRes = await admin
        .from("card_catalog")
        .insert({ ...catalogBase, ...catalogExtras })
        .select("id")
        .single();

      if (insertRes.error && isMissingColumn(insertRes.error)) {
        console.warn(
          "card_catalog: columnas nuevas ausentes, reintentando sin ellas. Aplica la migración 004."
        );
        insertRes = await admin
          .from("card_catalog")
          .insert(catalogBase)
          .select("id")
          .single();
      }

      if (insertRes.error) throw insertRes.error;
      catalogId = insertRes.data.id;
    } else {
      let updateRes = await admin
        .from("card_catalog")
        .update({
          ...catalogBase,
          ...catalogExtras,
          updated_at: new Date().toISOString(),
        })
        .eq("id", catalogId);
      if (updateRes.error && isMissingColumn(updateRes.error)) {
        updateRes = await admin
          .from("card_catalog")
          .update({ ...catalogBase, updated_at: new Date().toISOString() })
          .eq("id", catalogId);
      }
      if (updateRes.error) console.error("card_catalog update warn:", updateRes.error);
    }

    // 2) Inserta la carta en el inventario del usuario.
    const userCardFull = {
      user_id: userId,
      card_catalog_id: catalogId,
      condition,
      quantity,
      estimated_unit_value: estimatedUnitValue,
      set_name: setName,
      card_number: cardNumber,
      card_type: cardType,
      rarity: rarity,
      image_url: imageUrl,
    };
    const userCardBasic = {
      user_id: userId,
      card_catalog_id: catalogId,
      condition,
      quantity,
      estimated_unit_value: estimatedUnitValue,
      image_url: imageUrl,
    };

    let userCardRes = await admin
      .from("user_cards")
      .insert(userCardFull)
      .select("*")
      .single();

    if (userCardRes.error && isMissingColumn(userCardRes.error)) {
      console.warn("user_cards: columnas nuevas ausentes, reintentando sin ellas.");
      userCardRes = await admin
        .from("user_cards")
        .insert(userCardBasic)
        .select("*")
        .single();
    }

    if (userCardRes.error) throw userCardRes.error;

    // 3) Registra snapshot de precio (si hay valor).
    if (estimatedUnitValue > 0 && catalogId) {
      const { error: snapshotErr } = await admin
        .from("price_snapshots")
        .insert({
          card_catalog_id: catalogId,
          market_price: estimatedUnitValue,
        });
      if (snapshotErr) console.error("price_snapshot warn:", snapshotErr);
    }

    return NextResponse.json({
      message: "Carta guardada correctamente.",
      item: userCardRes.data,
    });
  } catch (error) {
    console.error("POST /api/inventory error:", error);
    return NextResponse.json({ error: formatError(error) }, { status: 500 });
  }
}
