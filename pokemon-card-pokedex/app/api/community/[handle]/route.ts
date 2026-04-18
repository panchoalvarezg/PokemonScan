import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/community/[handle]
 *
 * Devuelve el detalle de un perfil público: datos del usuario + todas sus
 * cartas marcadas para intercambio. 404 si el handle no existe o el
 * usuario no está publicado.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }> };

export async function GET(_request: NextRequest, ctx: Params) {
  try {
    const { handle } = await ctx.params;
    if (!handle || typeof handle !== "string") {
      return NextResponse.json({ error: "Handle inválido." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("community_profiles")
      .select(
        "id, handle, display_name, country, city, discord_handle, trade_notes, avatar_url, updated_at"
      )
      .eq("handle", handle)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json(
        { error: "Ese usuario no existe o no ha publicado su carpeta." },
        { status: 404 }
      );
    }

    const { data: cards, error: cardsError } = await admin
      .from("community_cards")
      .select(
        "id, product_name, set_name, card_number, card_type, rarity, image_url, condition, language, quantity, estimated_unit_value, last_market_price, notes, created_at"
      )
      .eq("user_id", profile.id)
      .order("last_market_price", { ascending: false, nullsFirst: false });

    if (cardsError) throw cardsError;

    const rows = (cards ?? []).map((c) => ({
      id: c.id,
      productName: c.product_name,
      setName: c.set_name,
      cardNumber: c.card_number,
      cardType: c.card_type,
      rarity: c.rarity,
      imageUrl: c.image_url,
      condition: c.condition,
      language: c.language,
      quantity: Number(c.quantity ?? 1),
      unitValue: Number(c.last_market_price ?? c.estimated_unit_value ?? 0),
      notes: c.notes,
      createdAt: c.created_at,
    }));

    const totalValue = rows.reduce(
      (acc, r) => acc + r.unitValue * r.quantity,
      0
    );
    const totalCards = rows.reduce((acc, r) => acc + r.quantity, 0);

    return NextResponse.json({
      profile: {
        id: profile.id,
        handle: profile.handle,
        displayName: profile.display_name,
        country: profile.country,
        city: profile.city,
        discord: profile.discord_handle,
        tradeNotes: profile.trade_notes,
        avatarUrl: profile.avatar_url,
        updatedAt: profile.updated_at,
      },
      cards: rows,
      totals: {
        distinct: rows.length,
        cards: totalCards,
        value: Number(totalValue.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("GET /api/community/[handle] error:", error);
    const msg =
      error instanceof Error ? error.message : "Error cargando el perfil.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
