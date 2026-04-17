import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Usuario no autenticado" },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("user_cards")
      .select("estimated_total_value, quantity, estimated_unit_value")
      .eq("user_id", user.id);

    if (error) throw error;

    const rows = data || [];

    const totalInventoryValue = rows.reduce(
      (sum, row) => sum + Number(row.estimated_total_value || 0),
      0
    );

    const totalCards = rows.reduce(
      (sum, row) => sum + Number(row.quantity || 0),
      0
    );

    const distinctEntries = rows.length;

    const avgCardValue =
      totalCards > 0 ? totalInventoryValue / totalCards : 0;

    return NextResponse.json({
      totalInventoryValue,
      totalCards,
      distinctEntries,
      avgCardValue,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "No se pudo calcular la valoración." },
      { status: 500 }
    );
  }
}
