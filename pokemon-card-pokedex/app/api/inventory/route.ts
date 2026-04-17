import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const userId = body?.userId as string | undefined;
    const externalId = body?.externalId as string | undefined;
    const productName = body?.productName as string | undefined;
    const setName = body?.setName as string | undefined;
    const cardNumber = body?.cardNumber as string | null | undefined;
    const condition = (body?.condition as string | undefined) || "ungraded";
    const quantity = Number(body?.quantity || 1);
    const estimatedUnitValue = Number(body?.estimatedUnitValue || 0);

    if (!userId || !externalId || !productName) {
      return NextResponse.json(
        { error: "Faltan datos para guardar en inventario." },
        { status: 400 }
      );
    }

    const { data: existingCatalog, error: lookupError } = await supabaseAdmin
      .from("card_catalog")
      .select("id")
      .eq("pricecharting_product_id", externalId)
      .maybeSingle();

    if (lookupError) throw lookupError;

    let catalogId = existingCatalog?.id;

    if (!catalogId) {
      const { data: insertedCatalog, error: insertCatalogError } =
        await supabaseAdmin
          .from("card_catalog")
          .insert({
            pricecharting_product_id: externalId,
            product_name: productName,
            set_name: setName || null,
            card_number: cardNumber || null,
            source: "pricecharting",
          })
          .select("id")
          .single();

      if (insertCatalogError) throw insertCatalogError;
      catalogId = insertedCatalog.id;
    }

    const { data, error } = await supabaseAdmin
      .from("user_cards")
      .insert({
        user_id: userId,
        card_catalog_id: catalogId,
        condition,
        quantity,
        estimated_unit_value: estimatedUnitValue,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      message: "Carta guardada correctamente.",
      item: data,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "No se pudo guardar la carta en inventario." },
      { status: 500 }
    );
  }
}
