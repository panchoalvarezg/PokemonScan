"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { currency } from "@/lib/utils";
import type { ValuationSummary } from "@/types";

export function DashboardClient() {
  const [summary, setSummary] = useState<ValuationSummary | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const loadSummary = useCallback(async (uid: string) => {
    try {
      const response = await fetch(`/api/valuation?userId=${uid}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data?.error || "No se pudo cargar la valorización.");
      setSummary(data);
      setMessage("Valorización cargada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
      if (data.user?.id) loadSummary(data.user.id);
    });
  }, [loadSummary]);

  if (!userEmail) {
    return (
      <div className="card">
        <p>
          Debes{" "}
          <a href="/login" className="brand">
            iniciar sesión
          </a>{" "}
          para ver tu dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="card form">
        <div className="flex justify-between items-center">
          <div>
            <p className="font-bold">Valoración de {userEmail}</p>
            <p className="small">
              El valor total se actualiza cuando refrescas precios o agregas
              cartas nuevas.
            </p>
          </div>
          <button
            className="button"
            onClick={() => userId && loadSummary(userId)}
          >
            Recalcular
          </button>
        </div>
        {message && <div className="notice">{message}</div>}
        {error && <div className="error">{error}</div>}
      </div>

      <div className="grid grid-3">
        <div className="card kpi">
          <span className="label">Entradas distintas</span>
          <span className="value">{summary?.distinctEntries ?? 0}</span>
        </div>
        <div className="card kpi">
          <span className="label">Cantidad total de cartas</span>
          <span className="value">{summary?.totalCards ?? 0}</span>
        </div>
        <div className="card kpi">
          <span className="label">Valor total estimado</span>
          <span className="value">
            {currency(summary?.totalInventoryValue ?? 0)}
          </span>
        </div>
      </div>

      <div className="card kpi">
        <span className="label">Valor promedio por carta</span>
        <span className="value">{currency(summary?.averageCardValue ?? 0)}</span>
      </div>
    </div>
  );
}
