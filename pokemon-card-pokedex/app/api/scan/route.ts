import { NextResponse } from "next/server";
import { parseCardText } from "@/services/scanner/parse-card-text";

/**
 * Recibe el texto OCR desde el cliente (Tesseract.js se ejecuta en el browser
 * porque Vercel no permite un binario tan grande en la función) y devuelve el
 * nombre, número, set, tipo y hints de variante detectados.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const text =
      typeof body?.text === "string"
        ? body.text
        : typeof body?.extractedText === "string"
          ? body.extractedText
          : "";

    if (!text.trim()) {
      return NextResponse.json(
        { error: "No se recibió texto a analizar." },
        { status: 400 }
      );
    }

    const parsed = parseCardText(text);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error ? error.message : "Error analizando el texto.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
