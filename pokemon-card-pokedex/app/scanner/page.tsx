import { ScannerClient } from '@/components/ScannerClient';

export default function ScannerPage() {
  return (
    <main className="page">
      <div className="container grid">
        <div>
          <h1>Scanner de cartas</h1>
          <p className="small">Sube una URL pública de la imagen, extrae texto con OCR, compara con PriceCharting y guarda la carta en el inventario.</p>
        </div>
        <ScannerClient />
      </div>
    </main>
  );
}
