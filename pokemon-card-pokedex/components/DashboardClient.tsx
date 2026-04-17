"use client";

import { useEffect, useState } from "react";

type ValuationResponse = {
  totalInventoryValue: number;
  totalCards: number;
  distinctEntries: number;
  avgCardValue: number;
  byType: Record<string, number>;
  byRarity: Record<string, number>;
  error?: string;
};

export default function DashboardClient() {
  const [data, setData] = useState<ValuationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadValuation() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/valuation", {
          method: "GET",
          credentials: "include",
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "No se pudo cargar el dashboard.");
        }

        setData(result);
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error ? err.message : "Error cargando dashboard."
        );
      } finally {
        setLoading(false);
      }
    }

    loadValuation();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border p-6">
        <p className="text-sm text-gray-600">Cargando dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-700">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border p-6">
        <p className="text-sm text-gray-600">No hay datos disponibles.</p>
      </div>
    );
  }

  const sortedTypes = Object.entries(data.byType || {}).sort((a, b) => b[1] - a[1]);
  const sortedRarities = Object.entries(data.byRarity || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-600">Valor total</p>
          <p className="text-2xl font-bold">${data.totalInventoryValue.toFixed(2)}</p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-600">Total cartas</p>
          <p className="text-2xl font-bold">{data.totalCards}</p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-600">Entradas distintas</p>
          <p className="text-2xl font-bold">{data.distinctEntries}</p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-sm text-gray-600">Valor promedio</p>
          <p className="text-2xl font-bold">${data.avgCardValue.toFixed(2)}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h2 className="mb-3 text-lg font-semibold">Tipos predominantes</h2>

          {sortedTypes.length === 0 ? (
            <p className="text-sm text-gray-600">Sin datos de tipos.</p>
          ) : (
            <div className="space-y-2">
              {sortedTypes.map(([type, count]) => (
                <div
                  key={type}
                  className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2"
                >
                  <span>{type}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border p-4">
          <h2 className="mb-3 text-lg font-semibold">Rarezas</h2>

          {sortedRarities.length === 0 ? (
            <p className="text-sm text-gray-600">Sin datos de rareza.</p>
          ) : (
            <div className="space-y-2">
              {sortedRarities.map(([rarity, count]) => (
                <div
                  key={rarity}
                  className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2"
                >
                  <span>{rarity}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
