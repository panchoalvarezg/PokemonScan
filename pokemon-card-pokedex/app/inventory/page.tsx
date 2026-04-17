import { createClient } from "@/lib/supabase/server";

type SearchParams = Promise<{ userId?: string }>;

export default async function InventoryPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const userId = searchParams.userId || "";

  let rows: any[] = [];
  let totalValue = 0;

  if (userId) {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("user_cards")
      .select(`
        id,
        quantity,
        condition,
        estimated_unit_value,
        estimated_total_value,
        created_at,
        card_catalog:card_catalog_id (
          product_name,
          set_name,
          card_number,
          rarity,
          card_type,
          variant
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error cargando inventario:", error);
    }

    rows = data || [];
    totalValue = rows.reduce(
      (acc, row) => acc + Number(row.estimated_total_value || 0),
      0
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6">
      <h1 className="mb-2 text-3xl font-bold">Inventario</h1>
      <p className="mb-6 text-sm text-gray-600">
        Usa <code>?userId=TU_UUID</code> en la URL para ver el inventario del usuario.
      </p>

      <div className="mb-6 rounded-xl border p-4">
        <p className="text-sm text-gray-600">Valor total estimado</p>
        <p className="text-3xl font-bold">${totalValue.toFixed(2)}</p>
      </div>

      {!userId ? (
        <p className="text-sm text-gray-600">
          Agrega el userId a la URL. Ejemplo: <code>/inventory?userId=...</code>
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-600">No hay cartas guardadas para este usuario.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="border-b px-4 py-3">Carta</th>
                <th className="border-b px-4 py-3">Set</th>
                <th className="border-b px-4 py-3">Número</th>
                <th className="border-b px-4 py-3">Tipo</th>
                <th className="border-b px-4 py-3">Rareza</th>
                <th className="border-b px-4 py-3">Variante</th>
                <th className="border-b px-4 py-3">Condición</th>
                <th className="border-b px-4 py-3">Cantidad</th>
                <th className="border-b px-4 py-3">Valor unitario</th>
                <th className="border-b px-4 py-3">Valor total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="border-b px-4 py-3">
                    {row.card_catalog?.product_name || "-"}
                  </td>
                  <td className="border-b px-4 py-3">
                    {row.card_catalog?.set_name || "-"}
                  </td>
                  <td className="border-b px-4 py-3">
                    {row.card_catalog?.card_number || "-"}
                  </td>
                  <td className="border-b px-4 py-3">
                    {row.card_catalog?.card_type || "-"}
                  </td>
                  <td className="border-b px-4 py-3">
                    {row.card_catalog?.rarity || "-"}
                  </td>
                  <td className="border-b px-4 py-3">
                    {row.card_catalog?.variant || "-"}
                  </td>
                  <td className="border-b px-4 py-3">{row.condition}</td>
                  <td className="border-b px-4 py-3">{row.quantity}</td>
                  <td className="border-b px-4 py-3">
                    ${Number(row.estimated_unit_value || 0).toFixed(2)}
                  </td>
                  <td className="border-b px-4 py-3">
                    ${Number(row.estimated_total_value || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
