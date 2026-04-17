import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardClient from "@/components/DashboardClient";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  return (
    <main className="mx-auto max-w-7xl p-6">
      <h1 className="mb-2 text-3xl font-bold">Dashboard</h1>
      <p className="mb-6 text-sm text-gray-600">
        Resumen de tu colección y valor estimado del inventario.
      </p>

      <DashboardClient />
    </main>
  );
}
