import { NextResponse } from "next/server";
import { searchCardVariants } from "@/lib/pokemon-price-tracker";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const detectedName =
      typeof body?.detectedName === "string" ? body.detectedName : "";
    const detectedNumber =
      typeof body?.detectedNumber === "string" ? body.detectedNumber : "";
    const detectedSet =
      typeof body?.detectedSet === "string" ? body.detectedSet : "";
    const extractedText =
      typeof body?.extractedText === "string" ? body.extractedText : "";
    const detectedVariantHints = Array.isArray(body?.detectedVariantHints)
      ? body.detectedVariantHints
      : [];

    const variants = await searchCardVariants({
      detectedName,
      detectedNumber,
      detectedSet,
      extractedText,
      detectedVariantHints,
    });

    return NextResponse.json({ variants });
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error ? error.message : "Error buscando variantes.";

    if (message.toLowerCase().includes("insufficient api credits")) {
      return NextResponse.json(
        {
          error:
            "No quedan créditos suficientes en la API para buscar variantes. Reduce búsquedas o espera a renovar créditos.",
        },
        { status: 402 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
