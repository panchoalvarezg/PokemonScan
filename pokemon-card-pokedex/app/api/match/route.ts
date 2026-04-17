import { NextResponse } from "next/server";
import { searchCardVariants } from "@/lib/pokemon-price-tracker";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const detectedName =
      typeof body?.detectedName === "string"
        ? body.detectedName
        : typeof body?.name === "string"
          ? body.name
          : "";
    const detectedNumber =
      typeof body?.detectedNumber === "string"
        ? body.detectedNumber
        : typeof body?.number === "string"
          ? body.number
          : "";
    const detectedSet =
      typeof body?.detectedSet === "string"
        ? body.detectedSet
        : typeof body?.set === "string"
          ? body.set
          : "";
    const extractedText =
      typeof body?.extractedText === "string" ? body.extractedText : "";
    const detectedVariantHints = Array.isArray(body?.detectedVariantHints)
      ? body.detectedVariantHints.filter((h: unknown) => typeof h === "string")
      : [];

    if (!detectedName && !extractedText) {
      return NextResponse.json(
        { error: "Falta texto o nombre detectado para buscar variantes." },
        { status: 400 }
      );
    }

    const variants = await searchCardVariants({
      detectedName,
      detectedNumber,
      detectedSet,
      extractedText,
      detectedVariantHints,
    });

    const best = variants[0] ?? null;

    return NextResponse.json({
      variants,
      best,
    });
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
