import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/community
 *
 * Devuelve la lista de perfiles públicos (is_public = true) junto con:
 *   - @handle
 *   - display_name
 *   - country / city
 *   - discord_handle (opcional)
 *   - avatar_url
 *   - count de cartas disponibles para intercambio
 *   - valor total estimado de esas cartas
 *   - preview de hasta 4 imágenes de cartas
 *
 * No requiere sesión — cualquiera puede explorar Comunidad, pero las
 * vistas SQL (`community_profiles`, `community_cards`) sólo exponen
 * datos de perfiles que han optado explícitamente.
 */
export const dynamic = "force-dynamic";

type CommunityProfileRow = {
  id: string;
  handle: string;
  display_name: string | null;
  country: string | null;
  city: string | null;
  discord_handle: string | null;
  trade_notes: string | null;
  avatar_url: string | null;
  updated_at: string | null;
};

type CommunityCardRow = {
  id: string;
  user_id: string;
  image_url: string | null;
  quantity: number | string | null;
  estimated_unit_value: number | string | null;
  last_market_price: number | string | null;
};

export async function GET(_request: NextRequest) {
  try {
    const admin = createAdminClient();

    const [{ data: profiles, error: profilesError }, { data: cards, error: cardsError }] =
      await Promise.all([
        admin
          .from("community_profiles")
          .select(
            "id, handle, display_name, country, city, discord_handle, trade_notes, avatar_url, updated_at"
          )
          .order("updated_at", { ascending: false }),
        admin
          .from("community_cards")
          .select(
            "id, user_id, image_url, quantity, estimated_unit_value, last_market_price"
          ),
      ]);

    if (profilesError) throw profilesError;
    if (cardsError) throw cardsError;

    const rows = (profiles ?? []) as CommunityProfileRow[];
    const allCards = (cards ?? []) as CommunityCardRow[];

    // Agrupamos cartas por user_id para construir summary rápido.
    const byUser = new Map<
      string,
      { count: number; value: number; previews: string[] }
    >();
    for (const card of allCards) {
      const key = card.user_id;
      if (!key) continue;
      const entry =
        byUser.get(key) ?? { count: 0, value: 0, previews: [] };

      const qty = Number(card.quantity ?? 1);
      // Preferimos last_market_price (reflejo vivo) sobre el unit_value
      // guardado en user_cards, que puede estar desfasado.
      const unit = Number(
        card.last_market_price ?? card.estimated_unit_value ?? 0
      );
      entry.count += Number.isFinite(qty) ? qty : 1;
      entry.value += (Number.isFinite(unit) ? unit : 0) * (Number.isFinite(qty) ? qty : 1);

      if (entry.previews.length < 4 && card.image_url) {
        entry.previews.push(card.image_url);
      }

      byUser.set(key, entry);
    }

    const result = rows.map((p) => {
      const s = byUser.get(p.id) ?? { count: 0, value: 0, previews: [] };
      return {
        id: p.id,
        handle: p.handle,
        displayName: p.display_name,
        country: p.country,
        city: p.city,
        discord: p.discord_handle,
        tradeNotes: p.trade_notes,
        avatarUrl: p.avatar_url,
        cardCount: s.count,
        totalValue: Number(s.value.toFixed(2)),
        previews: s.previews,
      };
    });

    return NextResponse.json({
      count: result.length,
      profiles: result,
    });
  } catch (error) {
    console.error("GET /api/community error:", error);
    const msg =
      error instanceof Error ? error.message : "Error cargando la comunidad.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
