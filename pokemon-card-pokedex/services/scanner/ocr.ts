import Tesseract from 'tesseract.js';
import { normalizeWhitespace } from '@/lib/utils';

export async function extractTextFromImage(imageUrl: string) {
  const result = await Tesseract.recognize(imageUrl, 'eng');
  return normalizeWhitespace(result.data.text || '');
}
