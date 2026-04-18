import { NextResponse, type NextRequest } from "next/server";
import { getTopExpensiveCards } from "@/lib/pokemon-price-tracker";

/**
 * GET /api/top-cards?limit=10           → Top N normalizado (uso normal)
 * GET /api/top-cards?debug=1            → dump crudo del primer endpoint de la
 *                                         API externa que responde, útil para
 *                                         depurar campos de precio.
 *
 * El lib `getTopExpensiveCards` intenta 6 combinaciones de sort y, si no
 * hay datos, hace fallback a una lista curada de 14 cartas famosas
 * consultando la API real carta por carta.
 */
export const revalidate = 600;

export async function GET(request: NextRequest) {
  const debug = request.nextUrl.searchParams.get("debug");
  if (debug) return handleDebug();

  try {
    const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(1, limitParam), 25)
      : 10;

    const cards = await getTopExpensiveCards(limit);

    return NextResponse.json({
      count: cards.length,
      cards,
    });
  } catch (error) {
    console.error("GET /api/top-cards error:", error);
    const message =
      error instanceof Error ? error.message : "No se pudo cargar el ranking.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Modo diagnóstico: consulta directamente varios endpoints candidatos y
 * devuelve el primer status/body que obtiene, para ver cómo viene el
 * payload real del proveedor (nombres de campos de precio, estructura
 * anidada, etc.). Expone sólo un sample de 2 cartas para no volcar
 * respuestas enormes.
 */
async function handleDebug() {
  const apiKey = process.env.POKEMON_PRICE_TRACKER_API_KEY;
  const hasKey = Boolean(apiKey);

  if (!hasKey) {
    return NextResponse.json(
      {
        hasApiKey: false,
        hint: "Falta POKEMON_PRICE_TRACKER_API_KEY en Vercel → Settings → Environment Variables.",
      },
      { status: 200 }
    );
  }

  const urls = [
    "https://www.pokemonpricetracker.com/api/v2/cards?sort=-price&limit=3",
    "https://www.pokemonpricetracker.com/api/v2/cards?sortBy=price&order=desc&limit=3",
    "https://www.pokemonpricetracker.com/api/v2/cards?search=charizard&limit=3",
    "https://www.pokemonpricetracker.com/api/v2/cards?limit=3",
  ];

  const tries: Array<{
    url: string;
    status: number;
    ok: boolean;
    sample: unknown;
  }> = [];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { _raw: text.slice(0, 400) };
      }

      // Sample reducido: sólo 2 cartas si es lista.
      const sample = shrinkSample(parsed);
      tries.push({ url, status: res.status, ok: res.ok, sample });
    } catch (err) {
      tries.push({
        url,
        status: 0,
        ok: false,
        sample: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  return NextResponse.json({ hasApiKey: true, tries });
}

function shrinkSample(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const obj = data as Record<string, unknown>;
  const cloned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      cloned[key] = value.slice(0, 2);
    } else {
      cloned[key] = value;
    }
  }
  return cloned;
}
