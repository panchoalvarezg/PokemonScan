import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page">
      <div className="container hero">
        <span className="badge">MVP listo para GitHub</span>
        <h1>Inventario de cartas Pokémon con escaneo y valorización</h1>
        <p>
          Sube una imagen, extrae texto con OCR, compara candidatos con PriceCharting,
          guarda la carta en tu cuenta y calcula el valor total estimado del inventario.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link href="/scanner" className="button">Ir al scanner</Link>
          <Link href="/dashboard" className="button secondary">Ver dashboard</Link>
        </div>
        <div className="grid grid-3">
          <div className="card kpi"><span className="label">1. Escaneo</span><span className="small">OCR con Tesseract y fallback manual</span></div>
          <div className="card kpi"><span className="label">2. Matching</span><span className="small">Comparación por nombre, número y set</span></div>
          <div className="card kpi"><span className="label">3. Valor contable</span><span className="small">Total por cuenta y por carta</span></div>
        </div>
      </div>
    </main>
  );
}
