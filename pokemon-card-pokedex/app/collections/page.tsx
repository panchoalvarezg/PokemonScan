import { CollectionsClient } from "@/components/CollectionsClient";

/**
 * Vista de colecciones: agrupa el inventario del usuario por expansión,
 * mostrando progreso (cartas únicas / total oficial) y valor por set.
 */
export default function CollectionsPage() {
  return (
    <main className="container" style={{ padding: "24px 0" }}>
      <h1 className="mb-2 text-3xl font-bold">Colecciones</h1>
      <p className="small" style={{ marginBottom: 16 }}>
        Tus cartas organizadas automáticamente por expansión. Cada set muestra
        el progreso de completitud y el valor total acumulado.
      </p>
      <CollectionsClient />
    </main>
  );
}
