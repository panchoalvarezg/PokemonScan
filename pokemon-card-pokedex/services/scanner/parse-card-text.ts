import { normalizeWhitespace } from '@/lib/utils';
import type { ScanResult } from '@/types';

const SET_KEYWORDS = [
  'base set',
  'jungle',
  'fossil',
  'team rocket',
  'neo genesis',
  'scarlet',
  'violet',
  'obsidian flames',
  'paldea evolved'
];

export function parseCardText(text: string): ScanResult {
  const clean = normalizeWhitespace(text);
  const lines = clean.split(/(?<=[a-zA-Z0-9])\s(?=[A-Z][a-z])/).filter(Boolean);
  const detectedNumber = clean.match(/\b\d{1,3}\s*\/\s*\d{1,3}\b|\b[A-Z]{0,3}\d{1,3}\b/)?.[0] ?? '';
  const detectedSet = SET_KEYWORDS.find((keyword) => clean.toLowerCase().includes(keyword)) ?? '';

  const detectedName = lines
    .find((line) => /^[A-Z][A-Za-z0-9\-'. ]{2,40}$/.test(line) && !line.includes('/'))
    ?.trim() ?? '';

  return {
    extractedText: clean,
    detectedName,
    detectedNumber: detectedNumber.replace(/\s+/g, ''),
    detectedSet: detectedSet ? titleCase(detectedSet) : ''
  };
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
