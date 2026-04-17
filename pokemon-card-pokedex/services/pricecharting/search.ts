// Este proyecto usa Pokemon Price Tracker (ver `lib/pokemon-price-tracker.ts`)
// como fuente de precios. Este archivo se mantiene como placeholder por si en
// el futuro se reintegra PriceCharting como fuente alternativa.

export type PriceChartingMatch = {
  id: string;
  productName: string;
  consoleName?: string;
  loosePrice?: number;
  confidence: number;
};

export async function searchPriceCharting(): Promise<PriceChartingMatch[]> {
  return [];
}
