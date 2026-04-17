/**
 * Cliente de la API oficial de Pokémon TCG (https://pokemontcg.io/).
 * Esta API tiene un catálogo completísimo y mucho mejor indexado que cualquier
 * otro: devuelve nombre exacto, expansión, número, tipos, imagen oficial y
 * precios de TCGPlayer/CardMarket. Es gratis y sin key tiene rate-limit bajo;
 * con key (gratuita en pokemontcg.io) sube el rate limit.
 */

const API_BASE_URL = "https://api.pokemontcg.io/v2";

export type TCGCard = {
  id: string;
  name: string;
  supertype?: string;
  subtypes?: string[];
  types?: string[];
  hp?: string;
  number?: string;
  rarity?: string;
  set: {
    id: string;
    name: string;
    series?: string;
    releaseDate?: string;
  };
  images: {
    small: string;
    large?: string;
  };
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<
      string,
      {
        low?: number;
        mid?: number;
        high?: number;
        market?: number;
        directLow?: number;
      }
    >;
  };
  cardmarket?: {
    url?: string;
    updatedAt?: string;
    prices?: {
      averageSellPrice?: number;
      trendPrice?: number;
      reverseHoloTrend?: number;
      lowPrice?: number;
    };
  };
};

export type TCGVariantResult = {
  externalId: string;
  name: string;
  set: string;
  setId: string;
  variant: string;
  type: string;
  imageUrl: string;
  cardNumber: string;
  price: number | null;
  confidence: number;
  source: "pokemontcg";
};

export function extractTCGPrice(card: TCGCard): number | null {
  const tcg = card.tcgplayer?.prices;
  if (tcg) {
    const preferred = ["holofoil", "normal", "reverseHolofoil", "1stEditionHolofoil", "unlimitedHolofoil"];
    for (const key of preferred) {
      const price = tcg[key]?.market ?? tcg[key]?.mid;
      if (typeof price === "number" && price > 0) return price;
    }
    // Fallback: primer precio disponible
    for (const group of Object.values(tcg)) {
      const price = group?.market ?? group?.mid;
      if (typeof price === "number" && price > 0) return price;
    }
  }

  const cm = card.cardmarket?.prices;
  if (cm) {
    if (typeof cm.trendPrice === "number" && cm.trendPrice > 0) return cm.trendPrice;
    if (typeof cm.averageSellPrice === "number" && cm.averageSellPrice > 0)
      return cm.averageSellPrice;
  }

  return null;
}

function mapCard(card: TCGCard, confidence: number): TCGVariantResult {
  return {
    externalId: `tcg:${card.id}`,
    name: card.name,
    set: card.set?.name ?? "",
    setId: card.set?.id ?? "",
    variant: (card.subtypes ?? []).join(" ") || card.rarity || "",
    type: (card.types ?? []).join(" / "),
    imageUrl: card.images?.large ?? card.images?.small ?? "",
    cardNumber: card.number ?? "",
    price: extractTCGPrice(card),
    confidence,
    source: "pokemontcg",
  };
}

/**
 * Escapa y sanitiza un término para la sintaxis Lucene de la API.
 */
function sanitize(term: string): string {
  return term
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function queryAPI(q: string, pageSize = 12): Promise<TCGCard[]> {
  const apiKey = process.env.POKEMON_TCG_API_KEY;
  const url = new URL(`${API_BASE_URL}/cards`);
  url.searchParams.set("q", q);
  url.searchParams.set("pageSize", String(pageSize));
  url.searchParams.set("orderBy", "-set.releaseDate");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["X-Api-Key"] = apiKey;

  const response = await fetch(url.toString(), { headers, cache: "no-store" });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Pokemon TCG API ${response.status}: ${text.slice(0, 200) || response.statusText}`
    );
  }

  const data = (await response.json()) as { data?: TCGCard[] };
  return Array.isArray(data?.data) ? data.data : [];
}

type SearchParams = {
  name?: string;
  number?: string;
  set?: string;
  type?: string;
};

/**
 * Ejecuta varias estrategias de búsqueda en cascada hasta que una devuelve
 * resultados. Empieza por lo más específico (nombre + número + set) y va
 * relajando criterios.
 */
export async function searchPokemonTCG(
  params: SearchParams
): Promise<TCGVariantResult[]> {
  const name = sanitize(params.name ?? "");
  const number = sanitize(params.number ?? "").split("/")[0]?.trim() ?? "";
  const set = sanitize(params.set ?? "");
  const type = sanitize(params.type ?? "");

  if (!name && !number && !set) return [];

  // Construye candidatos de query por orden de precisión.
  const strategies: Array<{ q: string; baseScore: number }> = [];

  if (name && number && set) {
    strategies.push({
      q: `name:"${name}" number:${number} set.name:"*${set}*"`,
      baseScore: 100,
    });
  }
  if (name && number) {
    strategies.push({
      q: `name:"${name}" number:${number}`,
      baseScore: 90,
    });
  }
  if (name && set) {
    strategies.push({
      q: `name:"${name}" set.name:"*${set}*"`,
      baseScore: 80,
    });
  }
  if (name) {
    strategies.push({ q: `name:"${name}"`, baseScore: 70 });
    // Wildcard fuzzy: tolera faltas y prefijos
    strategies.push({ q: `name:*${name}*`, baseScore: 50 });
    // Palabra a palabra (por si el OCR devolvió varias palabras con ruido)
    const firstWord = name.split(" ")[0];
    if (firstWord && firstWord !== name) {
      strategies.push({ q: `name:"${firstWord}"`, baseScore: 40 });
    }
  }
  if (!name && number) {
    strategies.push({ q: `number:${number}`, baseScore: 30 });
  }

  for (const strategy of strategies) {
    try {
      const cards = await queryAPI(strategy.q);
      if (cards.length > 0) {
        // Ajusta confianza por coincidencia extra de tipo.
        return cards
          .map((card, idx) => {
            let confidence = strategy.baseScore - idx * 2;
            if (
              type &&
              (card.types ?? []).some((t) =>
                t.toLowerCase().includes(type.toLowerCase())
              )
            ) {
              confidence += 10;
            }
            return mapCard(card, confidence);
          })
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, 8);
      }
    } catch (error) {
      console.error("Pokemon TCG strategy error:", strategy.q, error);
    }
  }

  return [];
}

/**
 * Trae una carta por su id (ej. "sv4-125"). Útil para refrescar precios.
 */
export async function getTCGCardById(id: string): Promise<TCGVariantResult | null> {
  const apiKey = process.env.POKEMON_TCG_API_KEY;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["X-Api-Key"] = apiKey;

  const response = await fetch(`${API_BASE_URL}/cards/${encodeURIComponent(id)}`, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { data?: TCGCard };
  if (!data?.data) return null;
  return mapCard(data.data, 100);
}
