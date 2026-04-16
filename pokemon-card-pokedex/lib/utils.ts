export function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function currency(value: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value);
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function scoreTextMatch(a: string, b: string) {
  const aa = a.toLowerCase();
  const bb = b.toLowerCase();
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.8;
  const wordsA = new Set(aa.split(/\s+/));
  const wordsB = new Set(bb.split(/\s+/));
  const intersection = [...wordsA].filter((word) => wordsB.has(word)).length;
  return intersection / Math.max(wordsA.size, wordsB.size, 1);
}
