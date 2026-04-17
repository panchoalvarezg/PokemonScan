import { InventoryClient } from "@/components/InventoryClient";

export default function InventoryPage() {
  return (
    <main className="page">
      <div className="container grid">
        <div>
          <h1>Inventario</h1>
          <p className="small">
            Todas las cartas que has escaneado y guardado con su valor de
            mercado actual.
          </p>
        </div>
        <InventoryClient />
      </div>
    </main>
  );
}
