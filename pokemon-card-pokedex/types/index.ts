export type ScanResult = {
  extractedText: string;
  detectedName: string;
  detectedNumber: string;
  detectedSet: string;
};

export type PriceChartingMatch = {
  id: string;
  productName: string;
  consoleName?: string;
  loosePrice?: number;
  manualOnly?: boolean;
  confidence: number;
};

export type InventoryInput = {
  pricechartingProductId: string;
  productName: string;
  setName?: string;
  cardNumber?: string;
  condition: string;
  quantity: number;
  estimatedUnitValue: number;
  imageUrl?: string;
  notes?: string;
  forTrade?: boolean;
};

export type ValuationSummary = {
  distinctEntries: number;
  totalCards: number;
  totalInventoryValue: number;
  averageCardValue: number;
};
