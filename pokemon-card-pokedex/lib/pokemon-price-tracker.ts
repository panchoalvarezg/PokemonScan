type SearchCardVariantsParams = {
  detectedName: string;
  detectedNumber: string;
  detectedSet: string;
  extractedText: string;
  detectedVariantHints: string[];
};

type ApiCard = Record<string, any>;

type VariantResult = {
  externalId: string;
  name: string;
  set: string;
  variant: string;
  price: number | null;
  confidence: number;
};

const API_BASE_URL = "https://www.pokemonpricetracker.com/api/v2";

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function buildSingleSearchTerm(params: SearchCardVariantsParams) {
  const q1 = [params.detectedName, params.detectedNumber].filter(Boolean).join(" ").trim();
  if (q1) return q1;

  const q2 = [params.detectedName, params.detectedSet].filter(Boolean).join(" ").trim();
  if (q2) return q2;

  if (params.detectedName.trim()) return params.detectedName.trim();

  return params.extractedText.trim().split(" ").slice(0, 4).join(" ");
}

function detectVariantLabel(card: ApiCard) {
  return (
    safeString(card.variant) ||
    safeString(card.finish) ||
    safeString(card.edition) ||
    safeString(card.subtype) ||
    safeString(card.version) ||
    ""
  );
}

function extractPrice(card: ApiCard) {
  const candidates = [
    card.price,
    card.marketPrice,
    card.rawPrice,
    card.ungradedPrice,
    card.raw,
    card.currentPrice,
    card.prices?.raw,
    card.prices?.market,
  ];

  for (const value of candidates) {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value))) {
      return Number(value);
    }
  }

  return null;
}

function scoreVariant(card: ApiCard, params: SearchCardVariantsParams) {
  const name = safeString(card.name || card.cardName || card.title).toLowerCase();
  const set = safeString(card.set || card.setName || card.expansion).toLowerCase();
  const number = safeString(card.number).toLowerCase();
  const variant = detectVariantLabel(card).toLowerCase();

  let score = 0;

  if (params.detectedName && name.includes(params.detectedName.toLowerCase())) score += 60;
  if (
    params.detectedNumber &&
    (number.includes(params.detectedNumber.toLowerCase()) ||
      name.includes(params.detectedNumber.toLowerCase()))
  ) {
    score += 35;
  }
  if (params.detectedSet && set.includes(params.detectedSet.toLowerCase())) score += 20;

  for (const hint of params.detectedVariantHints) {
    if (variant.includes(hint.toLowerCase()) || name.includes(hint.toLowerCase())) {
      score += 10;
    }
  }

  return score;
}

export async function searchCardVariants(
  params: SearchCardVariantsParams
): Promise<VariantResult[]> {
  const apiKey = process.env.POKEMON_PRICE_TRACKER_API_KEY;

  if (!apiKey) {
    throw new Error("Falta POKEMON_PRICE_TRACKER_API_KEY");
  }

  const search = buildSingleSearchTerm(params);
  if (!search) return [];

  const url = new URL(`${API_BASE_URL}/cards`);
  url.searchParams.set("search", search);
  url.searchParams.set("limit", "8");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || data?.error || "La API devolvió un error.");
  }

  const cards: ApiCard[] = Array.isArray(data?.cards)
    ? data.cards
    : Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data)
        ? data
        : [];

  return cards
    .map((card) => {
      const name = safeString(card.name || card.cardName || card.title || "Carta sin nombre");
      const set = safeString(card.set || card.setName || card.expansion);
      const variant = detectVariantLabel(card);
      const externalId = safeString(card.id || card.cardId || card.slug || name);
      const price = extractPrice(card);
      const confidence = scoreVariant(card, params);

      return {
        externalId,
        name,
        set,
        variant,
        price,
        confidence,
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}
