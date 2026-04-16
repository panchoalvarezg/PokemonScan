'use client';

import { useMemo, useState } from 'react';
import type { PriceChartingMatch, ScanResult } from '@/types';

const initialScan: ScanResult = {
  extractedText: '',
  detectedName: '',
  detectedNumber: '',
  detectedSet: ''
};

export function ScannerClient() {
  const [imageUrl, setImageUrl] = useState('');
  const [userId, setUserId] = useState('');
  const [condition, setCondition] = useState('near_mint');
  const [quantity, setQuantity] = useState(1);
  const [scan, setScan] = useState<ScanResult>(initialScan);
  const [matches, setMatches] = useState<PriceChartingMatch[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedId) ?? matches[0],
    [matches, selectedId]
  );

  async function handleScan() {
    setStatus('Escaneando imagen...');
    const response = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl })
    });

    const data = await response.json();
    setScan(data);
    setStatus('Buscando coincidencias en PriceCharting...');

    const matchResponse = await fetch('/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.detectedName,
        number: data.detectedNumber,
        set: data.detectedSet
      })
    });

    const matchData = await matchResponse.json();
    setMatches(matchData.matches ?? []);
    setSelectedId(matchData.matches?.[0]?.id ?? '');
    setStatus('Proceso completado. Revisa y guarda.');
  }

  async function handleSave() {
    if (!selectedMatch || !userId) {
      setStatus('Necesitas un userId y una coincidencia seleccionada.');
      return;
    }

    setSaving(true);
    const response = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        pricechartingProductId: selectedMatch.id,
        productName: selectedMatch.productName,
        setName: scan.detectedSet,
        cardNumber: scan.detectedNumber,
        condition,
        quantity,
        estimatedUnitValue: selectedMatch.loosePrice ?? 0,
        imageUrl
      })
    });

    const data = await response.json();
    setSaving(false);
    setStatus(response.ok ? `Carta guardada con id ${data.item.id}` : data.error || 'Error al guardar.');
  }

  return (
    <div className="grid grid-2">
      <div className="card form">
        <div className="field">
          <label>URL pública de la imagen</label>
          <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="field">
          <label>User ID de Supabase</label>
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid del usuario" />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label>Condición</label>
            <select value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="mint">Mint</option>
              <option value="near_mint">Near Mint</option>
              <option value="light_played">Light Played</option>
              <option value="moderate_played">Moderate Played</option>
              <option value="heavily_played">Heavily Played</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>
          <div className="field">
            <label>Cantidad</label>
            <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>
        </div>
        <button className="button" type="button" onClick={handleScan}>Escanear y comparar</button>
        {selectedMatch ? <button className="button secondary" type="button" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar en inventario'}</button> : null}
        {status ? <div className="notice">{status}</div> : null}
      </div>

      <div className="grid">
        <div className="card">
          <h3>Resultado OCR</h3>
          <p><strong>Nombre:</strong> {scan.detectedName || '—'}</p>
          <p><strong>Número:</strong> {scan.detectedNumber || '—'}</p>
          <p><strong>Set:</strong> {scan.detectedSet || '—'}</p>
          <p className="small">Texto extraído:</p>
          <div className="code">{scan.extractedText || 'Sin texto detectado todavía.'}</div>
        </div>

        <div className="card">
          <h3>Coincidencias PriceCharting</h3>
          <div className="form">
            {matches.length === 0 ? <p className="small">Aún no hay coincidencias.</p> : null}
            {matches.map((match) => (
              <label key={match.id} style={{ display: 'grid', gap: '.35rem', padding: '.75rem', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <input type="radio" name="match" checked={(selectedId || matches[0]?.id) === match.id} onChange={() => setSelectedId(match.id)} />
                  <strong>{match.productName}</strong>
                </div>
                <span className="small">Confidence: {match.confidence} · Precio estimado: USD {match.loosePrice ?? 0}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
