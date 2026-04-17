"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { currency } from "@/lib/utils";
import type { InventoryItem } from "@/types";

export function InventoryClient() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/inventory", { cache: "no-store" });
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

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      if (data.user) loadInventory();
      else setLoading(false);
    });
  }, [loadInventory]);

  async function removeItem(id: string) {
    setError("");
    const response = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data?.error || "No se pudo eliminar.");
      return;
    }
    setMessage("Carta eliminada.");
    loadInventory();
  }

  async function refreshPrices() {
    setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/prices/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error refrescando precios.");
      setMessage(`Precios actualizados (${data.refreshed}/${data.attempted}).`);
      await loadInventory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setRefreshing(false);
    }
  }

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
              Tu inventario se actualiza automáticamente cuando agregas cartas
              desde el escáner. Los precios se sincronizan con Pokemon Price
              Tracker.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className="button secondary"
              onClick={loadInventory}
              disabled={loading}
            >
              {loading ? "Cargando…" : "Recargar"}
            </button>
            <button
              className="button"
              onClick={refreshPrices}
              disabled={refreshing}
            >
              {refreshing ? "Actualizando…" : "Refrescar precios"}
            </button>
          </div>
        </div>
        {message && <div className="notice">{message}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Carta</th>
              <th>Expansión</th>
              <th>Tipo</th>
              <th>Condición</th>
              <th>Cantidad</th>
              <th>Valor unitario</th>
              <th>Valor total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={9} className="small" style={{ textAlign: "center" }}>
                  Aún no tienes cartas. Ve al{" "}
                  <a className="brand" href="/scanner">
                    escáner
                  </a>
                  .
                </td>
              </tr>
            ) : null}
            {items.map((item) => (
              <tr key={item.id}>
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
                <td>{item.condition}</td>
                <td>{item.quantity}</td>
                <td>{currency(Number(item.estimated_unit_value ?? 0))}</td>
                <td>{currency(Number(item.estimated_total_value ?? 0))}</td>
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
    </div>
  );
}
