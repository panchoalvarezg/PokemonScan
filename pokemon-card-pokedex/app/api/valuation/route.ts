import { NextRequest, NextResponse } from 'next/server';
import { getPortfolioSummary } from '@/services/inventory/compute-portfolio';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId es obligatorio' }, { status: 400 });

    const summary = await getPortfolioSummary(userId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'No se pudo calcular la valorización.' }, { status: 500 });
  }
}
