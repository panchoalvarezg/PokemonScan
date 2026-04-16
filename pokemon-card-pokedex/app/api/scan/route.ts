import { NextRequest, NextResponse } from 'next/server';
import { extractTextFromImage } from '@/services/scanner/ocr';
import { parseCardText } from '@/services/scanner/parse-card-text';

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl es obligatorio' }, { status: 400 });
    }

    const text = await extractTextFromImage(imageUrl);
    const parsed = parseCardText(text);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error: 'No se pudo procesar la imagen. Puedes continuar con búsqueda manual.',
        extractedText: '',
        detectedName: '',
        detectedNumber: '',
        detectedSet: ''
      },
      { status: 200 }
    );
  }
}
