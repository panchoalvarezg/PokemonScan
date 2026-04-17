import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient, supabaseAdmin } from "@/lib/supabase/server";

async function getAuthUserId(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch (err) {
    console.error("auth.getUser failed", err);
  }

  // Fallback: permite pasar el userId por query string o body para el MVP.
  const fromQuery = request.nextUrl.searchParams.get("userId");
  if (fromQuery) return fromQuery;
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: "No hay sesión activa." },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("user_cards_detailed")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error ? error.message : "No se pudo cargar el inventario.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const authUserId = await getAuthUserId(request);
    const userId = (body?.userId as string | undefined) || authUserId;

    const externalId = body?.externalId as string | undefined;
    const productName = body?.productName as string | undefined;
    const setName = (body?.setName as string | null | undefined) ?? null;
    const cardNumber = (body?.cardNumber as string | null | undefined) ?? null;
    const cardType = (body?.cardType as string | null | undefined) ?? null;
    const imageUrl = (body?.imageUrl as string | null | undefined) ?? null;
    const condition = (body?.condition as string | undefined) || "near_mint";
    const quantity = Math.max(1, Number(body?.quantity || 1));
    const estimatedUnitValue = Math.max(0, Number(body?.estimatedUnitValue || 0));

    if (!userId) {
      return NextResponse.json(
        { error: "No hay sesión activa." },
        { status: 401 }
      );
    }

    if (!externalId || !productName) {
      return NextResponse.json(
        { error: "Faltan datos (externalId, productName)." },
        { status: 400 }
      );
    }

    // 1) Busca o crea la entrada en card_catalog.
    const { data: existingCatalog, error: lookupError } = await supabaseAdmin
      .from("card_catalog")
      .select("id")
      .eq("pricecharting_product_id", externalId)
      .maybeSingle();

    if (lookupError) throw lookupError;

    let catalogId = existingCatalog?.id as string | undefined;

    if (!catalogId) {
      const { data: insertedCatalog, error: insertCatalogError } = await supabaseAdmin
        .from("card_catalog")
        .insert({
          pricecharting_product_id: externalId,
          product_name: productName,
          set_name: setName,
          card_number: cardNumber,
          card_type: cardType,
          official_image_url: imageUrl,
          last_market_price: estimatedUnitValue || null,
          price_updated_at: estimatedUnitValue ? new Date().toISOString() : null,
        })
        .select("id")
        .single();

      if (insertCatalogError) throw insertCatalogError;
      catalogId = insertedCatalog.id;
    } else {
      // Actualiza metadata y precio si venía en la request.
      await supabaseAdmin
        .from("card_catalog")
        .update({
          product_name: productName,
          set_name: setName,
          card_number: cardNumber,
          card_type: cardType,
          official_image_url: imageUrl,
          ...(estimatedUnitValue
            ? {
                last_market_price: estimatedUnitValue,
                price_updated_at: new Date().toISOString(),
              }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", catalogId);
    }

    // 2) Inserta la carta en el inventario del usuario.
    const { data, error } = await supabaseAdmin
      .from("user_cards")
      .insert({
        user_id: userId,
        card_catalog_id: catalogId,
        condition,
        quantity,
        estimated_unit_value: estimatedUnitValue,
        set_name: setName,
        card_number: cardNumber,
        card_type: cardType,
        image_url: imageUrl,
      })
      .select("*")
      .single();

    if (error) throw error;

    // 3) Registra snapshot de precio para la línea temporal.
    if (estimatedUnitValue > 0) {
      await supabaseAdmin.from("price_snapshots").insert({
        card_catalog_id: catalogId,
        market_price: estimatedUnitValue,
      });
    }

    return NextResponse.json({
      message: "Carta guardada correctamente.",
      item: data,
    });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo guardar la carta en inventario.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
