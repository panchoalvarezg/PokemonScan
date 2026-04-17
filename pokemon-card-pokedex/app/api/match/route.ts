import { NextResponse } from "next/server";

type PriceChartingSearchItem = {
  id: string;
  "product-name": string;
  "console-name"?: string;
};

function buildQuery({
  name,
  number,
  set,
  extractedText,
}: {
  name?: string;
  number?: string;
  set?: string;
  extractedText?: string;
}) {
  const parts = [name, number, set].filter(Boolean);
  if (parts.length > 0) return parts.join(" ").trim();

  return (extractedText || "").trim();
}

function scoreCandidate(
  item: PriceChartingSearchItem,
  {
    name,
    number,
    set,
  }: {
    name?: string;
    number?: string;
    set?: string;
  }
) {
  const product = (item["product-name"] || "").toLowerCase();
  const consoleName = (item["console-name"] || "").toLowerCase();

  let score = 0;

  if (name && product.includes(name.toLowerCase())) score += 55;
  if (number && product.includes(number.toLowerCase())) score += 25;
  if (set && (product.includes(set.toLowerCase()) || consoleName.includes(set.toLowerCase()))) {
    score += 20;
  }

  return score;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const name = typeof body?.name === "string" ? body.name : "";
    const number = typeof body?.number === "string" ? body.number : "";
    const set = typeof body?.set === "string" ? body.set : "";
    const extractedText =
      typeof body?.extractedText === "string" ? body.extractedText : "";

    const token = process.env.PRICECHARTING_API_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "Falta PRICECHARTING_API_TOKEN en variables de entorno." },
        { status: 500 }
      );
    }

    const q = buildQuery({ name, number, set, extractedText });

    if (!q) {
      return NextResponse.json({ matches: [] });
    }

    // 1) Buscar varias coincidencias
    const searchUrl = new URL("https://www.pricecharting.com/api/products");
    searchUrl.searchParams.set("t", token);
    searchUrl.searchParams.set("q", q);

    const searchResponse = await fetch(searchUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });

    const searchData = await searchResponse.json();

    if (!searchResponse.ok || searchData?.status === "error") {
      return NextResponse.json(
        {
          error:
            searchData?.["error-message"] ||
            "Error buscando productos en PriceCharting.",
        },
        { status: 500 }
      );
    }

    const products: PriceChartingSearchItem[] = Array.isArray(searchData?.products)
      ? searchData.products
      : [];

    // 2) Ordenar por score interno
    const ranked = products
      .map((item) => ({
        item,
        confidence: scoreCandidate(item, { name, number, set }),
      }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    // 3) Traer precio de cada candidato con /api/product
    const matches = [];

    for (const entry of ranked) {
      const detailUrl = new URL("https://www.pricecharting.com/api/product");
      detailUrl.searchParams.set("t", token);
      detailUrl.searchParams.set("id", entry.item.id);

      const detailResponse = await fetch(detailUrl.toString(), {
        method: "GET",
        cache: "no-store",
      });

      const detailData = await detailResponse.json();

      if (!detailResponse.ok || detailData?.status === "error") {
        continue;
      }

      // PriceCharting devuelve precios en centavos
      const rawPriceCents =
        detailData["ungraded-price"] ??
        detailData["loose-price"] ??
        detailData["cib-price"] ??
        null;

      matches.push({
        externalId: detailData.id,
        name: detailData["product-name"],
        set: detailData["console-name"] || "",
        price:
          typeof rawPriceCents === "number" ? rawPriceCents / 100 : null,
        confidence: entry.confidence,
      });

      // Respeta el límite de 1 llamada por segundo
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }

    return NextResponse.json({ matches });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "No se pudo comparar con PriceCharting." },
      { status: 500 }
    );
  }
}
