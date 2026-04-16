import { scoreTextMatch, toNumber } from '@/lib/utils';
import type { PriceChartingMatch } from '@/types';
import { priceChartingFetch } from './client';

type ProductApiResponse = {
  status: string;
  products?: Array<{
    id: string;
    'product-name': string;
    'console-name'?: string;
    'loose-price'?: number | string;
  }>;
};

export async function searchPriceCharting(
  query: string,
  detectedName = '',
  detectedNumber = '',
  detectedSet = ''
) {
  const response = await priceChartingFetch<ProductApiResponse>('/api/products', { q: query });
  const products = response.products ?? [];

  return products
    .map<PriceChartingMatch>((product) => {
      const productName = product['product-name'];
      let confidence = 0;
      confidence += scoreTextMatch(productName, detectedName) * 50;
      confidence += detectedNumber && productName.toLowerCase().includes(detectedNumber.toLowerCase()) ? 30 : 0;
      confidence += detectedSet && productName.toLowerCase().includes(detectedSet.toLowerCase()) ? 20 : 0;

      return {
        id: product.id,
        productName,
        consoleName: product['console-name'],
        loosePrice: toNumber(product['loose-price'] ?? 0),
        confidence: Math.round(confidence)
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}
