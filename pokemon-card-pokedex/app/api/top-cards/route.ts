import { NextResponse, type NextRequest } from "next/server";
import { getTopExpensiveCards } from "@/lib/pokemon-price-tracker";

/**
 * GET /api/top-cards?limit=10
 *
 * Devuelve el Top N de cartas Pokémon actualmente más caras según la API
 * de Pokemon Price Tracker. El lib intenta varios endpoints de la API con
 * sort-by-price y, si ninguno responde, hace fallback a una lista curada
 * de cartas históricamente valiosas (Pikachu Illustrator, Charizard 1st
 * ed, Blastoise Galaxy, etc.) consultando a la propia API su precio
 * actual — nunca hardcodeamos precios.
 *
 * Cache de respuesta: 10 min (revalidate en el fetch del lib + header
 * aquí). Suficiente para no machacar a la API del proveedor.
 */
export const revalidate = 600;

export async function GET(request: NextRequest) {
  try {
    const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(1, limitParam), 25)
      : 10;

    const cards = await getTopExpensiveCards(limit);

    return NextResponse.json({
      count: cards.length,
      cards,
    });
  } catch (error) {
    console.error("GET /api/top-cards error:", error);
    const message =
      error instanceof Error ? error.message : "No se pudo cargar el ranking.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
