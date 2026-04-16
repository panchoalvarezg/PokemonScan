import { InventoryClient } from '@/components/InventoryClient';

export default function InventoryPage() {
  return (
    <main className="page">
      <div className="container grid">
        <div>
          <h1>Inventario</h1>
          <p className="small">Consulta, revisa y elimina cartas guardadas en la cuenta del usuario.</p>
        </div>
        <InventoryClient />
      </div>
    </main>
  );
}
