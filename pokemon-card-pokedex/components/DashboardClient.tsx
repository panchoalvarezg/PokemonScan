'use client';

import { useState } from 'react';
import { currency } from '@/lib/utils';

export function DashboardClient() {
  const [userId, setUserId] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [message, setMessage] = useState('');

  async function loadSummary() {
    const response = await fetch(`/api/valuation?userId=${userId}`);
    const data = await response.json();
    setSummary(response.ok ? data : null);
    setMessage(response.ok ? 'Valorización cargada.' : data.error || 'No se pudo cargar la valorización.');
  }

  return (
    <div className="grid">
      <div className="card form">
        <div className="field">
          <label>User ID de Supabase</label>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid del usuario" />
        </div>
        <button className="button" type="button" onClick={loadSummary}>Calcular valor del inventario</button>
        {message ? <div className="notice">{message}</div> : null}
      </div>

      <div className="grid grid-3">
        <div className="card kpi"><span className="label">Entradas distintas</span><span className="value">{summary?.distinctEntries ?? 0}</span></div>
        <div className="card kpi"><span className="label">Cantidad total de cartas</span><span className="value">{summary?.totalCards ?? 0}</span></div>
        <div className="card kpi"><span className="label">Valor total estimado</span><span className="value">{currency(summary?.totalInventoryValue ?? 0)}</span></div>
      </div>

      <div className="card kpi">
        <span className="label">Valor promedio por carta</span>
        <span className="value">{currency(summary?.averageCardValue ?? 0)}</span>
      </div>
    </div>
  );
}
