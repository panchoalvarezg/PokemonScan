// El OCR corre en el cliente con Tesseract.js (ver `components/ScannerClient`).
// Este helper se mantiene para usos futuros en scripts o jobs.

import { normalizeWhitespace } from "@/lib/utils";

export async function extractTextFromImage(imageUrl: string): Promise<string> {
  const Tesseract = (await import("tesseract.js")).default;
  const result = await Tesseract.recognize(imageUrl, "eng");
  return normalizeWhitespace(result.data.text || "");
}
