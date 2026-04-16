import { NextRequest, NextResponse } from 'next/server';
import { searchPriceCharting } from '@/services/pricecharting/search';

export async function POST(request: NextRequest) {
  try {
    const { name, number, set } = await request.json();
    const query = [name, number, set, 'pokemon card'].filter(Boolean).join(' ').trim();

    if (!query) {
      return NextResponse.json({ error: 'Debes enviar al menos un criterio de búsqueda.' }, { status: 400 });
    }

    const matches = await searchPriceCharting(query, name, number, set);
    return NextResponse.json({ matches });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'No se pudo consultar PriceCharting.' }, { status: 500 });
  }
}
