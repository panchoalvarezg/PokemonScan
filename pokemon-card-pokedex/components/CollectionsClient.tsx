"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { currency } from "@/lib/utils";

type CollectionCard = {
  id: string;
  product_name: string;
  set_name?: string | null;
  card_number: string | null;
  card_type: string | null;
  rarity: string | null;
  condition: string | null;
  image_url: string | null;
  quantity: number;
  estimated_unit_value: number;
  estimated_total_value: number;
  for_trade?: boolean;
};

type CollectionGroup = {
  setName: string;
  owned: number;
  uniqueOwned: number;
  total: number | null;
  percent: number | null;
  totalValue: number;
  cards: CollectionCard[];
};

type CollectionsResponse = {
  collections: CollectionGroup[];
  unclassified: CollectionGroup | null;
  tradeCollection: CollectionGroup | null;
  summary: {
    totalCollections: number;
    totalCards: number;
    totalValue: number;
    tradeCards?: number;
    tradeValue?: number;
  };
};

type MissingRow = {
  setName: string;
  owned: number;
  total: number | null;
  missing: number | null;
  percent: number | null;
};

/**
 * Cliente de la pantalla /collections. Cada colección se renderiza como un
 * <details> colapsable: header con progreso + mosaico de cartas al abrir.
 */
export function CollectionsClient() {
  const [data, setData] = useState<CollectionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/collections", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Error cargando colecciones.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      if (data.user) load();
      else setLoading(false);
    });
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [] as CollectionGroup[];
    const s = search.trim().toLowerCase();
    const all = [...data.collections];
    if (data.unclassified) all.push(data.unclassified);
    if (!s) return all;
    return all
      .map((c) => ({
        ...c,
        cards: c.cards.filter((card) =>
          `${card.product_name} ${card.card_number ?? ""}`
            .toLowerCase()
            .includes(s)
        ),
      }))
      .filter((c) => c.setName.toLowerCase().includes(s) || c.cards.length > 0);
  }, [data, search]);

  /**
   * Resumen de cuenta: cuántas cartas faltan en cada expansión para
   * completarla. Se deriva de data.collections (total y uniqueOwned ya vienen
   * calculados por /api/collections contra la Pokémon TCG API). Los sets cuya
   * completitud no conocemos (sin total oficial) quedan al final.
   */
  const missingRows = useMemo(() => {
    if (!data) return [] as MissingRow[];
    return data.collections
      .map<MissingRow>((c) => {
        const total = c.total;
        const owned = c.uniqueOwned;
        const missing =
          total !== null && total > 0 ? Math.max(0, total - owned) : null;
        const percent =
          total !== null && total > 0
            ? Math.min(100, Math.round((owned / total) * 100))
            : null;
        return { setName: c.setName, owned, total, missing, percent };
      })
      .sort((a, b) => {
        const pa = a.percent ?? 101;
        const pb = b.percent ?? 101;
        if (pa !== pb) return pa - pb;
        return a.setName.localeCompare(b.setName);
      });
  }, [data]);

  // La pestaña de Intercambios se filtra igual que las demás pero se pinta
  // arriba con estilo destacado.
  const filteredTrade = useMemo(() => {
    if (!data?.tradeCollection) return null;
    const s = search.trim().toLowerCase();
    if (!s) return data.tradeCollection;
    const cards = data.tradeCollection.cards.filter((card) =>
      `${card.product_name} ${card.card_number ?? ""} ${card.set_name ?? ""}`
        .toLowerCase()
        .includes(s)
    );
    if (cards.length === 0 && !"intercambios".includes(s)) return null;
    return { ...data.tradeCollection, cards };
  }, [data, search]);

  if (!userEmail) {
    return (
      <div className="card">
        <p>
          Debes{" "}
          <a href="/login" className="brand">
            iniciar sesión
          </a>{" "}
          para ver tus colecciones.
        </p>
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold">Colecciones de {userEmail}</p>
            <p className="small">
              Cada set se calcula automáticamente a partir de las cartas que
              tienes guardadas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a className="button secondary" href="/inventory">
              Volver al inventario
            </a>
            <button
              className="button secondary"
              onClick={load}
              disabled={loading}
            >
              {loading ? "Cargando…" : "Recargar"}
            </button>
          </div>
        </div>
        {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

        {data && (
          <div className="grid gap-3 md:grid-cols-4 mt-3">
            <KPI
              label="Expansiones"
              value={String(data.summary.totalCollections)}
            />
            <KPI
              label="Cartas totales"
              value={String(data.summary.totalCards)}
            />
            <KPI label="Valor total" value={currency(data.summary.totalValue)} />
            <KPI
              label="En intercambio"
              value={`${data.summary.tradeCards ?? 0} · ${currency(
                data.summary.tradeValue ?? 0
              )}`}
            />
          </div>
        )}

        <div className="mt-3">
          <label className="block">
            <span className="text-xs text-gray-500">Buscar set o carta</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ej. Scarlet, Pikachu, 025…"
              className="mt-1 w-full rounded border border-gray-300 p-2"
            />
          </label>
        </div>
      </div>

      {loading && !data && (
        <div className="card">
          <p className="small">Cargando colecciones…</p>
        </div>
      )}

      {data && filtered.length === 0 && !loading && (
        <div className="card">
          <p className="small">
            {data.collections.length === 0 && !data.unclassified ? (
              <>
                Aún no tienes cartas. Ve al{" "}
                <a className="brand" href="/scanner">
                  escáner
                </a>{" "}
                para añadir tu primera carta.
              </>
            ) : (
              "No hay colecciones que coincidan con tu búsqueda."
            )}
          </p>
        </div>
      )}

      {/* Resumen de cuenta: cuántas cartas faltan por expansión para
          completar cada set. Antes vivía en /profile; lo movimos aquí para
          quedar junto a la vista de colecciones. */}
      {data && missingRows.length > 0 && (
        <div className="card">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold text-lg">Resumen de cuenta</h2>
              <p className="small">
                Cuántas cartas te faltan por expansión para completarla. Se
                calcula con los totales oficiales de la Pokémon TCG API.
              </p>
            </div>
          </div>
          <div className="grid gap-2 mt-3">
            {missingRows.map((row) => (
              <MissingRowCard key={row.setName} row={row} />
            ))}
          </div>
        </div>
      )}

      {/* Pestaña Intercambios: primera y destacada con color ámbar. */}
      {filteredTrade && (
        <CollectionSection group={filteredTrade} variant="trade" />
      )}

      {filtered.map((group) => (
        <CollectionSection key={group.setName} group={group} />
      ))}
    </div>
  );
}

function CollectionSection({
  group,
  variant = "default",
}: {
  group: CollectionGroup;
  variant?: "default" | "trade";
}) {
  const known = group.percent !== null && group.total !== null;
  const pct = group.percent ?? 0;
  const isTrade = variant === "trade";

  return (
    <details
      className="card"
      open
      style={
        isTrade
          ? {
              borderColor: "#f59e0b",
              background: "#fffbeb",
            }
          : undefined
      }
    >
      <summary
        className="cursor-pointer list-none"
        style={{ display: "block" }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div style={{ minWidth: 0 }}>
            <p className="font-bold text-lg truncate" title={group.setName}>
              {isTrade ? "★ " : ""}
              {group.setName}
              {isTrade ? (
                <span
                  className="ml-2 rounded-full bg-amber-500 text-white text-xs font-semibold px-2 py-0.5 align-middle"
                  style={{ verticalAlign: "middle" }}
                >
                  Disponibles para intercambio
                </span>
              ) : null}
            </p>
            <p className="small">
              {group.uniqueOwned}
              {known ? ` / ${group.total}` : isTrade ? "" : " / ?"} cartas
              {isTrade ? " marcadas" : " únicas"} · {group.owned} en total ·
              valor <strong>{currency(group.totalValue)}</strong>
            </p>
          </div>
          <div className="text-right" style={{ minWidth: 140 }}>
            {isTrade ? (
              <>
                <p className="font-bold text-lg">
                  {currency(group.totalValue)}
                </p>
                <p className="text-xs text-gray-500">Valor total de la carpeta</p>
              </>
            ) : (
              <>
                <p className="font-bold text-lg">
                  {known ? `${pct}%` : "—"}
                </p>
                <p className="text-xs text-gray-500">Completitud</p>
              </>
            )}
          </div>
        </div>
        {!isTrade && (
          <div className="w-full bg-gray-100 rounded h-2 mt-3">
            <div
              className={
                known ? "bg-green-500 h-2 rounded" : "bg-gray-300 h-2 rounded"
              }
              style={{ width: `${known ? pct : 100}%` }}
            />
          </div>
        )}
        {isTrade && (
          <p className="small mt-2" style={{ color: "#78350f" }}>
            Carpeta especial con las cartas que marcaste como disponibles para
            intercambio desde el inventario. Sus datos y valor se actualizan
            automáticamente al marcar/desmarcar.
          </p>
        )}
      </summary>

      <div
        className="grid gap-3 mt-4"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        }}
      >
        {group.cards.map((card) => (
          <CollectionCardTile
            key={card.id}
            card={card}
            showSet={isTrade}
          />
        ))}
      </div>
    </details>
  );
}

function CollectionCardTile({
  card,
  showSet = false,
}: {
  card: CollectionCard;
  showSet?: boolean;
}) {
  const tooltip = `${card.product_name}${
    card.card_number ? ` · #${card.card_number}` : ""
  }${card.set_name ? ` · ${card.set_name}` : ""}${
    card.rarity ? ` · ${card.rarity}` : ""
  } — unit ${currency(card.estimated_unit_value)}`;
  return (
    <div
      className="rounded-md border border-gray-200 bg-white p-2 flex flex-col gap-1"
      title={tooltip}
    >
      <div
        className="rounded bg-gray-50 overflow-hidden flex items-center justify-center relative"
        style={{ aspectRatio: "3 / 4" }}
      >
        {card.image_url ? (
          <img
            src={card.image_url}
            alt={card.product_name}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <span className="text-xs text-gray-400">Sin imagen</span>
        )}
        {card.for_trade ? (
          <span
            aria-label="En intercambio"
            className="absolute top-1 right-1 bg-amber-400 text-white rounded-full text-xs px-1.5 py-0.5 shadow"
            title="Disponible para intercambio"
          >
            ★
          </span>
        ) : null}
      </div>
      <p className="text-xs font-semibold truncate" title={card.product_name}>
        {card.product_name}
      </p>
      {showSet && card.set_name ? (
        <p className="text-[10px] text-gray-500 truncate" title={card.set_name}>
          {card.set_name}
        </p>
      ) : null}
      {(card.rarity || card.card_type) && (
        <p className="text-[10px] text-gray-500 truncate">
          {[card.card_type, card.rarity].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {card.card_number ? `#${card.card_number}` : "—"}
        </span>
        <span className="text-xs font-semibold">
          {currency(card.estimated_total_value)}
          {card.quantity > 1 ? (
            <span className="text-gray-500"> ×{card.quantity}</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-bold text-lg">{value}</p>
    </div>
  );
}

/**
 * Fila del "Resumen de cuenta": muestra set, poseídas/total, faltantes y %
 * de completitud con barra de progreso. Si no conocemos el total oficial,
 * lo indicamos en gris para que el usuario sepa por qué no hay %.
 */
function MissingRowCard({ row }: { row: MissingRow }) {
  const known = row.total !== null && row.percent !== null;
  const pct = row.percent ?? 0;
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div style={{ minWidth: 0 }}>
          <p className="font-semibold truncate" title={row.setName}>
            {row.setName}
          </p>
          <p className="small">
            {row.owned}
            {known ? ` / ${row.total}` : " / ?"} cartas únicas
            {known && row.missing !== null
              ? ` · faltan ${row.missing}`
              : " · total oficial desconocido"}
          </p>
        </div>
        <div className="text-right" style={{ minWidth: 80 }}>
          <p className="font-bold text-lg">{known ? `${pct}%` : "—"}</p>
          <p className="text-xs text-gray-500">Completitud</p>
        </div>
      </div>
      <div className="w-full bg-gray-100 rounded h-2 mt-2">
        <div
          className={
            known ? "bg-green-500 h-2 rounded" : "bg-gray-300 h-2 rounded"
          }
          style={{ width: `${known ? pct : 100}%` }}
        />
      </div>
    </div>
  );
}
