type SearchCardVariantsParams = {
  detectedName: string;
  detectedNumber: string;
  detectedSet: string;
  extractedText: string;
  detectedVariantHints: string[];
};

// Payload libre que devuelve pokemonpricetracker.com — es un objeto sin
// esquema estable, así que lo tipamos como `any` para no pelearse con cada
// variación de campo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiCard = Record<string, any>;

/**
 * Resultado normalizado que consume `app/api/match/route.ts` y cualquier otro
 * endpoint que use la API de Pokemon Price Tracker. `type` e `imageUrl` son
 * alias pensados para el frontend (el match espera `.type` / `.imageUrl` /
 * `.cardNumber`), además de `cardType` por si alguna pantalla ya los usaba.
 */
export type VariantResult = {
  externalId: string;
  name: string;
  set: string;
  variant: string;
  rarity: string;
  cardType: string;
  type: string;
  imageUrl: string | null;
  cardNumber: string;
  price: number | null;
  confidence: number;
};

const API_BASE_URL = "https://www.pokemonpricetracker.com/api/v2";

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** Resuelve la URL de imagen dentro del objeto libre que devuelve la API. */
function extractImageUrl(card: ApiCard): string | null {
  const images = card.images as
    | { large?: unknown; small?: unknown }
    | undefined;
  const candidates = [
    card.image,
    card.imageUrl,
    card.image_url,
    images?.large,
    images?.small,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.startsWith("http")) return value;
  }
  return null;
}

function extractCardNumber(card: ApiCard): string {
  return (
    safeString(card.number) ||
    safeString(card.cardNumber) ||
    safeString(card.card_number)
  );
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

function extractRarity(card: ApiCard) {
  return (
    safeString(card.rarity) ||
    safeString(card.rarityName) ||
    safeString(card.prices?.rarity) ||
    ""
  );
}

function extractCardType(card: ApiCard) {
  if (typeof card.cardType === "string") return card.cardType;
  if (typeof card.type === "string") return card.type;
  if (Array.isArray(card.types) && typeof card.types[0] === "string") return card.types[0];
  return "";
}

function scoreVariant(card: ApiCard, params: SearchCardVariantsParams) {
  const name = safeString(card.name || card.cardName || card.title).toLowerCase();
  const set = safeString(card.set || card.setName || card.expansion).toLowerCase();
  const number = safeString(card.number).toLowerCase();
  const variant = detectVariantLabel(card).toLowerCase();

  let score = 0;

  if (params.detectedName && name.includes(params.detectedName.toLowerCase())) {
    score += 60;
  }

  if (
    params.detectedNumber &&
    (
      number.includes(params.detectedNumber.toLowerCase()) ||
      name.includes(params.detectedNumber.toLowerCase())
    )
  ) {
    score += 35;
  }

  if (params.detectedSet && set.includes(params.detectedSet.toLowerCase())) {
    score += 20;
  }

  for (const hint of params.detectedVariantHints) {
    if (
      variant.includes(hint.toLowerCase()) ||
      name.includes(hint.toLowerCase())
    ) {
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
    .map<VariantResult>((card) => {
      const name = safeString(card.name || card.cardName || card.title || "Carta sin nombre");
      const set = safeString(card.set || card.setName || card.expansion);
      const variant = detectVariantLabel(card);
      const rarity = extractRarity(card);
      const cardType = extractCardType(card);
      const externalId = safeString(card.id || card.cardId || card.slug || name);
      const price = extractPrice(card);
      const confidence = scoreVariant(card, params);
      const imageUrl = extractImageUrl(card);
      const cardNumber = extractCardNumber(card);

      return {
        externalId,
        name,
        set,
        variant,
        rarity,
        cardType,
        type: cardType,
        imageUrl,
        cardNumber,
        price,
        confidence,
      };
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

/**
 * Estructura normalizada para el Top N de cartas más caras según la API
 * de pokemonpricetracker.com.
 */
export type TopExpensiveCard = {
  rank: number;
  externalId: string;
  name: string;
  set: string;
  cardNumber: string;
  rarity: string;
  type: string;
  imageUrl: string | null;
  price: number;
};

/**
 * Fallback: lista curada de cartas históricamente famosas por su alto
 * precio. Se consulta cada una por la API y nos quedamos con la variante
 * más cara. Así, aunque la API no soporte "sort by price" globalmente,
 * mostramos un Top 10 real y defendible.
 */
const ICONIC_EXPENSIVE_CARDS: string[] = [
  "Pikachu Illustrator",
  "Charizard Base Set 1st Edition",
  "Blastoise Galaxy Star Hologram",
  "Magikarp Tamamushi University",
  "Trophy Pikachu",
  "Umbreon Gold Star",
  "Espeon Gold Star",
  "Lugia Neo Genesis 1st Edition",
  "Rayquaza Gold Star",
  "Mewtwo Base Set 1st Edition",
  "Venusaur Base Set 1st Edition",
  "Shining Charizard Neo Destiny",
  "Charizard Shadowless",
  "Blastoise Base Set 1st Edition",
];

/**
 * Devuelve las N cartas con mayor precio actual. Probamos varias
 * combinaciones de query porque pokemonpricetracker.com no documenta un
 * contrato estable: `sort=-price`, `sortBy=price&order=desc`, etc. La
 * primera respuesta con resultados válidos gana.
 */
export async function getTopExpensiveCards(limit = 10): Promise<TopExpensiveCard[]> {
  const apiKey = process.env.POKEMON_PRICE_TRACKER_API_KEY;
  if (!apiKey) {
    console.warn("getTopExpensiveCards: POKEMON_PRICE_TRACKER_API_KEY no definida");
    return [];
  }

  const candidates = [
    `${API_BASE_URL}/cards?sort=-price&limit=${limit}`,
    `${API_BASE_URL}/cards?sortBy=price&order=desc&limit=${limit}`,
    `${API_BASE_URL}/cards?orderBy=price&direction=desc&limit=${limit}`,
    `${API_BASE_URL}/cards?sort=price_desc&limit=${limit}`,
    `${API_BASE_URL}/cards/top?limit=${limit}`,
    `${API_BASE_URL}/top-cards?limit=${limit}`,
  ];

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        // Cache de 10 min: los precios no cambian a cada minuto.
        next: { revalidate: 600 },
      });

      if (!response.ok) continue;
      const data = await response.json();

      const rawList: ApiCard[] = Array.isArray(data?.cards)
        ? data.cards
        : Array.isArray(data?.results)
          ? data.results
          : Array.isArray(data?.data)
            ? data.data
            : Array.isArray(data)
              ? data
              : [];

      if (rawList.length === 0) continue;

      const normalized = rawList
        .map<TopExpensiveCard | null>((card) => {
          const price = extractPrice(card);
          if (price == null) return null;
          return {
            rank: 0,
            externalId: safeString(card.id || card.cardId || card.slug || card.name),
            name: safeString(
              card.name || card.cardName || card.title || "Carta sin nombre"
            ),
            set: safeString(card.set || card.setName || card.expansion),
            cardNumber: extractCardNumber(card),
            rarity: extractRarity(card),
            type: extractCardType(card),
            imageUrl: extractImageUrl(card),
            price,
          };
        })
        .filter((row): row is TopExpensiveCard => row !== null)
        // Aunque pidamos sort=-price al server, garantizamos el orden
        // localmente por si el endpoint lo ignora.
        .sort((a, b) => b.price - a.price)
        .slice(0, limit)
        .map((row, idx) => ({ ...row, rank: idx + 1 }));

      if (normalized.length > 0) return normalized;
    } catch (err) {
      console.warn(`getTopExpensiveCards: fallo en ${url}`, err);
      continue;
    }
  }

  // Fallback: buscamos uno a uno los títulos icónicos y nos quedamos con
  // la mejor variante de cada uno. Es más lento (N requests) pero devuelve
  // datos reales de la API del proveedor — no hardcodeamos precios.
  return getTopExpensiveFromIconicList(limit);
}

/**
 * Consulta la API con cada título de la lista curada y devuelve las N
 * cartas más caras resultantes. Las llamadas se ejecutan en paralelo con
 * un `Promise.allSettled` para que si alguna falla no tumbe al resto.
 */
async function getTopExpensiveFromIconicList(limit: number): Promise<TopExpensiveCard[]> {
  const lookups = await Promise.allSettled(
    ICONIC_EXPENSIVE_CARDS.map(async (query) => {
      const variants = await searchCardVariants({
        detectedName: query,
        detectedNumber: "",
        detectedSet: "",
        extractedText: query,
        detectedVariantHints: [],
      });
      // Nos quedamos con la variante más cara dentro de cada búsqueda.
      const best = variants
        .filter((v) => typeof v.price === "number" && v.price !== null)
        .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];
      return best ?? null;
    })
  );

  const rows: TopExpensiveCard[] = [];
  for (const result of lookups) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const v = result.value;
    if (v.price == null) continue;
    rows.push({
      rank: 0,
      externalId: v.externalId,
      name: v.name,
      set: v.set,
      cardNumber: v.cardNumber,
      rarity: v.rarity,
      type: v.cardType,
      imageUrl: v.imageUrl,
      price: v.price,
    });
  }

  return rows
    .sort((a, b) => b.price - a.price)
    .slice(0, limit)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

/**
 * Refresca el precio de una carta conocida. Se usa desde
 * `app/api/prices/refresh/route.ts` (cron diario de Vercel). Busca en la API
 * con el nombre + número de carta y devuelve el primer match; si no
 * encuentra nada o la API está caída, devuelve `null`.
 */
export async function refreshCardPrice(
  externalId: string,
  productName: string,
  cardNumber?: string
): Promise<VariantResult | null> {
  const apiKey = process.env.POKEMON_PRICE_TRACKER_API_KEY;
  if (!apiKey) {
    // No reventamos: el cron sigue siendo inofensivo si falta la key.
    console.warn("refreshCardPrice: POKEMON_PRICE_TRACKER_API_KEY no definida");
    return null;
  }

  try {
    const results = await searchCardVariants({
      detectedName: productName,
      detectedNumber: cardNumber ?? "",
      detectedSet: "",
      extractedText: "",
      detectedVariantHints: [],
    });
    // Priorizamos el resultado cuyo externalId coincide exactamente; si no,
    // nos quedamos con el que tenga mejor confidence (ya vienen ordenados).
    const exact = results.find((r) => r.externalId === externalId);
    return exact ?? results[0] ?? null;
  } catch (err) {
    console.warn("refreshCardPrice error:", err);
    return null;
  }
}
