import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth";
import {
  getSetTotalsByName,
  normalizeSetName,
} from "@/lib/pokemon-tcg-api";

/**
 * /api/profile
 *
 * GET    → devuelve { profile, summary } donde:
 *            profile: fila de public.profiles (se upserta si falta).
 *            summary: { trade: { count, value }, missing: [{ setName, owned, total, missing, percent }] }
 *                     missing se calcula como total (TCG API) - cartas únicas poseídas.
 *
 * PATCH  → actualiza columnas permitidas del perfil
 *          (display_name, full_name, username, country, city, discord_handle,
 *           phone, trade_notes, avatar_url). Los cambios sólo afectan al
 *           propio usuario.
 */

type ProfileRow = {
  id: string;
  email: string | null;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  display_name?: string | null;
  country?: string | null;
  city?: string | null;
  discord_handle?: string | null;
  phone?: string | null;
  trade_notes?: string | null;
  is_public?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type UserCardRow = {
  id: string;
  set_name: string | null;
  card_number: string | null;
  quantity: number | string;
  estimated_total_value: number | string;
  for_trade: boolean | null;
};

const EDITABLE_FIELDS = [
  "display_name",
  "full_name",
  "username",
  "country",
  "city",
  "discord_handle",
  "phone",
  "trade_notes",
  "avatar_url",
] as const;

// Booleanos editables — se tratan aparte porque EDITABLE_FIELDS son strings
// que se trimean y vacío → null.
const EDITABLE_BOOL_FIELDS = ["is_public"] as const;

async function ensureAndFetchProfile(
  userId: string,
  email: string | null
): Promise<ProfileRow> {
  const admin = createAdminClient();
  // upsert para cubrir el caso de cuentas OAuth sin fila en profiles.
  const { error: upsertErr } = await admin
    .from("profiles")
    .upsert(
      { id: userId, email: email ?? undefined },
      { onConflict: "id", ignoreDuplicates: true }
    );
  if (upsertErr) console.error("profile upsert warn:", upsertErr);

  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data as ProfileRow;
}

/**
 * Calcula cuántas cartas le faltan al usuario en cada expansión con total
 * oficial conocido. Usamos el mismo flujo que /api/stats y /api/collections
 * para no divergir: cartas únicas por set (por card_number) vs. total oficial
 * de la Pokémon TCG API.
 */
async function computeMissingBySet(rows: UserCardRow[]) {
  const bySet = new Map<
    string,
    { setName: string; uniqueNumbers: Set<string> }
  >();

  for (const r of rows) {
    const name = (r.set_name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const num = (r.card_number ?? "").trim() || r.id;
    const entry =
      bySet.get(key) ?? { setName: name, uniqueNumbers: new Set<string>() };
    entry.uniqueNumbers.add(num);
    bySet.set(key, entry);
  }

  if (bySet.size === 0) return [];

  let totalsMap = new Map<string, number>();
  try {
    totalsMap = await getSetTotalsByName();
  } catch (err) {
    console.warn("Profile: TCG sets fetch failed:", err);
  }

  const out: Array<{
    setName: string;
    owned: number;
    total: number | null;
    missing: number | null;
    percent: number | null;
  }> = [];
  for (const { setName, uniqueNumbers } of bySet.values()) {
    const owned = uniqueNumbers.size;
    const total = totalsMap.get(normalizeSetName(setName)) ?? null;
    const missing = total && total > 0 ? Math.max(0, total - owned) : null;
    const percent =
      total && total > 0
        ? Math.min(100, Math.round((owned / total) * 100))
        : null;
    out.push({ setName, owned, total, missing, percent });
  }

  return out.sort((a, b) => {
    // Sets con menor % al principio (los que más le faltan), luego desconocidos,
    // luego alfabético.
    const pa = a.percent ?? 101;
    const pb = b.percent ?? 101;
    if (pa !== pb) return pa - pb;
    return a.setName.localeCompare(b.setName);
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    }

    const profile = await ensureAndFetchProfile(user.id, user.email ?? null);

    const admin = createAdminClient();
    const { data: cards, error } = await admin
      .from("user_cards_detailed")
      .select("id, set_name, card_number, quantity, estimated_total_value, for_trade")
      .eq("user_id", user.id);
    if (error) throw error;

    const rows = (cards ?? []) as UserCardRow[];

    let tradeCount = 0;
    let tradeValue = 0;
    let totalCards = 0;
    let totalValue = 0;
    for (const r of rows) {
      const qty = Number(r.quantity || 0);
      const val = Number(r.estimated_total_value || 0);
      totalCards += qty;
      totalValue += val;
      if (r.for_trade) {
        tradeCount += qty;
        tradeValue += val;
      }
    }

    const missing = await computeMissingBySet(rows);

    return NextResponse.json({
      profile,
      summary: {
        totals: {
          entries: rows.length,
          totalCards,
          totalValue: Number(totalValue.toFixed(2)),
        },
        trade: {
          count: tradeCount,
          value: Number(tradeValue.toFixed(2)),
        },
        missing,
      },
    });
  } catch (error) {
    console.error("GET /api/profile error:", error);
    const msg =
      error instanceof Error ? error.message : "Error cargando el perfil.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body inválido." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in body) {
        const raw = (body as Record<string, unknown>)[field];
        // Aceptamos null explícito para borrar, o string trimeado (empty → null).
        if (raw === null) {
          patch[field] = null;
        } else if (typeof raw === "string") {
          const trimmed = raw.trim();
          patch[field] = trimmed === "" ? null : trimmed;
        }
      }
    }

    for (const field of EDITABLE_BOOL_FIELDS) {
      if (field in body) {
        const raw = (body as Record<string, unknown>)[field];
        if (typeof raw === "boolean") {
          patch[field] = raw;
        }
      }
    }

    // Validación extra: no se puede publicar en Comunidad sin @handle.
    if (patch.is_public === true) {
      const nextUsername =
        typeof patch.username === "string"
          ? patch.username
          : // Si no cambia en este PATCH, consultamos la fila existente.
            null;
      if (nextUsername === null) {
        const admin = createAdminClient();
        const { data: current } = await admin
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();
        if (!current?.username) {
          return NextResponse.json(
            {
              error:
                "Necesitas un @handle (campo \"Usuario único\") antes de publicar tu carpeta en Comunidad.",
            },
            { status: 400 }
          );
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "No hay campos válidos para actualizar." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Asegura que la fila existe antes del update (caso OAuth sin profiles).
    await admin
      .from("profiles")
      .upsert(
        { id: user.id, email: user.email ?? undefined },
        { onConflict: "id", ignoreDuplicates: true }
      );

    const { data, error } = await admin
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ profile: data });
  } catch (error) {
    console.error("PATCH /api/profile error:", error);
    const msg =
      error instanceof Error ? error.message : "No se pudo actualizar el perfil.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
