import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { refreshCardPrice } from "@/lib/pokemon-price-tracker";

/**
 * Endpoint que vuelve a consultar la API de Pokemon Price Tracker y actualiza
 * `card_catalog.last_market_price`, `estimated_unit_value` en user_cards, y
 * guarda un registro en `price_snapshots`.
 *
 * Se puede ejecutar a demanda (GET /api/prices/refresh) o como Cron Job en
 * Vercel (ver `vercel.json`). Si defines CRON_SECRET añade `Authorization:
 * Bearer <secret>` en la configuración del cron.
 */
export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const auth = request.headers.get("authorization");
      if (auth !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "No autorizado." }, { status: 401 });
      }
    }

    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 25);

    const { data: catalog, error } = await supabaseAdmin
      .from("card_catalog")
      .select("id, pricecharting_product_id, product_name, card_number, price_updated_at")
      .order("price_updated_at", { ascending: true, nullsFirst: true })
      .limit(Number.isFinite(limit) ? limit : 25);

    if (error) throw error;

    const results: Array<{
      id: string;
      externalId: string;
      name: string;
      newPrice: number | null;
      updated: boolean;
      error?: string;
    }> = [];

    for (const row of catalog ?? []) {
      try {
        const variant = await refreshCardPrice(
          row.pricecharting_product_id,
          row.product_name,
          row.card_number ?? undefined
        );

        if (!variant || variant.price == null) {
          results.push({
            id: row.id,
            externalId: row.pricecharting_product_id,
            name: row.product_name,
            newPrice: null,
            updated: false,
          });
          continue;
        }

        await supabaseAdmin
          .from("card_catalog")
          .update({
            last_market_price: variant.price,
            price_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        await supabaseAdmin.from("price_snapshots").insert({
          card_catalog_id: row.id,
          market_price: variant.price,
        });

        // Sincroniza el valor unitario estimado del inventario del usuario.
        await supabaseAdmin
          .from("user_cards")
          .update({
            estimated_unit_value: variant.price,
            updated_at: new Date().toISOString(),
          })
          .eq("card_catalog_id", row.id);

        results.push({
          id: row.id,
          externalId: row.pricecharting_product_id,
          name: row.product_name,
          newPrice: variant.price,
          updated: true,
        });
      } catch (err) {
        console.error("Error refrescando carta", row.id, err);
        results.push({
          id: row.id,
          externalId: row.pricecharting_product_id,
          name: row.product_name,
          newPrice: null,
          updated: false,
          error: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    return NextResponse.json({
      refreshed: results.filter((r) => r.updated).length,
      attempted: results.length,
      results,
    });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error ? error.message : "No se pudo refrescar precios.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = GET;
