import { createAdminClient } from '@/lib/supabase/admin';
import type { ValuationSummary } from '@/types';

export async function getPortfolioSummary(userId: string): Promise<ValuationSummary> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('inventory_valuation_summary')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

  return {
    distinctEntries: data?.distinct_entries ?? 0,
    totalCards: data?.total_cards ?? 0,
    totalInventoryValue: Number(data?.total_inventory_value ?? 0),
    averageCardValue: Number(data?.average_card_value ?? 0)
  };
}
