import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";
import {
  getSetTotalsByName,
  normalizeSetName,
} from "@/lib/pokemon-tcg-api";

/**
 * /api/collections
 *
 * Devuelve el inventario del usuario autenticado *agrupado por expansión*
 * (set_name). Por cada grupo:
 *  - owned           total de cartas (suma de `quantity`)
 *  - uniqueOwned     cartas únicas (contamos card_number distinto)
 *  - total           tamaño oficial del set (Pokémon TCG API) o null
 *  - percent         % de completitud si `total` está disponible
 *  - totalValue      valor de mercado estimado de todas las cartas del set
 *  - cards           lista de cartas con metadatos para renderizar el mosaico
 *
 * Las colecciones son *automáticas* (se calculan a partir del set_name de cada
 * carta). Están pensadas como lista de solo-lectura; más adelante se añadirán
 * tags/colecciones manuales encima de esto.
 */

type Row = {
  id: string;
  product_name: string;
  set_name: string | null;
  card_number: string | null;
  card_type: string | null;
  rarity: string | null;
  condition: string | null;
  image_url: string | null;
  quantity: number | string;
  estimated_unit_value: number | string;
  estimated_total_value: number | string;
  for_trade: boolean | null;
  created_at: string;
};

export type CollectionCard = {
  id: string;
  product_name: string;
  set_name: string | null;
  card_number: string | null;
  card_type: string | null;
  rarity: string | null;
  condition: string | null;
  image_url: string | null;
  quantity: number;
  estimated_unit_value: number;
  estimated_total_value: number;
  for_trade: boolean;
};

export type CollectionGroup = {
  setName: string;
  owned: number;
  uniqueOwned: number;
  total: number | null;
  percent: number | null;
  totalValue: number;
  cards: CollectionCard[];
};

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("user_cards_detailed")
      .select(
        "id, product_name, set_name, card_number, card_type, rarity, condition, image_url, quantity, estimated_unit_value, estimated_total_value, for_trade, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = (data ?? []) as Row[];

    // Cargar totales oficiales del TCG para calcular completitud. Si la API
    // falla seguimos con total=null — no rompemos la vista.
    let totalsMap = new Map<string, number>();
    try {
      totalsMap = await getSetTotalsByName();
    } catch (err) {
      console.warn("Collections: TCG sets fetch failed:", err);
    }

    const groups = new Map<
      string,
      {
        setName: string;
        uniqueNumbers: Set<string>;
        owned: number;
        totalValue: number;
        cards: CollectionCard[];
      }
    >();

    let unclassifiedValue = 0;
    let unclassifiedOwned = 0;
    const unclassifiedCards: CollectionCard[] = [];

    // Carpeta de Intercambios: cartas marcadas con for_trade=true.
    // Se calcula en paralelo a las colecciones normales, sin excluirlas de
    // sus sets — una carta "en intercambio" sigue contando en su expansión.
    let tradeValue = 0;
    let tradeOwned = 0;
    const tradeCards: CollectionCard[] = [];

    for (const r of rows) {
      const qty = Number(r.quantity || 0);
      const val = Number(r.estimated_total_value || 0);
      const unit = Number(r.estimated_unit_value || 0);
      const card: CollectionCard = {
        id: r.id,
        product_name: r.product_name,
        set_name: r.set_name,
        card_number: r.card_number,
        card_type: r.card_type,
        rarity: r.rarity,
        condition: r.condition,
        image_url: r.image_url,
        quantity: qty,
        estimated_unit_value: unit,
        estimated_total_value: val,
        for_trade: !!r.for_trade,
      };

      if (r.for_trade) {
        tradeValue += val;
        tradeOwned += qty;
        tradeCards.push(card);
      }

      const setName = (r.set_name ?? "").trim();
      if (!setName) {
        unclassifiedValue += val;
        unclassifiedOwned += qty;
        unclassifiedCards.push(card);
        continue;
      }

      const key = setName.toLowerCase();
      const existing = groups.get(key) ?? {
        setName,
        uniqueNumbers: new Set<string>(),
        owned: 0,
        totalValue: 0,
        cards: [],
      };
      existing.owned += qty;
      existing.totalValue += val;
      existing.uniqueNumbers.add((r.card_number ?? "").trim() || r.id);
      existing.cards.push(card);
      groups.set(key, existing);
    }

    const collections: CollectionGroup[] = [];
    for (const g of groups.values()) {
      const total = totalsMap.get(normalizeSetName(g.setName)) ?? null;
      const uniqueOwned = g.uniqueNumbers.size;
      const percent =
        total && total > 0
          ? Math.min(100, Math.round((uniqueOwned / total) * 100))
          : null;
      collections.push({
        setName: g.setName,
        owned: g.owned,
        uniqueOwned,
        total,
        percent,
        totalValue: Number(g.totalValue.toFixed(2)),
        cards: g.cards,
      });
    }

    collections.sort((a, b) => {
      // Orden: más completitud primero (null al final), luego más valor, luego nombre.
      const pa = a.percent ?? -1;
      const pb = b.percent ?? -1;
      if (pb !== pa) return pb - pa;
      if (b.totalValue !== a.totalValue) return b.totalValue - a.totalValue;
      return a.setName.localeCompare(b.setName);
    });

    const unclassified: CollectionGroup | null =
      unclassifiedCards.length > 0
        ? {
            setName: "Sin expansión",
            owned: unclassifiedOwned,
            uniqueOwned: unclassifiedCards.length,
            total: null,
            percent: null,
            totalValue: Number(unclassifiedValue.toFixed(2)),
            cards: unclassifiedCards,
          }
        : null;

    const tradeCollection: CollectionGroup | null =
      tradeCards.length > 0
        ? {
            setName: "Intercambios",
            owned: tradeOwned,
            uniqueOwned: tradeCards.length,
            total: null,
            percent: null,
            totalValue: Number(tradeValue.toFixed(2)),
            cards: tradeCards,
          }
        : null;

    return NextResponse.json({
      collections,
      unclassified,
      tradeCollection,
      summary: {
        totalCollections: collections.length,
        totalCards: collections.reduce((a, c) => a + c.owned, 0) + unclassifiedOwned,
        totalValue: Number(
          (
            collections.reduce((a, c) => a + c.totalValue, 0) + unclassifiedValue
          ).toFixed(2)
        ),
        tradeCards: tradeOwned,
        tradeValue: Number(tradeValue.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("GET /api/collections error:", error);
    const msg =
      error instanceof Error ? error.message : "Error calculando colecciones.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
