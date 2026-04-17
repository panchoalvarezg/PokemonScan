export type ScanResult = {
  extractedText: string;
  detectedName: string;
  detectedNumber: string;
  detectedSet: string;
  detectedType: string;
  detectedVariantHints: string[];
};

export type InventoryInput = {
  externalId: string;
  productName: string;
  setName?: string;
  cardNumber?: string;
  cardType?: string;
  imageUrl?: string;
  condition?: string;
  quantity?: number;
  estimatedUnitValue?: number;
  notes?: string;
  forTrade?: boolean;
};

export type InventoryItem = {
  id: string;
  user_id: string;
  product_name: string;
  set_name: string | null;
  card_number: string | null;
  card_type: string | null;
  image_url: string | null;
  external_id: string | null;
  condition: string;
  quantity: number;
  estimated_unit_value: string | number;
  estimated_total_value: string | number;
  last_market_price: string | number | null;
  price_updated_at: string | null;
  created_at: string;
};

export type ValuationSummary = {
  distinctEntries: number;
  totalCards: number;
  totalInventoryValue: number;
  averageCardValue: number;
};
