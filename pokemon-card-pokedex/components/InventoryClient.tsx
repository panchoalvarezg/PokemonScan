'use client';

import { useState } from 'react';
import { currency } from '@/lib/utils';

export function InventoryClient() {
  const [userId, setUserId] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  async function loadInventory() {
    const response = await fetch(`/api/inventory?userId=${userId}`);
    const data = await response.json();
    setItems(data.items ?? []);
    setMessage(response.ok ? 'Inventario cargado.' : data.error || 'No se pudo cargar.');
  }

  async function removeItem(id: string) {
    const response = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
    const data = await response.json();
    setMessage(response.ok ? 'Carta eliminada.' : data.error || 'No se pudo eliminar.');
    if (response.ok) loadInventory();
  }

  return (
    <div className="grid">
      <div className="card form">
        <div className="field">
          <label>User ID de Supabase</label>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid del usuario" />
        </div>
        <button className="button" type="button" onClick={loadInventory}>Cargar inventario</button>
        {message ? <div className="notice">{message}</div> : null}
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Carta</th>
              <th>Set</th>
              <th>Condición</th>
              <th>Cantidad</th>
              <th>Valor unitario</th>
              <th>Valor total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.product_name}</td>
                <td>{item.set_name ?? '—'}</td>
                <td>{item.condition}</td>
                <td>{item.quantity}</td>
                <td>{currency(Number(item.estimated_unit_value ?? 0))}</td>
                <td>{currency(Number(item.estimated_total_value ?? 0))}</td>
                <td><button className="button secondary" onClick={() => removeItem(item.id)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
