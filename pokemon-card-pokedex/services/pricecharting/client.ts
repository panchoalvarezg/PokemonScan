const BASE_URL = 'https://www.pricecharting.com';

export async function priceChartingFetch<T>(path: string, params: Record<string, string>) {
  const token = process.env.PRICECHARTING_API_TOKEN;

  if (!token) {
    throw new Error('Falta PRICECHARTING_API_TOKEN en variables de entorno.');
  }

  const search = new URLSearchParams({ t: token, ...params });
  const response = await fetch(`${BASE_URL}${path}?${search.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PriceCharting error: ${response.status} ${text}`);
  }

  return response.json() as Promise<T>;
}
