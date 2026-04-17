import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";
import {
  getSetTotalsByName,
  normalizeSetName,
  KNOWN_POKEMON_TYPES,
} from "@/lib/pokemon-tcg-api";
import type {
  InventoryStats,
  SetCompleteness,
  TypeCompleteness,
} from "@/types";

type Row = {
  id: string;
  card_catalog_id?: string | null;
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
};

function bucket(
  rows: Row[],
  key: keyof Row,
  fallback = "Sin especificar"
): Array<{ key: string; count: number; value: number }> {
  const map = new Map<string, { count: number; value: number }>();
  for (const r of rows) {
    const raw = (r[key] as string | null) ?? "";
    const label = (raw ?? "").toString().trim() || fallback;
    const qty = Number(r.quantity || 0);
    const val = Number(r.estimated_total_value || 0);
    const cur = map.get(label) ?? { count: 0, value: 0 };
    cur.count += qty;
    cur.value += val;
    map.set(label, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, count: v.count, value: Number(v.value.toFixed(2)) }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calcula completitud por expansión consultando al Pokemon TCG API por los
 * totales oficiales de cada set. Para cada set del inventario del usuario
 * cuenta las cartas únicas que posee (distintas por número) y compara contra
 * el total oficial. Si un set no se encuentra en la API devuelve total=null.
 */
async function computeSetCompleteness(rows: Row[]): Promise<SetCompleteness[]> {
  // Agrupar por set: owned = cartas únicas (número único)
  const bySet = new Map<
    string,
    { setName: string; uniqueNumbers: Set<string> }
  >();
  for (const r of rows) {
    const name = (r.set_name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const num = (r.card_number ?? "").trim() || r.id; // fallback por id si no hay número
    const entry = bySet.get(key) ?? { setName: name, uniqueNumbers: new Set<string>() };
    entry.uniqueNumbers.add(num);
    bySet.set(key, entry);
  }

  if (bySet.size === 0) return [];

  let totalsMap = new Map<string, number>();
  try {
    totalsMap = await getSetTotalsByName();
  } catch (err) {
    // Si la API cae, seguimos con total=null para cada set.
    console.warn("Pokemon TCG sets fetch failed:", err);
  }

  const out: SetCompleteness[] = [];
  for (const { setName, uniqueNumbers } of bySet.values()) {
    const owned = uniqueNumbers.size;
    const total = totalsMap.get(normalizeSetName(setName)) ?? null;
    const percent =
      total && total > 0
        ? Math.min(100, Math.round((owned / total) * 100))
        : null;
    out.push({ setName, owned, total, percent });
  }

  return out.sort((a, b) => {
    // Primero los que más % tienen, luego los desconocidos, luego por nombre
    const pa = a.percent ?? -1;
    const pb = b.percent ?? -1;
    if (pb !== pa) return pb - pa;
    return a.setName.localeCompare(b.setName);
  });
}

/**
 * Calcula cobertura por tipo de energía (Fuego, Agua, etc.) frente a la
 * lista canónica de 11 tipos del TCG moderno. Se cuentan cartas y entradas.
 */
function computeTypeCompleteness(rows: Row[]): {
  items: TypeCompleteness[];
  typesCovered: number;
  totalKnownTypes: number;
  overallPercent: number;
} {
  const totals = new Map<string, { cards: number; entries: number }>();
  for (const r of rows) {
    const rawType = (r.card_type ?? "").trim();
    if (!rawType) continue;
    // Un mismo r.card_type puede venir como "Fire / Fighting"; partimos.
    const parts = rawType
      .split(/[\s,\/]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    for (const p of parts) {
      const cur = totals.get(p.toLowerCase()) ?? { cards: 0, entries: 0 };
      cur.cards += Number(r.quantity || 0);
      cur.entries += 1;
      totals.set(p.toLowerCase(), cur);
    }
  }

  const items: TypeCompleteness[] = KNOWN_POKEMON_TYPES.map((type) => {
    const t = totals.get(type.toLowerCase());
    return {
      type,
      cardsOwned: t?.cards ?? 0,
      entriesOwned: t?.entries ?? 0,
      hasIt: !!t && t.cards > 0,
    };
  });

  const typesCovered = items.filter((i) => i.hasIt).length;
  const totalKnownTypes = KNOWN_POKEMON_TYPES.length;
  const overallPercent = Math.round((typesCovered / totalKnownTypes) * 100);

  return { items, typesCovered, totalKnownTypes, overallPercent };
}

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
        "id, product_name, set_name, card_number, card_type, rarity, condition, image_url, quantity, estimated_unit_value, estimated_total_value"
      )
      .eq("user_id", user.id);

    if (error) throw error;

    const rows = (data ?? []) as Row[];

    const totalEntries = rows.length;
    let totalCards = 0;
    let totalValue = 0;
    let maxValue = 0;
    for (const r of rows) {
      totalCards += Number(r.quantity || 0);
      const tv = Number(r.estimated_total_value || 0);
      totalValue += tv;
      if (Number(r.estimated_unit_value || 0) > maxValue) {
        maxValue = Number(r.estimated_unit_value || 0);
      }
    }
    const averageValue = totalCards > 0 ? totalValue / totalCards : 0;

    const uniqueSets = new Set(rows.map((r) => r.set_name ?? "").filter(Boolean)).size;
    const uniqueTypes = new Set(rows.map((r) => r.card_type ?? "").filter(Boolean)).size;

    const topCards = [...rows]
      .sort(
        (a, b) =>
          Number(b.estimated_total_value || 0) - Number(a.estimated_total_value || 0)
      )
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        product_name: r.product_name,
        set_name: r.set_name,
        estimated_total_value: Number(r.estimated_total_value || 0),
        image_url: r.image_url,
      }));

    const setCompleteness = await computeSetCompleteness(rows);
    const typeCompleteness = computeTypeCompleteness(rows);

    // Completitud global promediando solo los sets con total conocido
    const knownSets = setCompleteness.filter((s) => s.percent !== null);
    const globalCompletenessPercent =
      knownSets.length > 0
        ? Number(
            (
              knownSets.reduce((a, s) => a + (s.percent as number), 0) /
              knownSets.length
            ).toFixed(1)
          )
        : null;

    const stats: InventoryStats = {
      totalEntries,
      totalCards,
      totalValue: Number(totalValue.toFixed(2)),
      averageValue: Number(averageValue.toFixed(2)),
      maxValue: Number(maxValue.toFixed(2)),
      uniqueSets,
      uniqueTypes,
      byType: bucket(rows, "card_type", "Sin tipo"),
      byRarity: bucket(rows, "rarity", "Sin rareza"),
      byCondition: bucket(rows, "condition", "Sin condición"),
      bySet: bucket(rows, "set_name", "Sin set"),
      topCards,
      setCompleteness,
      typeCompleteness,
      globalCompletenessPercent,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("GET /api/stats error:", error);
    const msg = error instanceof Error ? error.message : "No se pudo calcular estadísticas.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
