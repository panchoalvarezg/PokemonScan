"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api-client";
import { currency } from "@/lib/utils";
import type {
  InventoryItem,
  InventoryStats,
  SetCompleteness,
  TypeCompleteness,
} from "@/types";

const CONDITION_LABEL: Record<string, string> = {
  mint: "Mint",
  near_mint: "Near Mint",
  lightly_played: "Lightly Played",
  moderately_played: "Moderately Played",
  heavily_played: "Heavily Played",
  damaged: "Damaged",
};

// Paleta por tipo de Pokémon para que los indicadores visuales se sientan
// "oficiales" en la UI de completitud.
const TYPE_COLOR: Record<string, string> = {
  Colorless: "#a8a878",
  Darkness: "#4b4242",
  Dragon: "#7038f8",
  Fairy: "#ee99ac",
  Fighting: "#c03028",
  Fire: "#f08030",
  Grass: "#78c850",
  Lightning: "#f8d030",
  Metal: "#b8b8d0",
  Psychic: "#f85888",
  Water: "#6890f0",
};

function labelCondition(c: string | null | undefined): string {
  if (!c) return "—";
  return CONDITION_LABEL[c] ?? c;
}

/**
 * Pequeño hook para debouncear el input de búsqueda: evita recalcular el
 * filtro en cada pulsación y hace que la tabla se sienta responsiva incluso
 * con inventarios grandes.
 */
function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function InventoryClient() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Filtros básicos
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 200);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterRarities, setFilterRarities] = useState<string[]>([]);
  const [filterConditions, setFilterConditions] = useState<string[]>([]);
  const [filterSet, setFilterSet] = useState<string>("");

  // Filtros avanzados
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [qtyMin, setQtyMin] = useState<string>("");
  const [forTradeOnly, setForTradeOnly] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [sortKey, setSortKey] = useState<
    "recent" | "value_desc" | "value_asc" | "name" | "quantity"
  >("recent");
  const [showStats, setShowStats] = useState(true);
  // Modo de visualización del registro: tabla compacta (todo a la vista) o
  // galería (foto grande + ficha tipo carta física). La galería es lo que más
  // ayuda a distinguir cartas cuando la colección crece.
  const [viewMode, setViewMode] = useState<"table" | "gallery">("table");

  // Selección múltiple para enviar cartas en bloque a Intercambios.
  // Usamos Set<string> para operaciones O(1) al marcar/desmarcar filas.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/inventory", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "No se pudo cargar el inventario.");
      setItems(data.items ?? []);
      setMessage(`Se cargaron ${data.items?.length ?? 0} cartas.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await apiFetch("/api/stats", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo calcular estadísticas.");
      setStats(data);
    } catch (err) {
      console.warn("Stats error:", err);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      if (data.user) {
        loadInventory();
        loadStats();
      } else {
        setLoading(false);
      }
    });
  }, [loadInventory, loadStats]);

  async function removeItem(id: string) {
    setError("");
    const response = await apiFetch(`/api/inventory/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data?.error || "No se pudo eliminar.");
      return;
    }
    setMessage("Carta eliminada.");
    loadInventory();
    loadStats();
  }

  /**
   * Cambia el estado `for_trade` de una sola carta. Optimistic UI: pintamos
   * el cambio de inmediato y si el PATCH falla lo revertimos.
   */
  async function toggleForTrade(id: string, next: boolean) {
    setError("");
    const prev = items;
    setItems((curr) =>
      curr.map((it) => (it.id === id ? { ...it, for_trade: next } : it))
    );
    try {
      const res = await apiFetch(`/api/inventory/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ for_trade: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo actualizar.");
      setMessage(
        next ? "Carta marcada para intercambio." : "Carta quitada de intercambio."
      );
    } catch (err) {
      // Revertir si falla
      setItems(prev);
      setError(err instanceof Error ? err.message : "Error desconocido.");
    }
  }

  /**
   * Actualiza `for_trade` en bloque para todas las cartas seleccionadas.
   * Usa /api/inventory/bulk que aplica un único UPDATE en el server.
   */
  async function bulkSetForTrade(next: boolean) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setError("");
    const ids = [...selectedIds];
    try {
      const res = await apiFetch("/api/inventory/bulk", {
        method: "PATCH",
        body: JSON.stringify({ ids, for_trade: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo actualizar.");
      setItems((curr) =>
        curr.map((it) => (selectedIds.has(it.id) ? { ...it, for_trade: next } : it))
      );
      setMessage(
        next
          ? `Enviadas ${data.updated} carta(s) a Intercambios.`
          : `Quitadas ${data.updated} carta(s) de Intercambios.`
      );
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refreshPrices() {
    setRefreshing(true);
    setError("");
    try {
      const res = await apiFetch("/api/prices/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error refrescando precios.");
      setMessage(`Precios actualizados (${data.refreshed}/${data.attempted}).`);
      await loadInventory();
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setRefreshing(false);
    }
  }

  // Opciones de filtros únicas
  const typeOptions = useMemo(
    () => unique(items.map((i) => (i.card_type ?? "").trim()).filter(Boolean)),
    [items]
  );
  const rarityOptions = useMemo(
    () => unique(items.map((i) => (i.rarity ?? "").trim()).filter(Boolean)),
    [items]
  );
  const setOptions = useMemo(
    () => unique(items.map((i) => (i.set_name ?? "").trim()).filter(Boolean)),
    [items]
  );
  const conditionOptions = useMemo(
    () => unique(items.map((i) => i.condition).filter(Boolean)),
    [items]
  );

  const filteredItems = useMemo(() => {
    const s = debouncedSearch.trim().toLowerCase();
    const pmin = priceMin.trim() ? Number(priceMin) : null;
    const pmax = priceMax.trim() ? Number(priceMax) : null;
    const qmin = qtyMin.trim() ? Number(qtyMin) : null;

    let out = items.filter((it) => {
      if (filterTypes.length && !filterTypes.includes((it.card_type ?? "")))
        return false;
      if (filterRarities.length && !filterRarities.includes((it.rarity ?? "")))
        return false;
      if (filterConditions.length && !filterConditions.includes(it.condition))
        return false;
      if (filterSet && (it.set_name ?? "") !== filterSet) return false;

      const unitVal = Number(it.estimated_unit_value ?? 0);
      if (pmin !== null && Number.isFinite(pmin) && unitVal < pmin) return false;
      if (pmax !== null && Number.isFinite(pmax) && unitVal > pmax) return false;

      if (qmin !== null && Number.isFinite(qmin) && Number(it.quantity) < qmin)
        return false;

      if (forTradeOnly && !it.for_trade) return false;

      if (s) {
        const hay =
          `${it.product_name} ${it.card_number ?? ""} ${it.set_name ?? ""} ${it.card_type ?? ""} ${it.rarity ?? ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });

    switch (sortKey) {
      case "value_desc":
        out = out.sort(
          (a, b) => Number(b.estimated_total_value) - Number(a.estimated_total_value)
        );
        break;
      case "value_asc":
        out = out.sort(
          (a, b) => Number(a.estimated_total_value) - Number(b.estimated_total_value)
        );
        break;
      case "name":
        out = out.sort((a, b) => a.product_name.localeCompare(b.product_name));
        break;
      case "quantity":
        out = out.sort((a, b) => b.quantity - a.quantity);
        break;
      default:
        out = out.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
    return out;
  }, [
    items,
    debouncedSearch,
    filterTypes,
    filterRarities,
    filterConditions,
    filterSet,
    priceMin,
    priceMax,
    qtyMin,
    forTradeOnly,
    sortKey,
  ]);

  const filteredSummary = useMemo(() => {
    let cards = 0;
    let value = 0;
    for (const it of filteredItems) {
      cards += Number(it.quantity);
      value += Number(it.estimated_total_value);
    }
    return { entries: filteredItems.length, cards, value };
  }, [filteredItems]);

  // Resumen de las cartas seleccionadas (para la barra de acciones bulk).
  const selectionSummary = useMemo(() => {
    let cards = 0;
    let value = 0;
    let tradeOn = 0;
    for (const it of items) {
      if (!selectedIds.has(it.id)) continue;
      cards += Number(it.quantity);
      value += Number(it.estimated_total_value);
      if (it.for_trade) tradeOn += 1;
    }
    return {
      entries: selectedIds.size,
      cards,
      value,
      allForTrade: tradeOn === selectedIds.size && selectedIds.size > 0,
      anyForTrade: tradeOn > 0,
    };
  }, [items, selectedIds]);

  const visibleIds = useMemo(
    () => filteredItems.map((it) => it.id),
    [filteredItems]
  );
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function resetFilters() {
    setSearch("");
    setFilterTypes([]);
    setFilterRarities([]);
    setFilterConditions([]);
    setFilterSet("");
    setPriceMin("");
    setPriceMax("");
    setQtyMin("");
    setForTradeOnly(false);
    setSortKey("recent");
  }

  function toggleIn(
    list: string[],
    value: string,
    setter: (v: string[]) => void
  ) {
    if (list.includes(value)) setter(list.filter((x) => x !== value));
    else setter([...list, value]);
  }

  function exportCSV() {
    const headers = [
      "Nombre",
      "Número",
      "Expansión",
      "Tipo",
      "Rareza",
      "Condición",
      "Cantidad",
      "Valor unitario",
      "Valor total",
      "Para intercambio",
      "Creado",
    ];
    const esc = (val: unknown) => {
      const s = val == null ? "" : String(val);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filteredItems.map((it) =>
      [
        it.product_name,
        it.card_number ?? "",
        it.set_name ?? "",
        it.card_type ?? "",
        it.rarity ?? "",
        labelCondition(it.condition),
        it.quantity,
        Number(it.estimated_unit_value ?? 0),
        Number(it.estimated_total_value ?? 0),
        it.for_trade ? "Sí" : "No",
        it.created_at,
      ]
        .map(esc)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventario-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Chips de filtros activos con quick-remove
  const activeChips: Array<{ label: string; onRemove: () => void }> = [];
  if (debouncedSearch.trim())
    activeChips.push({
      label: `Buscar: "${debouncedSearch.trim()}"`,
      onRemove: () => setSearch(""),
    });
  for (const t of filterTypes)
    activeChips.push({
      label: `Tipo: ${t}`,
      onRemove: () => setFilterTypes(filterTypes.filter((x) => x !== t)),
    });
  for (const r of filterRarities)
    activeChips.push({
      label: `Rareza: ${r}`,
      onRemove: () => setFilterRarities(filterRarities.filter((x) => x !== r)),
    });
  for (const c of filterConditions)
    activeChips.push({
      label: `Condición: ${labelCondition(c)}`,
      onRemove: () =>
        setFilterConditions(filterConditions.filter((x) => x !== c)),
    });
  if (filterSet)
    activeChips.push({
      label: `Expansión: ${filterSet}`,
      onRemove: () => setFilterSet(""),
    });
  if (priceMin)
    activeChips.push({
      label: `Valor ≥ ${currency(Number(priceMin) || 0)}`,
      onRemove: () => setPriceMin(""),
    });
  if (priceMax)
    activeChips.push({
      label: `Valor ≤ ${currency(Number(priceMax) || 0)}`,
      onRemove: () => setPriceMax(""),
    });
  if (qtyMin)
    activeChips.push({
      label: `Cantidad ≥ ${qtyMin}`,
      onRemove: () => setQtyMin(""),
    });
  if (forTradeOnly)
    activeChips.push({
      label: "Solo para intercambio",
      onRemove: () => setForTradeOnly(false),
    });

  if (!userEmail) {
    return (
      <div className="card">
        <p>
          Debes{" "}
          <a href="/login" className="brand">
            iniciar sesión
          </a>{" "}
          para ver tu inventario.
        </p>
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="card form">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div>
            <p className="font-bold">Inventario de {userEmail}</p>
            <p className="small">
              Filtros avanzados y estadísticas de completitud sobre tu
              colección. Los precios se sincronizan con Pokemon Price Tracker.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div
              role="tablist"
              aria-label="Modo de vista"
              className="inline-flex rounded overflow-hidden border border-gray-300"
            >
              <button
                role="tab"
                aria-selected={viewMode === "table"}
                className={`px-3 py-1 text-sm ${
                  viewMode === "table"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700"
                }`}
                onClick={() => setViewMode("table")}
                title="Ver como tabla"
              >
                Tabla
              </button>
              <button
                role="tab"
                aria-selected={viewMode === "gallery"}
                className={`px-3 py-1 text-sm ${
                  viewMode === "gallery"
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700"
                }`}
                onClick={() => setViewMode("gallery")}
                title="Ver como galería con foto grande"
              >
                Galería
              </button>
            </div>
            <a
              className="button secondary"
              href="/collections"
              title="Ver las cartas agrupadas por expansión"
            >
              Colecciones
            </a>
            <button
              className="button secondary"
              onClick={() => setShowStats((s) => !s)}
            >
              {showStats ? "Ocultar estadísticas" : "Ver estadísticas"}
            </button>
            <button
              className="button secondary"
              onClick={exportCSV}
              disabled={filteredItems.length === 0}
              title="Exporta el inventario filtrado actual"
            >
              Exportar CSV
            </button>
            <button
              className="button secondary"
              onClick={() => {
                loadInventory();
                loadStats();
              }}
              disabled={loading}
            >
              {loading ? "Cargando…" : "Recargar"}
            </button>
            <button className="button" onClick={refreshPrices} disabled={refreshing}>
              {refreshing ? "Actualizando…" : "Refrescar precios"}
            </button>
          </div>
        </div>
        {message && <div className="notice">{message}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      {showStats && stats && <StatsPanel stats={stats} />}

      {/* Panel de filtros */}
      <div className="card">
        <div className="grid gap-3 md:grid-cols-6">
          <label className="block md:col-span-2">
            <span className="text-xs text-gray-500">Buscar</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, número, set…"
              className="mt-1 w-full rounded border border-gray-300 p-2"
            />
          </label>
          <MultiSelect
            label="Tipo"
            options={typeOptions}
            selected={filterTypes}
            onToggle={(v) => toggleIn(filterTypes, v, setFilterTypes)}
          />
          <MultiSelect
            label="Rareza"
            options={rarityOptions}
            selected={filterRarities}
            onToggle={(v) => toggleIn(filterRarities, v, setFilterRarities)}
          />
          <MultiSelect
            label="Condición"
            options={conditionOptions}
            selected={filterConditions}
            onToggle={(v) => toggleIn(filterConditions, v, setFilterConditions)}
            renderOption={labelCondition}
          />
          <label className="block">
            <span className="text-xs text-gray-500">Expansión</span>
            <select
              value={filterSet}
              onChange={(e) => setFilterSet(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 p-2"
            >
              <option value="">Todas</option>
              {setOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            className="text-xs text-gray-600 underline"
            onClick={() => setShowAdvanced((s) => !s)}
          >
            {showAdvanced ? "Ocultar filtros avanzados" : "Mostrar filtros avanzados"}
          </button>
          <div className="small">
            Mostrando <strong>{filteredSummary.entries}</strong> entradas ·{" "}
            <strong>{filteredSummary.cards}</strong> cartas · valor{" "}
            <strong>{currency(filteredSummary.value)}</strong>
          </div>
        </div>

        {showAdvanced && (
          <div className="grid gap-3 md:grid-cols-5 mt-3 items-end">
            <label className="block">
              <span className="text-xs text-gray-500">Valor mínimo ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded border border-gray-300 p-2"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Valor máximo ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="sin límite"
                className="mt-1 w-full rounded border border-gray-300 p-2"
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Cantidad mínima</span>
              <input
                type="number"
                min="1"
                step="1"
                value={qtyMin}
                onChange={(e) => setQtyMin(e.target.value)}
                placeholder="1"
                className="mt-1 w-full rounded border border-gray-300 p-2"
              />
            </label>
            <label className="flex items-center gap-2 mt-4 md:mt-0">
              <input
                type="checkbox"
                checked={forTradeOnly}
                onChange={(e) => setForTradeOnly(e.target.checked)}
              />
              <span className="text-xs text-gray-700">Solo para intercambio</span>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Ordenar por</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
                className="mt-1 w-full rounded border border-gray-300 p-2"
              >
                <option value="recent">Más recientes</option>
                <option value="value_desc">Mayor valor</option>
                <option value="value_asc">Menor valor</option>
                <option value="name">Nombre (A–Z)</option>
                <option value="quantity">Cantidad</option>
              </select>
            </label>
          </div>
        )}

        {(activeChips.length > 0 || sortKey !== "recent") && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            {activeChips.map((chip, idx) => (
              <span
                key={`${chip.label}-${idx}`}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 text-xs px-2 py-1"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="ml-1 text-blue-700 hover:text-blue-900"
                  aria-label={`Quitar filtro ${chip.label}`}
                >
                  ×
                </button>
              </span>
            ))}
            <button className="button secondary ml-auto" onClick={resetFilters}>
              Limpiar todo
            </button>
          </div>
        )}
      </div>

      {/* Barra de acciones bulk (sólo visible si hay algo seleccionado). */}
      {selectedIds.size > 0 && (
        <div
          className="card"
          style={{
            borderColor: "#93c5fd",
            background: "#eff6ff",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold">
                {selectionSummary.entries} seleccionadas ·{" "}
                {selectionSummary.cards} cartas · valor{" "}
                {currency(selectionSummary.value)}
              </p>
              <p className="small">
                Envía estas cartas a tu carpeta de Intercambios o quítalas de
                allí.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="button"
                onClick={() => bulkSetForTrade(true)}
                disabled={bulkBusy || selectionSummary.allForTrade}
                title={
                  selectionSummary.allForTrade
                    ? "Todas ya están en Intercambios"
                    : "Marcar las seleccionadas para intercambio"
                }
              >
                {bulkBusy ? "Guardando…" : "Mover a Intercambios"}
              </button>
              <button
                className="button secondary"
                onClick={() => bulkSetForTrade(false)}
                disabled={bulkBusy || !selectionSummary.anyForTrade}
                title="Quitar las seleccionadas de Intercambios"
              >
                Quitar de Intercambios
              </button>
              <button
                className="button secondary"
                onClick={() => setSelectedIds(new Set())}
                disabled={bulkBusy}
              >
                Limpiar selección
              </button>
            </div>
          </div>
        </div>
      )}

      {viewMode === "table" ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas las cartas visibles"
                    checked={allVisibleSelected}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) {
                          for (const id of visibleIds) next.add(id);
                        } else {
                          for (const id of visibleIds) next.delete(id);
                        }
                        return next;
                      });
                    }}
                  />
                </th>
                <th></th>
                <th>Carta</th>
                <th>Expansión</th>
                <th>Tipo</th>
                <th>Rareza</th>
                <th>Condición</th>
                <th>Cantidad</th>
                <th>Valor unitario</th>
                <th>Valor total</th>
                <th title="Marcar para intercambio">Intercambio</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 && !loading ? (
                <tr>
                  <td colSpan={12} className="small" style={{ textAlign: "center" }}>
                    {items.length === 0 ? (
                      <>
                        Aún no tienes cartas. Ve al{" "}
                        <a className="brand" href="/scanner">
                          escáner
                        </a>
                        .
                      </>
                    ) : (
                      "Ninguna carta coincide con los filtros."
                    )}
                  </td>
                </tr>
              ) : null}
              {filteredItems.map((item) => (
                <tr
                  key={item.id}
                  style={{
                    background: selectedIds.has(item.id) ? "#eff6ff" : undefined,
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${item.product_name}`}
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                  </td>
                  <td>
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.product_name}
                        style={{
                          width: 40,
                          height: 56,
                          objectFit: "contain",
                          borderRadius: 4,
                        }}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                    {item.card_number ? (
                      <div className="small">#{item.card_number}</div>
                    ) : null}
                  </td>
                  <td>{item.set_name ?? "—"}</td>
                  <td>{item.card_type ?? "—"}</td>
                  <td>{item.rarity ?? "—"}</td>
                  <td>{labelCondition(item.condition)}</td>
                  <td>{item.quantity}</td>
                  <td>{currency(Number(item.estimated_unit_value ?? 0))}</td>
                  <td>{currency(Number(item.estimated_total_value ?? 0))}</td>
                  <td>
                    <TradeToggle
                      active={!!item.for_trade}
                      onClick={() => toggleForTrade(item.id, !item.for_trade)}
                    />
                  </td>
                  <td>
                    <button
                      className="button secondary"
                      onClick={() => removeItem(item.id)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <GalleryGrid
          items={filteredItems}
          hasAnyItem={items.length > 0}
          onRemove={removeItem}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleTrade={toggleForTrade}
        />
      )}
    </div>
  );
}

/**
 * Vista "galería" del registro: muestra cada carta como una ficha con la foto
 * grande, nombre, set, número, rareza, tipo y totales de valor. Pensada para
 * cuando el usuario quiere distinguir cartas visualmente en lugar de leer una
 * tabla larga. Se adapta a móvil (columnas automáticas).
 */
function GalleryGrid({
  items,
  hasAnyItem,
  onRemove,
  selectedIds,
  onToggleSelect,
  onToggleTrade,
}: {
  items: InventoryItem[];
  hasAnyItem: boolean;
  onRemove: (id: string) => void | Promise<void>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleTrade: (id: string, next: boolean) => void | Promise<void>;
}) {
  if (items.length === 0) {
    return (
      <div className="card">
        <p className="small" style={{ textAlign: "center" }}>
          {hasAnyItem ? (
            "Ninguna carta coincide con los filtros."
          ) : (
            <>
              Aún no tienes cartas. Ve al{" "}
              <a className="brand" href="/scanner">
                escáner
              </a>
              .
            </>
          )}
        </p>
      </div>
    );
  }
  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
      }}
    >
      {items.map((item) => {
        const unit = Number(item.estimated_unit_value ?? 0);
        const total = Number(item.estimated_total_value ?? 0);
        const typeColor = item.card_type
          ? TYPE_COLOR[item.card_type.split(/[\s,/]+/)[0]]
          : undefined;
        const selected = selectedIds.has(item.id);
        return (
          <div
            key={item.id}
            className="rounded-lg border bg-white p-3 flex flex-col gap-2"
            style={{
              minHeight: 340,
              borderColor: selected ? "#60a5fa" : "#e5e7eb",
              boxShadow: selected ? "0 0 0 2px #bfdbfe" : undefined,
            }}
          >
            <div
              className="rounded-md bg-gray-50 flex items-center justify-center overflow-hidden relative"
              style={{ aspectRatio: "3 / 4" }}
            >
              {/* Checkbox superpuesto arriba-izquierda */}
              <label
                className="absolute top-1 left-1 bg-white/90 rounded p-1 shadow cursor-pointer"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(item.id)}
                  aria-label={`Seleccionar ${item.product_name}`}
                />
              </label>
              {/* Toggle de intercambio arriba-derecha */}
              <div
                className="absolute top-1 right-1"
                onClick={(e) => e.stopPropagation()}
              >
                <TradeToggle
                  active={!!item.for_trade}
                  onClick={() => onToggleTrade(item.id, !item.for_trade)}
                  compact
                />
              </div>
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.product_name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <span className="text-xs text-gray-400">Sin imagen</span>
              )}
            </div>
            <div className="flex items-start justify-between gap-2">
              <div style={{ minWidth: 0 }}>
                <p
                  className="font-bold truncate"
                  title={item.product_name}
                >
                  {item.product_name}
                </p>
                <p className="small truncate" title={item.set_name ?? ""}>
                  {item.set_name ?? "Sin expansión"}
                  {item.card_number ? ` · #${item.card_number}` : ""}
                </p>
              </div>
              {item.quantity > 1 ? (
                <span className="rounded-full bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 shrink-0">
                  ×{item.quantity}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              {item.card_type ? (
                <span
                  className="rounded-full text-xs px-2 py-0.5"
                  style={{
                    background: typeColor ? `${typeColor}22` : "#e5e7eb",
                    color: typeColor ?? "#374151",
                    border: typeColor ? `1px solid ${typeColor}55` : "1px solid #d1d5db",
                  }}
                >
                  {item.card_type}
                </span>
              ) : null}
              {item.rarity ? (
                <span className="rounded-full bg-amber-100 text-amber-800 text-xs px-2 py-0.5">
                  {item.rarity}
                </span>
              ) : null}
              <span className="rounded-full bg-gray-100 text-gray-700 text-xs px-2 py-0.5">
                {labelCondition(item.condition)}
              </span>
            </div>
            <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-500">Unitario</p>
                <p className="font-semibold">{currency(unit)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Total</p>
                <p className="font-semibold">{currency(total)}</p>
              </div>
            </div>
            <button
              className="button secondary"
              onClick={() => onRemove(item.id)}
              style={{ marginTop: 4 }}
            >
              Eliminar
            </button>
          </div>
        );
      })}
    </div>
  );
}

function StatsPanel({ stats }: { stats: InventoryStats }) {
  const hasData = stats.totalEntries > 0;
  const predominantType = stats.byType[0]?.key ?? "—";
  const predominantRarity = stats.byRarity[0]?.key ?? "—";

  return (
    <div className="card">
      <h3 className="font-bold text-lg mb-2">Estadísticas de tu colección</h3>

      {!hasData && (
        <p className="small">
          Aún no tienes cartas para calcular estadísticas. Agrega una desde el
          escáner.
        </p>
      )}

      {hasData && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <KPI label="Cartas totales" value={String(stats.totalCards)} />
            <KPI label="Entradas distintas" value={String(stats.totalEntries)} />
            <KPI label="Expansiones" value={String(stats.uniqueSets)} />
            <KPI label="Tipos" value={String(stats.uniqueTypes)} />
            <KPI label="Valor total" value={currency(stats.totalValue)} />
            <KPI label="Valor promedio" value={currency(stats.averageValue)} />
            <KPI
              label="Carta más cara (unitaria)"
              value={currency(stats.maxValue)}
            />
            <KPI label="Tipo predominante" value={predominantType} />
            <KPI label="Rareza predominante" value={predominantRarity} />
            {stats.globalCompletenessPercent !== null && (
              <KPI
                label="Completitud promedio"
                value={`${stats.globalCompletenessPercent}%`}
              />
            )}
            <KPI
              label="Cobertura de tipos"
              value={`${stats.typeCompleteness.typesCovered} / ${stats.typeCompleteness.totalKnownTypes}`}
            />
          </div>

          {/* Completitud por expansión */}
          {stats.setCompleteness.length > 0 && (
            <div className="rounded-lg border border-gray-200 p-3 mt-4">
              <p className="font-bold mb-2">Completitud por expansión</p>
              <p className="small mb-3">
                Basada en el total oficial de cartas de cada set (Pokemon TCG
                API). Los sets sin datos se muestran como desconocidos.
              </p>
              <div className="space-y-3">
                {stats.setCompleteness.map((s) => (
                  <SetCompletenessRow key={s.setName} row={s} />
                ))}
              </div>
            </div>
          )}

          {/* Completitud por tipo */}
          {stats.typeCompleteness.items.length > 0 && (
            <div className="rounded-lg border border-gray-200 p-3 mt-4">
              <p className="font-bold mb-2">Completitud por tipo</p>
              <p className="small mb-3">
                Tienes al menos una carta de{" "}
                <strong>{stats.typeCompleteness.typesCovered}</strong> de los{" "}
                <strong>{stats.typeCompleteness.totalKnownTypes}</strong> tipos
                del TCG moderno ({stats.typeCompleteness.overallPercent}%).
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {stats.typeCompleteness.items.map((t) => (
                  <TypeCompletenessRow
                    key={t.type}
                    row={t}
                    totalCards={stats.totalCards}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 mt-4">
            <Distribution title="Por tipo" rows={stats.byType} total={stats.totalCards} />
            <Distribution
              title="Por rareza"
              rows={stats.byRarity}
              total={stats.totalCards}
            />
            <Distribution
              title="Por condición"
              rows={stats.byCondition.map((r) => ({ ...r, key: labelCondition(r.key) }))}
              total={stats.totalCards}
            />
            <Distribution title="Por expansión" rows={stats.bySet} total={stats.totalCards} />
          </div>

          {stats.topCards.length > 0 && (
            <div className="mt-4">
              <h4 className="font-bold mb-2">Top 5 cartas más valiosas</h4>
              <ol className="space-y-1 list-decimal ml-5">
                {stats.topCards.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium">{c.product_name}</span>
                    {c.set_name ? (
                      <span className="small"> · {c.set_name}</span>
                    ) : null}
                    <span className="small">
                      {" "}
                      — {currency(c.estimated_total_value)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SetCompletenessRow({ row }: { row: SetCompleteness }) {
  const known = row.percent !== null && row.total !== null;
  const pct = row.percent ?? 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="font-medium">{row.setName}</span>
        <span className="text-gray-500">
          {row.owned}
          {known ? ` / ${row.total}` : " / ?"}
          {known ? ` · ${pct}%` : " · total desconocido"}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded h-2 mt-1">
        <div
          className={known ? "bg-green-500 h-2 rounded" : "bg-gray-300 h-2 rounded"}
          style={{ width: `${known ? pct : 100}%` }}
        />
      </div>
    </div>
  );
}

function TypeCompletenessRow({
  row,
  totalCards,
}: {
  row: TypeCompleteness;
  totalCards: number;
}) {
  const color = TYPE_COLOR[row.type] ?? "#60a5fa";
  const pct =
    totalCards > 0 ? Math.round((row.cardsOwned / totalCards) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: 9999,
              background: color,
            }}
          />
          <span className="font-medium">{row.type}</span>
        </span>
        <span className="text-gray-500">
          {row.cardsOwned} carta{row.cardsOwned === 1 ? "" : "s"} · {pct}%
          {row.hasIt ? "" : " · sin cartas"}
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded h-2 mt-1">
        <div
          className="h-2 rounded"
          style={{ width: `${pct}%`, background: row.hasIt ? color : "#e5e7eb" }}
        />
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

function Distribution({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<{ key: string; count: number; value: number }>;
  total: number;
}) {
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="font-bold mb-2">{title}</p>
      <div className="space-y-2">
        {rows.slice(0, 8).map((r) => {
          const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
          return (
            <div key={r.key}>
              <div className="flex justify-between text-xs">
                <span>{r.key}</span>
                <span className="text-gray-500">
                  {r.count} ({pct}%) · {currency(r.value)}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded h-2 mt-1">
                <div
                  className="bg-blue-500 h-2 rounded"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Dropdown estilo "multi-select" con checkboxes. Se renderiza como un
 * <details> nativo para no depender de librerías externas; es accesible
 * (teclado/SR) y contrae el panel al hacer click fuera.
 */
function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  renderOption,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  renderOption?: (value: string) => string;
}) {
  const summary =
    selected.length === 0
      ? "Todos"
      : selected.length === 1
        ? renderOption
          ? renderOption(selected[0])
          : selected[0]
        : `${selected.length} seleccionados`;

  return (
    <label className="block relative">
      <span className="text-xs text-gray-500">{label}</span>
      <details className="mt-1">
        <summary className="cursor-pointer list-none w-full rounded border border-gray-300 p-2 bg-white flex justify-between items-center">
          <span className="truncate">{summary}</span>
          <span className="text-gray-400 text-xs ml-2">▾</span>
        </summary>
        <div
          className="absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded border border-gray-200 bg-white shadow-lg"
          role="listbox"
        >
          {options.length === 0 ? (
            <p className="p-2 text-xs text-gray-500">Sin opciones.</p>
          ) : (
            options.map((opt) => {
              const checked = selected.includes(opt);
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(opt)}
                  />
                  <span>{renderOption ? renderOption(opt) : opt}</span>
                </label>
              );
            })
          )}
        </div>
      </details>
    </label>
  );
}

function unique(arr: string[]): string[] {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b));
}

/**
 * Botón estrella para marcar / desmarcar una carta como "disponible para
 * intercambio". En modo `compact` sólo muestra el ícono (ideal para el
 * corner de la galería); en modo normal muestra ícono + label.
 */
function TradeToggle({
  active,
  onClick,
  compact = false,
}: {
  active: boolean;
  onClick: () => void | Promise<void>;
  compact?: boolean;
}) {
  const title = active
    ? "Disponible para intercambio (click para quitar)"
    : "Marcar disponible para intercambio";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={
        compact
          ? `rounded-full p-1 shadow text-sm leading-none ${
              active
                ? "bg-amber-400 text-white"
                : "bg-white/90 text-gray-400 hover:text-amber-500"
            }`
          : `rounded-full px-2 py-1 text-xs font-semibold border ${
              active
                ? "bg-amber-400 text-white border-amber-500"
                : "bg-white text-gray-500 border-gray-300 hover:text-amber-500 hover:border-amber-300"
            }`
      }
      style={{ minWidth: compact ? 26 : undefined }}
    >
      {active ? "★" : "☆"}
      {compact ? null : (
        <span className="ml-1">{active ? "En intercambio" : "Intercambiar"}</span>
      )}
    </button>
  );
}
