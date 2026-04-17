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
  rarity: string | null;
  image_url: string | null;
  external_id: string | null;
  condition: string;
  quantity: number;
  estimated_unit_value: string | number;
  estimated_total_value: string | number;
  last_market_price: string | number | null;
  price_updated_at: string | null;
  for_trade?: boolean | null;
  created_at: string;
};

export type SetCompleteness = {
  setName: string;
  owned: number;
  total: number | null;
  percent: number | null;
};

export type TypeCompleteness = {
  type: string;
  cardsOwned: number;
  entriesOwned: number;
  hasIt: boolean;
};

export type InventoryStats = {
  totalEntries: number;
  totalCards: number;
  totalValue: number;
  averageValue: number;
  maxValue: number;
  uniqueSets: number;
  uniqueTypes: number;
  byType: Array<{ key: string; count: number; value: number }>;
  byRarity: Array<{ key: string; count: number; value: number }>;
  byCondition: Array<{ key: string; count: number; value: number }>;
  bySet: Array<{ key: string; count: number; value: number }>;
  topCards: Array<{
    id: string;
    product_name: string;
    set_name: string | null;
    estimated_total_value: number;
    image_url: string | null;
  }>;
  setCompleteness: SetCompleteness[];
  typeCompleteness: {
    items: TypeCompleteness[];
    typesCovered: number;
    totalKnownTypes: number;
    overallPercent: number;
  };
  globalCompletenessPercent: number | null;
};

export type ValuationSummary = {
  distinctEntries: number;
  totalCards: number;
  totalInventoryValue: number;
  averageCardValue: number;
};
