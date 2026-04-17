import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMarketMovers, type MarketMover } from "@/lib/pokemon-price-tracker";

/**
 * GET /api/market-movers?limit=10
 *
 * Devuelve el Top N de cartas con mayor variación de precio en las últimas
 * 24 h. Flujo:
 *   1. Se intenta con la API pública de Pokemon Price Tracker
 *      (getMarketMovers prueba varios endpoints porque el proveedor no tiene
 *      contrato estable).
 *   2. Si no hay datos, se computa el ranking a partir de `price_snapshots`
 *      de Supabase: comparamos el último snapshot de cada carta con el más
 *      reciente previo a las últimas 24 h.
 *   3. Si tampoco hay snapshots suficientes, devolvemos [] con `source:
 *      "empty"` para que el frontend muestre un mensaje amigable.
 *
 * Cacheado con `revalidate: 600` (10 min) para evitar abusar del proveedor.
 */
export const revalidate = 600;

type MoverSource = "api" | "snapshots" | "empty";

export async function GET(request: NextRequest) {
  try {
    const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(1, limitParam), 25)
      : 10;

    // 1) Fuente principal: la API externa.
    const fromApi = await getMarketMovers(limit);
    if (fromApi.length > 0) {
      return NextResponse.json({ source: "api" satisfies MoverSource, movers: fromApi });
    }

    // 2) Fallback: nuestros propios snapshots.
    const fromSnapshots = await getMoversFromSnapshots(limit);
    if (fromSnapshots.length > 0) {
      return NextResponse.json({
        source: "snapshots" satisfies MoverSource,
        movers: fromSnapshots,
      });
    }

    // 3) Nada.
    return NextResponse.json({
      source: "empty" satisfies MoverSource,
      movers: [] as MarketMover[],
    });
  } catch (error) {
    console.error("GET /api/market-movers error:", error);
    const message =
      error instanceof Error ? error.message : "No se pudo cargar el ranking.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Calcula el Top N a partir de `price_snapshots` cruzado con `card_catalog`.
 *
 * Estrategia: para cada card_catalog tomamos el snapshot más reciente y el
 * más reciente anterior a hace 24 h. Calculamos % cambio. Ordenamos por
 * |%| descendente.
 *
 * Si aún no tienes suficientes snapshots (app recién lanzada), devuelve [].
 */
async function getMoversFromSnapshots(limit: number): Promise<MarketMover[]> {
  const admin = createAdminClient();

  // Traemos snapshots de las últimas 72 h (margen ancho por si hubo días sin
  // corrida del cron) y los cruzamos con catálogo en memoria. Volumen
  // esperado: decenas → cientos, manejable client-side.
  const since = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

  const { data: snapshots, error: snapErr } = await admin
    .from("price_snapshots")
    .select("card_catalog_id, market_price, captured_at")
    .gte("captured_at", since)
    .order("captured_at", { ascending: false });

  if (snapErr) throw snapErr;
  if (!snapshots || snapshots.length === 0) return [];

  // Agrupa por card_catalog_id.
  const groups = new Map<
    string,
    { current: number; previous: number | null; capturedAt: string }
  >();

  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  for (const row of snapshots) {
    const id = row.card_catalog_id as string;
    const price = Number(row.market_price);
    const ts = new Date(row.captured_at as string).getTime();

    const entry = groups.get(id);
    if (!entry) {
      // Primer snapshot visto para esta carta: es el más reciente porque
      // el query viene ordenado desc por captured_at.
      groups.set(id, { current: price, previous: null, capturedAt: row.captured_at as string });
      continue;
    }

    // Aquí ya tenemos el current; buscamos el primero previo a 24 h.
    if (ts <= dayAgo && entry.previous == null) {
      entry.previous = price;
    }
  }

  // Cruzamos con catálogo para enriquecer.
  const ids = Array.from(groups.keys());
  if (ids.length === 0) return [];

  const { data: catalog, error: catErr } = await admin
    .from("card_catalog")
    .select(
      "id, product_name, set_name, card_number, rarity, card_type, official_image_url, pricecharting_product_id"
    )
    .in("id", ids);

  if (catErr) throw catErr;

  const byId = new Map((catalog ?? []).map((c) => [c.id as string, c]));

  const rows: MarketMover[] = [];
  for (const [id, g] of groups) {
    if (g.previous == null || g.previous === 0) continue;
    const catalogRow = byId.get(id);
    if (!catalogRow) continue;
    const percent = ((g.current - g.previous) / g.previous) * 100;
    rows.push({
      rank: 0,
      externalId: (catalogRow.pricecharting_product_id as string) ?? id,
      name: (catalogRow.product_name as string) ?? "Carta",
      set: (catalogRow.set_name as string) ?? "",
      cardNumber: (catalogRow.card_number as string) ?? "",
      rarity: (catalogRow.rarity as string) ?? "",
      type: (catalogRow.card_type as string) ?? "",
      imageUrl: (catalogRow.official_image_url as string) ?? null,
      currentPrice: g.current,
      previousPrice: g.previous,
      percentChange: percent,
      absoluteChange: g.current - g.previous,
      direction: percent >= 0 ? "up" : "down",
    });
  }

  rows.sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange));
  return rows.slice(0, limit).map((r, idx) => ({ ...r, rank: idx + 1 }));
}
