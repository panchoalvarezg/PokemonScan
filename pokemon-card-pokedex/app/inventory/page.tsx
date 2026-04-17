import { InventoryClient } from "@/components/InventoryClient";

/**
 * La página /inventory es 100% client-side: el InventoryClient pide los datos a
 * /api/inventory y /api/stats con el token del usuario. Antes había aquí un
 * fetch server-side directo a Supabase que duplicaba lógica y además rompía
 * TypeScript porque el join `card_catalog:card_catalog_id(...)` se inferencia
 * como un array.
 */
export default function InventoryPage() {
  return (
    <main className="container" style={{ padding: "24px 0" }}>
      <h1 className="mb-2 text-3xl font-bold">Inventario</h1>
      <p className="small" style={{ marginBottom: 16 }}>
        Registro completo de tus cartas con foto, expansión, número, rareza,
        tipo y valor.
      </p>
      <InventoryClient />
    </main>
  );
}
