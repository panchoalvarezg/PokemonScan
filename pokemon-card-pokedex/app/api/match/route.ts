import { NextResponse } from "next/server";
import { searchPokemonTCG } from "@/lib/pokemon-tcg-api";
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
    const detectedType =
      typeof body?.detectedType === "string" ? body.detectedType : "";
    const extractedText =
      typeof body?.extractedText === "string" ? body.extractedText : "";
    const detectedVariantHints = Array.isArray(body?.detectedVariantHints)
      ? body.detectedVariantHints.filter((h: unknown) => typeof h === "string")
      : [];
    const manualQuery =
      typeof body?.manualQuery === "string" ? body.manualQuery.trim() : "";

    // Si viene búsqueda manual la preferimos por encima del OCR.
    const searchName = manualQuery || detectedName;

    if (!searchName && !detectedNumber && !extractedText) {
      return NextResponse.json(
        { error: "Escribe el nombre de la carta o captura una imagen nítida." },
        { status: 400 }
      );
    }

    // 1) Fuente principal: Pokémon TCG API (identificación + precios).
    let variants = await searchPokemonTCG({
      name: searchName,
      number: detectedNumber,
      set: detectedSet,
      type: detectedType,
    });

    // 2) Fallback: Pokemon Price Tracker (por si la TCG API no encontró nada).
    if (variants.length === 0) {
      try {
        const fallback = await searchCardVariants({
          detectedName: searchName,
          detectedNumber,
          detectedSet,
          extractedText,
          detectedVariantHints,
        });
        variants = fallback.map((v) => ({
          externalId: `ppt:${v.externalId}`,
          name: v.name,
          set: v.set,
          setId: "",
          variant: v.variant,
          type: v.type,
          imageUrl: v.imageUrl,
          cardNumber: v.cardNumber,
          price: v.price,
          confidence: v.confidence,
          source: "pokemonpricetracker" as const,
        }));
      } catch (fallbackError) {
        console.error("Fallback Pokemon Price Tracker falló:", fallbackError);
      }
    }

    const best = variants[0] ?? null;

    return NextResponse.json({
      variants,
      best,
      searchedWith: {
        name: searchName,
        number: detectedNumber,
        set: detectedSet,
        type: detectedType,
      },
    });
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error ? error.message : "Error buscando variantes.";

    if (message.toLowerCase().includes("insufficient api credits")) {
      return NextResponse.json(
        {
          error:
            "No quedan créditos suficientes en la API. Prueba más tarde o escribe el nombre a mano.",
        },
        { status: 402 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
